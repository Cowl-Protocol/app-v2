"use client";

import { useRef } from "react";
import gsap from "gsap";
import { useGSAP } from "@gsap/react";
import { Eyes } from "@/components/brand/eyes";

/**
 * The eyes open, blink three times, and hand the screen over.
 *
 * A few things here are load bearing rather than stylistic:
 *
 * - **The overlay is visible in the static HTML.** This app is a static export,
 *   so the markup lands before any JavaScript does. If the overlay started
 *   hidden and JS revealed it, the first frame would be the page, then the
 *   preloader on top of it. Starting visible means the first painted frame is
 *   already correct.
 * - **`<noscript>` removes it.** The flip side of the above: with the overlay in
 *   the markup, a visitor whose JS never runs would stare at it forever. The
 *   inline style below is the escape hatch, and it costs nothing.
 * - **Reduced motion skips straight to the end.** Someone who has asked the
 *   system for less movement should not be held at a blinking screen.
 *
 * The blink is a vertical collapse rather than a fade, because these are eyes
 * and eyelids close toward the middle. A fade would read as a flickering lamp.
 *
 * **`onDone` fires when the fade finishes, and it is what advances the flow.**
 * The alternative was a timer beside this component counting to roughly the same
 * number, which is two clocks that agree until somebody edits one of them: a
 * blink retimed here would either be cut off mid animation or leave a beat of
 * black. The timeline that knows when it ended is the thing that says so.
 */
export function Preloader({ onDone }: { onDone?: () => void }) {
  const root = useRef<HTMLDivElement>(null);
  const eyes = useRef<HTMLDivElement>(null);

  useGSAP(
    () => {
      /*
        `onDone` is captured once, on mount, because `useGSAP` runs once and the
        timeline it builds outlives every later render. That is the behaviour
        this wants: the callback is a state setter, which React keeps stable, and
        re-reading it through a ref bought nothing while breaking the rule
        against writing a ref during render.
      */
      const finish = () => {
        gsap.set(root.current, { display: "none" });
        onDone?.();
      };

      if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
        finish();
        return;
      }

      const tl = gsap.timeline({ onComplete: finish });

      // Open. Starts collapsed so the first thing that happens reads as waking up.
      tl.fromTo(
        eyes.current,
        { scaleY: 0, opacity: 0 },
        { scaleY: 1, opacity: 1, duration: 0.5, ease: "power3.out" },
      );

      // Three blinks. Shut fast, open slower, the way a real one goes.
      for (let i = 0; i < 3; i++) {
        tl.to(eyes.current, { scaleY: 0, duration: 0.1, ease: "power2.in" }, "+=0.3")
          .to(eyes.current, { scaleY: 1, duration: 0.15, ease: "power2.out" });
      }

      // Hold a beat so the last blink lands, then get out of the way. The whole
      // timeline runs about three seconds, which is the brief: long enough to be
      // an entrance, short enough that a returning visitor is not being charged
      // for it every time.
      tl.to(root.current, { opacity: 0, duration: 0.5, ease: "power2.inOut" }, "+=0.35");
    },
    { scope: root },
  );

  return (
    <div
      ref={root}
      id="preloader"
      aria-hidden
      /*
        Absolute inside the frame, not fixed to the window. Fixed put the
        entrance over the housing and the first three seconds were a plain black
        rectangle with two eyes in it. Filling the frame instead means the
        instrument is already there and the eyes open inside it, which is the
        same object waking up rather than a splash screen that gets replaced by
        one.
      */
      className="absolute inset-0 z-10 flex items-center justify-center bg-ink pb-[7vh]"
    >
      <noscript>
        <style>{`#preloader{display:none}`}</style>
      </noscript>
      <div ref={eyes} className="origin-center will-change-transform">
        <Eyes className="text-mark" />
      </div>
    </div>
  );
}
