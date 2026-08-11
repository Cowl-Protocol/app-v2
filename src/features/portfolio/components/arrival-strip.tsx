import { formatAmount } from "@/lib/format";

/**
 * The session's automatic move, while it is happening. **Layout only,
 * reachable through `PREVIEW` and nothing else.**
 *
 * This is the state the verb row's missing boundary button turned into: public
 * funds landed on a receive address, the app is adding them to the balance, and
 * the person is told rather than asked. The copy names what is happening to
 * their money and not the mechanism doing it, the same rule the activity list
 * and the funnel caption follow.
 *
 * It renders as a strip above the grid rather than as a dialog because it needs
 * nothing from the person. A dialog is a question; this is a status. The one
 * interaction it will ever grow is the failure case: the arrival that cannot be
 * moved yet because nothing on the address can pay its own gas, which turns
 * this strip into the place that asks for a little ETH. That state ships with
 * the wiring, because designing its copy without the real refusal in hand would
 * be guessing.
 */
export function ArrivalStrip({
  symbol,
  amount,
  decimals,
}: {
  symbol: string;
  amount: bigint;
  decimals: number;
}) {
  return (
    <div className="flex items-center gap-2.5 bg-mark/[0.08] px-3 py-2">
      <span aria-hidden className="size-[5px] shrink-0 animate-pulse bg-mark" />
      <p className="min-w-0 flex-1 text-[11px] leading-snug text-bone/70">
        <span className="font-mono tabular-nums text-mark">
          +{formatAmount(amount, decimals)} {symbol}
        </span>{" "}
        arrived at a receive address · adding it to your balance
      </p>
      <span className="shrink-0 font-mono text-[9.5px] tracking-[0.2em] text-bone/35 uppercase">
        No action needed
      </span>
    </div>
  );
}
