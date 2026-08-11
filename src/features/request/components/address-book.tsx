"use client";

import { useState } from "react";
import { Overlay } from "@/components/ui/overlay";
import { formatAmount } from "@/lib/format";
import { cn } from "@/lib/utils";
import type { GatherQuote, ReceiveAddress } from "../types";

/**
 * Every address that has been handed out. **Layout only, wired to nothing.**
 *
 * **This screen exists because rotation does not retire anything.** A `zcowl1…`
 * cannot be revoked. An address disappearing from the Receive panel means the
 * app stopped offering it, not that it stopped working, and somebody who kept
 * the string can pay it years later. So the client keeps scanning every index it
 * ever issued, forever, and this is where a person can see the ones it is
 * watching.
 *
 * Hiding them from the panel and *also* from here would be the worst version of
 * this design: a payment would arrive against an address nothing on screen has
 * ever mentioned, and the balance would go up with no explanation available
 * anywhere. Dropping an old index from the scan to save time would be worse
 * still, because then the payment simply never appears and there is no symptom
 * at all.
 *
 * **The gather control and its price are here from the first version.** Every
 * address is a separate book, one spend can only read notes under a single
 * spending key, and so bringing a balance back together costs one relayed
 * transaction per funded address. That is the standing cost of one-time
 * addresses. It falls hardest on somebody being paid small amounts often, and a
 * person who meets it for the first time while trying to spend will reasonably
 * conclude the app has lost their money.
 */

export function AddressBook({
  addresses,
  gather,
  onClose,
}: {
  /** Retired ones, newest first. The live address belongs on the Receive panel. */
  addresses: ReceiveAddress[];
  gather: GatherQuote;
  onClose: () => void;
}) {
  return (
    <Overlay title="Previous addresses" onClose={onClose} className="max-w-[460px]">
      <p className="text-[12px] leading-relaxed text-bone/45">
        These still work. You have stopped handing them out, and anything sent to
        one still arrives, so this app keeps watching every one of them.
      </p>

      <ul className="mt-3.5 divide-y divide-white/[0.05] border-y border-white/[0.05]">
        {addresses.map((a) => (
          <AddressRow key={a.index} address={a} />
        ))}
      </ul>

      {gather.books > 0 && <Gather quote={gather} />}
    </Overlay>
  );
}

function AddressRow({ address }: { address: ReceiveAddress }) {
  const [copied, setCopied] = useState(false);

  async function copy() {
    try {
      await navigator.clipboard.writeText(address.address);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1600);
    } catch {
      // Nothing to say. The row is not the place a copy failure gets a dialog.
    }
  }

  const funded = address.holdings.length > 0;

  return (
    <li className="flex items-center gap-3 py-2.5">
      {/*
        The index, and it is not decoration. It is what the address is derived
        from, which is what makes an address recoverable from the one seed rather
        than something that had to be written down and kept.
      */}
      <span
        aria-hidden
        className={cn(
          "grid size-7 shrink-0 place-items-center font-mono text-[10px] tabular-nums",
          funded ? "bg-mark/15 text-mark/80" : "bg-white/[0.05] text-bone/35",
        )}
      >
        {String(address.index).padStart(2, "0")}
      </span>

      <div className="min-w-0 flex-1">
        {/*
          Truncated here and never on the Receive panel, and the difference is
          what the string is for. There it is a value somebody compares against
          what they pasted somewhere else, and a middle ellipsis hides exactly
          the characters a swapped address would differ in. Here it is a label
          for a row in a list of your own addresses, which nobody reads
          character by character. Copy hands over the whole thing.
        */}
        <p className="truncate font-mono text-[11px] text-bone/70">
          {address.address.slice(0, 14)}…{address.address.slice(-6)}
        </p>
        <p className="text-[10.5px] text-bone/30">{address.issued}</p>
      </div>

      {funded && (
        <div className="shrink-0 text-right">
          {address.holdings.map((h) => (
            <p key={h.symbol} className="font-mono text-[11px] tabular-nums text-mark/85">
              {formatAmount(h.amount, h.decimals)} {h.symbol}
            </p>
          ))}
        </div>
      )}

      <button
        type="button"
        onClick={copy}
        className="shrink-0 font-mono text-[9.5px] tracking-[0.18em] text-bone/30 uppercase transition-colors hover:text-mark"
      >
        {copied ? "Copied" : "Copy"}
      </button>
    </li>
  );
}

/**
 * The bill for one-time addresses, stated in full before it is agreed to.
 *
 * The count is what the price is made of, not the amount, and the copy says so:
 * a person seeing a fee next to a small balance needs to know it is not a
 * percentage, or the next thing they will do is wait for the balance to grow and
 * pay the identical fee later.
 */
function Gather({ quote }: { quote: GatherQuote }) {
  const total = quote.feeEach.amount * BigInt(quote.books);

  return (
    <div className="mt-4">
      <p className="mb-2 font-mono text-[10px] tracking-[0.2em] text-bone/35 uppercase">
        Gather
      </p>

      <p className="text-[12px] leading-relaxed text-bone/45">
        {quote.books} of these are holding something. Each address is its own
        book and one transaction can only spend from one of them, so bringing
        them together takes {quote.books}.
      </p>

      <div className="mt-3 flex items-baseline justify-between bg-white/[0.04] px-3 py-2.5">
        <span className="font-mono text-[10px] tracking-[0.18em] text-bone/35 uppercase">
          Fee
        </span>
        <span className="font-mono text-[12px] tabular-nums text-bone/80">
          ~{formatAmount(total, quote.feeEach.decimals)} {quote.feeEach.symbol}
          <span className="text-bone/30">
            {" "}
            · {formatAmount(quote.feeEach.amount, quote.feeEach.decimals)} each
          </span>
        </span>
      </div>

      {/*
        Counted per transaction rather than per token, because the fee is priced
        off gas and does not move with the amount. Somebody holding two dust
        payments pays what somebody holding two large ones pays.
      */}
      <p className="mt-1.5 text-[11px] leading-snug text-bone/35">
        Charged per transaction, not as a share of the amount.
      </p>

      <button
        type="button"
        className="mt-3.5 h-10 w-full bg-white/[0.05] font-mono text-[11px] tracking-[0.16em] text-bone/70 uppercase transition-colors hover:bg-white/[0.09] hover:text-mark"
      >
        Gather into one balance
      </button>
    </div>
  );
}
