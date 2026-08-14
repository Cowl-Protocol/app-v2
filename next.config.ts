import { networkInterfaces } from "node:os";
import type { NextConfig } from "next";

/**
 * Every spelling of "this machine", including the one the router hands out.
 *
 * Dev only. Next serves its chunks and its HMR socket to the host it was started
 * on and blocks every other name for the same computer, so reaching the dev
 * server at its LAN address gets HTML that never hydrates and a wall of
 * "Blocked cross-origin request" in the terminal.
 *
 * **Read from the interfaces rather than written down.** A hardcoded
 * `10.207.171.67` is right until the lease changes, a coffee shop hands out a
 * different subnet, or somebody else clones this repo, and every one of those is
 * the same afternoon lost to a page that renders and does nothing. This asks the
 * machine, at dev start, and is therefore never stale.
 *
 * It runs in `next build` too and costs nothing there: a static export has no
 * dev server for the list to apply to.
 */
function thisMachine(): string[] {
  const names = ["127.0.0.1", "localhost", "[::1]"];

  for (const addresses of Object.values(networkInterfaces())) {
    for (const address of addresses ?? []) {
      /* IPv4 only, and never the loopback the list already names. The runtime
         has reported `family` as both a string and a number across Node
         versions, so it is compared loosely rather than trusted to be one. */
      const four = String(address.family) === "IPv4" || String(address.family) === "4";
      if (four && !address.internal) names.push(address.address);
    }
  }

  return names;
}

const nextConfig: NextConfig = {
  /**
   * Static export, and it is a security decision before it is a deployment one.
   *
   * There is no Node process, no request handler, and no middleware, so there is
   * nothing on our side that could log a payment address, a payload, or an IP
   * against a session even by accident. A server that does not exist cannot be
   * asked for its records. It also means the whole app is files under a web root,
   * which is how the existing dapp is already served.
   *
   * Anything that genuinely needs a secret held server side, Turnkey
   * sub-organization creation being the known one, belongs in a separate small
   * service, never in an API route here. An API route would quietly turn this
   * back into a server.
   */
  output: "export",

  /** No optimizer to route images through when there is no server. */
  images: { unoptimized: true },

  /**
   * The dev route indicator, off.
   *
   * It renders bottom left, over the frame's own corner mark and the bottom of
   * whatever panel is there, which makes it impossible to judge the layout in
   * the one corner it covers. Nothing is lost by hiding it: this is a static
   * export, so every route is prerendered and the badge has only one answer to
   * give. Compile and runtime errors still surface, they are not part of this
   * indicator.
   *
   * `false` is the whole switch as of Next 16. The old `buildActivity` and
   * `appIsrStatus` keys were removed in 16.0.0, so a config carrying them is not
   * a config that hides less, it is one that fails.
   */
  devIndicators: false,

  /** See `thisMachine` above: loopback plus whatever address the network gave us. */
  allowedDevOrigins: thisMachine(),
};

export default nextConfig;
