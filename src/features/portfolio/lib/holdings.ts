/**
 * Turning what the pool holds into what this screen renders.
 *
 * `Holding` is the shielded feature's shape, amounts and token ids. `Asset` is
 * this screen's, with a name and a place to put the decimal point. The mapping
 * is here rather than in `shielded` because it is a rendering decision: what a
 * row is called when nothing will name it is a question about this panel.
 */
import type { Prices } from "@/lib/price";
import type { Holding } from "@/features/shielded";
import type { Asset } from "../types";

/**
 * `prices` is keyed by the pool's token id and never by ticker, which is the
 * one detail here that is about money rather than about layout. An ERC-20
 * chooses its own symbol, so a token calling itself USDG would be handed a
 * dollar each by a table keyed on what it calls itself.
 */
export function toAssets(holdings: Holding[], prices: Prices): Asset[] {
  return holdings.map((h) => {
    if (h.meta) {
      return {
        symbol: h.meta.symbol,
        name: h.meta.name,
        decimals: h.meta.decimals,
        balance: h.amount,
        /**
         * **The venue's own quote, or nothing.** `lib/price.ts` prices the
         * curated registry from the pools a trade would execute against, and a
         * token it will not quote comes back absent rather than guessed at.
         * `null` renders as no valuation, and the total above these rows is
         * summed from the same table, so the two cannot disagree.
         */
        price: prices.get(h.token) ?? null,
        logoURI: h.meta.logoURI,
      };
    }

    /*
      A token that answers neither the registry nor its own `symbol()`.

      Shown rather than hidden, because a row nobody can read is still somebody's
      money and dropping it would under-report a balance silently, which is the
      failure this whole path is built to avoid. `decimals: 0` is the only honest
      choice left: the amount is printed in base units because base units are the
      only thing actually known about it.
    */
    const address = `0x${h.token.toString(16).padStart(40, "0")}`;
    return {
      symbol: `${address.slice(0, 6)}…${address.slice(-4)}`,
      name: "Unnamed token",
      decimals: 0,
      balance: h.amount,
      /* Unnameable and therefore unpriceable: without decimals there is no
         whole unit for a price to be per. */
      price: null,
    };
  });
}
