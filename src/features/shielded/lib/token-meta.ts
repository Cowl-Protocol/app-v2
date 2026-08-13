/**
 * Naming a token a note holds.
 *
 * The registry answers for what this project curates. Everything else is read
 * from the token itself, because Robinhood Chain carries tokenized equities as
 * plain ERC-20s and somebody can be paid privately in any of them: a client that
 * only knows four tickers would render a stranger's payment as an unnamed row,
 * or worse, guess its decimals.
 *
 * **The chain read is narrower than it looks and it is worth naming.** Replaying
 * the pool's log tells an RPC nothing about who is reading it, since every
 * client replays the same public history. A `symbol()` call for one token
 * address does not have that property: it says this browser holds that token.
 * So it happens only for tokens the registry does not already answer, and the
 * result is held in memory for the session and never written down.
 */
import { ACTIVE_NETWORK, ACTIVE_TOKENS, type Token } from "@/config";
import { publicClient } from "@/lib/rpc";
import { fieldToAddress } from "./note";

/** Just enough of ERC-20 to put a name and a decimal point on a row. */
const ERC20_ABI = [
  { type: "function", name: "symbol", stateMutability: "view", inputs: [], outputs: [{ type: "string" }] },
  { type: "function", name: "decimals", stateMutability: "view", inputs: [], outputs: [{ type: "uint8" }] },
  { type: "function", name: "name", stateMutability: "view", inputs: [], outputs: [{ type: "string" }] },
] as const;

export type TokenMeta = Pick<Token, "symbol" | "name" | "decimals" | "logoURI"> & {
  /** The field element the pool uses. 0 is the native coin. */
  token: bigint;
  /** False when symbol and decimals came off the chain rather than the registry. */
  curated: boolean;
};

/** Session lifetime, in memory, gone with the tab like everything else here. */
const learned = new Map<bigint, TokenMeta>();

function fromRegistry(token: bigint): Token | undefined {
  if (token === 0n) return ACTIVE_TOKENS.find((t) => t.native);
  const address = fieldToAddress(token).toLowerCase();
  return ACTIVE_TOKENS.find((t) => t.address?.toLowerCase() === address);
}

/**
 * What to call a token, and where to put its point.
 *
 * **Never invents decimals.** A token that answers neither the registry nor the
 * chain comes back with `decimals: null` and the caller has to decide what to
 * render, which is the honest failure: a row that says "unknown token" is a
 * question, and a row that shows the wrong number of zeros is an answer that
 * happens to be false.
 */
export async function tokenMetaFor(token: bigint): Promise<TokenMeta | null> {
  const cached = learned.get(token);
  if (cached) return cached;

  const curated = fromRegistry(token);
  if (curated) {
    const meta: TokenMeta = { ...curated, token, curated: true };
    learned.set(token, meta);
    return meta;
  }

  if (token === 0n) return null;
  const address = fieldToAddress(token);

  try {
    const [symbol, decimals, name] = await Promise.all([
      publicClient.readContract({ address, abi: ERC20_ABI, functionName: "symbol" }),
      publicClient.readContract({ address, abi: ERC20_ABI, functionName: "decimals" }),
      publicClient.readContract({ address, abi: ERC20_ABI, functionName: "name" }).catch(() => ""),
    ]);

    const meta: TokenMeta = {
      token,
      symbol,
      name: name || symbol,
      decimals: Number(decimals),
      curated: false,
    };
    learned.set(token, meta);
    return meta;
  } catch {
    /* A token that will not say what it is on the chain this build runs against
       is not a token this client can put an amount beside. */
    return null;
  }
}

/** The explorer link for a token, for a row that has to name one it does not know. */
export function explorerFor(token: bigint): string {
  return `${ACTIVE_NETWORK.explorer}/address/${fieldToAddress(token)}`;
}
