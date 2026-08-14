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

/**
 * **Two of those five are never produced today**, and the reason is a fact about
 * the contract rather than about this file. The pool emits commitments, ciphers
 * and nullifiers, and a deposit is indistinguishable from a payment in all
 * three: telling `shield` from `receive` means attributing a token transfer to
 * this account's own wallet address, which is the one address no screen here is
 * allowed to read. They stay in the union because the day the boundary becomes
 * attributable, the label is already designed and already tested.
 */

export type Activity = {
  id: string;
  kind: ActivityKind;
  symbol: string;
  /** The second symbol on a swap, absent everywhere else. */
  intoSymbol?: string;
  /** Base units, unsigned. The sign is the kind's job, not the number's. */
  amount: bigint;
  decimals: number;
  /** Already phrased, against the one clock the whole screen dates from. */
  when: string;
};

/**
 * One reading on the 7 day value trace.
 *
 * The series is rebuilt backwards from today's holdings by undoing movements,
 * and valued throughout at today's price, because this app has no price history
 * and will not pretend to. `lib/trace.ts` carries what that does and does not
 * make the line mean.
 */
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
  /** Last completed sync, already phrased. Null before the first one lands. */
  synced: string | null;
  /**
   * Whether the replay agreed with the pool's own root, and null before it has
   * been asked.
   *
   * **This replaced a "ready to send" flag that could not be answered
   * honestly.** That field described proving material resident in the tab, and
   * nothing in this app proves anything yet, so it was a light that was on
   * because it was drawn on. What is here instead is the check the scan already
   * performs and never showed: a replay that lost a log window returns fewer
   * notes, no error, and a balance that is quietly short. That is the one
   * failure on this screen worth a person's attention, and it is the one that
   * otherwise looks calm.
   */
  integrity: "complete" | "moved" | "mismatch" | "gap" | null;
};
