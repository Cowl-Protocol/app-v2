/**
 * **Placeholder data. No chain, no key, no note.**
 *
 * Same contract as the portfolio's copy: the surfaces are being laid out before
 * they are wired, so every figure comes from here, and wiring is deleting this
 * module and satisfying the same types. Anything still importing it fails the
 * build rather than quietly shipping an invented address.
 *
 * **The addresses are built, never pasted.** Each one is real bech32m over a
 * seed that is a fixed phrase, so the texture is exactly what a live address
 * looks like while the `sk` behind it was never generated and exists in no
 * wallet on earth. That matters more here than on any other screen: these render
 * as scannable QR codes, and a scannable code is something a stranger can pay.
 * Anything sent to one of them is unrecoverable by anybody, including us. Hence
 * `IS_PLACEHOLDER`, and the SAMPLE tag it drives, which comes off in the same
 * commit as this file or not at all.
 */
import { keccak_256 } from "@noble/hashes/sha3";
import { bytesToHex, utf8ToBytes } from "@noble/hashes/utils";
import { hashToField } from "@/lib/field";
import { encodePaymentAddress } from "@/lib/payment-address";
import type { FunnelAddress, GatherQuote, ReceiveAddress, RequestToken } from "../types";

export const IS_PLACEHOLDER = true;

/**
 * One address per index, deterministic, owned by nobody.
 *
 * Indexed the way the real sequence will be, so the list on screen has the
 * shape it will have later: a live address at the top and everything before it
 * retired underneath, in the order they were handed out.
 */
function sampleAddress(index: number): string {
  return encodePaymentAddress(
    hashToField(utf8ToBytes(`cowl:app-v2:placeholder:mpk:${index}`)),
    "02" + bytesToHex(keccak_256(utf8ToBytes(`cowl:app-v2:placeholder:view:${index}`))),
  );
}

/**
 * The tokens a request can be denominated in.
 *
 * The same four the portfolio holds, restated here rather than imported.
 * Crossing a feature boundary for four tickers would make `request` depend on
 * `portfolio` for the rest of time, to reach mock data that both of them are
 * going to delete.
 */
export const REQUEST_TOKENS: RequestToken[] = [
  { symbol: "USDG", name: "Global Dollar", decimals: 6, logoURI: "/tokens/usdg.png" },
  { symbol: "ETH", name: "Ether", decimals: 18, logoURI: "/tokens/eth.svg" },
  { symbol: "COWL", name: "Cowl", decimals: 18, logoURI: "/tokens/cowl.png" },
  { symbol: "AAPL", name: "Apple", decimals: 18 },
];

/**
 * The sequence, newest first.
 *
 * Index 4 is live and holds nothing, which is the normal state: an address that
 * has been paid is retired the moment its payment is seen, so the one on screen
 * is by definition the one nothing has landed on yet.
 *
 * Two of the retired ones still hold value and one does not. That mix is
 * deliberate rather than filler — it is the only way the address list and the
 * gather control can be looked at in the state they exist for.
 */
export const ADDRESSES: ReceiveAddress[] = [
  { index: 4, address: sampleAddress(4), issued: "Just now", holdings: [] },
  {
    index: 3,
    address: sampleAddress(3),
    issued: "2 hours ago",
    holdings: [{ symbol: "USDG", amount: 250_000_000n, decimals: 6 }],
  },
  {
    index: 2,
    address: sampleAddress(2),
    issued: "Yesterday",
    holdings: [{ symbol: "AAPL", amount: 4_000_000_000_000_000_000n, decimals: 18 }],
  },
  { index: 1, address: sampleAddress(1), issued: "4 days ago", holdings: [] },
  { index: 0, address: sampleAddress(0), issued: "6 days ago", holdings: [] },
];

/** The live one, the QR on the Receive panel. Everything under it is finished. */
export const CURRENT = ADDRESSES[0]!;

/**
 * The address a new request would be paid into.
 *
 * **Not `CURRENT`, and this is the design rather than a detail.** There is one
 * sequence, and anything that hands an address out takes the next index off it.
 * If a request reused the address already on the Receive panel, the invoice and
 * the standing QR would be the same string in two different people's hands,
 * which is exactly the correlation one-time addresses exist to prevent.
 *
 * Wired, there is no constant here at all: opening the request dialog issues an
 * index, and the Receive panel moves to the one after it in the same move. Two
 * frozen values are the closest a placeholder gets to that, and they are enough
 * to see that the two screens never show the same address.
 */
export const NEXT: ReceiveAddress = {
  index: 5,
  address: sampleAddress(5),
  issued: "Just now",
  holdings: [],
};

export const RETIRED = ADDRESSES.slice(1);

/**
 * EIP-55, so the sample is byte for byte what a live funnel will look like and
 * survives being pasted into an exchange form that validates the checksum.
 */
function eip55(bytes20: Uint8Array): string {
  const hex = bytesToHex(bytes20);
  const hash = bytesToHex(keccak_256(utf8ToBytes(hex)));
  let out = "0x";
  for (let i = 0; i < hex.length; i++) {
    out += parseInt(hash[i]!, 16) >= 8 ? hex[i]!.toUpperCase() : hex[i]!;
  }
  return out;
}

/**
 * The public funnel on screen, index 1 because #0 is the anchor and is never
 * issued. Same contract as the `zcowl1…` samples above: hashed from a fixed
 * phrase, so no private key for it was ever computed and nothing can spend from
 * it. **It still receives** — an EVM address does not need an owner to accept a
 * transfer — which is exactly why the SAMPLE tag ships next to it. Anything
 * sent to it is gone for good.
 *
 * Wired, funnels come off the same watch rule as the shielded sequence: every
 * index ever issued stays scanned, and they join the address list beside the
 * `zcowl1…` entries rather than growing a second list of their own.
 */
export const FUNNEL: FunnelAddress = {
  index: 1,
  address: eip55(keccak_256(utf8ToBytes("cowl:app-v2:placeholder:funnel:1")).slice(12)),
  issued: "Just now",
};

/**
 * What gathering the two funded books would cost.
 *
 * **A real quote is per token**, because a relayed spend takes its fee out of
 * the notes it is moving and those notes are whatever token landed there. One
 * figure is enough to lay the control out; the wired version has to price each
 * book in its own token and say so, or it will understate the bill for anybody
 * holding something the relayer prices expensively.
 *
 * The figure itself is the measured one from the airdrop: roughly 6,383 COWL a
 * send, gas based, and it does not scale with how much is being moved.
 */
export const GATHER: GatherQuote = {
  books: 2,
  feeEach: { symbol: "COWL", amount: 6_383_000_000_000_000_000_000n, decimals: 18 },
};
