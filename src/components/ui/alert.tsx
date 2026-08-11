import { cn } from "@/lib/utils";

/**
 * A refusal, said out loud.
 *
 * **This is the one alarm surface in the app**, and it exists because a sign in
 * that fails has to be distinguishable at a glance from a sign in that is still
 * thinking. The card it sits on has no other red on it, so the colour is doing
 * the work of a heading: read it first, then read the words.
 *
 * It carries no domain knowledge and takes its message as children, so the
 * wording stays in the feature that knew what went wrong. `components/ui` may
 * not import from `features/`, which is what keeps that division honest.
 *
 * `role="alert"` is on the container rather than the paragraph, so a screen
 * reader announces the whole thing when it appears rather than the sentence
 * without the fact that it is a failure. The icon is `aria-hidden` for the same
 * reason: it repeats the role, it does not add to it.
 */
export function Alert({
  children,
  className,
}: {
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <div
      role="alert"
      className={cn(
        "flex items-start gap-2.5 rounded-lg bg-danger/10 px-3.5 py-3 ring-1 ring-danger/25",
        className,
      )}
    >
      <WarnIcon />
      <p className="text-[12.5px] leading-snug text-danger">{children}</p>
    </div>
  );
}

/**
 * The triangle. Drawn rather than imported, because one icon does not justify a
 * dependency in a bundle where a signature becomes a spending key.
 *
 * `mt-px` because the glyph's optical centre sits a shade above the cap height
 * of the text beside it, so aligning the boxes leaves the icon looking high.
 */
function WarnIcon() {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      strokeWidth="1.7"
      aria-hidden
      className="mt-px size-[15px] shrink-0 text-danger"
    >
      <path
        d="M12 4.5 21 19.5H3L12 4.5Z"
        stroke="currentColor"
        strokeLinejoin="round"
      />
      <path d="M12 10v4" stroke="currentColor" strokeLinecap="round" />
      <circle cx="12" cy="16.75" r=".9" fill="currentColor" />
    </svg>
  );
}
