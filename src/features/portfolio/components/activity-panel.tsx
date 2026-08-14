import { Panel } from "@/components/ui/panel";
import { cn } from "@/lib/utils";
import { formatAmount } from "@/lib/format";
import type { Activity, ActivityKind } from "../types";

/**
 * The owner's own last few movements.
 *
 * This list is assembled from notes only this browser can decrypt, so it is
 * private in the strict sense: nobody else can produce it, and no server here
 * holds it. Every row is one transaction from the pool's own log, netted per
 * token, dated by the block it landed in. It is still not a chain history and
 * must never be presented as one.
 * A shield and a withdraw are visible to anyone watching the pool's boundary,
 * and no badge in this panel changes that. Saying it in a row would also be a
 * warning arriving after the action, which is the least useful moment for it.
 *
 * Signs come from the kind, not from the amount. A negative `bigint` in a
 * balance is a bug worth crashing on rather than rendering.
 */

/**
 * Consumer words on screen, protocol words in code. The kinds keep the names
 * the CLI and the circuits use, because that is what the wired client will be
 * handed; what a person reads follows the same ruling as the verb row (see
 * `quick-actions.tsx`): no boundary vocabulary anywhere a user can see. "Added"
 * is the session's automatic move of arrived public funds, told as what it did
 * to the balance rather than as the mechanism that did it.
 */
const LABEL: Record<ActivityKind, string> = {
  receive: "Received",
  send: "Sent",
  swap: "Swapped",
  shield: "Added",
  unshield: "Withdrew",
};

const INBOUND: ActivityKind[] = ["receive", "shield"];

/**
 * How many rows the home screen shows. The rest are one click away, and this is
 * also what keeps this panel roughly the height of the assets table beside it,
 * so neither has to be stretched to fill a grid row it did not fill on its own.
 */
const SHOWN = 4;

export function ActivityPanel({
  items,
  reading = false,
}: {
  items: Activity[];
  /** A scan is in flight, so an empty list is not yet an answer. */
  reading?: boolean;
}) {
  return (
    <Panel label="Activity" square bodyClassName="px-0 pb-0" className="h-full min-w-0">
      {/*
        Nothing yet, said in the two ways it can be true. A book with no
        movements and a book nobody has finished reading look identical, and only
        one of them means this account has never been paid.
      */}
      {items.length === 0 && (
        <p className="border-t border-white/[0.05] px-4 py-8 text-center text-[12px] text-bone/35">
          {reading ? "Reading the chain." : "Nothing has moved yet."}
        </p>
      )}

      <ul className="divide-y divide-white/[0.05] border-t border-white/[0.05]">
        {items.slice(0, SHOWN).map((it) => {
          const inbound = INBOUND.includes(it.kind);
          const amount = formatAmount(it.amount, it.decimals);

          return (
            <li
              key={it.id}
              className="flex items-center gap-3 px-4 py-3 transition-colors hover:bg-white/[0.02]"
            >
              <Caret inbound={inbound} swap={it.kind === "swap"} />

              <div className="min-w-0 flex-1">
                <p className="truncate font-mono text-[12px] tracking-[0.04em] text-bone">
                  {LABEL[it.kind]}
                  <span className="text-bone/40">
                    {" "}
                    {it.symbol}
                    {/*
                      The arrow steps out of the mono face. A monospace cell is
                      as wide as a capital letter, which stretches an arrow into
                      something that reads as a rule between two tickers rather
                      than as a direction.
                    */}
                    {it.intoSymbol && (
                      <>
                        <span className="px-1 font-sans">→</span>
                        {it.intoSymbol}
                      </>
                    )}
                  </span>
                </p>
                <p className="text-[11px] text-bone/35">{it.when}</p>
              </div>

              <p
                className={cn(
                  "shrink-0 font-mono text-[12px] tabular-nums",
                  inbound ? "text-mark/85" : "text-bone/65",
                )}
              >
                {it.kind === "swap" ? amount : `${inbound ? "+" : "-"}${amount}`}
              </p>
            </li>
          );
        })}
      </ul>

      {/*
        Only when there is something behind it. A list of four with nothing under
        it does not need a way in, and a control that opens an empty screen is
        worse than no control.
      */}
      {items.length > SHOWN && (
        <button
          type="button"
          className="mt-auto w-full border-t border-white/[0.05] py-3 font-mono text-[10.5px] tracking-[0.18em] text-bone/40 uppercase transition-colors hover:bg-white/[0.02] hover:text-mark"
        >
          All activity
        </button>
      )}
    </Panel>
  );
}

/** Direction, at a glance. A swap goes nowhere, so it gets neither arrow. */
function Caret({ inbound, swap }: { inbound: boolean; swap: boolean }) {
  return (
    <span
      aria-hidden
      className={cn(
        "grid size-7 shrink-0 place-items-center bg-white/[0.05] text-[11px]",
        inbound ? "text-mark/70" : "text-bone/45",
      )}
    >
      {swap ? "⇄" : inbound ? "↓" : "↑"}
    </span>
  );
}
