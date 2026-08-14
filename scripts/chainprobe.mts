/**
 * Does this build actually reach its chain? Run with `npm run probe:chain`.
 *
 * A network probe, not a test, and it sits beside `probe:turnkey` for the same
 * reason: `npm test` is offline and stays offline, because a suite that fails
 * on a plane teaches people to ignore it.
 *
 * **What it is really checking is the fallback list.** `config/networks.ts` names
 * three endpoints per network and calls them "tried in order when the one before
 * stops answering", and until this script existed that sentence was a promise
 * nothing kept. Each endpoint is asked on its own here, so a dead one shows up
 * as a dead one rather than as a transport that got slower.
 *
 * Reads only. Nothing here can sign, send, or cost gas.
 */
import { createPublicClient, http } from "viem";
import { DEFAULT_NETWORK, tokensFor } from "../src/config";
import { fieldToHex } from "../src/lib/field";
import { POOL_ABI } from "../src/features/shielded/lib/pool-abi";
import { balanceOf, scanPool } from "../src/features/shielded/lib/scan";
import { randomField } from "../src/lib/field";
import { clientFor, toViemChain } from "../src/lib/rpc";
import { endpointsFor } from "../src/lib/transport";

/* The build's own network. A probe of a chain nobody's build points at would
   pass while the deployment it is standing in for could not reach anything. */
const net = DEFAULT_NETWORK;
const chain = toViemChain(net, tokensFor(net));
const publicClient = clientFor(net);

let failures = 0;

function ok(label: string) {
  console.log(`  ok    ${label}`);
}

function fail(label: string, detail: string) {
  failures++;
  console.log(`  FAIL  ${label}\n        ${detail}`);
}

function short(e: unknown): string {
  const message = e instanceof Error ? e.message : String(e);
  return message.split("\n")[0]!.slice(0, 160);
}

console.log(`\n${net.label} · chain ${net.chainId} · pool ${net.contracts.pool}\n`);

console.log("Every endpoint, asked on its own");

for (const url of endpointsFor(net)) {
  const solo = createPublicClient({ chain, transport: http(url, { timeout: 10_000, retryCount: 0 }) });
  const started = Date.now();
  try {
    const block = await solo.getBlockNumber();
    console.log(`  ok    ${url}\n        block ${block} · ${Date.now() - started}ms`);
  } catch (e) {
    /* Not counted as a failure. An endpoint being unreachable from here is the
       case the list exists for, and a fallback list where every entry answers
       has never been tested. What would be a failure is all of them refusing,
       which the reads below would catch. */
    console.log(`  down  ${url}\n        ${short(e)}`);
  }
}

console.log("\nThrough the app's own transport");

try {
  const block = await publicClient.getBlockNumber();
  ok(`head is block ${block}`);
} catch (e) {
  fail("the chain is reachable at all", short(e));
}

try {
  const [root, next] = await Promise.all([
    publicClient.readContract({ address: net.contracts.pool, abi: POOL_ABI, functionName: "root" }),
    publicClient.readContract({ address: net.contracts.pool, abi: POOL_ABI, functionName: "nextLeafIndex" }),
  ]);

  ok(`the pool answers · root ${root.slice(0, 18)}… · ${next} leaves committed`);

  /* A contract that answers both of these is a shielded pool. An address that
     is not one either reverts or returns nothing decodable, and both are how a
     stale address in the config surfaces here rather than as an empty balance
     later. */
  if (Number(next) > 0) ok("it holds leaves, so a replay has something to find");
  else fail("the pool has leaves", "nextLeafIndex is 0, so nothing has ever been shielded here");
} catch (e) {
  fail("the pool at the configured address answers a read", short(e));
}

/**
 * The log path, which is what a balance is actually made of.
 *
 * **Measured on 2026-08-12, and the three endpoints disagree in ways that decide
 * how a sync has to be written.** None of this is guessable from their docs, so
 * the table is printed rather than assumed:
 *
 *   thirdweb (primary)  a numeric `toBlock` is capped somewhere between 100 and
 *                       5,000 blocks and refuses with "Request exceeds defined
 *                       limit". The same range with `toBlock: "latest"` is served
 *                       fine, including the whole history in one call.
 *   publicnode          serves bounded windows, cannot serve the deep replay.
 *   robinhood official  serves everything, both spellings, and sits last in the
 *                       list because it is unreachable from some regions.
 *
 * So the replay asks for `latest` rather than a number. That is not a
 * workaround: pinning `toBlock` to a head read from one endpoint and then asking
 * another to serve it is asking about a block it may not have, and the head is
 * already seconds stale by the time the request lands.
 */
console.log("\nThe replay, the way a sync will ask for it");

try {
  const logs = await publicClient.getContractEvents({
    address: net.contracts.pool,
    abi: POOL_ABI,
    eventName: "NoteCommitted",
    fromBlock: net.contracts.poolDeployBlock,
    toBlock: "latest",
  });
  ok(`the whole history in one request · ${logs.length} leaves since block ${net.contracts.poolDeployBlock}`);
} catch (e) {
  fail("the full replay is served at all", short(e));
}

console.log("\nWhat each endpoint will and will not serve");

for (const url of endpointsFor(net)) {
  const solo = createPublicClient({ chain, transport: http(url, { timeout: 20_000, retryCount: 0 }) });
  const answers: string[] = [];

  for (const [label, from, to] of [
    ["bounded window", -5_000n, "head"],
    ["full replay", net.contracts.poolDeployBlock, "latest"],
  ] as const) {
    try {
      const head = from < 0n ? await solo.getBlockNumber() : 0n;
      await solo.getContractEvents({
        address: net.contracts.pool,
        abi: POOL_ABI,
        eventName: "NoteCommitted",
        fromBlock: from < 0n ? head + from : from,
        toBlock: to === "head" ? head : to,
      });
      answers.push(`${label} yes`);
    } catch {
      answers.push(`${label} NO`);
    }
  }

  console.log(`  ${answers.join(" · ")}  ${url}`);
}

/* Not a failure on its own. One endpoint refusing the deep replay is the case
   the fallback list exists for, and the check that matters already ran above:
   whether the app's own transport can serve it through whatever is willing. */

/**
 * The scan, end to end, against the live pool.
 *
 * Run with a key nobody owns, so it finds nothing. **Finding nothing is not the
 * check** · the check is `integrity`, which rebuilds the commitment tree from
 * the replayed leaves and compares it to the root the pool itself reports. That
 * passing means three separate things are right at once: the replay lost no
 * window, this client's Poseidon2 and its empty-subtree constants match the
 * deployed contract's, and the leaves were placed at the indices the log says.
 *
 * A wrong Poseidon or a lost window both produce a smaller balance and no error,
 * which is the failure this whole probe exists to make loud.
 */
console.log("\nThe scan, against a key nobody owns");

try {
  const started = Date.now();
  const result = await scanPool(
    { mpk: randomField(), nk: randomField(), viewPriv: randomField() },
    net,
  );
  const took = Date.now() - started;

  if (result.integrity.kind === "complete") {
    ok(`the rebuilt tree hashes to the pool's own root · ${result.leaves} leaves · ${took}ms`);
  } else if (result.integrity.kind === "moved") {
    console.log(`  moved   the chain gained a leaf mid-scan · replayed ${result.integrity.replayed}, chain says ${result.integrity.onChain}`);
  } else if (result.integrity.kind === "gap") {
    fail("the replay is complete", `no commitment at leaf ${result.integrity.missing}, so a log window was lost`);
  } else {
    fail(
      "the rebuilt tree matches the chain",
      `this client rebuilt ${fieldToHex(result.integrity.replayed)} and the pool reports ${result.integrity.onChain}`,
    );
  }

  if (result.notes.length === 0) ok("a stranger's key finds no notes, so the ownership check is not waving things through");
  else fail("a random key owns nothing", `it matched ${result.notes.length} notes, which is impossible unless the commitment check is broken`);

  if (balanceOf(result.notes).length === 0) ok("and therefore no balance");
} catch (e) {
  fail("the scan runs at all", short(e));
}

console.log(failures === 0 ? "\nThis build can read its chain.\n" : `\n${failures} check(s) FAILED.\n`);
process.exit(failures === 0 ? 0 : 1);
