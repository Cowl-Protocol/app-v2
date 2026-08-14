"use client";

/**
 * The owner's book, read from the chain, for screens that may not hold a key.
 *
 * **This is the boundary doing its job.** Scanning needs the viewing key, and
 * only `auth` and `shielded` may touch one. So the scan lives here, and what
 * leaves through `index.ts` is money: amounts, tokens, note counts. `portfolio`
 * renders a balance without ever being able to read the key that found it.
 *
 * Every session starts from nothing, so this runs on every sign in. There is no
 * cached tree to reconcile and no stored notes to invalidate, which is the one
 * simplification the no-persistence rule hands back.
 *
 * **It runs again on every chain switch, for the same reason.** The bar's picker
 * changes which pool holds the notes, not which notes are ours, so the whole
 * replay repeats against the other chain and nothing carries across.
 */
import { useEffect, useState } from "react";
import { type NetworkKey } from "@/config";
import { useShieldedKeys } from "@/features/auth/keys";
import { useNetwork } from "@/lib/network";
import { recentMovements, type MovementKind } from "./history";
import { balanceOf, scanPool, type ScanIntegrity } from "./scan";
import { tokenMetaFor, type TokenMeta } from "./token-meta";

export type Holding = {
  /** The pool's token id. 0 is the native coin. */
  token: bigint;
  /** Base units, unspent. */
  amount: bigint;
  /** How many notes it is spread across, which is what a spend is limited by. */
  notes: number;
  /** The two largest notes together: what one transaction can actually move. */
  ceiling: bigint;
  /** Null when neither the registry nor the chain would name it. */
  meta: TokenMeta | null;
};

/**
 * One movement, named.
 *
 * The same treatment the holdings get: what crosses this feature's boundary is
 * money and the words for it, never the key that found either. `meta` is null
 * for a token neither the registry nor the chain will name, which is a row that
 * has to print base units rather than one that gets dropped.
 */
export type Move = {
  id: string;
  kind: MovementKind;
  /** The pool's token id, which is what a price table is keyed by. */
  token: bigint;
  amount: bigint;
  meta: TokenMeta | null;
  /** What a swap bought. Absent on everything else. */
  intoToken?: bigint;
  intoAmount?: bigint;
  intoMeta?: TokenMeta | null;
  /** Unix seconds, off the block the movement landed in. */
  at: number;
};

export type Book =
  /** No session. Also every first render, because this app starts from nothing. */
  | { state: "locked" }
  | { state: "scanning" }
  | {
      state: "ready";
      holdings: Holding[];
      /** Newest first, and only as far back as a block time was read for. */
      movements: Move[];
      /**
       * Whether `movements` holds everything from the last seven days.
       *
       * False on an account that moves often enough to exhaust the history
       * walk's request budget. The balance trace is drawn by undoing movements
       * backwards from today's holdings, so a gap at the old end of the list is
       * a line that starts at a number nobody ever held: it draws nothing rather
       * than something wrong.
       */
      coversWindow: boolean;
      leaves: number;
      integrity: ScanIntegrity;
      /** When this scan finished, for the strip that says how current it is. */
      at: number;
    }
  | { state: "failed"; reason: string };

/**
 * A `moved` result means the chain gained a leaf while we were reading it, which
 * is ordinary and settles itself. Bounded, because a pool being written to
 * continuously would otherwise rescan forever and never render.
 */
const MAX_ATTEMPTS = 3;

/**
 * One scan per account per chain, shared by everything that asks.
 *
 * **Three surfaces call this hook now**, the balance screen and both spend
 * overlays, and without this each of them would replay the entire pool log and
 * trial-decrypt every cipher in it again. That is not a slow render, it is three
 * times the requests and three times the work on the one operation this client
 * cannot make cheap, every time somebody opens Send.
 *
 * Keyed by the account and the chain together, which is the same key the render
 * below compares against: two components asking for the same book get the same
 * promise, and asking for a different one cannot be answered by this cache.
 *
 * **In memory and short lived, like everything else here.** A minute is longer
 * than it takes to open a dialog and shorter than anybody would wait before
 * expecting a payment to show up. A failed scan is not kept: the next mount
 * tries again, which is right for a read that failed because an endpoint was
 * busy.
 */
const FRESH_MS = 60_000;
const scans = new Map<string, { at: number; result: Promise<Book> }>();

function cachedScan(key: string, run: () => Promise<Book>): Promise<Book> {
  const hit = scans.get(key);
  if (hit && Date.now() - hit.at < FRESH_MS) return hit.result;

  const result = run().catch((e: unknown) => {
    scans.delete(key);
    throw e;
  });
  scans.set(key, { at: Date.now(), result });
  return result;
}

export function useShieldedBook(): Book {
  const keys = useShieldedKeys();
  const network = useNetwork();
  const mpk = keys?.mpk;

  /*
    Keyed by the account **and the chain** it belongs to, and both of the states
    that are not a result are derived rather than stored.

    That is what makes a stale scan harmless. Sign out, sign in as somebody
    else, and the first account's scan can still land afterwards; carrying the
    `mpk` it was for means the render compares it to the account on screen and
    ignores it, instead of showing one person's balance to another.

    The network half is the same argument for the bar's chain picker. Switching
    to mainnet while a testnet scan is in flight would otherwise let the testnet
    result land under a bar that now says Mainnet, which is the reading this app
    must never present: an empty pool and a real one are told apart by a label,
    and here the label would be lying. Carrying the key means the late result is
    ignored and the screen stays on `scanning` until the right chain answers.
  */
  const [done, setDone] = useState<{ mpk: bigint; network: NetworkKey; book: Book } | null>(
    null,
  );

  useEffect(() => {
    if (!keys || mpk === undefined) return;

    let live = true;

    cachedScan(`${network.key}:${mpk}`, async (): Promise<Book> => {
      for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
        const result = await scanPool(keys, network);

        if (result.integrity.kind === "moved" && attempt < MAX_ATTEMPTS) continue;

        const holdings = await Promise.all(
          balanceOf(result.notes).map(async (b) => ({
            token: b.token,
            amount: b.amount,
            notes: b.notes,
            ceiling: b.ceiling,
            meta: await tokenMetaFor(b.token, network),
          })),
        );

        /*
          The history is read after the balance and never instead of it. Both
          come out of one replay, so they cannot disagree, but the dates behind
          the movements are extra requests: a chain that answers the pool and
          stalls on `eth_getBlockByNumber` should cost somebody their activity
          list, not their balance.
        */
        const now = Date.now();
        const history = await recentMovements(result.ledger, network, Math.floor(now / 1000));
        const movements = await Promise.all(
          history.movements.map(async (m) => ({
            id: m.id,
            kind: m.kind,
            token: m.token,
            amount: m.amount,
            at: m.at,
            meta: await tokenMetaFor(m.token, network),
            intoToken: m.intoToken,
            intoAmount: m.intoAmount,
            intoMeta:
              m.intoToken === undefined ? undefined : await tokenMetaFor(m.intoToken, network),
          })),
        );
        return {
          state: "ready",
          holdings,
          movements,
          coversWindow: history.coversWindow,
          leaves: result.leaves,
          integrity: result.integrity,
          at: now,
        };
      }

      /* Unreachable: the loop either returns or continues, and the last attempt
         cannot continue. Here so the shape is a `Book` rather than a maybe. */
      return { state: "scanning" };
    })
      .then((book) => {
        if (live) setDone({ mpk, network: network.key, book });
      })
      .catch((e: unknown) => {
        if (!live) return;
        /*
          The reason is carried rather than swallowed. A scan that fails silently
          renders an empty balance, and an empty balance is what being robbed
          looks like: the one failure this app must never present as calm.
        */
        setDone({
          mpk,
          network: network.key,
          book: { state: "failed", reason: e instanceof Error ? e.message : String(e) },
        });
      });

    return () => {
      live = false;
    };
  }, [keys, mpk, network]);

  if (!keys || mpk === undefined) return { state: "locked" };
  if (done?.mpk !== mpk || done.network !== network.key) return { state: "scanning" };
  return done.book;
}
