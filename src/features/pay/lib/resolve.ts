/**
 * Turn a decoded link into something payable, or into a reason it is not.
 *
 * Separate from the codec on purpose. `lib/request-link` answers whether a
 * string is a well formed request, which is a question about the string.
 * Everything here is a question about this deployment: whether the chain is one
 * this build knows, whether the destination decodes, whether the token exists.
 * A codec that knew the network table would be a codec that had to change every
 * time a contract moved.
 */
import { NETWORKS, type Network } from "@/config";
import { dustFloor } from "@/lib/denominations";
import { toBaseUnits } from "@/lib/format";
import { isPaymentAddress } from "@/lib/payment-address";
import type { RequestPayload } from "@/lib/request-link";
import type { PayRefusal, ResolvedRequest } from "../types";

/** Symbol to decimals. Stands in for reading the token itself. */
export type TokenTable = Record<string, number>;

export function resolveRequest(
  payload: RequestPayload,
  tokens: TokenTable,
): ResolvedRequest | PayRefusal {
  /**
   * The chain check, which is the one that stops real money going to a
   * rehearsal.
   *
   * A `zcowl1…` is `<mpk><viewPub>` and carries no chain id, so a testnet
   * address and a mainnet address are indistinguishable by inspection. The link
   * is the only thing that can name the chain, and a payer surface that does not
   * refuse an unrecognised one is a surface that will pay a testnet request with
   * mainnet funds and show nothing unusual while doing it.
   */
  const network = Object.values(NETWORKS).find(
    (n: Network) => n.chainId === payload.chain,
  );
  if (!network) return "unknown-chain";

  // Checked before anything renders. A screen showing an amount beside a Pay
  // button has already told the payer this request is good, and finding out at
  // signing time that the destination was mistyped is finding out too late.
  if (!isPaymentAddress(payload.to)) return "bad-address";

  const decimals = tokens[payload.token];
  if (decimals === undefined) return "unknown-token";

  const amount = toBaseUnits(payload.amount, decimals);
  if (amount <= 0n) return "malformed";

  return {
    payload,
    network,
    amount,
    decimals,
    /**
     * **Dust warns and never refuses**, which is a deliberate asymmetry with
     * the request side.
     *
     * A request is composed by the person who benefits from it being round, so
     * the client rounds it. A payment is somebody settling an obligation that
     * may genuinely be tiny, and refusing it would mean this screen deciding
     * that a payment two people agreed on is not worth making. The cost of a
     * small note is fragmentation on the recipient's side, which is real and
     * is theirs to carry.
     */
    dust: amount < dustFloor(decimals),
  };
}
