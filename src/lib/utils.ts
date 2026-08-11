import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

/**
 * Merge class names, letting a later Tailwind utility beat an earlier one in the
 * same group. Without this, a caller passing `px-6` to a component that already
 * has `px-4` gets both and whichever the stylesheet happens to order last.
 *
 * This is the one helper shadcn components expect to find at `@/lib/utils`.
 */
export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}
