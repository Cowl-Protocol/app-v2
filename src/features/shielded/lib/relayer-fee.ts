"use client";

/**
 * What the relayer charges to carry one spend, asked of the relayer.
 *
 * **A quote, not a constant.** The fee is gas priced in the token being sent, so
 * it moves with the chain and with the token, and the one number that used to
 * sit in this feature's placeholder was a figure measured once during the
 * airdrop. A stale fee is not a cosmetic error: the fee rides inside the same
 * spend as the amount, so a send composed against a number that is too low is a
 * send that gets refused after the proof is built.
 *
 * **The relayer is asked, and it is the only thing asked.** `GET /quote` is a
 * public endpoint on our own relayer, it takes a token address and returns the
 * fee in that token, and it declines with 503 when its own gas float has run
 * out. That refusal is worth surfacing rather than smoothing over: a relayer
 * that cannot carry a spend is a send that will not go through, and the honest
 * time to say so is before somebody types an amount.
 *
 * **What it tells the relayer is what using it would tell it anyway.** Asking
 * for a quote in one token says this browser is about to send that token, which
 * is exactly what handing it the spend says a moment later. It is asked only
 * when a spend surface is open and a token is chosen, never on the balance
 * screen.
 */
import { useEffect, useState } from "react";
import { type Network } from "@/config";
import { useNetwork } from "@/lib/network";

export type FeeQuote =
  | { state: "quoting" }
  /** Base units of the token asked about. */
  | { state: "quoted"; fee: bigint }
  /** No relayer, no float, or no answer. The reason is for the person, not a log. */
  | { state: "unavailable"; reason: string };

/** `0` is the native coin in the relayer's own query language, same as the pool's. */
function tokenParam(token: bigint): string {
  return token === 0n ? "0" : `0x${token.toString(16).padStart(40, "0")}`;
}

/**
 * A trade is two proof verifications and a swap, so the relayer sizes its quote
 * differently for one. Asking for a spend's fee and doubling it was the
 * placeholder's arithmetic; the relayer already knows the real answer and this
 * is the parameter that asks for it.
 */
export type FeeOp = "spend" | "trade";

async function quote(network: Network, token: bigint, op: FeeOp): Promise<FeeQuote> {
  const url = `${network.relay}/quote?token=${tokenParam(token)}${op === "trade" ? "&op=trade" : ""}`;

  let res: Response;
  try {
    res = await fetch(url);
  } catch {
    return { state: "unavailable", reason: "The relayer did not answer." };
  }

  if (res.status === 503) {
    return { state: "unavailable", reason: "The relayer is out of gas right now." };
  }
  if (!res.ok) {
    return { state: "unavailable", reason: "The relayer would not quote this token." };
  }

  try {
    const body = (await res.json()) as { fee?: string; chainId?: number };

    /*
      The chain is checked rather than trusted. A relayer pointed at the wrong
      network would quote a fee in the right shape and the wrong money, and the
      spend built against it would be refused by a pool that never heard of it.
    */
    if (body.chainId !== network.chainId) {
      return { state: "unavailable", reason: "The relayer is on a different network." };
    }

    const fee = BigInt(body.fee ?? "");
    if (fee < 0n) throw new Error("negative");
    return { state: "quoted", fee };
  } catch {
    return { state: "unavailable", reason: "The relayer's answer could not be read." };
  }
}

/**
 * The fee for one token, re-asked when the token or the chain changes.
 *
 * Null asks nothing, which is the state before a token is chosen.
 */
export function useRelayerFee(token: bigint | null, op: FeeOp = "spend"): FeeQuote {
  const network = useNetwork();
  const [done, setDone] = useState<{ key: string; quote: FeeQuote } | null>(null);

  const key = token === null ? null : `${network.key}:${op}:${token}`;

  useEffect(() => {
    if (token === null || key === null) return;
    let live = true;

    quote(network, token, op).then((q) => {
      if (live) setDone({ key, quote: q });
    });

    return () => {
      live = false;
    };
  }, [network, token, op, key]);

  if (key === null) return { state: "unavailable", reason: "No token chosen." };
  return done?.key === key ? done.quote : { state: "quoting" };
}
