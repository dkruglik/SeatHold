/**
 * Reads the link token from the address-bar fragment (`#t=<token>`) and removes the whole fragment from the address
 * bar at once, so it cannot be copied from the URL, restored by history, or leave in a Referer. Returns `null` when
 * there is no token. The token is not kept anywhere but in the returned value.
 */
export function takeFragmentToken(): string | null {
  const { hash, pathname, search } = window.location;
  if (hash === "") {
    return null;
  }
  const token = new URLSearchParams(hash.slice(1)).get("t");
  window.history.replaceState(null, "", `${pathname}${search}`);
  return token === null || token === "" ? null : token;
}
