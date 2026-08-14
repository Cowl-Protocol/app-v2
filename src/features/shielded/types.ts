/**
 * What the spend surfaces render. Shapes only, no data.
 *
 * This feature is where spends will be wired — it is one of the two permitted
 * key consumers — so the send and swap layouts live here from the start rather
 * than being moved in later with their history left behind.
 */

/** A token as a spend flow needs it: what is held, and what one send can move. */
export type SpendableToken = {
  /**
   * The pool's token id, which is what a price table and a fee quote are keyed
   * by. Never the ticker: a token chooses its own symbol, and one calling itself
   * USDG would otherwise be handed the Global Dollar's price and the Global
   * Dollar's fee.
   */
  token: bigint;
  symbol: string;
  /** Display name for picker rows. */
  name?: string;
  decimals: number;
  /** Base units held. */
  balance: bigint;
  /**
   * Base units one send can move right now.
   *
   * A spend reads two notes and writes two, so the most that can leave in one
   * transaction is the sum of the two largest notes, never the balance. The
   * constraint surfaces inside the send flow, in words, at the moment a send
   * that looks affordable is refused — that is the decision recorded when the
   * note count came off the status strip, and this field is its carrier.
   */
  ceiling: bigint;
  /**
   * The relayer's fee for one spend, taken from what is sent. Base units.
   *
   * **Null until the relayer has said**, which it is asked directly, per token,
   * whenever a spend surface is open. It was a constant here for as long as this
   * feature had a placeholder, and a constant is the one thing this number must
   * never be: it is gas priced in the token being sent, so it moves with the
   * chain, and a send composed against a stale figure is refused after its proof
   * is built.
   */
  fee: bigint | null;
  logoURI?: string;
};

/**
 * **`PriceTable` used to live here** as a symbol-keyed map of made-up dollars.
 * Prices come from `@/lib/price` now, keyed by the pool's token id and read from
 * the venue's own quoter, so there is nothing left for this feature to define.
 */
