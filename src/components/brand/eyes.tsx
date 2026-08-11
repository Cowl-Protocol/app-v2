import { cn } from "@/lib/utils";

/**
 * The mark. Two blades in the dark, and nothing else.
 *
 * Paths are the Figma export, unmodified, in a 359 by 87 box. The pair is a
 * mirror about x = 179.5, so if one side is ever edited the other has to move
 * with it.
 *
 * Fill is `currentColor` so the colour decision stays with the caller and this
 * file never hardcodes the accent.
 */

/**
 * The one place the mark's size is decided. The preloader and the page beneath
 * it have to agree to the pixel, because the handoff between them is a crossfade
 * and any drift shows up as a jump.
 */
export const EYES_SIZE = "w-[clamp(160px,22vw,360px)]";

export function Eyes({ className }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 359 87"
      fill="currentColor"
      role="img"
      aria-label="Cowl"
      className={cn(EYES_SIZE, className)}
    >
      <path d="M0 0L136.5 53L75 87L29.5 69L0 0Z" />
      <path d="M358.5 0L222 53L283.5 87L329 69L358.5 0Z" />
    </svg>
  );
}
