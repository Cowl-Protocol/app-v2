/**
 * Rebuilding the owner's book from the chain, from nothing, every session.
 *
 * **This app caches none of it, and that is the design rather than a shortcut.**
 * The dapp keeps its tree and its notes in `localStorage` and applies new leaves
 * incrementally. Here the no-persistence rule forbids it, so every session
 * replays the whole log and trial-decrypts every cipher again. The cost is real
 * and it grows with the pool; what it buys is that a closed tab leaves nothing
 * behind, which is the one property this product is built around.
 *
 * The upside worth naming: there is no cache, so there is no cache to be wrong.
 * The dapp's drift handling, its pending-note adoption and its re-alignment all
 * exist because stored state and the chain can disagree. Nothing here can.
 *
 * Ported from `app/lib/shielded/pool.ts`. The formulas are consensus and are not
 * open to interpretation.
 */
import type { ShieldedKeys } from "@/features/keys";
import { type Network } from "@/config";
import { fieldToHex, hexToField } from "@/lib/field";
import { clientFor } from "@/lib/rpc";
import { commitment, nullifier, type Note } from "./note";
import { tryDecryptNote, unpackCipher } from "./note-cipher";
import { POOL_ABI } from "./pool-abi";
import { computeRoot } from "./tree";

/**
 * What a scan needs, and deliberately not the whole key set.
 *
 * `sk` is absent. Reading a balance never requires the spending key, so a scan
 * that cannot see one cannot leak one, and the narrower type says so at every
 * call site rather than in a comment.
 */
export type ScanKeys = Pick<ShieldedKeys, "mpk" | "nk" | "viewPriv">;

export type OwnedNote = {
  /** Position in the tree. This is what a nullifier is keyed on. */
  leafIndex: number;
  value: bigint;
  /** 0 is the native coin, anything else an ERC-20 address as a field element. */
  token: bigint;
  blinding: bigint;
  spent: boolean;
};

/**
 * Whether the replay can be trusted, which is a separate question from whether
 * it succeeded.
 *
 * `complete` means the tree rebuilt from the leaves that came back hashes to the
 * root the pool reports. Nothing weaker is worth having: a replay that lost a
 * window returns fewer notes and no error at all, and the balance it produces is
 * wrong in the direction nobody notices until they try to spend.
 */
export type ScanIntegrity =
  | { kind: "complete" }
  /** The chain moved while we were reading it. Normal, and a rescan settles it. */
  | { kind: "moved"; replayed: number; onChain: number }
  /** The root disagrees at a matching leaf count. Never normal. */
  | { kind: "mismatch"; replayed: bigint; onChain: string }
  /** Leaf indices arrived with a hole in them. A window was lost. */
  | { kind: "gap"; missing: number };

/**
 * One transaction that moved this book, with our side of it on both ends.
 *
 * **Grouped by transaction, and that grouping is what makes a history
 * readable.** A join-split writes two outputs whether or not it had change to
 * write, so the same spend that sends money to somebody else also creates a note
 * back to us. Read leaf by leaf, a send looks like money leaving *and* money
 * arriving. Read per transaction, it is one movement whose size is the
 * difference, which is what actually happened.
 *
 * Only our own notes are on either side. A payment to somebody else is a
 * commitment this browser cannot decrypt, so it never appears here as an output,
 * and it does not need to: what left is what our inputs held and our outputs did
 * not keep.
 */
export type LedgerEntry = {
  tx: string;
  block: bigint;
  /** Our notes this transaction spent. */
  ins: OwnedNote[];
  /** Our notes it created, change included. */
  outs: OwnedNote[];
};

export type ScanResult = {
  /** Ours, spent and unspent both. The spent ones are history, not balance. */
  notes: OwnedNote[];
  /** Every leaf in the pool, not just ours. */
  leaves: number;
  /** Our own movements, oldest first. Built from the same replay as the notes. */
  ledger: LedgerEntry[];
  integrity: ScanIntegrity;
};

export type TokenBalance = {
  token: bigint;
  amount: bigint;
  notes: number;
  /**
   * The most one transaction can move of this token, which is not the balance.
   *
   * A join-split reads **two** notes and writes two, so a spend can reach the
   * sum of the two largest unspent notes and no further, however much the total
   * says. Somebody paid in ten small notes holds ten notes' worth and can send
   * two of them at a time, and finding that out at the moment a send is refused
   * is the whole reason this number is carried beside the balance rather than
   * derived at the last second.
   */
  ceiling: bigint;
};

/**
 * Read the whole pool and keep what is ours.
 *
 * **One `getContractEvents` call for all three events, not three calls.** Three
 * would each pick their own block range, and a commitment stream one block ahead
 * of the nullifier stream shows a spent note as spendable. One request cannot
 * disagree with itself.
 *
 * `toBlock: "latest"` rather than a block number, and that is measured rather
 * than stylistic: the primary endpoint refuses a numeric range past a few
 * hundred blocks and serves the identical range as `latest` without complaint.
 * See `npm run probe:chain`, which prints what each endpoint will and will not
 * serve.
 *
 * **The network is an argument.** A session can switch chains from the bar, and
 * a scan that read the build's constant instead would replay one pool's log and
 * check it against the other pool's root: an integrity failure on the honest
 * path, or worse, a balance from a chain the screen is no longer showing.
 */
export async function scanPool(keys: ScanKeys, network: Network): Promise<ScanResult> {
  const client = clientFor(network);
  const pool = network.contracts.pool;

  const logs = await client.getContractEvents({
    address: pool,
    abi: POOL_ABI,
    fromBlock: network.contracts.poolDeployBlock,
    toBlock: "latest",
  });

  const commitments: string[] = [];
  const ciphers: (string | undefined)[] = [];
  const nullifiers = new Set<string>();

  /*
    Where each leaf and each nullifier appeared, kept for the history rather than
    for the balance.

    Indexed and keyed exactly like the two above, out of the same single pass. A
    second `getContractEvents` for the history would be a second block range,
    free to disagree with the first about what has happened, and a movement list
    that disagrees with the balance printed above it is worse than no list.
  */
  const leafAt: ({ tx: string; block: bigint } | undefined)[] = [];
  const nullifiedAt = new Map<string, { tx: string; block: bigint }>();

  /*
    A log whose arguments did not decode is skipped rather than guessed at. That
    cannot pass silently: a dropped commitment leaves a hole in the leaf indices,
    and the gap check below refuses the whole scan rather than returning a
    balance built on a tree with a piece missing.
  */
  for (const log of logs) {
    const where = { tx: log.transactionHash, block: log.blockNumber };

    if (log.eventName === "NoteCommitted") {
      const { commitment: leaf, leafIndex } = log.args;
      if (leaf === undefined || leafIndex === undefined) continue;
      commitments[Number(leafIndex)] = leaf;
      leafAt[Number(leafIndex)] = where;
    } else if (log.eventName === "NoteCipher") {
      const { ciphertext, leafIndex } = log.args;
      if (ciphertext === undefined || leafIndex === undefined) continue;
      ciphers[Number(leafIndex)] = ciphertext;
    } else if (log.eventName === "Nullified") {
      const { nullifier: spent } = log.args;
      if (spent === undefined) continue;
      nullifiers.add(spent.toLowerCase());
      nullifiedAt.set(spent.toLowerCase(), where);
    }
  }

  const notes: OwnedNote[] = [];

  for (let i = 0; i < ciphers.length; i++) {
    const raw = ciphers[i];
    const onChain = commitments[i];
    if (!raw || !onChain) continue;

    let decoded: ReturnType<typeof tryDecryptNote>;
    try {
      decoded = tryDecryptNote(unpackCipher(raw), keys.viewPriv);
    } catch {
      /* A cipher of the wrong length is a leaf this client cannot read, not a
         reason to abandon the ones after it. */
      continue;
    }
    if (!decoded) continue;

    /*
      Decrypting is not owning. The cipher says what the note holds; the
      commitment says who it belongs to, and only rebuilding it against *our*
      mpk settles that. Without this check a note encrypted to our view key but
      committed to somebody else's mpk would be counted as money we can spend,
      and the first spend of it would fail in the circuit with no explanation a
      user could act on.
    */
    const note: Note = {
      value: decoded.value,
      token: decoded.token,
      mpk: keys.mpk,
      blinding: decoded.blinding,
    };
    if (fieldToHex(commitment(note)).toLowerCase() !== onChain.toLowerCase()) continue;

    notes.push({
      leafIndex: i,
      value: decoded.value,
      token: decoded.token,
      blinding: decoded.blinding,
      spent: nullifiers.has(fieldToHex(nullifier(keys.nk, i)).toLowerCase()),
    });
  }

  return {
    notes,
    leaves: commitments.length,
    ledger: buildLedger(notes, keys, leafAt, nullifiedAt),
    integrity: await checkIntegrity(commitments, network),
  };
}

/**
 * Every transaction that touched this book, oldest first.
 *
 * A note lands in the entry for the transaction that created it and, if it has
 * been spent, in the entry for the transaction that spent it. Both sides come
 * from the same replay, so a note cannot appear as spent in a history that does
 * not also count it as spent in the balance.
 *
 * An entry whose transaction is unknown is dropped rather than bucketed under a
 * placeholder key. That only happens for a log the RPC returned without a
 * transaction hash, which is a malformed answer rather than a movement, and
 * inventing a group for it would put two unrelated notes in one row.
 */
function buildLedger(
  notes: OwnedNote[],
  keys: ScanKeys,
  leafAt: ({ tx: string; block: bigint } | undefined)[],
  nullifiedAt: Map<string, { tx: string; block: bigint }>,
): LedgerEntry[] {
  const byTx = new Map<string, LedgerEntry>();

  function entry(at: { tx: string; block: bigint }): LedgerEntry {
    const found = byTx.get(at.tx);
    if (found) return found;
    const fresh: LedgerEntry = { tx: at.tx, block: at.block, ins: [], outs: [] };
    byTx.set(at.tx, fresh);
    return fresh;
  }

  for (const note of notes) {
    const created = leafAt[note.leafIndex];
    if (created) entry(created).outs.push(note);

    if (!note.spent) continue;
    const spent = nullifiedAt.get(fieldToHex(nullifier(keys.nk, note.leafIndex)).toLowerCase());
    if (spent) entry(spent).ins.push(note);
  }

  return [...byTx.values()].sort((a, b) => (a.block === b.block ? 0 : a.block < b.block ? -1 : 1));
}

/**
 * Does the chain agree that we saw everything?
 *
 * Read after the logs, never before. Reading the root first and the logs second
 * would compare a root to a replay that is allowed to be newer than it, which
 * turns every ordinary block into a false alarm.
 */
async function checkIntegrity(
  commitments: string[],
  network: Network,
): Promise<ScanIntegrity> {
  for (let i = 0; i < commitments.length; i++) {
    if (!commitments[i]) return { kind: "gap", missing: i };
  }

  const client = clientFor(network);
  const pool = network.contracts.pool;

  const [onChainRoot, nextLeaf] = await Promise.all([
    client.readContract({ address: pool, abi: POOL_ABI, functionName: "root" }),
    client.readContract({ address: pool, abi: POOL_ABI, functionName: "nextLeafIndex" }),
  ]);

  if (Number(nextLeaf) !== commitments.length) {
    return { kind: "moved", replayed: commitments.length, onChain: Number(nextLeaf) };
  }

  const rebuilt = computeRoot(commitments.map((c) => hexToField(c)));
  if (fieldToHex(rebuilt).toLowerCase() !== onChainRoot.toLowerCase()) {
    return { kind: "mismatch", replayed: rebuilt, onChain: onChainRoot };
  }

  return { kind: "complete" };
}

/**
 * Unspent value, grouped by token.
 *
 * Zero value notes are dropped rather than listed. A join-split writes two
 * outputs whether or not it has change to write, so a spend that used a note
 * exactly leaves a zero behind, and a token row that says nothing is held is a
 * row about the protocol's bookkeeping rather than about anybody's money.
 */
export function balanceOf(notes: OwnedNote[]): TokenBalance[] {
  const by = new Map<bigint, { amount: bigint; notes: bigint[] }>();

  for (const n of notes) {
    if (n.spent || n.value === 0n) continue;
    const cur = by.get(n.token) ?? { amount: 0n, notes: [] };
    cur.amount += n.value;
    cur.notes.push(n.value);
    by.set(n.token, cur);
  }

  return [...by.entries()]
    .map(([token, v]) => {
      const largestFirst = [...v.notes].sort((a, b) => (a === b ? 0 : a > b ? -1 : 1));
      return {
        token,
        amount: v.amount,
        notes: v.notes.length,
        ceiling: (largestFirst[0] ?? 0n) + (largestFirst[1] ?? 0n),
      };
    })
    .sort((a, b) => (a.token < b.token ? -1 : 1));
}
