import { Readout } from "@/components/ui/panel";
import type { ClientStatus } from "../types";

/**
 * The strip along the bottom: whether what is above it is current, and whether
 * the app can act right now.
 *
 * **Nothing here names the infrastructure.** It carried a contract address and a
 * note count and both are gone. A consumer who signed in with Google cannot
 * check an address, cannot do anything differently for knowing it, and reading
 * one on a money screen invites the question of whether they were supposed to
 * understand it. The technical account of how this works belongs in the docs,
 * where somebody arrives already wanting it.
 *
 * What is left are the two states that go wrong silently. A stale sync shows a
 * balance that is merely out of date, and a cold prover turns the first send of
 * a session into a minute of nothing visibly happening. Neither throws, so being
 * told is the only way anybody finds out.
 */

export function StatusStrip({ status }: { status: ClientStatus }) {
  return (
    <div className="flex flex-wrap items-center gap-x-7 gap-y-3 bg-white/[0.02] px-4 py-3">
      <Readout label="Updated">{status.synced}</Readout>

      <Readout label="Send">
        <span className={status.readyToSend ? "text-mark" : "text-bone/50"}>
          {status.readyToSend ? "ready" : "warming up"}
        </span>
      </Readout>

      {/*
        Right hand end, and deliberately the least loud thing on the strip. It is
        the honest note about where the boundary is, and it belongs where someone
        can find it rather than stamped across the balance. It says what is
        visible without naming what it is visible on.
      */}
      <p className="ml-auto text-[11px] text-bone/30">
        Deposits and withdrawals are visible on chain. What you hold and send is
        not.
      </p>
    </div>
  );
}
