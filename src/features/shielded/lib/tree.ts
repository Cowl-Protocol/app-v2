/**
 * The commitment tree, enough of it to check that a scan saw everything.
 *
 * Ported from `app/lib/shielded/tree.ts`. `merkleProof` is not here: a path is
 * what a spend proves against, and this app cannot spend yet.
 *
 * **What it is for today is the integrity check.** Commitments live in the event
 * log, so a balance is only as complete as the replay that built it, and a
 * replay that quietly lost a window under-reports somebody's money while looking
 * perfectly healthy. Rebuilding the root from what came back and comparing it to
 * the root the pool reports turns that silent failure into a loud one.
 */
import { poseidon } from "@/lib/field";

/** Depth 20, about a million notes. Frozen with the deployed pool. */
export const DEPTH = 20;

/** Hash of an empty subtree at each level. */
const ZEROS: bigint[] = (() => {
  const z: bigint[] = [0n];
  for (let i = 1; i <= DEPTH; i++) z.push(poseidon([z[i - 1]!, z[i - 1]!]));
  return z;
})();

export function emptyRoot(): bigint {
  return ZEROS[DEPTH]!;
}

export function computeRoot(leaves: bigint[]): bigint {
  if (leaves.length === 0) return emptyRoot();

  let level = leaves.slice();
  for (let d = 0; d < DEPTH; d++) {
    const next: bigint[] = [];
    for (let i = 0; i < level.length; i += 2) {
      const l = level[i]!;
      const r = i + 1 < level.length ? level[i + 1]! : ZEROS[d]!;
      next.push(poseidon([l, r]));
    }
    level = next;
  }
  return level[0]!;
}
