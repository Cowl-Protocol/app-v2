/**
 * What the home screen renders. Shapes only, no data.
 *
 * Amounts are `bigint` base units and never a JavaScript number, matching the
 * CLI and the dapp. A balance is the one number in this app that is never
 * allowed to be approximately right, and 2^53 is a ceiling a token with 18
 * decimals passes at nine whole units. Prices stay `number`, because a price
 * that is off in the last place is a rounding error rather than lost money.
 */

export type Asset = {
  symbol: string;
  name: string;
  decimals: number;
  /** Base units held inside the pool. There is no public side on this screen. */
  balance: bigint;
  /** USD per whole token, or null when nothing will price it. */
  price: number | null;
  /**
   * The token's mark.
   *
   * A path into this bundle for anything we curate, which is what the four
   * tokens under `public/tokens` are. A token discovered from the chain has no
   * artwork here and arrives carrying whatever URL the explorer holds for it,
   * and that is a request to a third party naming a token this browser holds.
   * Absent is fine and common: the glyph falls back to the ticker.
   */
  logoURI?: string;
};

/**
 * One movement in the owner's own book.
 *
 * `shield` and `unshield` are the two that cross the pool boundary and are
 * therefore the two anyone can see on chain. `send`, `receive` and `swap` happen
 * inside it. The row does not say which is which, and the panel does not
 * editorialise: the honest framing lives in the docs, not in a list of six
 * items, and a badge that whispered "this one was public" beside a completed
 * action would be a warning delivered far too late to act on.
 */
export type ActivityKind = "receive" | "send" | "swap" | "shield" | "unshield";

export type Activity = {
  id: string;
  kind: ActivityKind;
  symbol: string;
  /** The second symbol on a swap, absent everywhere else. */
  intoSymbol?: string;
  /** Base units, unsigned. The sign is the kind's job, not the number's. */
  amount: bigint;
  decimals: number;
  /** Already relative, because this is placeholder copy and not a clock. */
  when: string;
};

/** One reading on the 7 day value trace. */
export type TracePoint = { t: string; usd: number };

/**
 * The client's own state, as opposed to the owner's money.
 *
 * **Two fields, and both are things somebody can act on.** This started with a
 * contract address and a note count as well, and both came out: the contract is
 * where the product runs rather than what it is, and a note is a unit of
 * bookkeeping that exists so a balance can be split without linking the halves.
 * Neither is checkable by the person reading this screen and neither changes
 * what they would do next. They belong in the docs, for somebody who came
 * looking for them.
 *
 * Dropping the note count does lose something real, and it is worth writing
 * down rather than forgetting: a spend reads two notes and writes two, so what
 * can leave in one transaction is the sum of the two largest and not the
 * balance. That constraint has to surface at the moment it bites, inside the
 * send flow and in words, not as a number parked on the home screen that means
 * nothing until it does.
 */
export type ClientStatus = {
  /** Last completed sync, already phrased. */
  synced: string;
  /**
   * Proving material resident in the tab. False means the first send of the
   * session waits on a large download before anything appears to happen, which
   * is the one delay in this app long enough to read as a failure.
   */
  readyToSend: boolean;
};
