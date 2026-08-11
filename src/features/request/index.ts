/**
 * Public surface of the request feature.
 *
 * Other features import this file and nothing deeper. Everything not exported
 * here is free to move, rename, or disappear without touching another feature.
 *
 * Only the container is exported. The panels beneath it take an address
 * sequence, a gather quote and a network, and a neighbour that had to assemble
 * those would be holding this feature's internals in its hands. The home screen
 * renders one element and knows nothing about rotation.
 */
export { ReceiveCard } from "./components/receive-card";
