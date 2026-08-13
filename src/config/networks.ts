/**
 * Chain and contract addresses, in one place and nowhere else.
 *
 * These are copied from `cli/src/networks.ts`, which stays the source of record.
 * When a pool or adapter is redeployed there, it changes here too, and the two
 * are expected to be checked against each other rather than assumed to match.
 *
 * Only what this app actually reads is copied across. The venue addresses, the
 * trade adapter and its gas figure all live in the CLI's table and are
 * deliberately absent here until something in this app calls them: a field
 * nothing reads is a value nobody checks, and it will be stale on the day the
 * first caller trusts it.
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

/**
 * Where a build lands when it says nothing.
 *
 * Testnet, and the asymmetry is the point. A build that forgot to name a
 * network runs against the chain where a mistake costs nothing, and reaching
 * mainnet takes somebody typing its name. The reverse default would make an
 * omission the expensive case.
 */
const FALLBACK_NETWORK: NetworkKey = "robinhood-testnet";

/**
 * The network this build runs against.
 *
 * **An environment variable rather than a constant**, for the same reason the
 * auth ids are: it is a value that differs between a laptop and a deployment,
 * which is the one category `config/ui.ts` deliberately excludes. `output:
 * "export"` bakes it in at build time, so changing it means a rebuild, which is
 * correct for something that decides which chain a balance is read from.
 *
 * **An unrecognised name throws rather than falling back.** This runs at module
 * load, so under a static export it runs during prerender and fails
 * `npm run build`. A typo that quietly landed on the fallback is the failure
 * this exists to prevent: a build meant for mainnet would read an empty testnet
 * pool and look exactly like an account with no money in it.
 *
 * `NETWORKS` stays exported beside this because two different questions get
 * asked here. This one answers "which chain is this build on", and there is now
 * exactly one place to read it. The payer's screen asks the other one, whether
 * a link names a chain this build knows at all, and that has to look past the
 * active network or a testnet request would be unreadable in a mainnet build
 * rather than refused in words.
 */
function resolveNetwork(configured: string | undefined): Network {
  const named = configured?.trim();
  if (!named) return NETWORKS[FALLBACK_NETWORK];

  const known = Object.keys(NETWORKS);
  if (!known.includes(named)) {
    throw new Error(
      `NEXT_PUBLIC_COWL_NETWORK is "${named}", which is not a network this build knows. ` +
        `Use one of: ${known.join(", ")}. Leave it unset for ${FALLBACK_NETWORK}.`,
    );
  }

  return NETWORKS[named as NetworkKey];
}

export const ACTIVE_NETWORK: Network = resolveNetwork(
  process.env.NEXT_PUBLIC_COWL_NETWORK,
);

/**
 * The selection rule on its own, for `npm run test:config`.
 *
 * A module that reads its environment once at load cannot be asked a second
 * question in the same process, so a test of the constant above can only ever
 * see one answer. Taking the raw value as an argument is what makes the refusal
 * testable at all, and an untested refusal is this project's most repeated bug:
 * a rule that reads as enforced and is not.
 *
 * **Not a second way to reach a chain.** `ACTIVE_NETWORK` stays the only answer
 * to which network this build runs on, and the underscore is the same signal
 * `__unlock` carries: this is reachable so it can be checked, not so it can be
 * called.
 */
export const __networks = { resolveNetwork };

