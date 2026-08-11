/**
 * Number formatting, shared by every surface that prints an amount.
 *
 * These live in `lib` rather than in a feature because a balance, a request and
 * a payment screen all print the same kinds of number and there must be exactly
 * one answer for how. They were in `features/portfolio` while it was the only
 * screen; the moment `request` needed them, the choice was between one shared
 * helper and `request` depending on `portfolio` forever to format an integer.
 *
 * Every function takes base units and does its own scaling. Nothing upstream is
 * allowed to hand these a float, because the conversion is exactly where
 * precision goes missing and a balance that is quietly short is the one bug a
 * wallet must never ship.
 */

/**
 * Base units to a decimal string, exactly, with no float in the path.
 *
 * `Number(balance) / 10 ** decimals` is the obvious version and it is wrong at
 * eighteen decimals: the integer alone passes the safe range at nine whole
 * tokens, so a three million token balance would round before it was ever
 * displayed. Splitting the digits by string keeps every one of them.
 */
export function toDecimalString(value: bigint, decimals: number): string {
  const neg = value < 0n;
  const digits = (neg ? -value : value).toString().padStart(decimals + 1, "0");
  const whole = digits.slice(0, digits.length - decimals);
  const frac = decimals === 0 ? "" : digits.slice(digits.length - decimals);
  return `${neg ? "-" : ""}${whole}${frac ? `.${frac}` : ""}`;
}

/**
 * A decimal string back to base units, exactly.
 *
 * The inverse of the above and it exists for one caller: a request link carries
 * whole tokens as text, and something has to turn what the recipient typed into
 * the integer a transfer is actually made of. Doing that with `parseFloat` and a
 * multiply is the same bug as above, pointed the other way.
 *
 * Extra fractional digits are **truncated, not rounded**. A person who typed
 * more precision than the token has is asking for something the token cannot
 * express, and rounding up would quietly ask their payer for more than they
 * wrote down.
 */
export function toBaseUnits(decimal: string, decimals: number): bigint {
  const [whole = "0", frac = ""] = decimal.trim().split(".");
  const padded = frac.slice(0, decimals).padEnd(decimals, "0");
  return BigInt(whole || "0") * 10n ** BigInt(decimals) + BigInt(padded || "0");
}

/**
 * An amount as a person reads it: grouped thousands, and a fraction cut to the
 * point where the next digit stops being information.
 *
 * The cut is by significance rather than by a fixed width. Three million COWL
 * does not need two decimal places and 0.0948 AAPL is nothing without four, so
 * a single rule for both prints one of them wrong. **It truncates and never
 * rounds up**: a display that rounds 0.99996 to 1.0000 tells someone they hold
 * a whole token they cannot spend.
 */
export function formatAmount(value: bigint, decimals: number): string {
  const exact = toDecimalString(value, decimals);
  const [whole, frac = ""] = exact.split(".");
  const w = whole ?? "0";

  const places = w !== "0" && w.length > 4 ? 0 : w !== "0" ? 2 : 6;
  const cut = frac.slice(0, places).replace(/0+$/, "");

  const grouped = w.replace(/\B(?=(\d{3})+(?!\d))/g, ",");
  return cut ? `${grouped}.${cut}` : grouped;
}

/** USD, two places, grouped. Null prices print as a dash rather than as zero. */
export function formatUsd(usd: number | null): string {
  if (usd === null || !Number.isFinite(usd)) return "·";
  return usd.toLocaleString("en-US", {
    style: "currency",
    currency: "USD",
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
}
