/**
 * **Placeholder data. No chain, no key, no note.**
 *
 * Same contract as the portfolio's and request's copies: the spend surfaces are
 * being laid out before they are wired, every figure comes from here, and
 * wiring is deleting this module and satisfying the same types. Anything still
 * importing it fails the build rather than quietly shipping an invented
 * balance.
 *
 * The balances restate the portfolio's placeholder rather than importing it —
 * crossing a feature boundary to reach mock data both features are going to
 * delete would couple them for the rest of time. The figures agree on purpose,
 * because a send screen and a balance screen disagreeing about what is held is
 * a bug report even in a mock.
 *
 * **The ceilings are the interesting part.** USDG, AAPL and COWL are set below
 * their balances so the two-note ceiling state is reachable on screen; ETH is
 * set equal so the common case — the ceiling never biting — is on screen too.
 * The fees are the measured shapes from mainnet: COWL's is the airdrop's
 * ~6,383 figure, the others are plausible per-token relayer quotes.
 */
import type { PriceTable, SpendableToken } from "../types";

export const IS_PLACEHOLDER = true;

export const BOOK: SpendableToken[] = [
  {
    symbol: "USDG",
    name: "Global Dollar",
    decimals: 6,
    balance: 1_240_500_000n,
    ceiling: 1_000_000_000n,
    fee: 4_200_000n,
    logoURI: "/tokens/usdg.png",
  },
  {
    symbol: "ETH",
    name: "Ether",
    decimals: 18,
    balance: 1_482_000_000_000_000_000n,
    ceiling: 1_482_000_000_000_000_000n,
    fee: 1_100_000_000_000_000n,
    logoURI: "/tokens/eth.svg",
  },
  {
    symbol: "COWL",
    name: "Cowl",
    decimals: 18,
    balance: 8_400_000_000_000_000_000_000_000n,
    ceiling: 5_000_000_000_000_000_000_000_000n,
    fee: 6_383_000_000_000_000_000_000n,
    logoURI: "/tokens/cowl.png",
  },
  {
    symbol: "AAPL",
    name: "Apple",
    decimals: 18,
    balance: 12_500_000_000_000_000_000n,
    ceiling: 8_000_000_000_000_000_000n,
    fee: 20_000_000_000_000_000n,
  },
];

/**
 * The portfolio placeholder's prices, restated for the swap's arithmetic. A
 * real quote comes from the venue's quoter across every fee tier; these exist
 * so typing in one side of the swap can move the other.
 */
export const PRICES: PriceTable = {
  ETH: 3412.8,
  AAPL: 232.15,
  USDG: 1,
  COWL: 0.0000335,
};
