import { cn } from "@/lib/utils";

/**
 * The instrument frame the whole app sits inside.
 *
 * **It is a box in the layout, not an overlay on top of one.** The frame is a
 * real element with real borders and the page renders inside it, so the left and
 * right lines are the edges of the content rather than lines drawn over it. An
 * earlier version was `fixed` and floated above everything: it looked identical
 * on a screen that did not scroll and came apart on one that did, because the
 * content ran on past a housing that had stayed behind at the window edge.
 *
 * **Square corners.** The window it is displayed in already has rounded corners
 * of its own, from the browser and from the machine. A second radius a few
 * pixels inside the first reads as two frames disagreeing, and a HUD is drawn
 * with a rule and a set square rather than with a pen.
 *
 * The outer inset is padding on `body` rather than a margin here. Margins on a
 * `min-h-full` child add to the height it already fills, which is how you get a
 * scrollbar on a page whose content fits.
 */

export function HudFrame({ children }: { children: React.ReactNode }) {
  return (
    /*
      A shade brighter than the panel frames inside it. The housing is the
      outermost line on the screen with nothing behind it to sit against, so at
      the panels' own weight it disappears into the black and leaves the corner
      marks floating with nothing to be the corners of.
    */
    <div className="relative flex flex-1 flex-col border border-white/[0.13]">
      {/*
        Ticks and end caps are the only absolutely placed things left, and they
        are marks sitting on the border rather than the border itself. Every one
        of them is decoration, so the whole layer is inert: a decorative layer
        that swallows clicks is a bug this codebase has already shipped once.
      */}
      <Marks />
      {children}
    </div>
  );
}

/**
 * Corner brackets, plus a short crossbar and three ticks down each side.
 *
 * The brackets sit just inside the corner rather than on it. On the corner they
 * would double the border for nine pixels and read as a printing error; a hair
 * inside, they read as a sight lining something up.
 */
function Marks() {
  const arm = "absolute size-[10px] border-bone/25";

  return (
    /*
      Above the content, because the marks belong to the housing rather than to
      whatever is currently inside it. Nothing on any screen reaches the frame's
      edge, so this stacks over nothing, and the one thing that does fill the
      frame edge to edge, the preloader, would otherwise paint the corners out
      for its first three seconds.
    */
    <div aria-hidden className="pointer-events-none absolute inset-0 z-20">
      <span className={cn(arm, "top-[5px] left-[5px] border-t border-l")} />
      <span className={cn(arm, "top-[5px] right-[5px] border-t border-r")} />
      <span className={cn(arm, "bottom-[5px] left-[5px] border-b border-l")} />
      <span className={cn(arm, "right-[5px] bottom-[5px] border-r border-b")} />

      {/*
        Quarter marks on the vertical edges. They give the side lines a sense of
        scale without ever becoming a ruler somebody might try to read a value
        off, which is why there are three of them and not ten.
      */}
      {[25, 50, 75].map((pct) => (
        <span key={`l${pct}`} className="absolute left-0 h-px w-[9px] bg-bone/20" style={{ top: `${pct}%` }} />
      ))}
      {[25, 50, 75].map((pct) => (
        <span key={`r${pct}`} className="absolute right-0 h-px w-[9px] bg-bone/20" style={{ top: `${pct}%` }} />
      ))}
    </div>
  );
}
