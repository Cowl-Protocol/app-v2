/**
 * The tokens this app knows without asking a chain, per network.
 *
 * **Decimals are the reason this file exists.** A token's decimals decide where
 * the point goes, so a figure that is wrong by one is wrong by a factor of ten
 * while looking completely ordinary on screen, and nothing downstream can catch
 * it. Every entry below was read from the deployment it describes rather than
 * assumed, and the provenance is written beside it.
 *
 * **This is the curated set and it is deliberately short.** Robinhood Chain
 * carries tokenized equities as plain ERC-20s, and somebody can be paid in any
 * of them, so the wired app has to learn a token's symbol and decimals from the
 * token itself. That read does not exist yet. Until it does, a token that is not
 * here is refused rather than guessed at: refusing costs one payment, and
 * guessing costs the difference between 500 and 500,000,000,000,000.
 *
 * Addresses are copied from `cli/src/networks.ts`, which stays the source of
 * record for anything deployed.
 */
import { type Network, type NetworkKey } from "./networks";

export type Token = {
  symbol: string;
  name: string;
  decimals: number;
  /** The ERC-20. Absent on the native token, which has no contract to call. */
  address?: `0x${string}`;
  /** Gas token. Its balance is `eth_getBalance`, never `balanceOf`. */
  native?: boolean;
  /**
   * The token's mark, a path into this bundle.
   *
   * Only for what we curate, which is what sits under `public/tokens`. A token
   * discovered from the chain arrives carrying whatever URL an explorer holds
   * for it, and rendering that is a request to a third party naming a token
   * this browser holds. Absent is fine: the glyph falls back to the ticker.
   */
  logoURI?: string;
};

const ETH: Token = {
  symbol: "ETH",
  name: "Ether",
  decimals: 18,
  native: true,
  logoURI: "/tokens/eth.svg",
};

export const TOKENS: Record<NetworkKey, readonly Token[]> = {
  /**
   * The live chain. WETH and USDG are the real ones the pons venue routes
   * through, and USDG is the 6 decimal Global Dollar rather than an 18 decimal
   * stablecoin, which is the single most expensive thing in this file to get
   * wrong.
   */
  "robinhood-mainnet": [
    ETH,
    {
      symbol: "WETH",
      name: "Wrapped Ether",
      decimals: 18,
      address: "0x0Bd7D308f8E1639FAb988df18A8011f41EAcAD73",
      logoURI: "/tokens/weth.png",
    },
    {
      symbol: "USDG",
      name: "Global Dollar",
      decimals: 6,
      address: "0x5fc5360D0400a0Fd4f2af552ADD042D716F1d168",
      logoURI: "/tokens/usdg.png",
    },
    {
      symbol: "COWL",
      name: "Cowl",
      decimals: 18,
      address: "0xfc7CB8A3Df69c0F658Ac5Fb1e31dE1843E04E38f",
      logoURI: "/tokens/cowl.png",
    },
  ],

  /**
   * The test chain. WETH and USDG here are the venue stand-ins deployed
   * 2026-07-23, not bridged assets, and their symbols and decimals were read
   * out of `cli/contracts/test/mocks/TestVenue.sol` rather than copied from the
   * mainnet rows above: a stand-in is free to differ from the thing it stands in
   * for, and only the source says whether it does.
   *
   * **There is no COWL on this chain**, which is a fact about the deployment
   * rather than a hole in this table. A request denominated in COWL is not
   * payable on testnet and the payer's screen says so.
   */
  "robinhood-testnet": [
    ETH,
    {
      symbol: "WETH",
      name: "Wrapped Ether",
      decimals: 18,
      address: "0xdC155cafBa4D26790781c12e4B1001F933496Da2",
      logoURI: "/tokens/weth.png",
    },
    {
      symbol: "USDG",
      name: "Global Dollar",
      decimals: 6,
      address: "0xa82762eDA1AF5Ed19B9BD544C121dbcF365526aC",
      logoURI: "/tokens/usdg.png",
    },
  ],
};

/**
 * What a network can be named on without asking a chain.
 *
 * Takes the network rather than reading a module constant, because the network
 * in force is a runtime choice now: the bar has a picker, and a registry frozen
 * to whatever the build opened on would price a mainnet note against a testnet
 * stand-in's decimals. Same reason `tokenOn` below takes one.
 */
export function tokensFor(network: Network): readonly Token[] {
  return TOKENS[network.key];
}

/**
 * One token on one network, or nothing.
 *
 * Takes the network rather than reading the active one, because the caller that
 * matters most is the payer's screen and a payment link names its own chain. A
 * link resolved against whichever network this build happens to target would be
 * reading the wrong token's decimals in exactly the case the chain check exists
 * to catch.
 *
 * The match is exact and case sensitive, the same as the table it replaces. A
 * symbol is not a user's phrasing, it is a string the sending client wrote, and
 * a client that cannot spell its own token's ticker is not one to accommodate.
 */
export function tokenOn(network: Network, symbol: string): Token | undefined {
  return TOKENS[network.key].find((t) => t.symbol === symbol);
}
