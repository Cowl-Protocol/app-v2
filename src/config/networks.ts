/**
 * Chain and contract addresses, in one place and nowhere else.
 *
 * These are copied from `cli/src/networks.ts`, which stays the source of record.
 * When a pool or adapter is redeployed there, it changes here too, and the two
 * are expected to be checked against each other rather than assumed to match.
 */

export type NetworkKey = "robinhood-mainnet" | "robinhood-testnet";

export type Network = {
  key: NetworkKey;
  label: string;
  chainId: number;
  rpcUrl: string;
  /** Tried in order when the one before stops answering. */
  rpcFallbacks: string[];
  explorer: string;
  testnet: boolean;
  /** Boundary spends route through this so a wallet is never the gas payer. */
  relay: string;
  contracts: {
    pool: `0x${string}`;
    /**
     * Commitments live in the event log rather than contract storage, so
     * rebuilding the tree means replaying from here. Without a floor the replay
     * starts at genesis, which public RPCs refuse.
     */
    poolDeployBlock: bigint;
  };
};

export const NETWORKS: Record<NetworkKey, Network> = {
  "robinhood-mainnet": {
    key: "robinhood-mainnet",
    label: "Robinhood Chain",
    chainId: 4663,
    rpcUrl: "https://robinhood-rpc.publicnode.com",
    rpcFallbacks: [
      "https://robinhoodchain.blockscout.com/api/eth-rpc",
      "https://rpc.mainnet.chain.robinhood.com",
    ],
    explorer: "https://robinhoodchain.blockscout.com",
    testnet: false,
    relay: "https://relay.cowlprotocol.com/mainnet",
    contracts: {
      pool: "0x6f98666e9d05431dCd765AAa289a5E346AfA6a3E",
      poolDeployBlock: 18121312n,
    },
  },
  "robinhood-testnet": {
    key: "robinhood-testnet",
    label: "Robinhood Chain Testnet",
    chainId: 46630,
    rpcUrl: "https://46630.rpc.thirdweb.com",
    rpcFallbacks: [
      "https://robinhood-sepolia-rpc.publicnode.com",
      "https://rpc.testnet.chain.robinhood.com",
    ],
    explorer: "https://explorer.testnet.chain.robinhood.com",
    testnet: true,
    relay: "https://relay.cowlprotocol.com",
    contracts: {
      pool: "0xf9F825f2D6d8509c78baaa587694f74672C32A59",
      poolDeployBlock: 92522685n,
    },
  },
};

export const DEFAULT_NETWORK: NetworkKey = "robinhood-testnet";
