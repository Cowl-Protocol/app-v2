/**
 * What the payer's screen renders. Shapes only, no data.
 */
import type { Network } from "@/config";
import type { RequestPayload } from "@/lib/request-link";

/**
 * A request that has been checked against this build.
 *
 * The codec answers whether a string is well formed. This answers the two
 * questions that are about the deployment rather than the string: is this a
 * chain we know, and does the destination decode as a payment address. Both have
 * to be settled before anything is rendered, because a screen that shows an
 * amount and a Pay button has already told the payer the request is good.
 */
export type ResolvedRequest = {
  payload: RequestPayload;
  network: Network;
  /** Whole tokens, converted once, on this side, against the token's decimals. */
  amount: bigint;
  decimals: number;
  /** Below the smallest denomination. A warning, never a refusal. */
  dust: boolean;
};

/**
 * Why a link is not payable. Each of these is a different sentence on screen,
 * because "this link is broken" is useless to the one person who can fix it.
 */
export type PayRefusal =
  | "malformed"
  | "unknown-chain"
  | "bad-address"
  | "unknown-token";

/**
 * How far along a payment is.
 *
 * **`retrying` is not an error state and must never be styled as one.** A shield
 * proof binds the tree's current root and the leaf index it is inserting at, so
 * another deposit landing between proving and inclusion invalidates it. That is
 * normal on a public pay page: proving takes seconds and any stranger can
 * deposit during them. The client re-fetches the tip and proves again, and the
 * payer is told in plain words what is happening. **The circuit's own assertion
 * text never reaches this screen** · "insertion path does not match the current
 * tree" reads to a stranger as the site being broken.
 */
export type PayStage =
  | { kind: "ready" }
  | { kind: "proving" }
  | { kind: "retrying"; attempt: number }
  | { kind: "sent"; hash: string }
  | { kind: "failed"; reason: string };
