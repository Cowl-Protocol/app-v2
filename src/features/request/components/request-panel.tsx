"use client";

import { useMemo, useState } from "react";
import { Overlay } from "@/components/ui/overlay";
import { TokenSelect, TokenTrigger } from "@/components/ui/token-select";
import { formatAmount, toBaseUnits } from "@/lib/format";
import { isOnLadder, snapToLadder } from "@/lib/denominations";
import { requestLink, type RequestPayload } from "@/lib/request-link";
import { cn } from "@/lib/utils";
import type { ReceiveAddress, RequestToken } from "../types";
import { QrCode } from "./qr-code";

/**
 * Ask for a specific amount. **Layout only, wired to nothing.**
 *
 * A dialog and not a route, and its own surface rather than a mode of the
 * Receive panel. Receive hands out an address; this composes a request with an
 * amount, a token, a chain and a note, and burying a second job inside a panel
 * whose whole content is a single QR code would have made both of them harder
 * to read.
 *
 * **Creating a request spends an address.** Every request carries a fresh one,
 * so this is a two step dialog rather than a form that updates live: a link that
 * regenerated on every keystroke would burn an index per character typed. The
 * button is where the address is issued, which is why it says create rather than
 * something softer.
 *
 * **Nothing here is stored anywhere.** The whole request is the link, the link's
 * payload lives in the URL fragment, and a fragment is never sent in an HTTP
 * request. There is no request id, no row, and no record for anyone to hold or
 * to be asked for.
 */

export function RequestPanel({
  address,
  tokens,
  chainId,
  networkLabel,
  onClose,
}: {
  /**
   * The address this request is paid into: the session's own, always real.
   *
   * It used to be allowed to be a placeholder, with a "pays nobody" tag on the
   * finished link to say so. Nothing here can build a link to an address the
   * signed in account does not hold, so the tag and the state behind it are
   * gone.
   */
  address: ReceiveAddress;
  tokens: RequestToken[];
  /**
   * The chain, which is **not optional** in the payload.
   *
   * A `zcowl1…` is `<mpk><viewPub>` and carries no chain id, so a testnet
   * address and a mainnet address look identical. The link has to name the
   * chain or a testnet request is payable with real money and nothing would
   * say so.
   */
  chainId: number;
  networkLabel: string;
  onClose: () => void;
}) {
  const [token, setToken] = useState<RequestToken>(tokens[0]!);
  const [typed, setTyped] = useState("");
  const [label, setLabel] = useState("");
  const [picking, setPicking] = useState(false);
  const [created, setCreated] = useState<{ payload: RequestPayload; link: string } | null>(null);

  /**
   * What the request will actually ask for.
   *
   * Computed on every keystroke so the rounding is visible while it is still
   * being typed. Finding out that 137,428 became 100,000 *after* pressing the
   * button would read as the app having changed the invoice behind their back.
   */
  const snapped = useMemo(() => {
    if (!/^\d*\.?\d*$/.test(typed) || typed === "" || typed === ".") return null;
    const base = toBaseUnits(typed, token.decimals);
    if (base <= 0n) return null;
    return {
      base: snapToLadder(base, token.decimals),
      exact: isOnLadder(base, token.decimals),
    };
  }, [typed, token]);

  function create() {
    if (!snapped) return;
    const payload: RequestPayload = {
      v: 1,
      chain: chainId,
      to: address.address,
      token: token.symbol,
      // Whole tokens, because that is what the payload carries and what the
      // payer's screen will print. The base units were only ever an
      // intermediate for the rounding.
      amount: formatAmount(snapped.base, token.decimals).replace(/,/g, ""),
      label: label.trim() || undefined,
    };
    setCreated({ payload, link: requestLink(window.location.origin, payload) });
  }

  if (created) {
    return (
      <Overlay title="Request ready" onClose={onClose}>
        <CreatedView
          payload={created.payload}
          link={created.link}
          networkLabel={networkLabel}
          onAgain={() => {
            setCreated(null);
            setTyped("");
            setLabel("");
          }}
        />
      </Overlay>
    );
  }

  return (
    <Overlay title="New request" onClose={onClose}>
      {/*
        The token rides inside the amount row as the dapp's trigger, not as a
        section of chips. Same composition as Send and Swap, so the three
        forms read as one family, and the picker stops hard-wiring the token
        count into the layout.
      */}
      <Legend>Amount</Legend>
      <div className="flex items-center gap-2 bg-ink2 pr-1.5">
        <input
          value={typed}
          onChange={(e) => setTyped(e.target.value)}
          inputMode="decimal"
          placeholder="0"
          aria-label={`Amount in ${token.symbol}`}
          className="min-w-0 flex-1 bg-transparent px-3 py-3 font-mono text-[16px] tabular-nums text-bone outline-none placeholder:text-bone/20"
        />
        <TokenTrigger
          symbol={token.symbol}
          logoURI={token.logoURI}
          onClick={() => setPicking(true)}
        />
      </div>

      {picking && (
        <TokenSelect
          title="Request in"
          tokens={tokens.map((t) => ({ symbol: t.symbol, name: t.name, logoURI: t.logoURI }))}
          selected={token.symbol}
          onSelect={(symbol) => {
            const next = tokens.find((t) => t.symbol === symbol);
            if (next) setToken(next);
          }}
          onClose={() => setPicking(false)}
        />
      )}

      <LadderNote snapped={snapped} token={token} />

      <Legend className="mt-4">For</Legend>
      <input
        value={label}
        onChange={(e) => setLabel(e.target.value)}
        maxLength={80}
        placeholder="Invoice 0042"
        aria-label="What this request is for"
        className="w-full bg-ink2 px-3 py-2.5 text-[13px] text-bone outline-none placeholder:text-bone/20"
      />
      {/*
        The one thing about this field that a person can get wrong in a way that
        costs them something. There is no memo on chain and none is being added,
        so anything the recipient needed the *payment* to carry has to travel
        some other way. Said here rather than in a tooltip, because the mistake
        is made while typing.
      */}
      <p className="mt-1.5 text-[11px] leading-snug text-bone/35">
        Shown on the payer&apos;s screen only. Nothing on chain carries it.
      </p>

      <button
        type="button"
        disabled={!snapped}
        onClick={create}
        className="mt-5 h-11 w-full bg-primary font-mono text-[11px] tracking-[0.16em] text-on-primary uppercase transition-colors hover:bg-primary-hi disabled:cursor-not-allowed disabled:bg-white/[0.06] disabled:text-bone/25"
      >
        Create request
      </button>
    </Overlay>
  );
}

/**
 * The rounding, stated before it is applied.
 *
 * **This is the one place the client overrules the person using it**, so it
 * explains itself every time rather than once in a help page. The reason is not
 * housekeeping: the recipient picks the number and the *payer* is the one who
 * writes it onto the chain, where an unusual figure makes the payment that
 * lands identifiable even though its owner is not.
 */
function LadderNote({
  snapped,
  token,
}: {
  snapped: { base: bigint; exact: boolean } | null;
  token: RequestToken;
}) {
  if (!snapped) {
    return (
      <p className="mt-1.5 text-[11px] leading-snug text-bone/35">
        Requests use round amounts, so the payment that arrives looks like every
        other one of its size.
      </p>
    );
  }

  if (snapped.exact) {
    return (
      <p className="mt-1.5 font-mono text-[11px] tracking-[0.04em] text-mark/70">
        {formatAmount(snapped.base, token.decimals)} {token.symbol}
      </p>
    );
  }

  return (
    <p className="mt-1.5 text-[11px] leading-snug text-bone/45">
      Rounds to{" "}
      <span className="font-mono tabular-nums text-bone/80">
        {formatAmount(snapped.base, token.decimals)} {token.symbol}
      </span>
      . An odd figure would make the payment stand out on chain.
    </p>
  );
}

/** The finished request: the link, the code, and what the payer is going to see. */
function CreatedView({
  payload,
  link,
  networkLabel,
  onAgain,
}: {
  payload: RequestPayload;
  link: string;
  networkLabel: string;
  onAgain: () => void;
}) {
  const [copied, setCopied] = useState(false);

  async function copy() {
    try {
      await navigator.clipboard.writeText(link);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1600);
    } catch {
      // The link is on screen and selectable. A denied clipboard is not a dialog.
    }
  }

  return (
    <>
      <div className="flex justify-center">
        <QrCode text={link} className="w-full max-w-[200px]" />
      </div>

      <p className="mt-4 text-center font-mono text-[15px] tabular-nums text-bone">
        {payload.amount} {payload.token}
      </p>
      {payload.label && (
        <p className="mt-1 text-center text-[12px] text-bone/45">{payload.label}</p>
      )}
      {/*
        The chain is printed, not implied. It is the one fact the address itself
        cannot carry, and the difference between a rehearsal and real money.
      */}
      <p className="mt-2 text-center font-mono text-[10px] tracking-[0.18em] text-bone/35 uppercase">
        {networkLabel}
      </p>

      <div className="mt-4 flex items-center justify-between">
        <span className="font-mono text-[10px] tracking-[0.2em] text-bone/35 uppercase">
          Link
        </span>
        <button
          type="button"
          onClick={copy}
          className="font-mono text-[10px] tracking-[0.2em] text-bone/45 uppercase transition-colors hover:text-mark"
        >
          {copied ? "Copied" : "Copy"}
        </button>
      </div>
      <p className="mt-1.5 max-h-[76px] overflow-y-auto bg-white/[0.04] px-3 py-2.5 font-mono text-[10px] leading-[1.6] break-all text-bone/55 select-all">
        {link}
      </p>

      <p className="mt-2.5 text-[11px] leading-snug text-bone/35">
        The link is the whole request. Nothing was saved, and the part after the
        # never reaches a server.
      </p>

      <button
        type="button"
        onClick={onAgain}
        className="mt-4 h-10 w-full bg-white/[0.05] font-mono text-[11px] tracking-[0.16em] text-bone/70 uppercase transition-colors hover:bg-white/[0.09] hover:text-mark"
      >
        Another request
      </button>
    </>
  );
}

function Legend({ children, className }: { children: React.ReactNode; className?: string }) {
  return (
    <p
      className={cn(
        "mb-1.5 font-mono text-[10px] tracking-[0.2em] text-bone/35 uppercase",
        className,
      )}
    >
      {children}
    </p>
  );
}
