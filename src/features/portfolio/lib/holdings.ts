/**
 * Turning what the pool holds into what this screen renders.
 *
 * `Holding` is the shielded feature's shape, amounts and token ids. `Asset` is
 * this screen's, with a name and a place to put the decimal point. The mapping
 * is here rather than in `shielded` because it is a rendering decision: what a
 * row is called when nothing will name it is a question about this panel.
 */
import type { Holding } from "@/features/shielded";
import type { Asset } from "../types";

export function toAssets(holdings: Holding[]): Asset[] {
  return holdings.map((h) => {
    if (h.meta) {
      return {
        symbol: h.meta.symbol,
        name: h.meta.name,
        decimals: h.meta.decimals,
        balance: h.amount,
        /**
         * **No price, and no invented one.** There is no price source in this
         * app yet, and a number in this column decides what the total above it
         * says. `null` renders as no valuation, which is the honest state, and
         * the alternative is a portfolio figure nobody can source.
         */
        price: null,
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
      price: null,
    };
  });
}
