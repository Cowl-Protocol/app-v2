"use client";

/**
 * Which chain this session is reading, and the one place that answers.
 *
 * The build still names a starting network, `DEFAULT_NETWORK` in
 * `config/networks.ts`, and until the bar carried a picker that constant was the
 * whole answer. It is now the opening position and nothing more: anything that
 * reads a balance, a pool, a token registry or an explorer link asks
 * `useNetwork()`, and a module that imports the constant instead goes on naming
 * the chain the session has already left.
 *
 * **It is not written down anywhere, and that is the rule rather than an
 * omission.** This app persists nothing, so a reload opens on the network the
 * build named and a switch lasts as long as the tab. Every alternative is
 * storage: `localStorage` is blocked by lint, a cookie is storage that also
 * travels with every request, and a query parameter is a chain selection that
 * survives being pasted into somebody else's chat window. The cost is one click
 * after a reload, and the property bought is that the chain a fresh tab reads is
 * a fact about the deployment rather than about what the last person clicked.
 *
 * **Switching is a read-side change only.** Nothing here moves money, and no
 * key is derived from a chain id: the shielded account is the same account on
 * both networks, and what changes is which pool is replayed for its notes. So a
 * switch cannot strand a balance, it can only look at a different one.
 */
import { createContext, useCallback, useContext, useMemo, useState } from "react";
import { DEFAULT_NETWORK, NETWORK_LIST, type Network, type NetworkKey } from "@/config";

type NetworkChoice = {
  /** The chain in force. Everything downstream reads this and never the constant. */
  network: Network;
  /** What this session may switch to, in the order the picker lists them. */
  networks: readonly Network[];
  select: (key: NetworkKey) => void;
};

/**
 * The default is the build's network rather than `null`.
 *
 * A provider that has to be mounted before anything works is the usual shape,
 * and it is the wrong one here: the thing being provided has a correct answer
 * without it. This way a component rendered outside the provider, in a test or
 * on the payer's screen, reads the chain the build was made for instead of
 * throwing, and `select` is inert because there is no state for it to move.
 */
const NetworkContext = createContext<NetworkChoice>({
  network: DEFAULT_NETWORK,
  networks: NETWORK_LIST,
  select: () => {},
});

export function NetworkProvider({ children }: { children: React.ReactNode }) {
  const [network, setNetwork] = useState<Network>(DEFAULT_NETWORK);

  /*
    Resolved from the table by key rather than taking a whole `Network` object.
    The picker then cannot hand over a network this build does not carry, and a
    hand-assembled object pointing at an unknown pool is unrepresentable.
  */
  const select = useCallback((key: NetworkKey) => {
    const next = NETWORK_LIST.find((n) => n.key === key);
    if (next) setNetwork(next);
  }, []);

  const value = useMemo(
    () => ({ network, networks: NETWORK_LIST, select }),
    [network, select],
  );

  return <NetworkContext.Provider value={value}>{children}</NetworkContext.Provider>;
}

/** The chain in force. What almost everything wants. */
export function useNetwork(): Network {
  return useContext(NetworkContext).network;
}

/** The chain in force, the alternatives, and how to move between them. For the picker. */
export function useNetworkChoice(): NetworkChoice {
  return useContext(NetworkContext);
}
