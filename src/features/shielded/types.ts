/**
 * What the spend surfaces render. Shapes only, no data.
 *
 * This feature is where spends will be wired — it is one of the two permitted
 * key consumers — so the send and swap layouts live here from the start rather
 * than being moved in later with their history left behind.
 */

/** A token as a spend flow needs it: what is held, and what one send can move. */
export type SpendableToken = {
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
  /** The relayer's fee for one spend, taken from what is sent. Base units. */
  fee: bigint;
  logoURI?: string;
};

/** USD per whole token, for the swap's placeholder arithmetic. */
export type PriceTable = Record<string, number>;
