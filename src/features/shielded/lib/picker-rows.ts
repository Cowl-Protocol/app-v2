import type { SelectableToken } from "@/components/ui/token-select";
import { formatAmount } from "@/lib/format";
import type { Prices } from "@/lib/price";
import type { SpendableToken } from "../types";

/**
 * The book, shaped for the picker: balance on the right, its dollar value
 * under it, exactly the two facts the dapp's rows carry. Formatting happens
 * here so the picker itself never learns what a balance is — it renders
 * strings, and staying that ignorant is what lets `request` share it.
 */
export function pickerRows(book: SpendableToken[], prices: Prices): SelectableToken[] {
  return book.map((t) => {
    const whole = Number(formatAmount(t.balance, t.decimals).replace(/,/g, ""));
    const price = prices.get(t.token);
    return {
      symbol: t.symbol,
      name: t.name,
      logoURI: t.logoURI,
      detail: formatAmount(t.balance, t.decimals),
      detailSub:
        price === undefined
          ? undefined
          : `$${(whole * price).toLocaleString("en-US", { maximumFractionDigits: 2 })}`,
    };
  });
}
