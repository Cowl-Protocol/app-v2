"use client";

import { useMemo, useState } from "react";
import { Overlay } from "@/components/ui/overlay";
import { TokenSelect, TokenTrigger } from "@/components/ui/token-select";
import { formatAmount, toBaseUnits } from "@/lib/format";
import { decodeRequest, type RequestPayload } from "@/lib/request-link";
import { cn } from "@/lib/utils";
import { BOOK, IS_PLACEHOLDER, PRICES } from "../lib/placeholder";
import type { SpendableToken } from "../types";
import { pickerRows } from "../lib/picker-rows";

/**
 * Send, and its second door, Pay. **Layout only, wired to nothing.**
 *
 * One overlay for both verbs, because underneath they are one machine: a
 * payment link is a send whose destination and amount arrived pre filled and
 * locked. The verb row opens this in `send` mode with an empty destination, or
 * in `pay` mode where the field asks for the link first. Whatever mode it
 * opened in, pasting a link locks the form and pasting an address does not.
 *
 * **The destination decides what this is**, and the copy under the field is
 * where that lands:
 *
 * - `zcowl1…` · a private send. Stays inside, arrives in their private balance.
 * - plain `0x` · the withdrawal. There is deliberately no Withdraw button on
 *   the verb row; this moment, with the address in hand, is where the
 *   difference is true and checkable, so this is where it is said: the arrival
 *   is public.
 * - a payment link · the locked form, button says Pay.
 *
 * **The two note ceiling surfaces here, in words, when it bites.** A spend
 * reads two notes and writes two, so one send moves at most the sum of the two
 * largest notes, and the fee comes out of the same notes. The refusal names
 * the amount that CAN go and promises the rest follows, without the word note
 * appearing anywhere a user reads.
 *
 * The in flight states exist and are reachable only through the `stage` prop,
 * same contract as the payer screen: nothing here can prove or submit yet, and
 * a state nobody can render is a state that gets designed wrong.
 */

export type SendStage = "compose" | "proving" | "sent" | "failed";

type Dest =
  | { kind: "empty" }
  | { kind: "private"; address: string }
  | { kind: "public"; address: string }
  | { kind: "request"; payload: RequestPayload }
  | { kind: "wrongChain"; payload: RequestPayload }
  | { kind: "unknown" };

/**
 * Shape checks only. Real validation — checksum, bech32m, chain registry — is
 * the wired client's job; this layer only has to route the copy underneath the
 * field, and guessing harder than the shape would mean re implementing the
 * decoders it will be handed.
 */
function classify(raw: string, chainId: number): Dest {
  const s = raw.trim();
  if (!s) return { kind: "empty" };
  if (s.includes("#")) {
    const payload = decodeRequest(s.slice(s.indexOf("#")));
    if (payload) {
      return payload.chain === chainId
        ? { kind: "request", payload }
        : { kind: "wrongChain", payload };
    }
    return { kind: "unknown" };
  }
  if (/^zcowl1[a-z0-9]{20,}$/.test(s)) return { kind: "private", address: s };
  if (/^0x[0-9a-fA-F]{40}$/.test(s)) return { kind: "public", address: s };
  return { kind: "unknown" };
}

export function SendOverlay({
  mode,
  chainId,
  onClose,
  stage = "compose",
}: {
  /** Same machine, two doors: `pay` retitles the overlay and the empty field. */
  mode: "send" | "pay";
  chainId: number;
  onClose: () => void;
  /** In flight states, reachable only from here until wiring exists. */
  stage?: SendStage;
}) {
  const [rawDest, setRawDest] = useState("");
  const [token, setToken] = useState<SpendableToken>(BOOK[0]!);
  const [typed, setTyped] = useState("");
  const [picking, setPicking] = useState(false);

  const dest = useMemo(() => classify(rawDest, chainId), [rawDest, chainId]);

  /** The request's own token, when a link is driving the form. */
  const reqToken = useMemo(() => {
    if (dest.kind !== "request") return null;
    return BOOK.find((t) => t.symbol === dest.payload.token) ?? null;
  }, [dest]);

  const active = dest.kind === "request" ? reqToken : token;

  /**
   * What this send would move, fee included, against what one send can move.
   * The fee comes out of the same notes as the amount — the airdrop measured
   * this the hard way: sending 100,000 needs ~106,400 in reach — so every
   * comparison below is `amount + fee`, never the amount alone.
   */
  const amount = useMemo(() => {
    if (dest.kind === "request") {
      if (!reqToken) return null;
      const base = toBaseUnits(dest.payload.amount, reqToken.decimals);
      return base > 0n ? base : null;
    }
    if (!/^\d*\.?\d*$/.test(typed) || typed === "" || typed === ".") return null;
    const base = toBaseUnits(typed, token.decimals);
    return base > 0n ? base : null;
  }, [dest, reqToken, typed, token]);

  const overBalance = active && amount !== null && amount + active.fee > active.balance;
  const overCeiling =
    active && amount !== null && !overBalance && amount + active.fee > active.ceiling;

  const sendable =
    stage === "compose" &&
    amount !== null &&
    !overBalance &&
    !overCeiling &&
    (dest.kind === "private" || dest.kind === "public" || (dest.kind === "request" && !!reqToken));

  const title = mode === "pay" ? "Pay" : "Send";
  const button =
    dest.kind === "request" ? "Pay" : dest.kind === "public" ? "Withdraw" : "Send";

  if (stage !== "compose") {
    return (
      <Overlay title={title} onClose={onClose}>
        <FlightView stage={stage} />
      </Overlay>
    );
  }

  return (
    <Overlay title={title} onClose={onClose}>
      {IS_PLACEHOLDER && (
        <p className="mb-3 bg-white/[0.05] px-3 py-2 font-mono text-[10px] tracking-[0.14em] text-bone/50 uppercase">
          Sample · sends nothing
        </p>
      )}

      <Legend>To</Legend>
      {dest.kind === "request" || dest.kind === "wrongChain" ? (
        <LockedRequest payload={dest.payload} onClear={() => setRawDest("")} />
      ) : (
        <textarea
          value={rawDest}
          onChange={(e) => setRawDest(e.target.value)}
          rows={2}
          spellCheck={false}
          placeholder={
            mode === "pay" ? "Paste a payment link" : "zcowl1… · 0x… · or a payment link"
          }
          aria-label="Destination"
          className="w-full resize-none bg-ink2 px-3 py-2.5 font-mono text-[11.5px] leading-relaxed break-all text-bone outline-none placeholder:text-bone/20"
        />
      )}
      <DestNote dest={dest} />

      {dest.kind !== "request" && dest.kind !== "wrongChain" && (
        <>
          {/*
            The dapp's composition: the token lives inside the amount row as a
            small trigger, and picking one is a modal of its own. A grid of
            four chips sat here first and lost twice over — it spent a whole
            section on a choice most sends never change, and it hard-wired the
            token count into the layout when the wired book is dynamic.
          */}
          <div className="mt-4 mb-1.5 flex items-baseline justify-between">
            <Legend className="mb-0">Amount</Legend>
            <span className="font-mono text-[10px] tracking-[0.08em] text-bone/35">
              Holding {formatAmount(token.balance, token.decimals)} {token.symbol}
            </span>
          </div>
          <div className="flex items-center gap-2 bg-ink2 pr-1.5">
            <input
              value={typed}
              onChange={(e) => setTyped(e.target.value)}
              inputMode="decimal"
              placeholder="0"
              aria-label={`Amount in ${token.symbol}`}
              className="min-w-0 flex-1 bg-transparent px-3 py-3 font-mono text-[16px] tabular-nums text-bone outline-none placeholder:text-bone/20"
            />
            <button
              type="button"
              onClick={() => {
                /*
                  Max is the most one send can actually deliver: the tighter of
                  the ceiling and the balance, minus the fee that rides in the
                  same transaction. Filling the raw balance in here would
                  compose a send the two lines below immediately refuse.
                */
                const cap = token.ceiling < token.balance ? token.ceiling : token.balance;
                const max = cap - token.fee;
                setTyped(max > 0n ? formatAmount(max, token.decimals).replace(/,/g, "") : "0");
              }}
              className="shrink-0 px-1 font-mono text-[10px] tracking-[0.16em] text-bone/45 uppercase transition-colors hover:text-mark"
            >
              Max
            </button>
            <TokenTrigger
              symbol={token.symbol}
              logoURI={token.logoURI}
              onClick={() => setPicking(true)}
            />
          </div>
        </>
      )}

      {picking && (
        <TokenSelect
          title="Send"
          tokens={pickerRows(BOOK, PRICES)}
          selected={token.symbol}
          onSelect={(symbol) => {
            const next = BOOK.find((t) => t.symbol === symbol);
            if (next) {
              setToken(next);
              // A different token is a different amount question.
              setTyped("");
            }
          }}
          onClose={() => setPicking(false)}
        />
      )}

      <AmountNote token={active} amount={amount} overBalance={!!overBalance} overCeiling={!!overCeiling} />

      <button
        type="button"
        disabled={!sendable}
        /*
          Present and enabled so the flow reads whole, but there is nothing to
          submit to: no key, no proof, no relayer. Wiring replaces this with the
          real pipeline and the `stage` prop above stops being the only way to
          see the states it drives.
        */
        onClick={() => undefined}
        className="mt-5 h-11 w-full bg-primary font-mono text-[11px] tracking-[0.16em] text-on-primary uppercase transition-colors hover:bg-primary-hi disabled:cursor-not-allowed disabled:bg-white/[0.06] disabled:text-bone/25"
      >
        {button}
      </button>
    </Overlay>
  );
}

/** The words under the destination, which are the point of the field. */
function DestNote({ dest }: { dest: Dest }) {
  if (dest.kind === "private") {
    return <Note>Arrives in their private balance.</Note>;
  }
  if (dest.kind === "public") {
    return (
      <Note>
        A plain address is public · the arrival will be visible on chain.
      </Note>
    );
  }
  if (dest.kind === "wrongChain") {
    return (
      <Note tone="warn">
        This link names a different network. Paying it from here would use the
        wrong one, so it is refused.
      </Note>
    );
  }
  if (dest.kind === "unknown") {
    return (
      <Note tone="warn">
        Not an address or a payment link this app recognises.
      </Note>
    );
  }
  return null;
}

/**
 * The fee, then the two refusals, in the order they should interrupt: more
 * than you hold beats the ceiling, because "send less" is the answer to both
 * and the balance is the harder wall.
 */
function AmountNote({
  token,
  amount,
  overBalance,
  overCeiling,
}: {
  token: SpendableToken | null;
  amount: bigint | null;
  overBalance: boolean;
  overCeiling: boolean;
}) {
  if (!token) return null;

  if (overBalance) {
    return <Note tone="warn">That is more than you hold.</Note>;
  }

  if (overCeiling) {
    const most = token.ceiling - token.fee;
    return (
      <Note tone="warn">
        Up to{" "}
        <span className="font-mono tabular-nums text-bone/80">
          {formatAmount(most > 0n ? most : 0n, token.decimals)} {token.symbol}
        </span>{" "}
        can leave in one send right now. Send that first · more frees up as it
        settles.
      </Note>
    );
  }

  if (amount !== null) {
    return (
      <Note>
        Fee ·{" "}
        <span className="font-mono tabular-nums text-bone/60">
          {formatAmount(token.fee, token.decimals)} {token.symbol}
        </span>{" "}
        · taken from what you send. No gas needed.
      </Note>
    );
  }

  return null;
}

/**
 * A locked request. The form stops being a form: the link chose the
 * destination, the token and the amount, and re opening any of them here would
 * let a payer "correct" an invoice. Clear is the whole escape hatch.
 */
function LockedRequest({
  payload,
  onClear,
}: {
  payload: RequestPayload;
  onClear: () => void;
}) {
  return (
    <div className="bg-white/[0.04] px-3 py-2.5">
      <div className="flex items-baseline justify-between gap-3">
        <p className="font-mono text-[15px] tabular-nums text-bone">
          {payload.amount} {payload.token}
        </p>
        <button
          type="button"
          onClick={onClear}
          className="font-mono text-[10px] tracking-[0.2em] text-bone/45 uppercase transition-colors hover:text-mark"
        >
          Clear
        </button>
      </div>
      {payload.label && (
        <p className="mt-0.5 text-[12px] text-bone/45">{payload.label}</p>
      )}
      <p className="mt-1.5 font-mono text-[10px] leading-[1.6] break-all text-bone/40">
        {payload.to}
      </p>
    </div>
  );
}

/**
 * The in flight states. The proof is built where the secret is, so the wait is
 * on this device and the copy says so; the failure promises what is true from
 * the protocol's own shape — nothing partial can happen — and never surfaces
 * an internal assertion, the same rule the payer screen records.
 */
function FlightView({ stage }: { stage: Exclude<SendStage, "compose"> }) {
  if (stage === "proving") {
    return (
      <div className="py-8 text-center">
        <span aria-hidden className="mx-auto block size-[7px] animate-pulse bg-mark" />
        <p className="mt-4 font-mono text-[12px] tracking-[0.12em] text-bone uppercase">
          Building the proof
        </p>
        <p className="mt-2 text-[12px] leading-relaxed text-bone/45">
          A few seconds, on this device. Nothing has left your balance yet.
        </p>
      </div>
    );
  }
  if (stage === "sent") {
    return (
      <div className="py-8 text-center">
        <span aria-hidden className="mx-auto block size-[7px] bg-mark" />
        <p className="mt-4 font-mono text-[12px] tracking-[0.12em] text-bone uppercase">
          Sent
        </p>
        <p className="mt-2 text-[12px] leading-relaxed text-bone/45">
          It settles in under a minute. The balance updates itself.
        </p>
      </div>
    );
  }
  return (
    <div className="py-8 text-center">
      <span aria-hidden className="mx-auto block size-[7px] bg-bone/40" />
      <p className="mt-4 font-mono text-[12px] tracking-[0.12em] text-bone uppercase">
        That did not go through
      </p>
      <p className="mt-2 text-[12px] leading-relaxed text-bone/45">
        Nothing left your balance. Try it again in a moment.
      </p>
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
