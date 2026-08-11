import { cn } from "@/lib/utils";

/**
 * Chamfered corners with a hairline frame that actually follows them.
 *
 * A CSS border cannot follow a clip path, so the frame is two stacked layers:
 * an outer element filled with the line colour and clipped to the silhouette,
 * and an inner element filled with the surface colour, clipped the same way and
 * inset by a pixel. What shows between them is the frame. A ring or an outline
 * squares the bevel off and leaves the corner looking like a rendering bug.
 *
 * The geometry lives here rather than in each caller so every bevelled thing in
 * the app cuts at the same angle and carries the same line weight. A panel, the
 * nav tag and anything added later are then the same object at different sizes,
 * which is what makes a set of them read as one instrument rather than as
 * several decorated boxes.
 */

/** The bevel, in pixels. One number, so nothing drifts out of step. */
export const BEVEL = 14;

/** Square except for a cut across the top right. The panel silhouette. */
export function notchClip(size = BEVEL): string {
  return `polygon(0 0, calc(100% - ${size}px) 0, 100% ${size}px, 100% 100%, 0 100%)`;
}

/**
 * Both vertical ends cut to a point. The shape a label wears when a rail runs
 * into it from either side, so the line appears to pass through rather than
 * stop at a box that happens to be in the way.
 */
export function tagClip(size = 11): string {
  return (
    `polygon(${size}px 0, calc(100% - ${size}px) 0, 100% 50%, ` +
    `calc(100% - ${size}px) 100%, ${size}px 100%, 0 50%)`
  );
}

export function Bevel({
  clip,
  className,
  innerClassName,
  children,
}: {
  clip: string;
  /** Goes on the frame layer, so this is where the line colour is set. */
  className?: string;
  /** Goes on the surface layer, so this is where the fill is set. */
  innerClassName?: string;
  children?: React.ReactNode;
}) {
  return (
    <div className={cn("relative bg-white/[0.09] p-px", className)} style={{ clipPath: clip }}>
      <div className={cn("relative h-full bg-ink", innerClassName)} style={{ clipPath: clip }}>
        {children}
      </div>
    </div>
  );
}
