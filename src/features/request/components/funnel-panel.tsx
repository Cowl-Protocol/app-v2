"use client";

import { useState } from "react";
import { Panel } from "@/components/ui/panel";
import { formatAmount } from "@/lib/format";
import type { FunnelAddress, TokenAmount } from "../types";
import { QrCode } from "./qr-code";

/**
 * Receive, for senders that are not Cowl users.
 *
 * **Both halves are live now.** The payment link names the session's own
 * `zcowl1…` and the chain in force. The plain address under it is account index
 * 1 on the same keyring, derived by Turnkey inside the enclave, and anything
 * sent to it genuinely arrives somewhere this account controls. It used to
 * render a sample: an EIP-55 string hashed from a fixed phrase, which an
 * exchange form accepts and pays into a wallet nobody holds the key to.
 *
 * **What has landed is shown as it lands**, because a deposit is somebody else's
 * action and a screen that made a person reload to find out is a screen that
 * makes them wonder whether it arrived at all.
 *
 * Two artifacts, and the order is the argument. The payment link comes first
 * because a person clicking it pays from their own wallet straight into the
 * recipient's private balance: nothing ever sits in the recipient's public
 * custody and there is nothing to move afterwards. The plain address exists for
 * the senders that cannot click, an exchange withdrawal form being the whole
 * genre, and it is presented as the fallback it is rather than as an equal
 * option.
 *
 * **What the plain address block must never claim: that this path is private.**
 * The transfer that lands here is public and the move that follows it is
 * public, and the copy therefore describes a sequence of events, never a
 * property. The privacy on this tab lives in the link, and the link's own copy
 * carries it.
 *
 * The network is printed under the address, not implied. An exchange form asks
 * for a network in its own dropdown, this address means nothing off this chain,
 * and the caption is the one place that fact can meet the person mid task.
 */

export function FunnelPanel({
  funnel = null,
  issuing = false,
  unavailable,
  arrivals = [],
  networkLabel,
  onRequest,
  tabs,
}: {
  /** The session's own public funnel, or null while none is derived. */
  funnel?: FunnelAddress | null;
  /** The derivation is in flight, which is not the same as there being none. */
  issuing?: boolean;
  /**
   * Why there is no address, when there is a session and still no address.
   *
   * Its own prop rather than a third state to infer, because the sentence for
   * "not signed in" and the sentence for "Turnkey refused" are different
   * problems with different answers, and showing the first to somebody who is
   * signed in sends them to do the one thing that will not help.
   */
  unavailable?: string;
  /** What is sitting on it right now, read from the chain. */
  arrivals?: TokenAmount[];
  networkLabel: string;
  /** Opens the same request dialog the Cowl tab uses. One machine, two doors. */
  onRequest?: () => void;
  /** The tab strip, built by the card so both panels render the same one. */
  tabs?: React.ReactNode;
}) {
  return (
    <Panel label="Receive" tone="mark" className="h-full min-w-0">
      {tabs}

      <p className="text-[12px] leading-relaxed text-bone/45">
        They pay from any wallet. It arrives in your balance, and your address
        book stays yours.
      </p>

      <button
        type="button"
        onClick={onRequest}
        disabled={!onRequest}
        className="mt-3 h-11 w-full bg-primary font-mono text-[11px] tracking-[0.16em] text-on-primary uppercase transition-colors hover:bg-primary-hi disabled:bg-white/[0.06] disabled:text-bone/30"
      >
        Create a payment link
      </button>

      <div className="mt-auto pt-5">
        {/*
          Two parts, not three. "One time" was here as well and wrapped the
          legend onto a second line at this panel's width; the caption under the
          address already carries that fact in a full sentence, and a legend is
          not where a property gets its only mention.
        */}
        <p className="font-mono text-[10px] tracking-[0.2em] text-bone/35 uppercase">
          Using an exchange?
          <span className="text-bone/20"> · plain address</span>
        </p>

        {funnel ? (
          <>
            <AddressBlock address={funnel.address} />

            <p className="mt-1.5 font-mono text-[10px] tracking-[0.18em] text-bone/35 uppercase">
              {networkLabel}
            </p>

            <Landed arrivals={arrivals} />

            {/*
              The sequence of events, in the order the person experiences it,
              with no property claimed for it. **It does not promise the move
              yet**: nothing in this app can build the proof a deposit needs, so
              what arrives sits here until it can, and saying otherwise would be
              a promise the product has not kept.
            */}
            <p className="mt-2.5 text-[11px] leading-snug text-bone/35">
              This address is yours and keeps working. Anything sent to it lands
              in public first · adding it to your private balance is the one step
              this app cannot take yet.
            </p>
          </>
        ) : (
          <p className="mt-1.5 bg-white/[0.03] px-3 py-3 text-[11px] leading-snug text-bone/35">
            {issuing
              ? "Deriving your deposit address."
              : unavailable
                ? `Your deposit address could not be derived · ${unavailable}`
                : "Sign in and this address is derived from your own keyring. Nothing is held on our side, so there is nothing to show until it is."}
          </p>
        )}
      </div>
    </Panel>
  );
}

/**
 * What is sitting on the funnel, if anything.
 *
 * **Absent when the address is empty**, rather than a row saying zero. An empty
 * deposit address is the ordinary state and the caption above already explains
 * what the address is for; a line reading "0 ETH" would be a fact about nothing
 * that also looks like a balance.
 */
function Landed({ arrivals }: { arrivals: TokenAmount[] }) {
  if (arrivals.length === 0) return null;

  return (
    <div className="mt-2.5 flex flex-col gap-1 bg-mark/[0.07] px-3 py-2">
      <p className="font-mono text-[9.5px] tracking-[0.2em] text-bone/45 uppercase">
        Landed here
      </p>
      {arrivals.map((a) => (
        <p key={a.symbol} className="font-mono text-[11.5px] tabular-nums text-mark">
          {formatAmount(a.amount, a.decimals)} {a.symbol}
        </p>
      ))}
    </div>
  );
}

/**
 * The full string beside a small code, same reasoning as the Cowl tab: the
 * address is the one thing somebody compares character by character against an
 * exchange form, and a middle ellipsis hides exactly where a swapped address
 * differs. The QR is for the exchange apps that scan instead.
 */
function AddressBlock({ address }: { address: string }) {
  const [copied, setCopied] = useState(false);

  async function copy() {
    try {
      await navigator.clipboard.writeText(address);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1600);
    } catch {
      // The address is on screen in full and can be selected by hand.
    }
  }

  return (
    <div className="mt-1.5 flex items-stretch gap-px bg-white/[0.06]">
      <div className="flex min-w-0 flex-1 flex-col bg-white/[0.04]">
        <p className="flex-1 px-3 py-2.5 font-mono text-[10.5px] leading-[1.55] break-all text-bone/60 select-all">
          {address}
        </p>
        <button
          type="button"
          onClick={copy}
          className="h-8 w-full bg-transparent text-left font-mono text-[10px] tracking-[0.2em] text-bone/45 uppercase transition-colors hover:text-mark"
        >
          <span className="px-3">{copied ? "Copied" : "Copy"}</span>
        </button>
      </div>
      <div className="flex shrink-0 items-center bg-white/[0.04] p-2">
        <QrCode text={address} className="w-[84px]" />
      </div>
    </div>
  );
}


