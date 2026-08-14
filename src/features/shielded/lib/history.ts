/**
 * What happened to this book, read from the same replay as the balance.
 *
 * **Three kinds, and the two that are missing are missing on purpose.**
 * `ActivityKind` in the portfolio also carries `shield` and `unshield`, the two
 * movements that cross the pool's boundary, and nothing here ever produces them.
 * The pool emits no boundary event: it announces commitments, ciphers and
 * nullifiers, and a deposit is indistinguishable from a payment in all three.
 * Telling them apart means attributing a token transfer to this account's own
 * wallet address, which is the one address this app deliberately never lets a
 * screen read. So a deposit is reported as money that arrived and a withdrawal
 * as money that left, which is what our own notes actually prove, and the two
 * labels stay unused until something can honestly produce them.
 *
 * A **swap** is the exception and it is provable from the notes alone: a
 * transaction that spent one token of ours and wrote back a different one did
 * both, and no other movement can.
 */
import { type Network } from "@/config";
import { clientFor } from "@/lib/rpc";
import type { LedgerEntry, OwnedNote } from "./scan";

export type MovementKind = "receive" | "send" | "swap";

export type Movement = {
  /** The transaction, plus the token when one transaction moved two. */
  id: string;
  kind: MovementKind;
  /** The pool's token id. 0 is the native coin. */
  token: bigint;
  /** Base units, unsigned. The direction is the kind's job. */
  amount: bigint;
  /** What a swap bought, absent on everything else. */
  intoToken?: bigint;
  intoAmount?: bigint;
  /** Unix seconds, off the block. */
  at: number;
};

/**
 * How much history is dated, and why it is two conditions rather than a number.
 *
 * Every movement is already in hand when this runs. What costs a request is the
 * timestamp behind each one, one per block, so the walk goes newest first and
 * stops as soon as both of the things that need dating are covered:
 *
 * - **`ENOUGH` rows**, for the activity panel, which shows four and has to have
 *   something left over for the list behind it.
 * - **`WINDOW` of time**, for the balance trace, which is drawn by undoing
 *   movements backwards from today's holdings. A movement inside the window that
 *   nobody dated is a line that starts at the wrong number, so the walk keeps
 *   going until it has passed the far edge and knows there are no more.
 *
 * `MAX_BLOCKS` is the backstop for an account that moves constantly, and it is
 * the one case where the trace is knowingly incomplete: `coversWindow` says so
 * rather than letting a short line be read as a quiet week.
 */
const ENOUGH = 12;
const WINDOW = 7 * 24 * 60 * 60;
const MAX_BLOCKS = 80;
const CHUNK = 10;

function sumByToken(notes: OwnedNote[]): Map<bigint, bigint> {
  const by = new Map<bigint, bigint>();
  for (const n of notes) by.set(n.token, (by.get(n.token) ?? 0n) + n.value);
  return by;
}

/**
 * One ledger entry to the movements it represents, newest caller's problem.
 *
 * **Netted per token, never per note.** A spend reads two notes and writes two,
 * so the change coming back is not money received and the note it came from is
 * not money sent: only the difference left the book. Reporting the gross would
 * turn a single payment into two rows that both look like the whole balance
 * moved.
 */
function movementsIn(entry: LedgerEntry): Omit<Movement, "at">[] {
  const ins = sumByToken(entry.ins);
  const outs = sumByToken(entry.outs);

  /* Nothing of ours was spent, so everything written is money that arrived. */
  if (ins.size === 0) {
    return [...outs.entries()]
      .filter(([, amount]) => amount > 0n)
      .map(([token, amount]) => ({
        id: `${entry.tx}:${token}`,
        kind: "receive" as const,
        token,
        amount,
      }));
  }

  /*
    A token in the outputs that was not in the inputs is a token this
    transaction bought. There is exactly one on a trade, because the circuit
    writes two outputs and the change takes the other.
  */
  const bought = [...outs.entries()].find(([token, amount]) => amount > 0n && !ins.has(token));

  const spent: Omit<Movement, "at">[] = [];
  for (const [token, into] of ins) {
    const left = into - (outs.get(token) ?? 0n);
    if (left <= 0n) continue;

    if (bought) {
      spent.push({
        id: `${entry.tx}:${token}`,
        kind: "swap",
        token,
        amount: left,
        intoToken: bought[0],
        intoAmount: bought[1],
      });
    } else {
      spent.push({ id: `${entry.tx}:${token}`, kind: "send", token, amount: left });
    }
  }

  return spent;
}

export type History = {
  /** Newest first. */
  movements: Movement[];
  /**
   * Whether everything inside the trace's window is in that list.
   *
   * False means the walk hit its request backstop before reaching the far edge,
   * so the oldest end of the list is not the oldest movement in the window. The
   * balance trace refuses to draw on it: a line missing its earliest movements
   * starts at a number this account never held.
   */
  coversWindow: boolean;
};

/**
 * The book's recent movements, newest first, each dated from its own block.
 *
 * The timestamps are read once per block rather than once per movement, because
 * a transaction that moved two tokens is two rows out of one block, and an L2
 * with sub-second blocks will put several movements in one on a busy day.
 *
 * A block whose time will not come back drops its movements rather than dating
 * them from the clock on this machine. A local clock is not what happened, it is
 * what time it is here, which on a payment history is a different claim
 * altogether.
 *
 * `now` is passed in rather than read here so the window is measured against the
 * same instant the screen renders against, and so this function can be checked
 * against a fixed one.
 */
/**
 * The classifier on its own, for `npm run test:history`.
 *
 * Same signal `__networks` and `__unlock` carry: reachable so it can be checked,
 * not so it can be called. Netting a spend against its own change is the one
 * piece of arithmetic here that decides what a person reads as money leaving,
 * and a rule nothing tests is this project's most repeated bug.
 */
export const __history = { movementsIn };

export async function recentMovements(
  ledger: LedgerEntry[],
  network: Network,
  now: number,
): Promise<History> {
  const newestFirst = [...ledger].reverse();
  if (newestFirst.length === 0) return { movements: [], coversWindow: true };

  const client = clientFor(network);
  const times = new Map<bigint, number>();
  const movements: Movement[] = [];

  let read = 0;
  let reachedEdge = false;
  let drained = false;

  for (let i = 0; i < newestFirst.length; ) {
    /*
      One chunk of distinct blocks at a time, asked together. Sequential chunks
      rather than one big parallel sweep: the whole point is to stop early, and
      a request already in flight cannot be un-asked.
    */
    const chunk: bigint[] = [];
    let j = i;
    for (; j < newestFirst.length && chunk.length < CHUNK; j++) {
      const block = newestFirst[j]!.block;
      if (!times.has(block) && !chunk.includes(block)) chunk.push(block);
    }
    if (chunk.length === 0) break;

    if (read + chunk.length > MAX_BLOCKS) break;
    read += chunk.length;

    await Promise.all(
      chunk.map(async (blockNumber) => {
        try {
          const block = await client.getBlock({ blockNumber });
          times.set(blockNumber, Number(block.timestamp));
        } catch {
          /* Left undated, which drops its rows below. */
        }
      }),
    );

    for (; i < j; i++) {
      const entry = newestFirst[i]!;
      const at = times.get(entry.block);
      if (at === undefined) continue;
      if (at < now - WINDOW) reachedEdge = true;
      for (const m of movementsIn(entry)) movements.push({ ...m, at });
    }

    if (i >= newestFirst.length) drained = true;
    if (reachedEdge && movements.length >= ENOUGH) break;
  }

  return { movements, coversWindow: reachedEdge || drained };
}
