"use client";

import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { notchClip } from "@/components/ui/bevel";
import { TokenGlyph } from "@/components/ui/token-glyph";
import { cn } from "@/lib/utils";

/**
 * The token picker, ported from the dapp's `TokenModal` and cut to what a
 * layout needs: a search field, a scrollable list, one row per token with its
 * mark, its name and whatever the caller wants on the right. The dapp's
 * import-by-address and live chain list arrive with wiring; the shell they
 * arrive into is this.
 *
 * **This is a primitive and stays one.** It renders strings it was handed —
 * `detail` and `detailSub` are already-formatted text, never amounts — so it
 * knows nothing about balances, notes or books, which is what lets `request`
 * and `shielded` share it without either reaching into the other.
 *
 * **It stacks above an open dialog, and Escape is scoped to it.** The dapp's
 * picker floats over a page; here it floats over the Send or Swap overlay, and
 * both listen for Escape on the document. This one listens in the **capture
 * phase and stops the event**, so one press closes the picker and leaves the
 * dialog under it open — without that, Escape falls through and shuts both,
 * which reads as the whole flow collapsing.
 */

const CLIP = notchClip();

export type SelectableToken = {
  symbol: string;
  name?: string;
  logoURI?: string;
  /** Right-hand column, already formatted. A balance, a price, or nothing. */
  detail?: string;
  detailSub?: string;
};

export function TokenSelect({
  title = "Select a token",
  tokens,
  selected,
  /**
   * Hidden from the list entirely. A swap's receive side excludes the pay
   * token, which makes "both sides the same token" unrepresentable instead of
   * being a case to handle.
   */
  exclude,
  onSelect,
  onClose,
}: {
  title?: string;
  tokens: SelectableToken[];
  selected?: string;
  exclude?: string;
  onSelect: (symbol: string) => void;
  onClose: () => void;
}) {
  const [q, setQ] = useState("");

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") {
        e.stopPropagation();
        onClose();
      }
    }
    document.addEventListener("keydown", onKey, { capture: true });
    return () => document.removeEventListener("keydown", onKey, { capture: true });
  }, [onClose]);

  const needle = q.trim().toLowerCase();
  const list = tokens
    .filter((t) => t.symbol !== exclude)
    .filter(
      (t) =>
        !needle ||
        t.symbol.toLowerCase().includes(needle) ||
        (t.name ?? "").toLowerCase().includes(needle),
    );

  return createPortal(
    <div
      className="fixed inset-0 z-[60] flex items-start justify-center overflow-y-auto p-4 pt-[12vh]"
      role="dialog"
      aria-modal="true"
      aria-label={title}
    >
      <button
        type="button"
        aria-hidden
        tabIndex={-1}
        onClick={onClose}
        className="fixed inset-0 cursor-default bg-black/70"
      />

      <div className="relative w-full max-w-[360px] bg-white/[0.09] p-px" style={{ clipPath: CLIP }}>
        <div className="relative flex flex-col bg-card" style={{ clipPath: CLIP }}>
          <header className="flex items-center gap-3 px-4 pt-3.5 pb-3">
            <span aria-hidden className="size-[5px] shrink-0 bg-mark" />
            <h2 className="font-mono text-[10.5px] leading-none tracking-[0.2em] text-bone/55 uppercase">
              {title}
            </h2>
            <button
              type="button"
              onClick={onClose}
              className="ml-auto font-mono text-[10.5px] tracking-[0.2em] text-bone/40 uppercase transition-colors hover:text-bone"
            >
              Close
            </button>
          </header>

          <div className="px-4 pb-3">
            <input
              autoFocus
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder="Search name or symbol"
              aria-label="Search tokens"
              className="w-full bg-ink2 px-3 py-2.5 text-[13px] text-bone outline-none placeholder:text-bone/20"
            />
          </div>

          <div className="max-h-[46vh] overflow-y-auto pb-2">
            {list.map((t) => (
              <button
                key={t.symbol}
                type="button"
                onClick={() => {
                  onSelect(t.symbol);
                  onClose();
                }}
                className={cn(
                  "flex w-full items-center gap-3 px-4 py-2.5 text-left transition-colors",
                  t.symbol === selected ? "bg-white/[0.06]" : "hover:bg-white/[0.04]",
                )}
              >
                <TokenGlyph symbol={t.symbol} src={t.logoURI} />
                <span className="flex min-w-0 flex-1 flex-col">
                  <span className="font-mono text-[12px] tracking-[0.06em] text-bone">
                    {t.symbol}
                  </span>
                  {t.name && (
                    <span className="truncate text-[11px] text-bone/40">{t.name}</span>
                  )}
                </span>
                {(t.detail || t.detailSub) && (
                  <span className="flex shrink-0 flex-col items-end">
                    {t.detail && (
                      <span className="font-mono text-[12px] tabular-nums text-bone">
                        {t.detail}
                      </span>
                    )}
                    {t.detailSub && (
                      <span className="text-[10px] text-bone/35">{t.detailSub}</span>
                    )}
                  </span>
                )}
              </button>
            ))}

            {list.length === 0 && (
              <p className="px-4 py-5 text-[12px] text-bone/40">
                Nothing here matches that.
              </p>
            )}
          </div>
        </div>
      </div>
    </div>,
    document.body,
  );
}

/**
 * The button a form shows for its current token: mark, ticker, chevron. The
 * dapp puts this inside the amount row rather than spending a whole section on
 * a token grid, and that composition comes with it.
 */
export function TokenTrigger({
  symbol,
  logoURI,
  onClick,
  className,
}: {
  symbol: string;
  logoURI?: string;
  onClick: () => void;
  className?: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={`Change token · ${symbol}`}
      className={cn(
        "flex shrink-0 items-center gap-2 bg-white/[0.05] py-1.5 pr-2.5 pl-1.5 transition-colors hover:bg-white/[0.09]",
        className,
      )}
    >
      <TokenGlyph symbol={symbol} src={logoURI} className="size-6" />
      <span className="font-mono text-[11px] tracking-[0.1em] text-bone">{symbol}</span>
      <svg
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
        aria-hidden
        className="size-3 text-bone/40"
      >
        <path d="M6 9l6 6 6-6" />
      </svg>
    </button>
  );
}
