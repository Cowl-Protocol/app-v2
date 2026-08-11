/**
 * What the receive and request surfaces render. Shapes only, no data.
 *
 * Amounts are `bigint` base units, matching the rest of the app. A figure on
 * this screen is either the money somebody is owed or the money sitting in an
 * address they stopped handing out, and neither is allowed to be approximately
 * right.
 */

/** A token, as a request needs it. Deliberately not the portfolio's `Asset`. */
export type RequestToken = {
  symbol: string;
  /** Display name for picker rows. */
  name?: string;
  decimals: number;
  logoURI?: string;
};

/** Base units of one token, with enough beside it to print. */
export type TokenAmount = {
  symbol: string;
  amount: bigint;
  decimals: number;
};

/**
 * One address in the owner's sequence.
 *
 * **Every address here is a separate book, and that is the whole cost of the
 * design.** A fresh address means a fresh spending key, and the join-split
 * circuit derives one `mpk` from one `sk` and checks both of its input notes
 * against it. Two notes at two addresses therefore cannot be spent in the same
 * transaction, however small they are and however much the total says.
 *
 * `index` is the position in that sequence and not a display detail. It is what
 * the key is derived from, so it is what makes an address recoverable from the
 * one seed rather than something that had to be written down.
 */
export type ReceiveAddress = {
  index: number;
  address: string;
  /** Already phrased. This is placeholder copy and not a clock. */
  issued: string;
  /**
   * What is still sitting in this address's own book.
   *
   * Empty means it has either never been paid or has already been gathered.
   * The list does not distinguish the two, because a retired empty address is
   * finished business and a row explaining that is a row about nothing.
   */
  holdings: TokenAmount[];
};

/**
 * One address on the public side of the boundary, for senders that can only
 * pay a plain `0x`: exchanges, payout services, another chain's bridge.
 *
 * **These rotate for the same reason `zcowl1…` does**, so no single public
 * string collects a person's whole inflow history. The wallet is an HD keyring:
 * account #0 signs the derivation message and is the shielded account's anchor,
 * and it never appears on chain at all; #1 and up are these, issued one per
 * hand-out, emptied into the private balance while a session is open, watched
 * forever afterwards because an old one still receives.
 *
 * **The gas rule is the design's one sharp edge.** A funnel must never be
 * topped up from the owner's other addresses, because that one transfer links
 * them all. ETH arrivals carry their own gas; permit tokens go gasless through
 * the relayer when that path ships; anything else waits on screen for a little
 * ETH from outside.
 */
export type FunnelAddress = {
  /** Derivation index. #0 is the anchor and is never issued. */
  index: number;
  /** EIP-55 checksummed. */
  address: string;
  /** Already phrased. Placeholder copy, not a clock. */
  issued: string;
};

/**
 * What it costs to bring several books back into one.
 *
 * A gather is one relayed spend per book, and a relayed spend pays its fee out
 * of the notes it moves. So the price scales with how many addresses hold
 * something, not with how much they hold: gathering ten dust payments costs ten
 * fees, exactly as gathering ten large ones does.
 *
 * **This is on screen from the first version on purpose.** It is the standing
 * cost of one-time addresses, it lands hardest on somebody being paid small
 * amounts often, and a person who finds it only when they try to spend will
 * reasonably think the app lost their money.
 */
export type GatherQuote = {
  /** Books holding something. One spend each. */
  books: number;
  /** The relayer's fee for one spend, in the token it is taken in. */
  feeEach: TokenAmount;
};
