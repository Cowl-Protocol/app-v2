/**
 * Public surface of the pay feature.
 *
 * Other features and the `/pay` route import this file and nothing deeper.
 * Everything not exported here is free to move, rename, or disappear.
 *
 * Only the route component. The screen beneath it takes a request that has
 * already been resolved against this build's networks and tokens, and a caller
 * assembling one by hand would be a caller who could skip the chain check.
 */
export { PayRoute } from "./components/pay-route";
