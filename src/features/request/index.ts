/**
 * Public surface of the request feature.
 *
 * Other features import this file and nothing deeper. Everything not exported
 * here is free to move, rename, or disappear without touching another feature.
 *
 * Only the container is exported. It reads the session's own address and the
 * network in force for itself, so the home screen renders one element and knows
 * nothing about addresses, links or which chain they name.
 */
export { ReceiveCard } from "./components/receive-card";
