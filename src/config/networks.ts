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
  /**
   * What the network chip in the bar says. Two words at most, because it sits
   * beside an account name in a row that also has to hold a balance on a phone.
   *
   * A field rather than `testnet ? "Testnet" : "Mainnet"` read off the flag at
   * the call site. That derivation is correct only while there are exactly two
   * networks, and the day a third arrives it silently labels two of them the
   * same thing, which is the one mistake a chain picker must not make.
   */
  short: string;
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
    /**
     * The venue's V3 quoter, which is where every price on the balance screen
     * comes from.
     *
     * **The only price source this app has, and deliberately the only one.** The
     * CLI falls back to the explorer's REST rate for tokens the venue has no
     * pool for; here that would be this browser telling a third party which
     * tokens it holds, on a screen whose whole premise is that nobody can learn
     * that. A token the venue will not quote is rendered without a valuation
     * instead, which `Asset.price: null` already means.
     *
     * Optional in the type because a network without a venue is a network with
     * no prices rather than a broken build, and `lib/price.ts` says so in one
     * place. Both deployments have one today.
     */
    quoter?: `0x${string}`;
  };
};

export const NETWORKS: Record<NetworkKey, Network> = {
  "robinhood-mainnet": {
    key: "robinhood-mainnet",
    label: "Robinhood Chain",
    short: "Mainnet",
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
      /* The live pons Uniswap V3 stack, copied from `cli/src/networks.ts`. */
      quoter: "0x33e885eD0Ec9bF04EcfB19341582aADCb4c8A9E7",
    },
  },
  "robinhood-testnet": {
    key: "robinhood-testnet",
    label: "Robinhood Chain Testnet",
    short: "Testnet",
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
      /* The V3-interface stand-in venue deployed 2026-07-23. It answers, and
         `lib/price.ts` still refuses to call a test chain's answer a dollar. */
      quoter: "0x5cD1F037A2CB277A7661Ad6c045803BFC428f84B",
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
 * The network a session **starts** on.
 *
 * **An environment variable rather than a constant**, for the same reason the
 * auth ids are: it is a value that differs between a laptop and a deployment,
 * which is the one category `config/ui.ts` deliberately excludes. `output:
 * "export"` bakes it in at build time, so a deployment's starting chain is
 * decided by whoever built it and not by whoever opens it.
 *
 * **It is a starting point and no longer the answer.** The bar carries a chain
 * picker, so the network in force is a runtime value that lives in
 * `lib/network.tsx` and is read with `useNetwork()`. Reading this constant
 * inside the app is therefore a bug with a plausible shape: it compiles, it
 * names a real chain, and it goes on naming the chain the session has already
 * left. It is exported for the picker's initial value, for the probes, and for
 * nothing else, which is why it is not called `ACTIVE_NETWORK` any more.
 *
 * **An unrecognised name throws rather than falling back.** This runs at module
 * load, so under a static export it runs during prerender and fails
 * `npm run build`. A typo that quietly landed on the fallback is the failure
 * this exists to prevent: a build meant for mainnet would open on an empty
 * testnet pool and look exactly like an account with no money in it.
 *
 * `NETWORKS` stays exported beside this because two other questions get asked
 * of it. The picker asks what a session may switch to, and the payer's screen
 * asks whether a link names a chain this build knows at all, which has to look
 * past the current selection or a testnet request would be unreadable in a
 * mainnet build rather than refused in words.
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

export const DEFAULT_NETWORK: Network = resolveNetwork(
  process.env.NEXT_PUBLIC_COWL_NETWORK,
);

/**
 * Every network a session may switch to, in the order the picker lists them.
 *
 * Derived from `NETWORKS` rather than written again, so a chain added to the
 * table above appears in the bar without a second edit. Mainnet first because
 * that is the one a real balance is on, and a list ordered by how often a
 * developer uses it would put the rehearsal chain at the top of a menu ordinary
 * users see.
 */
export const NETWORK_LIST: readonly Network[] = [
  NETWORKS["robinhood-mainnet"],
  NETWORKS["robinhood-testnet"],
];

/**
 * The selection rule on its own, for `npm run test:config`.
 *
 * A module that reads its environment once at load cannot be asked a second
 * question in the same process, so a test of the constant above can only ever
 * see one answer. Taking the raw value as an argument is what makes the refusal
 * testable at all, and an untested refusal is this project's most repeated bug:
 * a rule that reads as enforced and is not.
 *
 * **Not a second way to reach a chain.** `DEFAULT_NETWORK` stays the only
 * answer to which network a session opens on, and the underscore is the same
 * signal `__unlock` carries: this is reachable so it can be checked, not so it
 * can be called.
 */
export const __networks = { resolveNetwork };

