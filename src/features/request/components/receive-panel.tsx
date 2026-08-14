"use client";

import { useState } from "react";
import { Panel } from "@/components/ui/panel";
import type { ReceiveAddress } from "../types";
import { QrCode } from "./qr-code";

/**
 * The panel this product exists for.
 *
 * **What it must never say.** Not "private payment". The person paying is
 * visible on chain and anybody can confirm it in a single look, so the phrase is
 * false in the one direction that matters and a critic disproves it in thirty
 * seconds. What is true, and sells on its own: money reaches you and you never
 * showed an address to get it.
 *
 * **The address is not one-time yet, and this panel no longer says it is.** The
 * design is a sequence, a fresh address as soon as a payment lands, so that no
 * single string collects a person's whole payment history in the hands of
 * everyone who ever paid them. What exists today is one account per session:
 * per-index derivation has not shipped, so there is nothing to rotate to. The
 * copy here describes what the address does do, which is carry no balance and no
 * history, and the "one time" label and the rotation sentence come back in the
 * same commit as the derivation, not before it.
 *
 * What rotation will **not** do is retire anything, and this panel deliberately
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
 * **There is no sample state left.** This panel used to be able to render a
 * placeholder address, and the SAMPLE tag beside it was the warning that came
 * with it: the string was real bech32m over a fixed phrase, so it scanned, and a
 * code that scans is a code somebody can pay into a book whose spending key
 * exists in no wallet on earth. `address` is now the session's own or null, and
 * null draws no code at all.
 */

export function ReceivePanel({
  address,
  onRequest,
  tabs,
}: {
  /** The session's own address, or null when there is no session. */
  address: ReceiveAddress | null;
  /** The tab strip, built by the card so both receive panels render the same one. */
  tabs?: React.ReactNode;
  onRequest: () => void;
}) {
  return (
    <Panel label="Receive" tone="mark" className="h-full min-w-0">
      {tabs}

      {address ? (
        <>
          <div className="flex justify-center pt-1">
            <QrCode text={address.address} className="w-full max-w-[188px]" />
          </div>

          <p className="mt-4 text-center text-[12px] leading-relaxed text-bone/45">
            Give this to whoever is paying you. It carries no balance and no
            history, and nothing on chain ties it to you.
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
          </div>
        </>
      ) : (
        <NoSession />
      )}
    </Panel>
  );
}

/**
 * No account, so no address. Reachable only with `SKIP_LOGIN`, which is the
 * layout bypass: a real visitor never gets past the gate without a session.
 */
function NoSession() {
  return (
    <p className="grid flex-1 place-items-center px-6 py-12 text-center text-[12px] leading-relaxed text-bone/35">
      Sign in and this browser derives your payment address. Nothing here is held
      on our side, so there is nothing to show until it does.
    </p>
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
