import { cn } from "@/lib/utils";

/**
 * The four verbs. **Layout only, none of them do anything yet.**
 *
 * Consumer words, the user's ruling on 2026-08-07, reversing the earlier open
 * call that kept the dapp's vocabulary here. The reasoning that won: this
 * client's person arrived from a Google login and is paid into the app, and the
 * docs are where the protocol's own names live for whoever goes looking. The
 * row therefore carries no boundary verb at all:
 *
 * - **Shield is not a button.** Public funds that land on a receive address are
 *   moved into the private balance automatically while a session is open, and
 *   the moment that happens is shown, not asked about.
 * - **Withdraw is not a button.** Sending to a plain `0x` address IS the
 *   withdrawal, the way sending to a transparent address is in every Zcash
 *   wallet. The send flow owns the moment that needs explaining, at the moment
 *   it is true, rather than this row owning a verb for it.
 * - **Pay is Send's second door.** A payment link opens the same flow with the
 *   destination and amount already locked. Two buttons, one machine, because a
 *   person holding a link should not have to know it is "really" a send.
 *
 * No accent on any of them. The accent belongs to Receive's own card, which is
 * the action this product exists for, and it is spent there. The Receive button
 * here is the same action's door for the layouts where the card sits below the
 * fold.
 */

type Action = { label: string; hint: string; icon: React.ReactNode };

function ArrowIn() {
  return (
    <Glyph>
      <path d="M12 6v10" />
      <path d="M8 12.5l4 4 4-4" />
      <path d="M5 19h14" />
    </Glyph>
  );
}

function ArrowOut() {
  return (
    <Glyph>
      <path d="M12 17V7" />
      <path d="M8 10.5 12 6.5l4 4" />
      <path d="M5 19h14" />
    </Glyph>
  );
}

function LinkOut() {
  return (
    <Glyph>
      <path d="M14 5H6v14h8" />
      <path d="M11 12h8" />
      <path d="M16 9l3 3-3 3" />
    </Glyph>
  );
}

function Swap() {
  return (
    <Glyph>
      <path d="M6 9h12" />
      <path d="M15 6l3 3-3 3" />
      <path d="M18 15H6" />
      <path d="M9 18l-3-3 3-3" />
    </Glyph>
  );
}

function Glyph({ children }: { children: React.ReactNode }) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.5"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
      className="size-[18px]"
    >
      {children}
    </svg>
  );
}

/**
 * The hints say what the action does to the person's own money and never where
 * it happens. **Eighteen characters is the budget**, set by the two column
 * layout on a phone; each hint reads as a continuation of its own label, so it
 * does not repeat the verb and spends every character on the object.
 *
 * "To any address" on Send is doing quiet work: any means `zcowl1…` or plain
 * `0x`, and the second one is the withdrawal this row deliberately has no
 * button for.
 */
export type Verb = "Receive" | "Send" | "Pay" | "Swap";

const ACTIONS: (Action & { label: Verb })[] = [
  { label: "Receive", hint: "to a fresh address", icon: <ArrowIn /> },
  { label: "Send", hint: "to any address", icon: <ArrowOut /> },
  { label: "Pay", hint: "a payment link", icon: <LinkOut /> },
  { label: "Swap", hint: "for another asset", icon: <Swap /> },
];

export function QuickActions({
  onAction,
  className,
}: {
  /** The screen decides what a verb opens; this row only names them. */
  onAction?: (verb: Verb) => void;
  className?: string;
}) {
  return (
    <div className={cn("grid grid-cols-2 gap-px bg-white/[0.06] sm:grid-cols-4", className)}>
      {ACTIONS.map((a) => (
        <button
          key={a.label}
          type="button"
          title={a.hint}
          onClick={() => onAction?.(a.label)}
          className="group flex items-center gap-3 bg-card px-3.5 py-3 text-left transition-colors hover:bg-white/[0.05]"
        >
          <span className="text-bone/45 transition-colors group-hover:text-mark">
            {a.icon}
          </span>
          <span className="min-w-0">
            <span className="block font-mono text-[11px] tracking-[0.14em] text-bone uppercase">
              {a.label}
            </span>
            <span className="block truncate text-[11px] text-bone/35">{a.hint}</span>
          </span>
        </button>
      ))}
    </div>
  );
}
