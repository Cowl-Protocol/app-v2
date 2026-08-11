/**
 * Portfolio-only formatting. The general helpers moved to `@/lib/format` when a
 * second feature needed them; what is left here is what only a holdings screen
 * asks: what a position is worth, and how much of the book it is.
 */
import { toDecimalString } from "@/lib/format";

/**
 * What one holding is worth, in USD.
 *
 * The float appears here and nowhere earlier. Scaling by string first keeps the
 * full balance intact, and the only thing lost to the conversion is precision
 * far below a cent.
 */
export function usdValue(
  balance: bigint,
  decimals: number,
  price: number | null,
): number | null {
  if (price === null) return null;
  return Number(toDecimalString(balance, decimals)) * price;
}

/** A percentage for a share bar. Guards the empty portfolio, which is division by zero. */
export function share(part: number | null, total: number): number {
  if (part === null || total <= 0) return 0;
  return Math.min(100, Math.max(0, (part / total) * 100));
}
