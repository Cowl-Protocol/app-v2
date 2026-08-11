"use client";

import { useMemo, useState } from "react";
import { Overlay } from "@/components/ui/overlay";
import { TokenSelect, TokenTrigger } from "@/components/ui/token-select";
import { formatAmount } from "@/lib/format";
import { cn } from "@/lib/utils";
import { BOOK, IS_PLACEHOLDER, PRICES } from "../lib/placeholder";
import type { SpendableToken } from "../types";
import { pickerRows } from "../lib/picker-rows";

/**
 * Swap. **Layout only, wired to nothing.**
 *
 * The shipped design from the dapp, restated for this client: **both sides are
 * typeable and whichever was typed last anchors.** The protocol underneath is
 * always exact output; a pay side anchor is UI sugar whose quote becomes the
 * exact output when wired. Here the "quote" is placeholder price arithmetic —
 * floats, display only — which is exactly as much as a layout needs to make
 * the two fields feel coupled.
 *
 * Each side carries the dapp's token trigger, and the picker it opens
 * **excludes the other side's token**, so "both sides the same token" is
 * unrepresentable rather than a case to handle. The ⇅ button between the rows
 * is the deliberate way to turn the trade around.
 *
 * Two lines say what the wired version will have to say:
 *
 * - **The route line** appears when neither side is ETH. There is no direct
 *   pool between two arbitrary tokens; it runs as two swaps through ETH, and a
 *   flow that takes two steps and settles twice should say so before it is
 *   asked to.
 * - **The fee share line** appears when the fee crosses a tenth of what is
 *   being paid. A swap fee is roughly twice a send fee, it is priced in the
 *   pay token, and on a small swap of an expensively relayed token it stops
 *   being a rounding error. Saying it out loud is the recorded behaviour of
 *   the dapp's own modal.
 */

const STEEP_SHARE = 0.1;

export function SwapOverlay({ onClose }: { onClose: () => void }) {
  const [payToken, setPayToken] = useState<SpendableToken>(BOOK[1]!);
  const [recvToken, setRecvToken] = useState<SpendableToken>(BOOK[0]!);
  const [payTyped, setPayTyped] = useState("");
  const [recvTyped, setRecvTyped] = useState("");
  const [anchor, setAnchor] = useState<"pay" | "recv">("pay");
  const [picking, setPicking] = useState<null | "pay" | "recv">(null);

  const rate = useMemo(() => {
    const a = PRICES[payToken.symbol];
    const b = PRICES[recvToken.symbol];
    return a && b ? a / b : null;
  }, [payToken, recvToken]);

  /** The side the person did not type, derived from the side they did. */
  const derived = useMemo(() => {
    if (!rate) return { pay: "", recv: "" };
    if (anchor === "pay") {
      const p = parseTyped(payTyped);
      return { pay: payTyped, recv: p === null ? "" : trim(p * rate) };
    }
    const r = parseTyped(recvTyped);
    return { pay: r === null ? "" : trim(r / rate), recv: recvTyped };
  }, [anchor, payTyped, recvTyped, rate]);

  const payAmount = parseTyped(derived.pay);

  /**
   * The pay side is a spend, so the send flow's arithmetic applies unchanged:
   * fee out of the same notes, ceiling before balance is checked the other way
   * around — the harder wall interrupts first.
   */
  const payWhole = Number(formatAmount(payToken.balance, payToken.decimals).replace(/,/g, ""));
  const ceilWhole = Number(formatAmount(payToken.ceiling, payToken.decimals).replace(/,/g, ""));
  const feeWhole = Number(formatAmount(2n * payToken.fee, payToken.decimals).replace(/,/g, ""));

  const overBalance = payAmount !== null && payAmount + feeWhole > payWhole;
  const overCeiling = payAmount !== null && !overBalance && payAmount + feeWhole > ceilWhole;
  const steep = payAmount !== null && payAmount > 0 && feeWhole / payAmount >= STEEP_SHARE;
  const twoLeg = payToken.symbol !== "ETH" && recvToken.symbol !== "ETH";

  function flip() {
    setPayToken(recvToken);
    setRecvToken(payToken);
    setPayTyped(recvTyped);
    setRecvTyped(payTyped);
  }

  return (
    <Overlay title="Swap" onClose={onClose}>
      {IS_PLACEHOLDER && (
        <p className="mb-3 bg-white/[0.05] px-3 py-2 font-mono text-[10px] tracking-[0.14em] text-bone/50 uppercase">
          Sample · placeholder rates · swaps nothing
        </p>
      )}

      <Side
        legend="You pay"
        token={payToken}
        onPick={() => setPicking("pay")}
        value={derived.pay}
        onType={(v) => {
          setPayTyped(v);
          setAnchor("pay");
        }}
        holding={`Holding ${formatAmount(payToken.balance, payToken.decimals)} ${payToken.symbol}`}
      />

      <div className="my-3 flex justify-center">
        <button
          type="button"
          aria-label="Swap sides"
          onClick={flip}
          className="flex size-8 items-center justify-center bg-white/[0.05] text-bone/45 transition-colors hover:bg-white/[0.09] hover:text-mark"
        >
          <svg
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.5"
            strokeLinecap="round"
            strokeLinejoin="round"
            aria-hidden
            className="size-[16px]"
          >
            <path d="M8 5v14" />
            <path d="M5 16l3 3 3-3" />
            <path d="M16 19V5" />
            <path d="M13 8l3-3 3 3" />
          </svg>
        </button>
      </div>

      <Side
        legend="You receive"
        token={recvToken}
        onPick={() => setPicking("recv")}
        value={derived.recv}
        onType={(v) => {
          setRecvTyped(v);
          setAnchor("recv");
        }}
      />

      {rate && (
        <p className="mt-3 font-mono text-[11px] tracking-[0.04em] text-bone/45">
          1 {payToken.symbol} ≈ {trim(rate)} {recvToken.symbol}
        </p>
      )}

      {overBalance && <Note tone="warn">That is more than you hold.</Note>}
      {overCeiling && (
        <Note tone="warn">
          Up to{" "}
          <span className="font-mono tabular-nums text-bone/80">
            {formatAmount(payToken.ceiling - 2n * payToken.fee, payToken.decimals)}{" "}
            {payToken.symbol}
          </span>{" "}
          can go in one swap right now. Swap that first · more frees up as it
          settles.
        </Note>
      )}
      {!overBalance && !overCeiling && payAmount !== null && (
        <Note>
          Fee ·{" "}
          <span className="font-mono tabular-nums text-bone/60">
            {formatAmount(2n * payToken.fee, payToken.decimals)} {payToken.symbol}
          </span>{" "}
          · taken from the swap. No gas needed.
        </Note>
      )}
      {steep && !overBalance && !overCeiling && (
        <Note tone="warn">The fee is a large share of a swap this size.</Note>
      )}
      {twoLeg && (
        <Note>Routes through ETH · two steps, one balance at the end.</Note>
      )}

      <button
        type="button"
        disabled={payAmount === null || overBalance || overCeiling}
        /*
          Present so the flow reads whole; there is no quoter, no proof and no
          adapter behind it yet. Wiring replaces this with the executor and its
          own in flight states.
        */
        onClick={() => undefined}
        className="mt-5 h-11 w-full bg-primary font-mono text-[11px] tracking-[0.16em] text-on-primary uppercase transition-colors hover:bg-primary-hi disabled:cursor-not-allowed disabled:bg-white/[0.06] disabled:text-bone/25"
      >
        Swap
      </button>

      {picking && (
        <TokenSelect
          title={picking === "pay" ? "You pay" : "You receive"}
          tokens={pickerRows(BOOK, PRICES)}
          selected={picking === "pay" ? payToken.symbol : recvToken.symbol}
          exclude={picking === "pay" ? recvToken.symbol : payToken.symbol}
          onSelect={(symbol) => {
            const next = BOOK.find((t) => t.symbol === symbol);
            if (!next) return;
            if (picking === "pay") setPayToken(next);
            else setRecvToken(next);
          }}
          onClose={() => setPicking(null)}
        />
      )}
    </Overlay>
  );
}

function Side({
  legend,
  token,
  onPick,
  value,
  onType,
  holding,
}: {
  legend: string;
  token: SpendableToken;
  onPick: () => void;
  value: string;
  onType: (v: string) => void;
  holding?: string;
}) {
  return (
    <div>
      <div className="mb-1.5 flex items-baseline justify-between">
        <p className="font-mono text-[10px] tracking-[0.2em] text-bone/35 uppercase">
          {legend}
        </p>
        {holding && (
          <span className="font-mono text-[10px] tracking-[0.08em] text-bone/35">
            {holding}
          </span>
        )}
      </div>

      <div className="flex items-center gap-2 bg-ink2 pr-1.5">
        <input
          value={value}
          onChange={(e) => onType(e.target.value)}
          inputMode="decimal"
          placeholder="0"
          aria-label={`${legend} amount in ${token.symbol}`}
          className="min-w-0 flex-1 bg-transparent px-3 py-3 font-mono text-[16px] tabular-nums text-bone outline-none placeholder:text-bone/20"
        />
        <TokenTrigger symbol={token.symbol} logoURI={token.logoURI} onClick={onPick} />
      </div>
    </div>
  );
}

function Note({
  children,
  tone = "quiet",
}: {
  children: React.ReactNode;
  tone?: "quiet" | "warn";
}) {
  return (
    <p
      className={cn(
        "mt-1.5 text-[11px] leading-snug",
        tone === "warn" ? "text-bone/60" : "text-bone/35",
      )}
    >
      {children}
    </p>
  );
}

/** Digits and at most one point, or null. Floats are fine here: display only. */
function parseTyped(s: string): number | null {
  if (!/^\d*\.?\d*$/.test(s) || s === "" || s === ".") return null;
  const n = Number(s);
  return Number.isFinite(n) && n > 0 ? n : null;
}

/** Enough places to be useful, no trailing zeros, never scientific notation. */
function trim(n: number): string {
  if (n >= 1000) return n.toLocaleString("en-US", { maximumFractionDigits: 2 });
  const places = n >= 1 ? 4 : 8;
  return n.toFixed(places).replace(/\.?0+$/, "");
}
