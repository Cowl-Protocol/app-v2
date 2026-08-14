"use client";

import { useEffect, useRef, useState } from "react";
import { useNetworkChoice } from "@/lib/network";
import { cn } from "@/lib/utils";

/**
 * The chain this session is reading, and the control that changes it.
 *
 * The bar used to carry a network chip, it came out, and this is it coming back
 * wired. The reason it is worth its place is the one the old chip had: nothing
 * else on this screen distinguishes a testnet balance from real money, and an
 * empty pool and a rich one look identical when both render as zero.
 *
 * **Live is lit and a rehearsal is not**, which is the asymmetry the app bar's
 * own note asked for, read from the other end. The live chain gets the mark's
 * green; the test chain gets a dim dot, because a chip that shouts on testnet
 * would be shouting on the chain where nothing can go wrong.
 *
 * **It says the chain, not the chain's whole name.** `short` off the network
 * table, so the row stays a row: the labels in `config/networks.ts` run to three
 * words and this sits beside an account name on a bar that also has to survive a
 * phone.
 *
 * A menu rather than a native `<select>`. The house style has no borders and no
 * focus rings, and a native control brings the platform's own, which cannot be
 * removed on every browser and reads as a form field dropped into an instrument
 * panel.
 */
export function NetworkSelect() {
  const { network, networks, select } = useNetworkChoice();
  const [open, setOpen] = useState(false);
  const root = useRef<HTMLDivElement>(null);

  /*
    Escape and an outside click both close it, and both listen only while it is
    open. A menu that installs document listeners for its whole life is a menu
    that answers events meant for the dialogs this app stacks on top of it.
  */
  useEffect(() => {
    if (!open) return;

    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") setOpen(false);
    }
    function onDown(e: MouseEvent) {
      if (!root.current?.contains(e.target as Node)) setOpen(false);
    }

    document.addEventListener("keydown", onKey);
    document.addEventListener("mousedown", onDown);
    return () => {
      document.removeEventListener("keydown", onKey);
      document.removeEventListener("mousedown", onDown);
    };
  }, [open]);

  return (
    <div ref={root} className="relative">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-haspopup="menu"
        aria-expanded={open}
        aria-label={`Network · ${network.label}`}
        className="flex h-9 items-center gap-2 bg-white/[0.04] px-2.5 transition-colors hover:bg-white/[0.08]"
      >
        <Dot testnet={network.testnet} />
        <span className="font-mono text-[11px] tracking-[0.08em] text-bone/75">
          {network.short}
        </span>
        <svg
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.6"
          strokeLinecap="round"
          strokeLinejoin="round"
          aria-hidden
          className="size-3 shrink-0 text-bone/40"
        >
          <path d="M6 9.5 12 15.5 18 9.5" />
        </svg>
      </button>

      {open && (
        /*
          Anchored to this control rather than portalled to the body. It opens
          under the chip and closes on the next click, so there is nothing for it
          to be clipped by and nothing above it to stack against, which is what
          a portal would be buying.
        */
        <div
          role="menu"
          aria-label="Network"
          className="absolute top-full right-0 z-50 mt-1 min-w-[184px] bg-white/[0.09] p-px"
        >
          <div className="flex flex-col bg-card py-1">
            {networks.map((n) => (
              <button
                key={n.key}
                type="button"
                role="menuitemradio"
                aria-checked={n.key === network.key}
                onClick={() => {
                  select(n.key);
                  setOpen(false);
                }}
                className={cn(
                  "flex items-center gap-2.5 px-3 py-2 text-left transition-colors",
                  n.key === network.key ? "bg-white/[0.06]" : "hover:bg-white/[0.04]",
                )}
              >
                <Dot testnet={n.testnet} />
                <span className="flex min-w-0 flex-1 flex-col">
                  <span className="font-mono text-[11px] tracking-[0.08em] text-bone">
                    {n.short}
                  </span>
                  <span className="truncate text-[10.5px] text-bone/40">{n.label}</span>
                </span>
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

/**
 * The mark's green when the chain is live, dim bone when it is a rehearsal.
 *
 * **No second accent.** `cowl/STYLE.md` gives this world one, and a warning
 * colour invented for a network chip would be a palette decision made in a
 * component. Lit against unlit carries it, and the same green already means
 * "this panel is live" everywhere else on the screen.
 *
 * Colour never carries it alone. The label beside the dot says which chain in
 * words, so somebody who cannot separate the two dots reads "Testnet" and loses
 * nothing.
 */
function Dot({ testnet }: { testnet: boolean }) {
  return (
    <span
      aria-hidden
      className={cn("size-[5px] shrink-0", testnet ? "bg-bone/30" : "bg-mark")}
    />
  );
}
