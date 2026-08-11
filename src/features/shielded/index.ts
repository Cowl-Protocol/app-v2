/**
 * Public surface of the shielded feature.
 *
 * Other features import this file and nothing deeper. Everything not exported
 * here is free to move, rename, or disappear without touching another feature.
 *
 * The spend surfaces live here because this feature is where spending will be
 * wired: it is one of the two permitted key consumers, and a send flow that
 * grew up in `portfolio` would have to either move house later or drag key
 * material somewhere the boundary rules exist to keep it out of.
 */
export { SendOverlay, type SendStage } from "./components/send-overlay";
export { SwapOverlay } from "./components/swap-overlay";
