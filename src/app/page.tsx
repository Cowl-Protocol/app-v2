import { AuthGate, SessionBar } from "@/features/auth";
import { HomeScreen } from "@/features/portfolio";
import { NetworkProvider } from "@/lib/network";

/**
 * The whole app, on one route.
 *
 * The entrance, the door and the balance screen used to be `/`, `/login` and
 * `/home`. They are one path now, because that is what a visitor actually walks:
 * nobody types `/login`, and every arrival starts in the same place.
 *
 * `AuthGate` owns which of the three is on screen. This file owns what "signed
 * in" looks like and hands it over, which is the direction that keeps `auth`
 * from importing the app it stands in front of.
 *
 * **Paying happens at `/pay` and never here.** A payer is a stranger settling
 * something rather than somebody acquiring a shielded balance, so they get their
 * own address and this app is not merely unmounted for them, it is never
 * referenced: nothing on that path imports auth, the preloader or a portfolio.
 *
 * A route file picks the route and hands off. The shell belongs here, the
 * behaviour belongs to the features.
 *
 * **`NetworkProvider` is mounted here rather than in the layout**, and inside
 * the gate rather than around it. The chain picker belongs to the signed in
 * screen: the login card reads no chain, and `/pay` deliberately references
 * nothing on this path, since a payer's chain is named by the link they were
 * handed and is not theirs to switch.
 */
export default function Page() {
  return (
    <AuthGate>
      <main className="relative flex flex-1 flex-col">
        {/*
          A single soft wash at the top so the page is not flat black behind
          the panels. It sits under everything and catches no pointer events.
        */}
        <div
          aria-hidden
          className="pointer-events-none absolute inset-x-0 top-0 h-[420px] bg-[radial-gradient(60%_100%_at_50%_0%,rgba(201,250,1,0.05),transparent_70%)]"
        />

        <NetworkProvider>
          <div className="relative flex flex-1 flex-col gap-5">
            <SessionBar />
            <HomeScreen />
          </div>
        </NetworkProvider>
      </main>
    </AuthGate>
  );
}
