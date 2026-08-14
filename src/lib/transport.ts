/**
 * How this client behaves when an RPC endpoint stops being useful.
 *
 * Ported from `app/lib/transport.ts`, where the rules below were learned the
 * expensive way rather than designed. They are kept because the endpoints are
 * the same endpoints: this chain has one archive source that rate-limits hard,
 * and several fast ones that decline the calls they do not serve.
 *
 * The whole file exists to answer one question correctly: **when an endpoint
 * refuses, is the next one worth asking?**
 */
import { fallback, http } from "viem";
import { type Network } from "@/config";

/**
 * Recognised by hostname rather than by position in the list. The ordering in
 * `config/networks.ts` is about preference; this is about behaviour.
 */
function isExplorerEndpoint(url: string): boolean {
  return /blockscout|explorer/i.test(url);
}

/**
 * "That block range is too wide" is not an endpoint failing.
 *
 * Falling through on it is wrong twice: the next endpoint is no likelier to
 * serve the range, and once the last one has also declined, the message the
 * caller sees belongs to whichever happened to be last. The log reader then
 * cannot tell a cap from an outage, so it never splits the range it was being
 * told to split.
 */
function isRangeCap(message: string): boolean {
  return /limit|range|exceed|too (?:many|large|broad)|more than \d+ results/i.test(message);
}

/**
 * A rate limit is this endpoint's state, not the request's shape.
 *
 * **Asked before `isRangeCap`, and the order is load-bearing.** The explorer
 * refuses with "Too many requests", which `too (?:many|…)` reads as a range cap.
 * Classified that way, a throttled endpoint looks like a malformed request
 * nobody else would serve either, the fallback stops there, and the one
 * endpoint that answers this chain's historical logs is never asked.
 */
function isRateLimit(message: string): boolean {
  return /\b429\b|too many requests|rate limit|rate-limit|quota exceeded/i.test(message);
}

/**
 * A revert is the chain's answer, not an endpoint's failure.
 *
 * Asking a second node produces the same revert, so walking the rest of the
 * list only spends their timeouts and retries.
 */
function isChainAnswer(message: string): boolean {
  return /execution reverted|reverted with|invalid opcode|out of gas|EstimateGas/i.test(message);
}

/** Exported so a check can drive this function rather than a second copy of it. */
export function surfaceImmediately(error: Error): boolean {
  if (isRateLimit(error.message)) return false;
  return isRangeCap(error.message) || isChainAnswer(error.message);
}

/** Every endpoint for a network, in the order they should be tried. */
export function endpointsFor(network: Network): string[] {
  return [network.rpcUrl, ...network.rpcFallbacks];
}

/**
 * One transport for a network, built from its ordered endpoint list.
 *
 * The network is an argument with no default. It used to fall back to the one
 * the build named, which is a shape that stops being safe the moment a session
 * can switch chains: an omitted argument would then read the right endpoints
 * for the wrong pool.
 *
 * Patience is for a last resort. The explorer's spaced retries are right when
 * there is nothing after it and wasteful when there is: three rounds is ten
 * seconds spent on a node that has already said no, per request, on a replay
 * that makes many.
 */
export function transportFor(network: Network) {
  const urls = endpointsFor(network);

  return fallback(
    urls.map((url, i) => {
      const lastResort = i === urls.length - 1;

      if (isExplorerEndpoint(url)) {
        return http(url, {
          timeout: lastResort ? 30_000 : 8_000,
          retryCount: lastResort ? 3 : 0,
          retryDelay: 3_000,
        });
      }

      return http(url, { timeout: 8_000, retryCount: 1 });
    }),
    { shouldThrow: surfaceImmediately },
  );
}
