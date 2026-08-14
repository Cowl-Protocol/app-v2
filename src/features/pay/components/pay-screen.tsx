"use client";

import { Eyes } from "@/components/brand/eyes";
import { Panel } from "@/components/ui/panel";
import { formatAmount } from "@/lib/format";
import { cn } from "@/lib/utils";
import type { PayRefusal, PayStage, ResolvedRequest } from "../types";

/**
 * The payer's screen. One surface, no session. **Layout only, wired to nothing.**
 *
 * **The payer is a stranger, and the whole design follows from that.** They want
 * to settle something, not to acquire a shielded balance. So there is no login,
 * no preloader, no wallet connect ritual before anything is legible, and no
 * account is created by arriving here. The request is on screen first and the
 * only decision is whether to pay it. `COWL-PAY.md` is explicit that this must
 * not be filed as an advanced feature: being paid is simpler than depositing,
 * and the implementation is the hard part rather than the use.
 *
 * **This screen never claims the payment is private.** The payer is fully
 * visible · address, token, amount and time all sit in plain view and anyone can
 * confirm it in one look at an explorer. Saying otherwise invites a rebuttal
 * that costs more than the phrase is worth, and this is the one screen where the
 * person being told is also the person who can check. What is true and loses
 * nothing: the recipient never showed an address to get paid.
 *
 * Reading it as a pitch is a side effect and a welcome one. The stranger paying
 * an invoice is the best qualified visitor this product ever gets, and the
 * honest sentence is also the interesting one.
 */

export function PayScreen({
  request,
  stage = { kind: "ready" },
}: {
  request: ResolvedRequest;
  stage?: PayStage;
  /**
   * Nothing behind this request is real.
   *
   * `/pay` is a real address somebody can type, so it has to render something
   * when it is reached without a link. A request screen that looks live and is
   * not is worse than an empty one, and this screen carries a Pay button.
   */
}) {
  const { payload, network, amount, decimals, dust } = request;

  return (
    <Frame>
      <Panel
        label="Payment request"
        tone="mark"
      >
        <p className="pt-2 text-center font-mono text-[34px] leading-none tabular-nums text-bone">
          {formatAmount(amount, decimals)}
        </p>
        <p className="mt-2 text-center font-mono text-[12px] tracking-[0.22em] text-bone/45 uppercase">
          {payload.token}
        </p>
        {payload.label && (
          <p className="mt-3 text-center text-[13px] leading-snug text-bone/60">
            {payload.label}
          </p>
        )}

        {dust && (
          <p className="mt-3 bg-white/[0.05] px-3 py-2 text-[11px] leading-snug text-bone/50">
            Below the smallest standard amount. It will still arrive.
          </p>
        )}

        <Legend className="mt-5">To</Legend>
        {/*
          Printed in full and never truncated. This is the string the payment
          cannot be taken back from: a note addressed to an `mpk` nobody holds is
          unrecoverable by anyone, including us. A middle ellipsis would hide
          exactly the characters an altered address differs in, on the one screen
          where somebody still has the chance to compare it against what they
          were sent.
        */}
        <p className="bg-white/[0.04] px-3 py-2.5 font-mono text-[10.5px] leading-[1.55] break-all text-bone/60 select-all">
          {payload.to}
        </p>

        <Legend className="mt-4">Network</Legend>
        <p className="font-mono text-[12px] text-bone/70">{network.label}</p>

        {/*
          **The test chain warning, which is the reason the link carries a chain
          at all.** A `zcowl1…` is `<mpk><viewPub>` and nothing else, so a testnet
          address and a mainnet one are indistinguishable by inspection. It
          appears only on a test chain, deliberately: a permanent network chip
          becomes furniture and stops being read, and the mistake worth
          preventing runs in exactly one direction.
        */}
        {network.testnet && (
          <p className="mt-2 bg-mark/[0.08] px-3 py-2 text-[11px] leading-snug text-bone/70">
            Test network. Nothing paid here is worth anything.
          </p>
        )}

        <Disclosure />
        <Action stage={stage} explorer={network.explorer} />
      </Panel>
    </Frame>
  );
}

/**
 * What the chain writes down, said before the payment rather than after.
 *
 * One row of the record changes compared with an ordinary transfer, and it
 * happens to be the row every correlation heuristic starts from. Stating both
 * halves is what makes the claim checkable, which is the only kind of privacy
 * claim worth making on a screen the reader can verify from.
 */
function Disclosure() {
  return (
    <div className="mt-5 border-t border-white/[0.06] pt-3.5">
      <p className="font-mono text-[10px] tracking-[0.2em] text-bone/35 uppercase">
        What the chain records
      </p>
      <p className="mt-1.5 text-[11.5px] leading-relaxed text-bone/45">
        Your wallet, the token, the amount and the time, the same as any
        transfer. Not the person you are paying. They never showed you an
        address to be paid at.
      </p>
    </div>
  );
}

/**
 * The button, and everything that replaces it once it has been pressed.
 *
 * **`retrying` is not an error and is not styled as one.** A shield proof binds
 * the tree's current root and the index it inserts at, so a deposit landing
 * during the seconds it takes to prove invalidates it and the transaction would
 * revert. On a public pay page that is ordinary rather than exceptional, and the
 * client's answer is to fetch the tip and prove again. What must never appear
 * here is the circuit's own words · "insertion path does not match the current
 * tree" reads to a stranger as a broken site, at the exact moment they are
 * deciding whether to trust one.
 *
 * Every in flight line says whether anything has been sent, because that is the
 * only question a person watching a spinner over their own money is asking.
 */
function Action({ stage, explorer }: { stage: PayStage; explorer: string }) {
  if (stage.kind === "sent") {
    return (
      <div className="mt-5">
        <p className="bg-mark/[0.08] px-3 py-2.5 text-[12px] leading-snug text-bone/75">
          Paid. The note is theirs and nothing on chain names them.
        </p>
        <a
          href={`${explorer}/tx/${stage.hash}`}
          target="_blank"
          rel="noreferrer"
          className="mt-2.5 flex h-10 items-center justify-center bg-white/[0.05] font-mono text-[10.5px] tracking-[0.18em] text-bone/60 uppercase transition-colors hover:bg-white/[0.09] hover:text-mark"
        >
          View transaction
        </a>
      </div>
    );
  }

  if (stage.kind === "failed") {
    return (
      <div className="mt-5">
        <p className="bg-white/[0.05] px-3 py-2.5 text-[12px] leading-snug text-bone/70">
          {stage.reason} Nothing was sent.
        </p>
        <button
          type="button"
          className="mt-2.5 h-11 w-full bg-primary font-mono text-[11px] tracking-[0.16em] text-on-primary uppercase transition-colors hover:bg-primary-hi"
        >
          Try again
        </button>
      </div>
    );
  }

  if (stage.kind === "proving" || stage.kind === "retrying") {
    return (
      <div className="mt-5">
        <div className="flex h-11 w-full items-center justify-center gap-2.5 bg-white/[0.05]">
          <span aria-hidden className="size-[5px] animate-pulse bg-mark" />
          <span className="font-mono text-[11px] tracking-[0.16em] text-bone/60 uppercase">
            {stage.kind === "proving" ? "Preparing" : "Rebuilding"}
          </span>
        </div>
        <p className="mt-2 text-[11px] leading-snug text-bone/40">
          {stage.kind === "proving"
            ? "Building the proof in this browser. It takes a few seconds and nothing has been sent."
            : "Somebody else deposited while this was being prepared, so it is being built again against the current state. Nothing has been sent."}
        </p>
      </div>
    );
  }

  return (
    <button
      type="button"
      className="mt-5 h-11 w-full bg-primary font-mono text-[11px] tracking-[0.16em] text-on-primary uppercase transition-colors hover:bg-primary-hi"
    >
      Connect wallet
    </button>
  );
}

/**
 * Why a link cannot be paid, in the words of the person who can do something
 * about it.
 *
 * Four sentences instead of one, because "this link is broken" tells the payer
 * nothing and tells the recipient less. Each of these points at a different
 * next step, and three of the four are the recipient's to take.
 */
const REFUSAL: Record<PayRefusal, string> = {
  malformed:
    "This is not a payment request, or it was cut short on the way here. Ask for the link again.",
  "unknown-chain":
    "This request is for a network this app does not know, so there is no safe way to pay it here.",
  "bad-address":
    "The destination in this link is not a valid payment address. Paying it would send money to keys nobody holds, so it cannot be paid.",
  "unknown-token":
    "This request names a token this app cannot read. Ask for it in a different one.",
};

/**
 * No link in the address bar, which is not a refusal of anything.
 *
 * Its own component rather than a fifth `PayRefusal`, because the refusal panel
 * says "Cannot be paid" and "Nothing was sent", and both are answers to a
 * question this visitor never asked. They typed an address, or a chat app ate
 * the fragment off a link somebody sent them.
 */
export function PayNeedsLink() {
  return (
    <Frame>
      <Panel label="Payment link needed">
        <p className="pt-1 text-[13px] leading-relaxed text-bone/60">
          This page opens a payment link. Ask whoever is charging you to send
          theirs again, in full · the part after the # is the request itself, and
          some apps cut it off.
        </p>
      </Panel>
    </Frame>
  );
}

export function PayRefused({ reason }: { reason: PayRefusal }) {
  return (
    <Frame>
      <Panel label="Cannot be paid">
        <p className="pt-1 text-[13px] leading-relaxed text-bone/60">
          {REFUSAL[reason]}
        </p>
        {/*
          Said out loud on every refusal. A person who followed a link about
          money and hit a wall assumes the worst available explanation, and the
          worst one here is that they have already paid something.
        */}
        <p className="mt-3 font-mono text-[10.5px] tracking-[0.16em] text-bone/35 uppercase">
          Nothing was sent
        </p>
      </Panel>
    </Frame>
  );
}

/**
 * The housing. No app bar and no preloader, and both absences are the point:
 * the app bar carries an account this visitor does not have, and three seconds
 * of eyes opening is a ritual for somebody who came to stay.
 */
function Frame({ children }: { children: React.ReactNode }) {
  return (
    <main className="relative flex flex-1 flex-col items-center justify-center px-4 py-10">
      <div
        aria-hidden
        className="pointer-events-none absolute inset-x-0 top-0 h-[420px] bg-[radial-gradient(60%_100%_at_50%_0%,rgba(201,250,1,0.05),transparent_70%)]"
      />

      <div className="relative w-full max-w-[400px]">
        <div className="mb-5 flex justify-center">
          <Eyes className="w-9 text-mark" />
        </div>

        {children}

        <p className="mt-4 text-center text-[11px] leading-snug text-bone/25">
          Paid through Cowl. The person you are paying holds a shielded balance,
          not a wallet address.
        </p>
      </div>
    </main>
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
