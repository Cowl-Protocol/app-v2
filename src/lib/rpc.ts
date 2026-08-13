/**
 * The read side of the chain, and there is only one of it.
 *
 * **Read only, deliberately.** Nothing here can sign or send. A spend leaves
 * this app either through the relayer or through Turnkey, and both are their
 * own modules: a client that could do both would make "this call cannot move
 * money" a thing you check by reading the call site rather than the import.
 */
import { createPublicClient, type Chain } from "viem";
import { ACTIVE_NETWORK, ACTIVE_TOKENS, type Network, type Token } from "@/config";
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

export const activeChain = toViemChain(ACTIVE_NETWORK, ACTIVE_TOKENS);

/**
 * One client for the whole app.
 *
 * Module scope rather than a hook or a provider. The network is fixed at build
 * time, so there is nothing for a provider to provide and nothing that can
 * change under a component. A second client would only be a second connection
 * pool with the same answers.
 */
export const publicClient = createPublicClient({
  chain: activeChain,
  transport: transportFor(ACTIVE_NETWORK),
});
