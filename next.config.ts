import type { NextConfig } from "next";

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

  /**
   * Dev only. Next serves its chunks and HMR socket to the host it was started
   * on and blocks every other spelling of this machine. Reach the dev server as
   * 127.0.0.1 without this and the page arrives as HTML that never hydrates.
   */
  allowedDevOrigins: ["127.0.0.1", "localhost", "[::1]"],
};

export default nextConfig;
