/**
 * The book, as a spend surface needs it.
 *
 * `Holding` is what the scan produced: a token id, an amount, how many notes it
 * is spread across and the two largest of them added together. This adds
 * nothing and invents nothing; it drops what a spend cannot use.
 *
 * **A token nothing will name is not offered for sending.** The balance screen
 * shows it, because it is somebody's money and hiding it would under-report a
 * balance. A send is different: without decimals there is no whole unit for an
 * amount to be in, so the field would be asking for a number in base units while
 * looking exactly like every other amount field in the app. The honest failure
 * is that it cannot be composed here yet, not that it can be composed wrong.
 */
import type { SpendableToken } from "../types";
import type { Holding } from "./use-book";

export function toSpendable(holdings: Holding[]): SpendableToken[] {
  return holdings
    .filter((h) => h.meta !== null)
    .map((h) => ({
      token: h.token,
      symbol: h.meta!.symbol,
      name: h.meta!.name,
      decimals: h.meta!.decimals,
      balance: h.amount,
      ceiling: h.ceiling,
      /* Quoted per token by `useRelayerFee` when a surface is open, never
         guessed at here. */
      fee: null,
      logoURI: h.meta!.logoURI,
    }));
}
