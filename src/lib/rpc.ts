/**
 * The read side of the chain, one client per network.
 *
 * **Read only, deliberately.** Nothing here can sign or send. A spend leaves
 * this app either through the relayer or through Turnkey, and both are their
 * own modules: a client that could do both would make "this call cannot move
 * money" a thing you check by reading the call site rather than the import.
 */
import { createPublicClient, type Chain, type PublicClient } from "viem";
import { tokensFor, type Network, type NetworkKey, type Token } from "@/config";
import { transportFor } from "./transport";

/**
 * The chain, in the shape viem wants.
 *
 * `nativeCurrency` is read off the token registry's native entry rather than
 * written again here. It is the same fact in both places, and `npm run
 * test:config` already pins that every network has exactly one native token,
 * which is what makes the read below safe.
 */
export function toViemChain(network: Network, tokens: readonly Token[]): Chain {
  const native = tokens.find((t) => t.native);
  if (!native) {
    throw new Error(
      `${network.key} has no native token in the registry, so there is nothing to price gas in.`,
    );
  }

  return {
    id: network.chainId,
    name: network.label,
    nativeCurrency: {
      name: native.name,
      symbol: native.symbol,
      decimals: native.decimals,
    },
    rpcUrls: { default: { http: [network.rpcUrl] } },
    blockExplorers: { default: { name: network.label, url: network.explorer } },
    testnet: network.testnet,
  };
}

/**
 * One client per network, built the first time that network is asked for.
 *
 * **A function over a map, where this used to be a single module constant.**
 * The network is a runtime choice now, so a lone client would answer for
 * whichever chain the build opened on no matter what the bar says, and a
 * balance read from the wrong pool comes back as zero rather than as an error.
 *
 * Cached rather than constructed per call, and the cache is what makes calling
 * this from a render safe. viem's fallback transport keeps its own per-endpoint
 * state, which is how a rate-limited node stays skipped instead of being retried
 * on every request, and a fresh client each time would throw that away and hand
 * the same wall of 429s to every scan.
 *
 * **Read only, still.** Nothing reachable from here can sign or send.
 */
const clients = new Map<NetworkKey, PublicClient>();

export function clientFor(network: Network): PublicClient {
  const cached = clients.get(network.key);
  if (cached) return cached;

  const client = createPublicClient({
    chain: toViemChain(network, tokensFor(network)),
    transport: transportFor(network),
  });
  clients.set(network.key, client);
  return client;
}
