/**
 * Turn a connection failure into a sentence a person can act on.
 *
 * Node's `fetch` returns the single string "fetch failed" for every network
 * error and buries the real cause in `cause` — exactly when the user most needs
 * to know: is the service down, or is the address wrong?
 */
export function describeConnectError(err: unknown, timeoutMs: number): string {
  const e = err as Error & { cause?: { code?: string; message?: string } };
  if (e.name === "TimeoutError") return `No answer within ${timeoutMs / 1000}s`;

  const code = e.cause?.code;
  if (code === "ECONNREFUSED") return "Nothing is listening at this address — is the service running?";
  if (code === "ENOTFOUND") return "Could not resolve the host in the configured address";
  if (code === "ECONNRESET") return "The connection dropped mid-request";
  if (code) return `${e.message} (${code})`;

  // No error code — but `cause` often still says something ("bad port" when the
  // port is on undici's blocked list). Use it rather than returning "fetch
  // failed", which points at nothing.
  const causeMessage = e.cause?.message?.trim();
  return causeMessage ? `${e.message}: ${causeMessage}` : e.message;
}
