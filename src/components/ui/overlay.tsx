"use client";

import { useEffect, useRef } from "react";
import { createPortal } from "react-dom";
import { notchClip } from "@/components/ui/bevel";
import { cn } from "@/lib/utils";

/**
 * The modal shell. One instrument lifted off the board and put in front of you.
 *
 * A dialog rather than a route, because this app is one route on purpose and a
 * second one is a second copy of every screen. It is also the honest shape for
 * what these are: a request builder and an address list are things you open
 * while looking at your balance, not places you go.
 *
 * **Not `<dialog>`.** The native element brings its own top layer, its own
 * backdrop and a default border, and unpicking those costs more than the two
 * behaviours it gives back. Both are implemented below and neither is subtle.
 *
 * The panel geometry is the same `notchClip` every card uses, so an open dialog
 * reads as one of the surfaces behind it that came forward, not as a different
 * component library arriving.
 */

const CLIP = notchClip();

export function Overlay({
  title,
  onClose,
  children,
  className,
}: {
  /** Announced to screen readers and printed as the panel's own label. */
  title: string;
  onClose: () => void;
  children: React.ReactNode;
  className?: string;
}) {
  const panel = useRef<HTMLDivElement>(null);

  useEffect(() => {
    /*
      Escape closes. Bound to the document rather than to the panel, because the
      key has to work before anything inside has been clicked, and a keydown on
      the body never reaches a handler attached to the panel.
    */
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
    }
    document.addEventListener("keydown", onKey);

    /*
      The page behind must not scroll while this is open. Without it, a trackpad
      flick over the scrim scrolls the balance screen underneath and the dialog
      appears to float away from the app it belongs to.

      The previous value is restored rather than being cleared to "", so two
      overlays or a future scroll lock elsewhere cannot silently undo each
      other's work.
    */
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";

    // Move focus into the dialog so the keyboard is somewhere sensible and the
    // next Tab lands on the first control rather than back at the top bar.
    panel.current?.focus();

    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = previousOverflow;
    };
  }, [onClose]);

  /*
    Rendered into `document.body`, not in place, and this is a fix rather than
    a preference. `fixed` measures against the viewport only until some
    ancestor carries a transform, a filter or a fill-mode animation that ever
    touched transform — at which point that ancestor becomes the containing
    block and "inset-0" quietly means *its* box. The signed-in app sits inside
    exactly such a wrapper (the `rise` entrance), and the first symptom was a
    dialog centring itself on the page's height instead of the screen's. A
    portal makes the geometry unconditional.

    No `typeof document` guard on purpose: every consumer mounts this from an
    interaction, so it can never render during prerender, and if that ever
    stops being true a loud build failure is the correct outcome.
  */
  return createPortal(
    <div
      className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto p-4 sm:items-center sm:p-6"
      role="dialog"
      aria-modal="true"
      aria-label={title}
    >
      {/*
        The scrim is a sibling and a button, not a click handler on the wrapper.
        On the wrapper, every click that bubbled up from inside the panel would
        close the dialog, which is the bug where selecting an address dismisses
        the thing you were reading it from.
      */}
      <button
        type="button"
        /*
          Hidden from assistive technology, not merely unfocusable. Named, it is
          a second control called Close inside a dialog that already has one, and
          the duplicate is pure noise: it does nothing the header button and the
          Escape key do not already do. Safe to hide because `tabIndex={-1}`
          keeps it out of the tab order, so this is never a focusable element
          that has been made invisible to a screen reader.
        */
        aria-hidden
        tabIndex={-1}
        onClick={onClose}
        className="fixed inset-0 cursor-default bg-black/80 backdrop-blur-[2px]"
      />

      <div
        ref={panel}
        tabIndex={-1}
        className={cn(
          "relative my-auto w-full max-w-[420px] bg-white/[0.09] p-px outline-none",
          className,
        )}
        style={{ clipPath: CLIP }}
      >
        <div className="relative flex flex-col bg-card" style={{ clipPath: CLIP }}>
          <Ticks />

          <header className="flex items-center gap-3 px-4 pt-3.5 pb-3">
            <span aria-hidden className="size-[5px] shrink-0 bg-mark" />
            <h2 className="font-mono text-[10.5px] leading-none tracking-[0.2em] text-bone/55 uppercase">
              {title}
            </h2>
            <button
              type="button"
              onClick={onClose}
              className="ml-auto font-mono text-[10.5px] tracking-[0.2em] text-bone/40 uppercase transition-colors hover:text-bone"
            >
              Close
            </button>
          </header>

          <div className="flex flex-col px-4 pb-4">{children}</div>
        </div>
      </div>
    </div>,
    document.body,
  );
}

/**
 * The same three corner Ls a panel wears. Copied rather than shared with
 * `Panel`, which draws a fourth arm case for its square variant that a dialog
 * never has: one component with a prop for it would be two shapes wearing one
 * name, and the next person to change the panel would change this by accident.
 */
function Ticks() {
  const arm = "absolute size-[9px] border-bone/25";
  return (
    <div aria-hidden className="pointer-events-none absolute inset-0">
      <span className={cn(arm, "top-[5px] left-[5px] border-t border-l")} />
      <span className={cn(arm, "bottom-[5px] left-[5px] border-b border-l")} />
      <span className={cn(arm, "right-[5px] bottom-[5px] border-r border-b")} />
    </div>
  );
}
