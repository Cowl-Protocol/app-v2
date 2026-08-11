import { cn } from "@/lib/utils";

/**
 * Which side of the boundary the payment is coming from, asked in the only
 * words the person on this card can actually answer: who is paying you.
 *
 * "From Cowl" is another Cowl user paying a `zcowl1…` address. "From anywhere"
 * is everyone else, and it holds two artifacts in a fixed order: the payment
 * link first, because a human sender clicking a link arrives private with
 * nothing landing in public custody, and the plain address under it for the
 * senders that are forms rather than people. The tab never says any of that in
 * these terms; the ordering IS the steer.
 *
 * State lives in the card, not here, and is never written down. Which tab was
 * open is not worth being the exception to the no storage rule.
 */

export type ReceiveTab = "cowl" | "anywhere";

const TABS: { id: ReceiveTab; label: string }[] = [
  { id: "cowl", label: "From Cowl" },
  { id: "anywhere", label: "From anywhere" },
];

export function ReceiveTabs({
  active,
  onSelect,
}: {
  active: ReceiveTab;
  onSelect: (tab: ReceiveTab) => void;
}) {
  return (
    <div className="mb-3.5 grid grid-cols-2 gap-px bg-white/[0.06]">
      {TABS.map((t) => (
        <button
          key={t.id}
          type="button"
          onClick={() => onSelect(t.id)}
          aria-pressed={active === t.id}
          className={cn(
            "h-8 font-mono text-[10px] tracking-[0.14em] uppercase transition-colors",
            active === t.id
              ? "bg-white/[0.09] text-bone"
              : "bg-card text-bone/40 hover:bg-white/[0.04] hover:text-bone/70",
          )}
        >
          {t.label}
        </button>
      ))}
    </div>
  );
}
