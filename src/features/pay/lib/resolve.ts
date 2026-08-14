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
import { NETWORKS, tokenOn, type Network } from "@/config";
import { dustFloor } from "@/lib/denominations";
import { toBaseUnits } from "@/lib/format";
import { isPaymentAddress } from "@/lib/payment-address";
import type { RequestPayload } from "@/lib/request-link";
import type { PayRefusal, ResolvedRequest } from "../types";

export function resolveRequest(
  payload: RequestPayload,
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
   *
   * Checked against every network this build knows rather than the one it runs
   * on. A build aimed at one chain still has to read a link naming the other,
   * or the refusal it gives is "this app does not know that network" when the
   * truth is that it knows it perfectly well and cannot pay there.
   */
  const network = Object.values(NETWORKS).find(
    (n: Network) => n.chainId === payload.chain,
  );
  if (!network) return "unknown-chain";

  // Checked before anything renders. A screen showing an amount beside a Pay
  // button has already told the payer this request is good, and finding out at
  // signing time that the destination was mistyped is finding out too late.
  if (!isPaymentAddress(payload.to)) return "bad-address";

  /*
    Decimals come from the token registry, on the chain the link names, and a
    token that is not in it is refused rather than assumed. This used to be a
    table of four tickers that lived in this feature's placeholder module,
    which meant a token whose real decimals differed from the guess
    would have rendered an amount off by orders of magnitude while looking
    completely ordinary. The registry ends the guess for what it curates; the
    read that ends it for everything else is a call to the token itself, and it
    does not exist yet.
  */
  const token = tokenOn(network, payload.token);
  if (!token) return "unknown-token";

  const amount = toBaseUnits(payload.amount, token.decimals);
  if (amount <= 0n) return "malformed";

  return {
    payload,
    network,
    amount,
    decimals: token.decimals,
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
    dust: amount < dustFloor(token.decimals),
  };
}
