"use client";

/**
 * What is sitting on the public deposit address right now.
 *
 * **A plain chain read of a plain address**, which is exactly what it looks
 * like: a funnel is public by design, its whole job is to be given out, and
 * anyone who was handed it can watch it as easily as this does. Nothing here
 * touches the shielded side.
 *
 * **It polls, because an arrival is somebody else's action.** A payment lands
 * when the payer sends it, and a screen that only read once would sit there
 * saying nothing had arrived while the money was already there. The interval is
 * slow enough to be background noise on a public RPC and fast enough that a
 * person watching for their own deposit sees it without reloading.
 *
 * The registry is what gets asked about, so the calls are the same for every
 * reader on a network rather than a list of what this account expects.
 */
import { useEffect, useState } from "react";
import { tokensFor, type Network } from "@/config";
import { useNetwork } from "@/lib/network";
import { tokenField } from "@/lib/price";
import { clientFor } from "@/lib/rpc";
import type { TokenAmount } from "../types";

const ERC20_BALANCE_ABI = [
  {
    type: "function",
    name: "balanceOf",
    stateMutability: "view",
    inputs: [{ name: "owner", type: "address" }],
    outputs: [{ type: "uint256" }],
  },
] as const;

/** How often the funnel is re-read while a receive surface is on screen. */
const EVERY_MS = 12_000;

export type Arrivals =
  | { state: "reading" }
  /** Everything the registry can name that this address holds. Empty is normal. */
  | { state: "ready"; holding: TokenAmount[] };

async function read(network: Network, address: `0x${string}`): Promise<TokenAmount[]> {
  const client = clientFor(network);
  const tokens = tokensFor(network);

  const balances = await Promise.all(
    tokens.map(async (t): Promise<TokenAmount | null> => {
      try {
        const amount = t.address
          ? await client.readContract({
              address: t.address,
              abi: ERC20_BALANCE_ABI,
              functionName: "balanceOf",
              args: [address],
            })
          : await client.getBalance({ address });

        return amount > 0n
          ? { symbol: t.symbol, amount, decimals: t.decimals, token: tokenField(t) }
          : null;
      } catch {
        /* One token that will not answer is one row missing, not a screen that
           fails. The others are still the truth about this address. */
        return null;
      }
    }),
  );

  return balances.filter((b): b is TokenAmount => b !== null);
}

export function useArrivals(address: `0x${string}` | null): Arrivals {
  const network = useNetwork();
  const [done, setDone] = useState<{ key: string; holding: TokenAmount[] } | null>(null);

  const key = address ? `${network.key}:${address}` : null;

  useEffect(() => {
    if (!address || key === null) return;
    let live = true;

    const load = () => {
      read(network, address)
        .then((holding) => {
          if (live) setDone({ key, holding });
        })
        .catch(() => {
          /* Leave the last good answer on screen. A failed poll is not evidence
             that the money left. */
        });
    };

    load();
    const id = window.setInterval(load, EVERY_MS);
    return () => {
      live = false;
      window.clearInterval(id);
    };
  }, [network, address, key]);

  if (key === null || done?.key !== key) return { state: "reading" };
  return { state: "ready", holding: done.holding };
}
