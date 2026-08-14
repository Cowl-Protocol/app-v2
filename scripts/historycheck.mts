/**
 * The money-shaped arithmetic behind the home screen, checked. Offline.
 *
 * Three things are pinned here and all three are wrong in ways nothing
 * downstream can notice:
 *
 * **What a movement was.** A join-split writes change back to its owner, so a
 * spend seen leaf by leaf looks like money leaving and money arriving at once.
 * Netting it per transaction is what turns that into one row saying what
 * actually left, and getting it wrong reads as somebody's whole balance having
 * moved.
 *
 * **What one send can move.** A spend reads two notes, so the ceiling is the sum
 * of the two largest and never the balance. Too high and the app composes sends
 * the circuit refuses; too low and it refuses sends that would have worked.
 *
 * **What the balance was.** The trace is rebuilt by undoing movements backwards
 * from today's holdings, so an unpriced token or a truncated history has to
 * produce no line at all rather than a line that starts at a number nobody held.
 */
import { __history } from "../src/features/shielded/lib/history";
import { balanceOf, type LedgerEntry, type OwnedNote } from "../src/features/shielded/lib/scan";
import type { Move, Holding } from "../src/features/shielded/lib/use-book";
import { relativeTime } from "../src/features/portfolio/lib/activity";
import { totalUsd, traceOf } from "../src/features/portfolio/lib/trace";

const { movementsIn } = __history;

let failures = 0;
let checks = 0;

function ok(label: string) {
  checks++;
  console.log(`  ok    ${label}`);
}

function fail(label: string, detail: string) {
  checks++;
  failures++;
  console.log(`  FAIL  ${label}\n        ${detail}`);
}

function is(label: string, actual: unknown, expected: unknown) {
  if (actual === expected) ok(label);
  else fail(label, `expected ${String(expected)}, got ${String(actual)}`);
}

const ETH = 0n;
const USDG = 0x5fc5360d0400a0fd4f2af552add042d716f1d168n;
const AAPL = 0x1111111111111111111111111111111111111111n;

function note(token: bigint, value: bigint, leafIndex = 0, spent = false): OwnedNote {
  return { leafIndex, value, token, blinding: 1n, spent };
}

function entry(ins: OwnedNote[], outs: OwnedNote[]): LedgerEntry {
  return { tx: "0xtx", block: 1n, ins, outs };
}

console.log("\nWhat a movement was\n");

{
  const got = movementsIn(entry([], [note(USDG, 250_000_000n)]));
  is("nothing of ours spent, so it arrived", got[0]?.kind, "receive");
  is("and it arrived whole", got[0]?.amount, 250_000_000n);
}

{
  /* Sent 40 out of a 100 note: 60 comes back as change and 40 left. */
  const got = movementsIn(entry([note(USDG, 100n)], [note(USDG, 60n)]));
  is("a spend with change is one movement, not two", got.length, 1);
  is("and it is a send", got[0]?.kind, "send");
  is("netted against its own change, so the row is what left", got[0]?.amount, 40n);
}

{
  /* The whole note went, and the circuit still wrote a zero output. */
  const got = movementsIn(entry([note(USDG, 100n)], [note(USDG, 0n)]));
  is("a spend with no change is still one movement", got.length, 1);
  is("and it moved the whole note", got[0]?.amount, 100n);
}

{
  const got = movementsIn(entry([note(ETH, 10n ** 18n)], [note(AAPL, 4n * 10n ** 18n)]));
  is("a different token out than in is a swap", got[0]?.kind, "swap");
  is("the amount is what was paid", got[0]?.amount, 10n ** 18n);
  is("and the other side is what it bought", got[0]?.intoAmount, 4n * 10n ** 18n);
  is("named by its own token id", got[0]?.intoToken, AAPL);
}

{
  /* Two of ours in, change back, plus a token we did not hold before. */
  const got = movementsIn(
    entry([note(ETH, 10n ** 18n)], [note(ETH, 4n * 10n ** 17n), note(AAPL, 2n * 10n ** 18n)]),
  );
  is("a swap with change nets the pay side", got[0]?.amount, 6n * 10n ** 17n);
}

console.log("\nWhat one send can move\n");

{
  const [usdg] = balanceOf([
    note(USDG, 10n, 0),
    note(USDG, 30n, 1),
    note(USDG, 20n, 2),
    note(USDG, 5n, 3),
  ]);
  is("the balance is every unspent note", usdg?.amount, 65n);
  is("the ceiling is the two largest, because a spend reads two", usdg?.ceiling, 50n);
  is("and the note count is what a spend is limited by", usdg?.notes, 4);
}

{
  const [only] = balanceOf([note(USDG, 7n)]);
  is("one note is its own ceiling", only?.ceiling, 7n);
}

{
  const spentOnly = balanceOf([note(USDG, 7n, 0, true)]);
  is("a spent note is history, not balance", spentOnly.length, 0);
}

{
  const zero = balanceOf([note(USDG, 0n)]);
  is("a zero output is the protocol's bookkeeping, not a holding", zero.length, 0);
}

console.log("\nWhat the balance was\n");

const DAY = 24 * 60 * 60;
const NOW = 1_760_000_000;
const prices = new Map<bigint, number>([
  [ETH, 2_000],
  [USDG, 1],
]);

function holding(token: bigint, amount: bigint, decimals: number): Holding {
  return {
    token,
    amount,
    notes: 1,
    ceiling: amount,
    meta: { token, symbol: "T", name: "T", decimals, curated: true },
  };
}

function move(kind: Move["kind"], token: bigint, amount: bigint, at: number, decimals = 6): Move {
  return {
    id: `${at}`,
    kind,
    token,
    amount,
    at,
    meta: { token, symbol: "T", name: "T", decimals, curated: true },
  };
}

{
  const holdings = [holding(USDG, 500_000_000n, 6)];
  is("the total is what the priced rows add up to", totalUsd(holdings, prices), 500);

  const points = traceOf({
    holdings,
    movements: [move("receive", USDG, 200_000_000n, NOW - 2 * DAY)],
    prices,
    coversWindow: true,
    now: NOW,
  });

  is("seven readings, one per day", points.length, 7);
  is("today is what is held now", points[6]?.usd, 500);
  is("before the payment landed, it was 200 less", points[0]?.usd, 300);
  is("and the label reads as a person would say it", points[6]?.t, "Today");
}

{
  const points = traceOf({
    holdings: [holding(USDG, 500_000_000n, 6)],
    movements: [move("send", USDG, 100_000_000n, NOW - DAY)],
    prices,
    coversWindow: true,
    now: NOW,
  });
  is("a send undone puts the money back before it left", points[0]?.usd, 600);
}

{
  const points = traceOf({
    holdings: [holding(USDG, 500_000_000n, 6)],
    movements: [move("receive", USDG, 100_000_000n, NOW - 2 * DAY)],
    prices,
    coversWindow: false,
    now: NOW,
  });
  is("an incomplete history draws nothing rather than a wrong start", points.length, 0);
}

{
  const points = traceOf({
    holdings: [holding(USDG, 500_000_000n, 6)],
    movements: [move("receive", AAPL, 1n, NOW - DAY, 18)],
    prices,
    coversWindow: true,
    now: NOW,
  });
  is("a movement nothing will price takes the whole line down", points.length, 0);
}

{
  const points = traceOf({
    holdings: [holding(AAPL, 1n, 18)],
    movements: [],
    prices,
    coversWindow: true,
    now: NOW,
  });
  is("nothing priced at all is no line", points.length, 0);
  is("and no total either", totalUsd([holding(AAPL, 1n, 18)], prices), null);
}

console.log("\nHow long ago\n");

is("inside the hour is not a count of minutes", relativeTime(NOW - 600, NOW), "Just now");
is("hours, while hours are the useful unit", relativeTime(NOW - 3 * 3600, NOW), "3h ago");
is(
  "yesterday is a calendar day, not 24 hours",
  relativeTime(new Date(NOW * 1000).setHours(-1, 0, 0, 0) / 1000, NOW),
  "Yesterday",
);
is("a week is not seven days spelled out", relativeTime(NOW - 8 * DAY, NOW), "Last week");

console.log(
  failures === 0
    ? `\nAll ${checks} history checks pass.\n`
    : `\n${failures} of ${checks} history checks FAILED.\n`,
);
process.exit(failures === 0 ? 0 : 1);
