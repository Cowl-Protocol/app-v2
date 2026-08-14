# app-v2

The consumer surface. Google login, a wallet provisioned for the user, and a
shielded balance they can be paid into without ever showing a wallet address.

Separate from `app/`, which stays the self custody dapp for people who already
hold crypto and want to keep their own keys. Two audiences, two apps, one pool.

```
npm run dev        # http://localhost:3000
npm run build      # static export to out/
npm run preview    # serve out/ the way it will actually be served
npm run lint       # includes the architecture rules below
npm run typecheck
npm test           # config, keys, note ciphers, history arithmetic, sign in plumbing, architecture rules. all offline
npm run probe:chain     # can this build reach its chain, and what will each RPC serve
npm run probe:privy     # asks a real Privy app the two questions the tests cannot
```

`probe:privy` needs a Privy **app secret**, which lives on a laptop and never in
this app · nothing under `src/` reads it and it is deliberately not a
`NEXT_PUBLIC_` variable. It answers whether signatures are deterministic and
whether they are RFC 6979, and **it has to be run before anybody holds a
balance**. See "The assumption underneath all of it".

Copy `.env.example` to `.env.local`. It holds the chain a session opens on
and the public ids sign in needs, and nothing in it is a secret. Without the
ids the app still runs and every screen behind the door is still reachable with
`SKIP_LOGIN`; what you lose is the Google button, which says it has no
credentials rather than failing at the provider's door.

## Two decisions that shape everything else

**There is no server.** `output: "export"` in `next.config.ts`. The whole app is
files under a web root, the way the existing dapp is already served. That is a
privacy decision before it is a deployment one: nothing on our side can log a
payment address, a payload, or an IP against a session even by accident, and a
server that does not exist cannot be asked for its records.

Anything that genuinely needs a server side secret belongs in a **separate small
service**, the shape `cowl-claim` already has on the VPS. Never an API route
here. An API route quietly turns this back into a server and takes the guarantee
with it.

Sub-organization creation used to be the known example, and as of 2026-08-08 it
is not: the wallet provider holds the parent credential and the browser talks to
it directly, so there is nothing left for a service of ours to do. Which is the
better outcome twice over, because that service would have seen every user's
identity token and therefore their email. **There is currently nothing in this
product that needs a server**, and the bar for the first thing that does should
be read as higher than it looks.

**Shielded secrets are never persisted.** They are derived on demand, held in
memory, and die with the tab. No `localStorage`, no `sessionStorage`, no
IndexedDB, no cookie, and eslint blocks all four anywhere under `src/`. A
viewing key reads history backwards, so a leak cannot be undone by rotating
anything. The provider protects the EOA key inside its TEE. It cannot protect
this one, because a ZK proof has to be built where the secret is, and that is
the browser.

**One half of that rule was lost on 2026-08-14 and it should not be discovered
later as a regression.** The previous provider's session was a non-extractable
key in a module variable, so nothing at all survived the tab. Privy signs in by
redirecting, which means its session has to survive a page load, and its web SDK
keeps that token in `localStorage` with no supported way to move it · there is no
`storage` prop on `PrivyProvider` and no persistence option in
`PrivyClientConfig`. So the shielded keys still die with the tab, and **the
ability to derive them again now survives on the user's own device** until they
sign out. `useSignOut` clears it, which is why signing out matters more than it
used to.

## Which chain a session reads

`NEXT_PUBLIC_COWL_NETWORK`, one of the keys in `config/networks.ts`, decides
which chain a session **opens** on. **Left unset it is testnet**, and the
asymmetry is deliberate: a build that forgot to name a network runs against the
chain where a mistake costs nothing, and reaching mainnet takes somebody typing
its name.

**A name this build does not know fails `npm run build`.** The check runs at
module load, which under `output: "export"` is during prerender, so a typo takes
the build down instead of falling back. That fallback is the failure worth
paying a build error to avoid: a build meant for mainnet that quietly landed on
testnet reads an empty pool, and an empty pool looks exactly like an account
with no money in it.

**From 2026-08-14 the bar carries a chain picker, so the chain in force is a
runtime value.** `lib/network.tsx` holds it and `useNetwork()` is the only way to
read it. Everything that touches a chain takes a network as an argument now:
`clientFor`, `transportFor`, `tokensFor`, `scanPool`, `tokenMetaFor`. The
constant is called `DEFAULT_NETWORK` rather than `ACTIVE_NETWORK` for that
reason, because a module reading it inside the app compiles, names a real chain,
and goes on naming the one the session has already left.

Switching **rescans**. `useShieldedBook` carries the chain its result was for
alongside the account, so a scan that lands after a switch is discarded rather
than rendered under a bar that now names the other network: an empty pool and a
funded one both render as zero, and the label is the only thing telling them
apart.

The choice is **not written down**. This app persists nothing, so a reload opens
on the network the build named. A cookie or a query parameter would be the same
storage the no-persistence rule refuses, and a chain selection in a URL survives
being pasted into somebody else's window.

`NETWORKS` stays exported beside all of it because the payer's screen asks a
different question, whether a link names a chain this build knows **at all**, and
that one has to look past the current selection or a testnet request is
unreadable in a mainnet build rather than refused in words.

**`config/tokens.ts` is where decimals live, per network, and nowhere else.**
Decimals decide where the point goes, so an entry wrong by one is wrong by a
factor of ten while rendering perfectly, and nothing downstream can catch it.
Every value there was read from the deployment it describes, including the
testnet venue's stand-ins, which are free to differ from the mainnet tokens they
stand in for. The set is deliberately short: this chain carries tokenized
equities as plain ERC-20s, so a wired client has to learn a token from the token
itself, and until that read exists **a token that is not in the registry is
refused rather than guessed at**.

`npm run test:config` pins all of it, 64 checks. The selection rule is tested
twice on purpose, once in this process against a value it is handed and once in
a child process with a real environment variable set, because a pure function
nothing calls passes every test it has and still ships a build on the wrong
chain. Addresses are checked against their own EIP-55 checksum, which is what
catches a hand typo. Six mutants, six killed.

## Where every figure on screen comes from

**Nothing on any screen is invented.** The placeholder modules that carried this
app through its layout phase are gone, along with `PREVIEW`, and each figure now
has exactly one source:

| On screen | Read from |
| --- | --- |
| Balances, per token | the pool's own log, replayed and trial-decrypted in the tab |
| What one send can move | the two largest unspent notes, because a join-split reads two |
| Activity rows | the same replay, grouped by transaction and netted per token |
| Dates | the block each movement landed in, never this machine's clock |
| Dollar prices | the venue's V3 quoter, median across fee tiers |
| The 7 day line | today's holdings with the movements since undone |
| Send and swap fees | the relayer's own `GET /quote`, per token |
| Swap rate | the quoter, asked about that exact pair |
| The name in the bar | the signed in account's email, local part only |

**A figure with no source is absent, never approximated.** A token the venue will
not quote renders without a valuation; a chain whose dollars are not real, which
is every test chain, renders no dollars at all; a movement list that cannot reach
back seven days draws no line rather than one starting from a number nobody held.
`npm run test:history` pins that arithmetic, including the refusals, because a
chart that is drawable and wrong is worse on a balance screen than no chart.

**Prices are asked for the whole curated registry, not for what is held.** The
request set an RPC sees is therefore identical for everybody on a network. The
CLI's explorer fallback is deliberately not ported: an HTTPS request to a third
party naming a token, sent from the browser holding it, is the one thing this
app's whole shape exists to avoid.

### What is still not real, and why

- **Nothing submits.** No proof is built anywhere in this app yet, so Send, Pay
  and Swap compose a spend, apply every real refusal to it, and stop. That is one
  module, not a redesign.
- **One address, not a sequence.** Per-index derivation does not exist, so there
  is nothing to rotate to, no previous addresses to list, no gather to quote and
  no public funnel to issue. The copy on those surfaces says what is true today
  rather than what the design promises.
- **No `shield` or `unshield` rows.** The pool emits commitments, ciphers and
  nullifiers, and a deposit is indistinguishable from a payment in all three.
  Telling them apart means attributing a token transfer to this account's own
  wallet address, which is the one address no screen here may read. Money in
  reads as received, money out as sent.

## One shielded account space, shared with the dapp

`SHIELDED_SIGN_MESSAGE` in `features/keys` is **byte-identical** to the dapp's.
Same wallet, same signature, same `mpk`, same `zcowl1…`, whichever client is
holding it. A provider can export the EOA key, and an export that hands someone a
key whose shielded balance then does not appear in the dapp is an export in name
only.

The message is fixed forever. One different byte is a different account, for
everybody, with no recovery: a note belongs to whoever holds the `sk` behind its
`mpk`, and nothing on chain records that it moved. `npm run test:keys` pins the
message and the derived output against known answers generated from the shipped
dapp, and the vectors are deliberately **not** regenerated from this code, which
would only make the check agree with whatever it currently does.

**Open decision.** That message ends "Only sign it on app.cowlprotocol.com." It
is an anti-phishing control and it names a domain this app is not served from. It
cannot be reworded without splitting the account space in two, so the choice is
between a wallet prompt that names the wrong host and two shielded balances per
wallet. Nobody has decided; shared account space is the current default because
it is the one a user can reason about.

**One thing about that sentence changed when a hosted provider landed.** In the
dapp it is an anti-phishing control that works, because MetaMask renders it and a
human reads it before approving. Here nobody ever sees it: the signature is
produced inside a TEE, on request, with no prompt. The control is not weakened so
much as absent, and what replaces it is narrower and stronger for this app. A
hostile origin cannot make the provider sign anything, because signing needs a
session minted for our app id against an origin allowlist. The risk comes back
the moment a user exports the key into an injected wallet, which is exactly where
the original warning starts working again.

## Sign in

Google, through Privy, with no server of ours anywhere in it.

```
click  ->  the provider redirects to Google. this page is gone
       ->  Google  ->  back to this origin, a fresh page
       ->  the provider reports ready and authenticated
       ->  a signer appears, once the keyring has an account at index 0
       ->  m/44'/60'/0'/0/0 signs the unlock message, twice
       ->  shielded keys, derived in this tab
```

**The second half runs on a page load rather than on a click**, which is why
`lib/sign-in.ts` is a hook and not the single awaited function it used to be.
Nothing can be sequenced after the login call, because that call navigates the
page away.

**Account 0 signs and never appears on chain. Account 1 is the deposit
address.** The anchor's whole job is that signature, and an anchor seen receiving
in public ties a transfer to the account a shielded balance derives from.
`features/auth/lib/funnel.ts` derives index 1 on demand, inside the provider's
TEE, and nothing about it is stored here. Both indices are named constants in
`lib/signer.ts` rather than literals at call sites.

**No server, still.** The provider holds the credential that provisions an
account and the browser talks to it directly. That is better than convenient: a
service of ours in this path would see every user's identity token, which carries
their email, and no box of ours being able to learn that is the whole point of
`output: "export"`.

**The SDK is a real cost and it was taken deliberately.** Auth used to be six
`fetch` calls and **zero packages**, which was the answer to the audit note that
the build machine turns dependencies into the bundle where a signature becomes a
spending key · the shortest path in this project from a bad package to somebody's
money. `@privy-io/react-auth` brings roughly forty direct dependencies, including
a styling engine, two icon sets and two wallet connector stacks, and the install
took this project from 317 packages to 543. It was traded for a price model that
matches how this app actually behaves, and it is written down here as a trade
rather than left to be found later. One thing that does not get worse: Privy pins
the same viem this app already had, so there is no second copy of it.

**Only two files may name the vendor**, `lib/providers/` and
`components/auth-provider.tsx`, and a lint rule enforces it rather than a
convention · see rule 7 below.

**The provider is behind a port.** `lib/signer.ts` defines `ShieldedSigner` and
`WalletSession`, `lib/providers/privy.ts` implements them, and
`lib/providers/index.ts` is the one line that chooses. That exists because the
last swap cost a whole feature: `unlock.ts`, `funnel.ts` and `sign-in.ts` each
imported the vendor directly, so replacing it meant editing the code that derives
keys for a reason that had nothing to do with derivation.

### The assumption underneath all of it

The shielded account is derived from the bytes of one signature. That rests on
two properties, **neither of which any hosted provider has put on the public
record**, and they fail in different sizes.

**Determinism.** If the provider signs with a random nonce, every session derives
a different shielded account: a balance reading zero, notes addressed to keys
nothing will derive again. Hedged signing, deterministic plus fresh entropy, is a
normal choice for a TEE signer. This one is **loud** · `lib/unlock.ts` signs
twice on every unlock and refuses if the two differ, so nobody loses money, they
just cannot sign in.

**RFC 6979.** A deterministic nonce that is not RFC 6979 would be perfectly
stable here and produce **different bytes than viem** for the same key. Accounts
would be reproducible in this app and **fork from the dapp**, one wallet would
open two different shielded balances depending on which client held it, and an
exported key would open the wrong one in MetaMask. This one is **silent**. Two
signatures in one session agree happily. Nothing observable from inside a browser
distinguishes it from the correct world.

`lib/unlock.ts` also checks that the signature recovers to the wallet's own
address and that `s` is on the low half of the curve. Each of those failures is
otherwise silent and looks exactly like theft.

**`npm run probe:privy` is what answers both**, and it has to be run before
anybody holds a balance. It signs four times with a provider-generated wallet for
determinism, then imports a key generated locally and compares the provider's
signature against noble's own RFC 6979 output byte for byte. Freeze the wallet id
and the `r` it prints and re-run on another day: determinism inside one session
cannot see a scheme that changed between sessions.

### Setting it up, once

Neither account exists yet. Both are free and neither touches a chain.

Only one account, and it is free.

1. **Privy.** Create an app in the dashboard. Copy the **App ID**, and the
   **Client ID** from App settings · Clients. Allowlist the origin this app is
   served from, exactly.
2. **Turn every login method off except Google.** A second method is a second
   door into the same shielded account, and the weakest one sets the strength of
   all of them: anything that can authenticate as the user can derive the view
   key, which reads payment history backwards and cannot be rotated. The client
   config in `components/auth-provider.tsx` also names `loginMethods: ["google"]`,
   and **the two have to agree** · a method enabled in the dashboard and omitted
   there is still reachable.
3. Put the ids in `.env.local`, then `npm run probe:privy` before trusting any of
   it with a balance. That needs the app secret as well, in the shell only.

Google needs no separate project: the provider owns that integration. The
`/auth/callback` route the previous popup flow needed is gone, and with it the
`Cross-Origin-Opener-Policy` trap · that header severed `window.opener` and is
now harmless. `/pay` still emits `out/pay.html` rather than an index file, so
Caddy still needs `try_files {path} {path}.html`.

## Where code goes

```
src/
  app/             routes only, thin shells
  features/        the actual app, one folder per domain
    auth/          Google sign in, the provider session, key derivation trigger
    keys/          secret material. the only place it exists
    shielded/      notes, tree sync, proving
    pay/           paying into someone else's shielded balance
    request/       payment addresses and links
    portfolio/     balances and history
  components/ui/   primitives with no domain knowledge (shadcn lands here)
  components/layout/
  lib/             cross cutting helpers
  config/          networks, tokens, contract addresses, constants
  hooks/           generic hooks only
  types/
```

A feature owns its own `components/`, `hooks/`, `lib/` and `types.ts`, and
exposes exactly one public file, `index.ts`. Everything not exported there is
free to move, rename or disappear without touching another feature.

## The seven rules

Six of these are enforced in `eslint.config.mjs`. A convention people have to
remember is a convention that erodes, so these fail `npm run lint` instead.

1. **`app/` is routing only.** A file under `app/` picks the route and hands off
   to a feature. No business logic, no fetching, no state machines.
2. **One folder per feature**, owning its own components, hooks, lib and types.
3. **Features never reach into each other's internals.** Import the neighbour's
   `index.ts`, never a file inside it. *Enforced.*
4. **Dependencies point one way**, shared to features to app. A feature that
   imports a route has been written backwards. *Enforced.*
5. **Shared code stays shared.** `components/ui`, `lib`, `hooks`, `types` and
   `config` cannot import from `features/` or `app/`. The moment a button knows
   what a note is, it is not a primitive. *Enforced.*
6. **Key material lives in `features/keys` and is reachable only from `auth` and
   `shielded`.** Auth derives once a signature comes back, shielded needs the
   secret in process to prove. Nothing else has a reason, and a reason that turns
   up later is a design conversation rather than a quick import. *Enforced, plus
   a second rule that blocks browser storage anywhere under `src/`.*
7. **The wallet provider is named in two files and nowhere else.**
   `features/auth/lib/providers/` and `features/auth/components/auth-provider.tsx`
   may import the SDK. Everything else uses the `ShieldedSigner` and
   `WalletSession` ports in `features/auth/lib/signer.ts`. *Enforced.* It caught
   a real violation in `sign-in.ts` within an hour of being written, which is
   roughly how long the previous provider's imports took to spread.

Adding a feature means adding its folder **and** its name to `FEATURES` in
`eslint.config.mjs`. A folder missing from that list silently escapes rule 3.

### They are tested in both directions

`npm run test:boundary` writes a probe file into each folder, lints it, deletes
it, and asserts twenty five cases. Seventeen must be blocked and eight
**allowed**, and an allow that errors fails the script exactly as loudly as a
block that passes.

One further trap that suite set for itself: it filters lint output down to the
rule ids the architecture is made of, so a **new rule missing from that filter is
invisible to the script that exists to prove the rules work**. The provider rule
was working perfectly and reported as "nothing stopped it" until the filter
learned its name.

That second half is not symmetry for its own sake. A lint rule that over-blocks
looks identical to a lint rule that works, right up until the feature that needs
the import cannot be built. This happened here: `KEY_CONSUMERS` named `auth` and
`shielded` as the two features permitted to touch key material, and the
cross-feature zone blocked every cross-feature import including a public
`index.ts`, so both were refused and the allowlist was unreachable code. It
survived because the rules had only ever been tried with imports that were
supposed to fail. Fixed 2026-08-03, the first time `auth` needed a key.

One limit worth knowing: `no-restricted-paths` compares **resolved** paths, so it
cannot restrict an import it cannot resolve. A deep import of a file that does
not exist is a module error rather than a boundary error, which is why every case
in that script points at a real file.

### Where public data goes

`@/lib/payment-address` holds `zcowl1…` encoding, decoding and validation, and it
is deliberately **outside** `features/keys`. A payment address is the part of a
shielded account meant to be published, decoding one is what a *payer* does, and
`pay` is not a key consumer. Filing it under `keys` would put a public-data
helper behind the strictest boundary in the app, and the first person who needed
it would widen `KEY_CONSUMERS` to reach it, undoing the rule the product rests on
for the sake of a function that holds no secret.

## Components

shadcn/ui, configured in `components.json`, landing in `src/components/ui`.
Chosen because the code is copied into the repo rather than installed, so the
house style in `cowl/STYLE.md`, which has no borders and no focus rings, is
applied at the source instead of fought with overrides.

```
npx shadcn@latest add button
```

## Copy rules for anything a user can read

Same as the dapp. **No em or en dashes**, including tooltips, metadata, button
labels and empty states. Two sentences, a comma, or the house middot `·`.

And never describe this as a private payment. The payer is visible on chain and
anyone can confirm it in a single look. What is true, and sells on its own: you
get paid without ever showing an address.

## Architecture reference

The layout follows [bulletproof-react](https://github.com/alan2207/bulletproof-react),
specifically `docs/project-structure.md` and its `import/no-restricted-paths`
approach. Read that before proposing a change to the structure.
