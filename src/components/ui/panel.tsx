import { notchClip } from "@/components/ui/bevel";
import { cn } from "@/lib/utils";

/**
 * The HUD panel. Every card on the home screen is one of these.
 *
 * The look is instrument panel rather than web card: square corners, one
 * chamfered corner, a hairline frame, and tick marks in the corners. That is a
 * deliberate departure from the marketing site, where `cowl/STYLE.md` says cards
 * carry no border at all. The site is a page someone reads once; this is a
 * surface someone comes back to, and a reader scanning six panels needs to know
 * where each one stops. The frame is the quietest way to say that, at
 * `white/[0.07]`, which is a shade off the background rather than a line drawn
 * on top of it.
 *
 * **The chamfer is drawn, not faked**, by the two layer technique in
 * `components/ui/bevel`. The silhouette comes from there rather than from a
 * literal here, so a panel and the nav tag in the top bar cut at the same angle
 * and carry the same line weight.
 */

const CLIP = notchClip();

export type PanelProps = {
  /**
   * The bracketed label in the top left. Kept short and structural, because it
   * is set in mono at eleven pixels and a sentence there reads as body copy that
   * lost its paragraph.
   */
  label?: string;
  /** Optional right hand slot on the label row: a count, a chip, a control. */
  aside?: React.ReactNode;
  /**
   * The small square before the label. `mark` is the accent, and it is spent on
   * the one panel per screen that should be looked at first. Everything else
   * takes `dim`, so the accent keeps meaning something.
   */
  tone?: "mark" | "dim";
  /** Square off the bevel. For panels that sit in a row and would look ragged. */
  square?: boolean;
  className?: string;
  /** Padding is a prop because a table wants its rows flush to the frame. */
  bodyClassName?: string;
  children?: React.ReactNode;
};

export function Panel({
  label,
  aside,
  tone = "dim",
  square = false,
  className,
  bodyClassName,
  children,
}: PanelProps) {
  const clip = square ? undefined : CLIP;

  return (
    <section
      className={cn("relative bg-white/[0.07] p-px", className)}
      style={{ clipPath: clip }}
    >
      <div
        className="relative flex h-full flex-col bg-card"
        style={{ clipPath: clip }}
      >
        {/*
          Tick marks in the corners. They sit on the three square corners only:
          on the bevelled one the arms would cross the diagonal and read as a
          mistake. Purely optical, hence aria-hidden.
        */}
        <Ticks square={square} />

        {label && (
          <header className="flex items-center gap-3 px-4 pt-3.5 pb-3">
            <span
              aria-hidden
              className={cn(
                "size-[5px] shrink-0",
                tone === "mark" ? "bg-mark" : "bg-bone/30",
              )}
            />
            <h2 className="font-mono text-[10.5px] leading-none tracking-[0.2em] text-bone/55 uppercase">
              {label}
            </h2>
            {aside && <div className="ml-auto flex items-center">{aside}</div>}
          </header>
        )}

        {/*
          A flex column, so a panel that has been stretched to match its
          neighbour can push its last element to the bottom with `mt-auto`
          instead of leaving a hole under it. Grid rows size to their tallest
          cell whatever anyone intends, so the choice is between deciding where
          the slack goes and letting it fall wherever the content ends.
        */}
        <div
          className={cn(
            "flex flex-1 flex-col",
            label ? "px-4 pb-4" : "p-4",
            bodyClassName,
          )}
        >
          {children}
        </div>
      </div>
    </section>
  );
}

/**
 * Corner ticks, eight hairlines forming three Ls.
 *
 * Drawn as bordered boxes rather than as an SVG so they inherit the same
 * subpixel rendering as the frame beside them and cannot land half a pixel off
 * it at fractional zoom levels.
 */
function Ticks({ square }: { square: boolean }) {
  const arm = "absolute size-[9px] border-bone/25";
  return (
    /*
      `pointer-events-none` belongs on this wrapper and not only on the arms
      inside it. Absolutely positioned and painted after its static siblings,
      this layer covers the entire panel, so without it the decoration swallowed
      every click in every card: the hide toggle, all four actions, copy, and the
      chart's own hover. Nothing looked wrong, the buttons simply did nothing.
    */
    <div aria-hidden className="pointer-events-none absolute inset-0">
      <span className={cn(arm, "top-[5px] left-[5px] border-t border-l")} />
      {square && (
        <span className={cn(arm, "top-[5px] right-[5px] border-t border-r")} />
      )}
      <span className={cn(arm, "bottom-[5px] left-[5px] border-b border-l")} />
      <span className={cn(arm, "right-[5px] bottom-[5px] border-r border-b")} />
    </div>
  );
}

/**
 * A bracketed value, the HUD's unit of meta: `[ NOTES ] 11`.
 *
 * The brackets are real characters rather than pseudo-elements so the label
 * copies and reads out as written, and the pair keeps its spacing when the
 * label is one word or three.
 */
export function Readout({
  label,
  children,
  className,
}: {
  label: string;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <span className={cn("flex items-baseline gap-2 font-mono text-[11px]", className)}>
      <span className="tracking-[0.16em] text-bone/35 uppercase">[{label}]</span>
      <span className="tabular-nums text-bone/75">{children}</span>
    </span>
  );
}
