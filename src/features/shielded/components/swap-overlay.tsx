"use client";

import { useMemo, useState } from "react";
import { Overlay } from "@/components/ui/overlay";
import { TokenSelect, TokenTrigger } from "@/components/ui/token-select";
import { formatAmount } from "@/lib/format";
import { cn } from "@/lib/utils";
import { tokensFor } from "@/config";
import { useNetwork } from "@/lib/network";
import { tokenField, usePrices } from "@/lib/price";
import type { SpendableToken } from "../types";
import { pickerRows } from "../lib/picker-rows";
import { useRelayerFee } from "../lib/relayer-fee";
import { toSpendable } from "../lib/spendable";
import { useSwapRate } from "../lib/use-swap-rate";
import { useShieldedBook } from "../lib/use-book";

/**
 * Swap.
 *
 * **The book, the rate and the fee are real; the submit is not.** Balances come
 * out of the pool, the rate is the venue's own quoter asked about this exact
 * pair, and the fee is the relayer's trade-sized quote rather than a send's
 * doubled. What no part of this app can do yet is build the proof the trade
 * needs, so the button composes and submits nowhere.
 *
 * The shipped design from the dapp, restated for this client: **both sides are
 * typeable and whichever was typed last anchors.** The protocol underneath is
 * always exact output; a pay side anchor is UI sugar whose quote becomes the
 * exact output when wired. The number moving the other field is spot for one
 * whole unit, which is indicative rather than what a trade of this size would
 * settle at, and the line under the rows says so.
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
  const [payChosen, setPayChosen] = useState<bigint | null>(null);
  const [recvChosen, setRecvChosen] = useState<bigint | null>(null);
  const [payTyped, setPayTyped] = useState("");
  const [recvTyped, setRecvTyped] = useState("");
  const [anchor, setAnchor] = useState<"pay" | "recv">("pay");
  const [picking, setPicking] = useState<null | "pay" | "recv">(null);

  const network = useNetwork();
  const book = useShieldedBook();
  const prices = usePrices();

  /*
    **The pay side comes out of the book and the receive side out of the
    registry**, and the asymmetry is the trade itself: you can only sell what
    you hold, and you can buy anything this chain knows how to name. Offering
    only held tokens on the receive side would make the one swap nobody needs,
    more of what they already have, the only one on offer.
  */
  const held = useMemo(
    () => (book.state === "ready" ? toSpendable(book.holdings) : []),
    [book],
  );
  const buyable = useMemo(
    () =>
      tokensFor(network).map((t) => ({
        token: tokenField(t),
        symbol: t.symbol,
        name: t.name,
        decimals: t.decimals,
        logoURI: t.logoURI,
      })),
    [network],
  );

  const payToken = held.find((t) => t.token === payChosen) ?? held[0] ?? null;
  const recvToken =
    buyable.find((t) => t.token === recvChosen) ??
    buyable.find((t) => t.token !== payToken?.token) ??
    null;

  const rate = useSwapRate(payToken, recvToken);

  /*
    A trade is two proof verifications and a swap, so the relayer prices it
    differently from a send. `2 × the send fee` was the placeholder's arithmetic
    and the relayer has always known the real answer.
  */
  const quote = useRelayerFee(payToken?.token ?? null, "trade");
  const fee = quote.state === "quoted" ? quote.fee : null;

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
  const decimals = payToken?.decimals ?? 18;
  const whole = (v: bigint) => Number(formatAmount(v, decimals).replace(/,/g, ""));

  const payWhole = payToken ? whole(payToken.balance) : 0;
  const ceilWhole = payToken ? whole(payToken.ceiling) : 0;
  const feeWhole = fee === null ? null : whole(fee);

  const overBalance =
    payAmount !== null && feeWhole !== null && payAmount + feeWhole > payWhole;
  const overCeiling =
    payAmount !== null && feeWhole !== null && !overBalance && payAmount + feeWhole > ceilWhole;
  const steep =
    payAmount !== null && feeWhole !== null && payAmount > 0 && feeWhole / payAmount >= STEEP_SHARE;
  const twoLeg =
    !!payToken && !!recvToken && payToken.symbol !== "ETH" && recvToken.symbol !== "ETH";

  /*
    Only one direction can be turned around: the pay side has to be something
    this book actually holds, and the receive side is free to be anything the
    chain names. Flipping into a token nobody holds would compose a sale of
    money that is not there, so the control is shut when that is what it would
    do.
  */
  const flippable = !!recvToken && held.some((t) => t.token === recvToken.token);

  function flip() {
    if (!flippable || !payToken || !recvToken) return;
    setPayChosen(recvToken.token);
    setRecvChosen(payToken.token);
    setPayTyped(recvTyped);
    setRecvTyped(payTyped);
  }

  return (
    <Overlay title="Swap" onClose={onClose}>
      {/*
        Nothing held, so nothing to sell. Said before the rows rather than under
        them, and the two reasons are kept apart: a scan still running is not an
        account with nothing in it.
      */}
      {!payToken && (
        <p className="mb-3 bg-white/[0.05] px-3 py-2 text-[11.5px] leading-snug text-bone/50">
          {book.state === "ready"
            ? "Nothing in your balance to swap yet."
            : "Reading your balance from the chain."}
        </p>
      )}

      {payToken && (
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
      )}

      <div className="my-3 flex justify-center">
        <button
          type="button"
          aria-label="Swap sides"
          onClick={flip}
          disabled={!flippable}
          className="flex size-8 items-center justify-center bg-white/[0.05] text-bone/45 transition-colors hover:bg-white/[0.09] hover:text-mark disabled:text-bone/15 disabled:hover:bg-white/[0.05]"
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

      {recvToken && (
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
      )}

      {/*
        Spot for one whole unit, and it says so. What a trade of this size
        settles at depends on the pool's depth and on whether it routes through
        the wrapper, and neither is known until the trade is built.
      */}
      {rate !== null && payToken && recvToken && (
        <p className="mt-3 font-mono text-[11px] tracking-[0.04em] text-bone/45">
          1 {payToken.symbol} ≈ {trim(rate)} {recvToken.symbol}
          <span className="text-bone/25"> · indicative</span>
        </p>
      )}
      {rate === null && payToken && recvToken && (
        <Note tone="warn">
          The venue has no price for this pair right now, so neither side can be
          worked out from the other.
        </Note>
      )}

      {payToken && quote.state === "unavailable" && (
        <Note tone="warn">{quote.reason} Nothing can be swapped until it answers.</Note>
      )}
      {payToken && quote.state === "quoting" && (
        <Note>Asking the relayer what this costs.</Note>
      )}

      {overBalance && <Note tone="warn">That is more than you hold.</Note>}
      {overCeiling && payToken && fee !== null && (
        <Note tone="warn">
          Up to{" "}
          <span className="font-mono tabular-nums text-bone/80">
            {formatAmount(
              payToken.ceiling > fee ? payToken.ceiling - fee : 0n,
              payToken.decimals,
            )}{" "}
            {payToken.symbol}
          </span>{" "}
          can go in one swap right now. Swap that first · more frees up as it
          settles.
        </Note>
      )}
      {!overBalance && !overCeiling && payAmount !== null && payToken && fee !== null && (
        <Note>
          Fee ·{" "}
          <span className="font-mono tabular-nums text-bone/60">
            {formatAmount(fee, payToken.decimals)} {payToken.symbol}
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
        disabled={payAmount === null || fee === null || overBalance || overCeiling}
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

      {/*
        Two different lists behind one control. The pay side offers the book,
        with balances on the rows; the receive side offers what this chain can
        name, with none, because a balance beside a token being bought is a
        number about the wrong side of the trade.
      */}
      {picking && (
        <TokenSelect
          title={picking === "pay" ? "You pay" : "You receive"}
          tokens={
            picking === "pay"
              ? pickerRows(held, prices)
              : buyable.map((t) => ({ symbol: t.symbol, name: t.name, logoURI: t.logoURI }))
          }
          selected={picking === "pay" ? payToken?.symbol : recvToken?.symbol}
          exclude={picking === "pay" ? recvToken?.symbol : payToken?.symbol}
          onSelect={(symbol) => {
            if (picking === "pay") {
              const next = held.find((t) => t.symbol === symbol);
              if (next) setPayChosen(next.token);
            } else {
              const next = buyable.find((t) => t.symbol === symbol);
              if (next) setRecvChosen(next.token);
            }
          }}
          onClose={() => setPicking(null)}
        />
      )}
    </Overlay>
  );
}

/** Either side of the trade: what is being sold, or what is being bought. */
type SideToken = Pick<SpendableToken, "symbol" | "decimals" | "logoURI">;

function Side({
  legend,
  token,
  onPick,
  value,
  onType,
  holding,
}: {
  legend: string;
  token: SideToken;
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
