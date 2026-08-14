/**
 * Seven days of this book's value, rebuilt backwards from what it holds now.
 *
 * **There is no stored history to draw, so the line is derived rather than
 * recorded.** Today's holdings are known exactly, every movement since is known
 * exactly, and undoing them one at a time gives what was held at any earlier
 * moment. Nothing is written down between sessions, which is the same property
 * the whole app is built on, and it costs nothing here: the chain kept the
 * record and this rebuilds it.
 *
 * **What the line is not is a market chart.** There is one price per token, the
 * venue's quote right now, and no price history anywhere in this app. So the
 * shape is what this account's holdings did, valued throughout at today's price:
 * money arriving lifts it and money leaving drops it, and a token that doubled
 * overnight moves nothing. That is the honest reading of the only data on hand,
 * and it is the reading a balance screen wants anyway, but it must never be
 * captioned as performance.
 *
 * **It refuses rather than approximates.** No prices, an incomplete movement
 * list, or one movement in a token nothing will price, and the answer is no line
 * at all. Each of those produces a chart that is drawable and wrong, which on a
 * balance screen is the worst of the three outcomes.
 */
import type { Holding, Move } from "@/features/shielded";
import type { Prices } from "@/lib/price";
import type { TracePoint } from "../types";
import { wholeUnits } from "./activity";

/** Seven readings, the last one being now. */
const DAYS = 7;

export type TraceInput = {
  holdings: Holding[];
  /** Newest first, as the book hands them over. */
  movements: Move[];
  prices: Prices;
  /** False when the movement list does not reach back past the window. */
  coversWindow: boolean;
  /** Unix seconds. One instant for the whole screen. */
  now: number;
};

/** What one holding is worth right now, or null when nothing will price it. */
function worth(
  token: bigint,
  amount: bigint,
  decimals: number | undefined,
  prices: Prices,
): number | null {
  const price = prices.get(token);
  if (price === undefined || decimals === undefined) return null;
  return wholeUnits(amount, decimals) * price;
}

/**
 * The dollars a movement added to this book, negative when it took some away.
 *
 * Null means at least one side of it cannot be priced, which makes the whole
 * movement unusable: a swap with a priced input and an unpriced output would
 * otherwise read as money vanishing.
 */
function effect(move: Move, prices: Prices): number | null {
  const out = worth(move.token, move.amount, move.meta?.decimals, prices);
  if (out === null) return null;

  if (move.kind === "receive") return out;
  if (move.kind === "send") return -out;

  if (move.intoToken === undefined || move.intoAmount === undefined) return null;
  const bought = worth(move.intoToken, move.intoAmount, move.intoMeta?.decimals, prices);
  if (bought === null) return null;
  return bought - out;
}

/** The value of everything priced, right now. Unpriced rows are simply absent. */
export function totalUsd(holdings: Holding[], prices: Prices): number | null {
  const priced = holdings
    .map((h) => worth(h.token, h.amount, h.meta?.decimals, prices))
    .filter((v): v is number => v !== null);

  if (priced.length === 0) return null;
  return priced.reduce((sum, v) => sum + v, 0);
}

export function traceOf({
  holdings,
  movements,
  prices,
  coversWindow,
  now,
}: TraceInput): TracePoint[] {
  const value = totalUsd(holdings, prices);
  if (value === null || !coversWindow) return [];

  const window = now - (DAYS - 1) * 24 * 60 * 60;
  const inWindow = movements.filter((m) => m.at >= window);

  const effects: { at: number; usd: number }[] = [];
  for (const move of inWindow) {
    const usd = effect(move, prices);
    if (usd === null) return [];
    effects.push({ at: move.at, usd });
  }

  /*
    Sampled at the end of each day rather than at its start, so the last reading
    is this moment and not this morning. The figure printed above the chart is
    the same `value`, and a chart whose right hand end disagreed with the number
    over it would be read as one of the two being broken.
  */
  return Array.from({ length: DAYS }, (_, i) => {
    const daysAgo = DAYS - 1 - i;
    const at = daysAgo === 0 ? now : endOfDay(now, daysAgo);
    const since = effects.filter((e) => e.at > at).reduce((sum, e) => sum + e.usd, 0);
    return { t: label(daysAgo), usd: value - since };
  });
}

/** Local midnight at the end of a day that many days back, which is what a reader means. */
function endOfDay(now: number, daysAgo: number): number {
  const d = new Date(now * 1000);
  d.setHours(0, 0, 0, 0);
  return Math.floor(d.getTime() / 1000) - (daysAgo - 1) * 24 * 60 * 60;
}

function label(daysAgo: number): string {
  if (daysAgo === 0) return "Today";
  if (daysAgo === 1) return "Yesterday";
  return `${daysAgo} days ago`;
}
