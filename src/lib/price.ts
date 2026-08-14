"use client";

/**
 * What a token is worth in dollars, asked of the chain and of nothing else.
 *
 * **The venue's own quoter, which is the same set of pools a trade would
 * execute against.** Ported from `cli/src/shielded/betacap.ts`, which is the
 * source of record for how this project prices anything, with one deliberate
 * subtraction: the CLI falls back to the explorer's REST rate for tokens the
 * venue cannot quote, and this app does not. That fallback is an HTTPS request
 * to a third party naming a token, sent from the browser holding it, on a screen
 * whose entire premise is that nobody can learn what is held. A token nothing on
 * chain will price renders with no valuation instead, which is a state the
 * portfolio already carries as `price: null`.
 *
 * **The request set is the same for everybody on a network.** Prices are asked
 * for the curated registry, never for "the tokens this book holds", so the calls
 * an RPC sees are identical whether the reader holds one token or all of them.
 * Pricing exactly the holdings would have turned the one read that reveals
 * nothing into a list of what this browser owns.
 *
 * **Keyed by the pool's token id, never by ticker.** A symbol is a string an
 * ERC-20 chooses for itself, so a token that calls itself USDG and is not the
 * Global Dollar would be handed a dollar each by a symbol-keyed table. The id is
 * the address, and the address is the asset.
 */
import { useEffect, useState } from "react";
import { formatUnits, type Address } from "viem";
import { tokensFor, type Network, type NetworkKey, type Token } from "@/config";
import { useNetwork } from "./network";
import { clientFor } from "./rpc";

/** USD per whole token, by the field element the pool uses. 0 is the native coin. */
export type Prices = ReadonlyMap<bigint, number>;

export const NO_PRICES: Prices = new Map();

/**
 * Every tier, and the **median** of whatever answers.
 *
 * Not the best quote and not the first one that returns. One stale pool at a
 * tier nobody uses is enough to set a portfolio figure otherwise: the dapp found
 * NVDA quoted at a two-hundred-and-fiftieth of its value by a single 0.01% pool,
 * and a mean would have carried a quarter of that error into the total.
 */
const FEE_TIERS = [100, 500, 3000, 10000] as const;

/**
 * `nonpayable` in the ABI, which is why this is `simulateContract` and not
 * `readContract`. Uniswap's quoter mutates and reverts its way to an answer, so
 * there is no view function to call: it is an `eth_call` against a function that
 * would be a write if anybody sent it.
 */
const QUOTER_ABI = [
  {
    type: "function",
    name: "quoteExactInputSingle",
    stateMutability: "nonpayable",
    inputs: [
      {
        name: "params",
        type: "tuple",
        components: [
          { name: "tokenIn", type: "address" },
          { name: "tokenOut", type: "address" },
          { name: "amountIn", type: "uint256" },
          { name: "fee", type: "uint24" },
          { name: "sqrtPriceLimitX96", type: "uint160" },
        ],
      },
    ],
    outputs: [
      { name: "amountOut", type: "uint256" },
      { name: "sqrtPriceX96After", type: "uint160" },
      { name: "initializedTicksCrossed", type: "uint32" },
      { name: "gasEstimate", type: "uint256" },
    ],
  },
] as const;

function median(values: number[]): number | null {
  if (values.length === 0) return null;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[mid]! : (sorted[mid - 1]! + sorted[mid]!) / 2;
}

/** The pool's id for a token: the address as a field element, 0 for the coin. */
export function tokenField(token: Token): bigint {
  return token.address ? BigInt(token.address) : 0n;
}

/** One whole `tokenIn` in `tokenOut`, across tiers, median of what answers. */
async function quoteAcrossTiers(
  network: Network,
  tokenIn: Address,
  tokenOut: Address,
  decimalsIn: number,
  decimalsOut: number,
): Promise<number | null> {
  const quoter = network.contracts.quoter;
  if (!quoter || tokenIn.toLowerCase() === tokenOut.toLowerCase()) return null;

  const client = clientFor(network);

  const answers = await Promise.all(
    FEE_TIERS.map(async (fee) => {
      try {
        const { result } = await client.simulateContract({
          address: quoter,
          abi: QUOTER_ABI,
          functionName: "quoteExactInputSingle",
          args: [
            {
              tokenIn,
              tokenOut,
              amountIn: 10n ** BigInt(decimalsIn),
              fee,
              sqrtPriceLimitX96: 0n,
            },
          ],
        });
        const out = Number(formatUnits(result[0], decimalsOut));
        return Number.isFinite(out) && out > 0 ? out : null;
      } catch {
        /* No pool at this tier, or one too thin to fill a whole unit. Neither is
           an error: it is the tier declining to be part of the median. */
        return null;
      }
    }),
  );

  return median(answers.filter((a): a is number => a !== null));
}

/** A token as the quoter needs it: the pool's id, and where its point goes. */
export type Quotable = { token: bigint; decimals: number };

/**
 * How many `to` one whole `from` buys, straight from the venue.
 *
 * **A pair question, not a dollar question**, which is why it does not go
 * through the price table above. Two tokens have a pool between them or they do
 * not, and asking what each is worth in dollars first would refuse on any chain
 * whose dollars are not real while the pair itself quotes perfectly well.
 *
 * The native coin is quoted as its wrapper, which is the same asset and the one
 * a pool actually holds.
 *
 * **Indicative, and the caller has to say so.** This is the spot answer for one
 * whole unit; what a trade executes at depends on its size and on the route
 * taken, and neither is decided here.
 */
export async function quoteUnitRate(
  network: Network,
  from: Quotable,
  to: Quotable,
): Promise<number | null> {
  const tokens = tokensFor(network);
  const weth = tokens.find((t) => t.symbol === "WETH");

  const resolve = (q: Quotable): { address: Address; decimals: number } | null => {
    if (q.token !== 0n) {
      return { address: `0x${q.token.toString(16).padStart(40, "0")}`, decimals: q.decimals };
    }
    return weth?.address ? { address: weth.address, decimals: weth.decimals } : null;
  };

  const a = resolve(from);
  const b = resolve(to);
  if (!a || !b) return null;

  return quoteAcrossTiers(network, a.address, b.address, a.decimals, b.decimals);
}

/**
 * Dollar prices for a network's curated tokens.
 *
 * **A test chain has no prices at all, and that is the important line.** Its
 * WETH and USDG are stand-ins deployed for a venue to route through, and their
 * pool holds whatever somebody seeded it with. Quoting them produces a number,
 * which is exactly the danger: a rehearsal balance carrying a dollar figure is
 * indistinguishable from money, and the figure would be sourced from a pool
 * anybody can move for the price of a test transaction.
 *
 * USDG is the unit of account and is a dollar by definition rather than by
 * quote. Asking the venue what one Global Dollar is worth in Global Dollars is
 * circular, and answering it from a pool would let a thin pool reprice the whole
 * screen.
 */
export async function pricesFor(network: Network): Promise<Prices> {
  if (network.testnet || !network.contracts.quoter) return NO_PRICES;

  const tokens = tokensFor(network);
  const usdg = tokens.find((t) => t.symbol === "USDG");
  const weth = tokens.find((t) => t.symbol === "WETH");
  if (!usdg?.address) return NO_PRICES;

  const priced = await Promise.all(
    tokens.map(async (token): Promise<[bigint, number] | null> => {
      if (token.symbol === "USDG") return [tokenField(token), 1];

      /* The coin has no pool of its own. Its wrapper is the same asset, and the
         wrapper is what every venue actually holds. */
      const address = token.native ? weth?.address : token.address;
      const decimals = token.native ? (weth?.decimals ?? token.decimals) : token.decimals;
      if (!address) return null;

      const direct = await quoteAcrossTiers(
        network,
        address,
        usdg.address!,
        decimals,
        usdg.decimals,
      );
      if (direct !== null) return [tokenField(token), direct];

      /* No dollar pool for it. The wrapper has one, so price it in the wrapper
         and convert. Two quotes, and the error compounds, which is why this is
         the fallback rather than the route. */
      if (weth?.address && address.toLowerCase() !== weth.address.toLowerCase()) {
        const inWeth = await quoteAcrossTiers(
          network,
          address,
          weth.address,
          decimals,
          weth.decimals,
        );
        const wethUsd = await quoteAcrossTiers(
          network,
          weth.address,
          usdg.address!,
          weth.decimals,
          usdg.decimals,
        );
        if (inWeth !== null && wethUsd !== null) return [tokenField(token), inWeth * wethUsd];
      }

      return null;
    }),
  );

  return new Map(priced.filter((p): p is [bigint, number] => p !== null));
}

/**
 * One fetch per network per session window, shared by every screen that asks.
 *
 * **In memory, like everything else here.** The balance screen and an open swap
 * both want the same table, and two components mounting is not two reasons to
 * ask a venue the same question. The window is short because a price moves and
 * a stale one is a wrong total; it is not zero because a re-render is not a
 * reason to spend four `eth_call`s per token.
 *
 * A failed fetch is not cached. The next mount tries again, which is the right
 * behaviour for a chain read that failed because an endpoint was busy.
 */
const CACHE_MS = 60_000;
const cache = new Map<string, { at: number; table: Promise<Prices> }>();

function cachedPricesFor(network: Network): Promise<Prices> {
  const hit = cache.get(network.key);
  if (hit && Date.now() - hit.at < CACHE_MS) return hit.table;

  const table = pricesFor(network).catch((e: unknown) => {
    cache.delete(network.key);
    throw e;
  });
  cache.set(network.key, { at: Date.now(), table });
  return table;
}

/**
 * Prices for the network in force, empty until they arrive.
 *
 * Empty rather than a loading flag, and the difference matters on screen: a
 * portfolio with no prices renders every row without a valuation, which is also
 * what a chain that will not price anything looks like. Both are the honest
 * "nothing is claiming to know what this is worth", and the total above the
 * rows is built from the same table, so it cannot disagree with them.
 */
export function usePrices(): Prices {
  const network = useNetwork();

  /*
    The table carries the chain it was read on, and the render compares. Same
    shape as `useShieldedBook`, for the same reason: a switch must not leave one
    chain's prices under another chain's balances, and clearing the state in the
    effect would be a second render pass to say what this comparison says for
    free.
  */
  const [done, setDone] = useState<{ network: NetworkKey; table: Prices } | null>(null);

  useEffect(() => {
    let live = true;

    cachedPricesFor(network)
      .then((table) => {
        if (live) setDone({ network: network.key, table });
      })
      .catch(() => {
        /* A price that cannot be read is a row without a valuation, never a
           screen that fails. The balance itself came from the pool and is not
           in question here. */
      });

    return () => {
      live = false;
    };
  }, [network]);

  return done?.network === network.key ? done.table : NO_PRICES;
}
