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
npm test           # key derivation, sign in plumbing, architecture rules. all offline
npm run probe:turnkey   # asks a real Turnkey org the one question the tests cannot
```

Sign in needs two public ids. Copy `.env.example` to `.env.local` and fill them
in. Without them the app still runs and every screen behind the door is still
reachable with `SKIP_LOGIN`; what you lose is the Google button, which says it
has no credentials rather than failing at Google's door.

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
is not: Turnkey's managed auth proxy holds the parent key, so the browser calls
it directly and there is nothing left for a service of ours to do. Which is the
better outcome twice over, because that service would have seen every user's
identity token and therefore their email. **There is currently nothing in this
product that needs a server**, and the bar for the first thing that does should
be read as higher than it looks.

**Secrets are never persisted.** Shielded keys are derived on demand, held in
memory, and die with the tab. No `localStorage`, no `sessionStorage`, no
IndexedDB, no cookie. This costs one auth step per session and it is not
negotiable: a viewing key reads history backwards, so a leak cannot be undone by
rotating anything. Turnkey protects the EOA key inside an enclave. It cannot
protect this one, because a ZK proof has to be built where the secret is, and
that is the browser.

## One shielded account space, shared with the dapp

`SHIELDED_SIGN_MESSAGE` in `features/keys` is **byte-identical** to the dapp's.
Same wallet, same signature, same `mpk`, same `zcowl1…`, whichever client is
holding it. Turnkey can export the EOA key, and an export that hands someone a
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

**One thing about that sentence changed when Turnkey landed.** In the dapp it is
an anti-phishing control that works, because MetaMask renders it and a human
reads it before approving. Here nobody ever sees it: the signature is produced
inside an enclave, on request, with no prompt. The control is not weakened so
much as absent, and what replaces it is narrower and stronger for this app. A
hostile origin cannot make Turnkey sign anything, because signing needs a session
minted from a Google token bound to our client id and our proxy config. The risk
comes back the moment a user exports the key into an injected wallet, which is
exactly where the original warning starts working again.

## Sign in

Google, through Turnkey, with no server of ours anywhere in it.

```
click  ->  P-256 keypair, non-extractable, in memory
       ->  Google, nonce = sha256(that public key), popup
       ->  Turnkey auth proxy: find or create the sub-organization
       ->  Turnkey auth proxy: token + public key -> session
       ->  wallet account m/44'/60'/0'/0/0 signs the unlock message
       ->  shielded keys, derived in this tab
```

**No server, still.** Sub-organization creation needs the parent organization's
API key, and until Turnkey shipped a managed auth proxy that meant running a
small service to hold one. It no longer does. That is better than convenient: a
service of ours in this path would see every user's identity token, which carries
their email, and no box of ours being able to learn that is the whole point of
`output: "export"`. The proxy moves the secret to the party that already holds
the account.

**No SDK, either.** `@turnkey/core` keeps the session keypair in IndexedDB and
its storage layer is not optional; `@turnkey/react-wallet-kit` arrives with a UI
framework, an icon set, an animation player and a phone number parser. The whole
surface used here is six HTTP calls, so `features/auth/lib/turnkey.ts` makes them
directly and this feature adds **zero dependencies**. That is a deliberate answer
to the audit note in the workspace handoff: the build machine turns dependencies
into the bundle where a signature becomes a spending key, which is the shortest
path in this project from a bad package to somebody's money.

**The popup is forced, not chosen.** Google's nonce commits to the session public
key, so the private half has to survive the round trip. A redirect ends the page,
and this app persists nothing, so the token would come back unspendable. Storing
the key across the hop is the one thing the no-persistence rule exists to refuse.
`/auth/callback` is the popup's landing page and does nothing but hand the token
to its opener.

### The assumption underneath all of it

The shielded account is derived from the bytes of one signature. That works
because deterministic ECDSA gives the same bytes every time, which every injected
wallet does and **Turnkey has never said whether it does**. A search of the
published docs, the whitepaper and the whole `tkhq/sdk` monorepo on 2026-08-08
found no mention of RFC 6979 or of nonce generation. Hedged signing, deterministic
plus fresh entropy, is a normal choice for enclave signers and would break this
design silently: a different account every session, a balance reading zero, notes
addressed to keys nothing will derive again.

So `lib/unlock.ts` signs **twice on every unlock and refuses if the two differ**,
along with checking that the signature recovers to the wallet's own address and
that `s` is on the low half of the curve. Each of those failures is otherwise
silent and looks exactly like theft. `npm run probe:turnkey` answers the same
question against a real organization in about five seconds, and **it has to be
run before anybody holds a balance**, because a sign in that always refuses is
safe but is not a product.

Still open and not answerable from the probe: whether these are the same bytes
viem would produce for the same private key. Determinism alone does not settle
it, since a deterministic nonce that is not RFC 6979 would be stable here and
still differ in an injected wallet. It decides whether export means anything, so
it belongs with the export flow rather than before it.

### Setting it up, once

Neither account exists yet. Both are free and neither touches a chain.

1. **Turnkey.** Create an organization, then Embedded Wallets · Configuration.
   Copy the **Auth Proxy Config ID**. Allowlist the origin this app is served
   from, exactly, since partial wildcards are not supported. Enable Google, and
   **turn off every method you are not using**: email OTP left on is a second
   door into the same shielded account, and a weaker one than the Google account
   it sits beside.
2. **Google.** Cloud Console · Credentials · OAuth 2.0 Client ID, type Web
   application. Authorised JavaScript origin `http://localhost:3000`, authorised
   redirect URI `http://localhost:3000/auth/callback`. Google compares strings,
   so scheme, port and trailing slash all have to match what the browser sends.
3. Put both ids in `.env.local`, then `npm run probe:turnkey` before trusting any
   of it with a balance.

Two things that would break this from outside the app. `Cross-Origin-Opener-Policy:
same-origin` on the web server severs `window.opener` and takes sign in with it,
so a hardening pass has to leave that header alone. And the static export writes
`out/auth/callback.html`, not `out/auth/callback/index.html`, which is the same
trap `/pay` already carries: Caddy needs `try_files {path} {path}.html`, or
`trailingSlash: true` fixes it everywhere and moves the address to
`/auth/callback/`, which then has to be re-registered with Google.

## Where code goes

```
src/
  app/             routes only, thin shells
  features/        the actual app, one folder per domain
    auth/          Google sign in, the Turnkey session, key derivation trigger
    keys/          secret material. the only place it exists
    shielded/      notes, tree sync, proving
    pay/           paying into someone else's shielded balance
    request/       payment addresses and links
    portfolio/     balances and history
  components/ui/   primitives with no domain knowledge (shadcn lands here)
  components/layout/
  lib/             cross cutting helpers
  config/          networks, contract addresses, constants
  hooks/           generic hooks only
  types/
```

A feature owns its own `components/`, `hooks/`, `lib/` and `types.ts`, and
exposes exactly one public file, `index.ts`. Everything not exported there is
free to move, rename or disappear without touching another feature.

## The six rules

Five of these are enforced in `eslint.config.mjs`. A convention people have to
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

Adding a feature means adding its folder **and** its name to `FEATURES` in
`eslint.config.mjs`. A folder missing from that list silently escapes rule 3.

### They are tested in both directions

`npm run test:boundary` writes a probe file into each folder, lints it, deletes
it, and asserts twenty two cases. Fifteen must be blocked and seven **allowed**,
and an allow that errors fails the script exactly as loudly as a block that
passes.

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
