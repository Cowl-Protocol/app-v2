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
 */
import { useEffect, useState } from "react";
import { useShieldedKeys } from "@/features/auth/keys";
import { balanceOf, scanPool, type ScanIntegrity } from "./scan";
import { tokenMetaFor, type TokenMeta } from "./token-meta";

export type Holding = {
  /** The pool's token id. 0 is the native coin. */
  token: bigint;
  /** Base units, unspent. */
  amount: bigint;
  /** How many notes it is spread across, which is what a spend is limited by. */
  notes: number;
  /** Null when neither the registry nor the chain would name it. */
  meta: TokenMeta | null;
};

export type Book =
  /** No session. Also every first render, because this app starts from nothing. */
  | { state: "locked" }
  | { state: "scanning" }
  | { state: "ready"; holdings: Holding[]; leaves: number; integrity: ScanIntegrity }
  | { state: "failed"; reason: string };

/**
 * A `moved` result means the chain gained a leaf while we were reading it, which
 * is ordinary and settles itself. Bounded, because a pool being written to
 * continuously would otherwise rescan forever and never render.
 */
const MAX_ATTEMPTS = 3;

export function useShieldedBook(): Book {
  const keys = useShieldedKeys();
  const mpk = keys?.mpk;

  /*
    Keyed by the account it belongs to, and both of the states that are not a
    result are derived rather than stored.

    That is what makes a stale scan harmless. Sign out, sign in as somebody
    else, and the first account's scan can still land afterwards; carrying the
    `mpk` it was for means the render compares it to the account on screen and
    ignores it, instead of showing one person's balance to another.
  */
  const [done, setDone] = useState<{ mpk: bigint; book: Book } | null>(null);

  useEffect(() => {
    if (!keys || mpk === undefined) return;

    let live = true;

    (async () => {
      for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
        const result = await scanPool(keys);
        if (!live) return;

        if (result.integrity.kind === "moved" && attempt < MAX_ATTEMPTS) continue;

        const holdings = await Promise.all(
          balanceOf(result.notes).map(async (b) => ({
            token: b.token,
            amount: b.amount,
            notes: b.notes,
            meta: await tokenMetaFor(b.token),
          })),
        );
        if (!live) return;

        setDone({
          mpk,
          book: { state: "ready", holdings, leaves: result.leaves, integrity: result.integrity },
        });
        return;
      }
    })().catch((e: unknown) => {
      if (!live) return;
      /*
        The reason is carried rather than swallowed. A scan that fails silently
        renders an empty balance, and an empty balance is what being robbed
        looks like: the one failure this app must never present as calm.
      */
      setDone({
        mpk,
        book: { state: "failed", reason: e instanceof Error ? e.message : String(e) },
      });
    });

    return () => {
      live = false;
    };
  }, [keys, mpk]);

  if (!keys || mpk === undefined) return { state: "locked" };
  if (done?.mpk !== mpk) return { state: "scanning" };
  return done.book;
}
