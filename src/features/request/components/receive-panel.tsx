"use client";

import { useState } from "react";
import { Panel } from "@/components/ui/panel";
import { formatAmount } from "@/lib/format";
import type { ReceiveAddress, TokenAmount } from "../types";
import { QrCode } from "./qr-code";

/**
 * The panel this product exists for. **Layout only, wired to nothing.**
 *
 * **What it must never say.** Not "private payment". The person paying is
 * visible on chain and anybody can confirm it in a single look, so the phrase is
 * false in the one direction that matters and a critic disproves it in thirty
 * seconds. What is true, and sells on its own: money reaches you and you never
 * showed an address to get it.
 *
 * **The address is one-time.** A fresh one is issued as soon as a payment lands
 * on this one, so no single string collects a person's whole payment history in
 * the hands of everyone who ever paid them. Two payers holding the same address
 * can establish off chain that they paid the same person; two payers holding
 * different ones cannot, and the chain never says it either way.
 *
 * What rotation does **not** do is retire anything, and this panel deliberately
 * does not claim it does. A `zcowl1…` cannot be revoked and money sent to an old
 * one still arrives. The full version of that belongs on the address list, next
 * to the addresses it is about, rather than as a paragraph on the screen
 * somebody opens to get paid.
 *
 * The address is rendered in full rather than truncated. It is the one string
 * here somebody may want to compare against what they pasted somewhere else, and
 * a middle ellipsis hides exactly the characters a swapped address would differ
 * in. The QR stays the way it actually gets handed over.
 *
 * **The SAMPLE tag is not decoration.** This encodes a scannable code from
 * placeholder material, and a code that scans is a code somebody can pay. The
 * address behind it was built from a fixed phrase, so its `sk` exists in no
 * wallet anywhere and anything sent to it is gone for good. The tag comes off
 * with the placeholder module, in the same commit, or not at all.
 */

export function ReceivePanel({
  address,
  retiredCount,
  justReceived,
  onRequest,
  onOpenAddresses,
  tabs,
  sample = false,
}: {
  address: ReceiveAddress;
  /** How many are behind this one. Zero hides the control rather than printing 0. */
  retiredCount: number;
  /** The tab strip, built by the card so both receive panels render the same one. */
  tabs?: React.ReactNode;
  /**
   * The payment that caused this address to be the one on screen.
   *
   * **The QR is never swapped silently**, and this prop is why. A code that
   * changes under a phone that is mid-scan is a payment that fails for no
   * reason the payer can see. Rotation happens at the one moment it explains
   * itself: something arrived, so here is a new one.
   */
  justReceived?: TokenAmount;
  onRequest: () => void;
  onOpenAddresses: () => void;
  sample?: boolean;
}) {
  return (
    <Panel
      label="Receive"
      tone="mark"
      aside={sample ? <SampleTag /> : undefined}
      className="h-full min-w-0"
    >
      {tabs}

      {justReceived && <ReceivedStrip amount={justReceived} />}

      <div className="flex justify-center pt-1">
        <QrCode text={address.address} className="w-full max-w-[188px]" />
      </div>

      <p className="mt-4 text-center text-[12px] leading-relaxed text-bone/45">
        Give this to whoever is paying you. It carries no balance and no history,
        and once a payment lands you get a new one.
      </p>

      <AddressBlock address={address.address} />

      <div className="mt-2.5 grid gap-px bg-white/[0.06]">
        <button
          type="button"
          onClick={onRequest}
          className="h-10 w-full shrink-0 bg-white/[0.05] font-mono text-[11px] tracking-[0.16em] text-bone/70 uppercase transition-colors hover:bg-white/[0.09] hover:text-mark"
        >
          Request an amount
        </button>

        {retiredCount > 0 && (
          <button
            type="button"
            onClick={onOpenAddresses}
            className="h-9 w-full shrink-0 bg-transparent font-mono text-[10.5px] tracking-[0.18em] text-bone/40 uppercase transition-colors hover:bg-white/[0.03] hover:text-mark"
          >
            {retiredCount} previous {retiredCount === 1 ? "address" : "addresses"}
          </button>
        )}
      </div>
    </Panel>
  );
}

/**
 * Why the address above is not the one you were looking at.
 *
 * Phrased as an arrival rather than as a rotation, because that is the order the
 * person experiences it in and the only part they had any stake in. "Your
 * address changed" describes the client's bookkeeping; "this landed" describes
 * their money, and the new address is then self-evidently the consequence.
 */
function ReceivedStrip({ amount }: { amount: TokenAmount }) {
  return (
    <div className="mb-3 flex items-center gap-2.5 bg-mark/[0.08] px-3 py-2">
      <span aria-hidden className="size-[5px] shrink-0 bg-mark" />
      <p className="min-w-0 text-[11px] leading-snug text-bone/70">
        <span className="font-mono tabular-nums text-mark">
          +{formatAmount(amount.amount, amount.decimals)} {amount.symbol}
        </span>{" "}
        landed. Here is a fresh address.
      </p>
    </div>
  );
}

function AddressBlock({ address }: { address: string }) {
  const [copied, setCopied] = useState(false);

  /**
   * The button says what happened and then stops saying it. No toast, no
   * portal, no timer left running when the panel unmounts: the label is the
   * feedback, next to the thing it is about.
   */
  async function copy() {
    try {
      await navigator.clipboard.writeText(address);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1600);
    } catch {
      // A denied clipboard is not an error worth a dialog. The address is on
      // screen in full and can be selected by hand.
    }
  }

  return (
    <div className="mt-auto pt-4">
      <div className="flex items-center justify-between">
        <span className="font-mono text-[10px] tracking-[0.2em] text-bone/35 uppercase">
          Payment address
          <span className="text-bone/20"> · one time</span>
        </span>
        <button
          type="button"
          onClick={copy}
          className="font-mono text-[10px] tracking-[0.2em] text-bone/45 uppercase transition-colors hover:text-mark"
        >
          {copied ? "Copied" : "Copy"}
        </button>
      </div>

      <p className="mt-1.5 bg-white/[0.04] px-3 py-2.5 font-mono text-[10.5px] leading-[1.55] break-all text-bone/60 select-all">
        {address}
      </p>
    </div>
  );
}

function SampleTag() {
  return (
    <span className="bg-white/[0.07] px-2 py-1 font-mono text-[9.5px] tracking-[0.2em] text-bone/55 uppercase">
      Sample
    </span>
  );
}
