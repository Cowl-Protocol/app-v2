/**
 * The book's movements, as rows a person reads.
 *
 * The shielded feature hands over what it can prove from its own notes: a
 * direction, a token, an amount and the block's own clock. This turns the last
 * of those into words, which is a rendering decision and therefore lives on this
 * side of the boundary.
 *
 * **Two kinds never appear**, `shield` and `unshield`, and `features/shielded`'s
 * history module carries the reason: the pool emits no boundary event, so a
 * deposit and a payment are the same three logs. The labels stay in the type for
 * the day something can honestly tell them apart.
 */
import type { Move } from "@/features/shielded";
import { toDecimalString } from "@/lib/format";
import type { Activity } from "../types";

const MINUTE = 60;
const HOUR = 60 * MINUTE;
const DAY = 24 * HOUR;

/**
 * How long ago, in the shape the panel was designed around.
 *
 * **Days are calendar days, not multiples of 24 hours.** Something that happened
 * at eleven last night is "Yesterday" at nine this morning, and calling it "10h
 * ago" is technically true and reads as a machine's answer. Anything inside the
 * hour is "Just now" rather than a count of minutes: on a payment history the
 * minute is never the thing being asked.
 *
 * `now` is an argument so the whole screen dates against one instant. A helper
 * reading the clock itself renders rows that disagree with each other by however
 * long the render took.
 */
export function relativeTime(at: number, now: number): string {
  const seconds = Math.max(0, now - at);
  if (seconds < HOUR) return "Just now";
  if (seconds < 12 * HOUR) return `${Math.floor(seconds / HOUR)}h ago`;

  const days = calendarDaysBetween(at, now);
  if (days === 0) return `${Math.floor(seconds / HOUR)}h ago`;
  if (days === 1) return "Yesterday";
  if (days < 7) return `${days} days ago`;
  if (days < 14) return "Last week";
  if (days < 60) return `${Math.floor(days / 7)} weeks ago`;
  return `${Math.floor(days / 30)} months ago`;
}

/** Midnight to midnight in the reader's own timezone, which is what "yesterday" means. */
function calendarDaysBetween(at: number, now: number): number {
  const then = new Date(at * 1000);
  const today = new Date(now * 1000);
  then.setHours(0, 0, 0, 0);
  today.setHours(0, 0, 0, 0);
  return Math.round((today.getTime() - then.getTime()) / (DAY * 1000));
}

/**
 * A token that answered nothing gets its own id printed in base units.
 *
 * The same ruling the asset table already follows: a row nobody can name is
 * still somebody's money, and dropping it under-reports a history silently.
 * Decimals of zero is the only honest scale left, because base units are the
 * only thing actually known.
 */
function nameOf(meta: Move["meta"], token: bigint): { symbol: string; decimals: number } {
  if (meta) return { symbol: meta.symbol, decimals: meta.decimals };
  const address = `0x${token.toString(16).padStart(40, "0")}`;
  return { symbol: `${address.slice(0, 6)}…${address.slice(-4)}`, decimals: 0 };
}

export function toActivity(movements: Move[], now: number): Activity[] {
  return movements.map((m) => {
    const { symbol, decimals } = nameOf(m.meta, m.token);
    const into =
      m.intoToken === undefined ? null : nameOf(m.intoMeta ?? null, m.intoToken);

    return {
      id: m.id,
      kind: m.kind,
      symbol,
      intoSymbol: into?.symbol,
      amount: m.amount,
      decimals,
      when: relativeTime(m.at, now),
    };
  });
}

/** Whole units of a movement's token, for arithmetic that is about value. */
export function wholeUnits(amount: bigint, decimals: number): number {
  return Number(toDecimalString(amount, decimals));
}
