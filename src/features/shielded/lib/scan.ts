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
import { ACTIVE_NETWORK } from "@/config";
import { fieldToHex, hexToField } from "@/lib/field";
import { publicClient } from "@/lib/rpc";
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

export type ScanResult = {
  /** Ours, spent and unspent both. The spent ones are history, not balance. */
  notes: OwnedNote[];
  /** Every leaf in the pool, not just ours. */
  leaves: number;
  integrity: ScanIntegrity;
};

export type TokenBalance = { token: bigint; amount: bigint; notes: number };

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
 */
export async function scanPool(keys: ScanKeys): Promise<ScanResult> {
  const pool = ACTIVE_NETWORK.contracts.pool;

  const logs = await publicClient.getContractEvents({
    address: pool,
    abi: POOL_ABI,
    fromBlock: ACTIVE_NETWORK.contracts.poolDeployBlock,
    toBlock: "latest",
  });

  const commitments: string[] = [];
  const ciphers: (string | undefined)[] = [];
  const nullifiers = new Set<string>();

  /*
    A log whose arguments did not decode is skipped rather than guessed at. That
    cannot pass silently: a dropped commitment leaves a hole in the leaf indices,
    and the gap check below refuses the whole scan rather than returning a
    balance built on a tree with a piece missing.
  */
  for (const log of logs) {
    if (log.eventName === "NoteCommitted") {
      const { commitment: leaf, leafIndex } = log.args;
      if (leaf === undefined || leafIndex === undefined) continue;
      commitments[Number(leafIndex)] = leaf;
    } else if (log.eventName === "NoteCipher") {
      const { ciphertext, leafIndex } = log.args;
      if (ciphertext === undefined || leafIndex === undefined) continue;
      ciphers[Number(leafIndex)] = ciphertext;
    } else if (log.eventName === "Nullified") {
      const { nullifier: spent } = log.args;
      if (spent === undefined) continue;
      nullifiers.add(spent.toLowerCase());
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
    integrity: await checkIntegrity(commitments),
  };
}

/**
 * Does the chain agree that we saw everything?
 *
 * Read after the logs, never before. Reading the root first and the logs second
 * would compare a root to a replay that is allowed to be newer than it, which
 * turns every ordinary block into a false alarm.
 */
async function checkIntegrity(commitments: string[]): Promise<ScanIntegrity> {
  for (let i = 0; i < commitments.length; i++) {
    if (!commitments[i]) return { kind: "gap", missing: i };
  }

  const [onChainRoot, nextLeaf] = await Promise.all([
    publicClient.readContract({ address: ACTIVE_NETWORK.contracts.pool, abi: POOL_ABI, functionName: "root" }),
    publicClient.readContract({ address: ACTIVE_NETWORK.contracts.pool, abi: POOL_ABI, functionName: "nextLeafIndex" }),
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
  const by = new Map<bigint, { amount: bigint; notes: number }>();

  for (const n of notes) {
    if (n.spent || n.value === 0n) continue;
    const cur = by.get(n.token) ?? { amount: 0n, notes: 0 };
    cur.amount += n.value;
    cur.notes++;
    by.set(n.token, cur);
  }

  return [...by.entries()]
    .map(([token, v]) => ({ token, amount: v.amount, notes: v.notes }))
    .sort((a, b) => (a.token < b.token ? -1 : 1));
}
