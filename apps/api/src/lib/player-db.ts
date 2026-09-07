import { playerDbIsSeparate } from "@audio/database";
import { UserError } from "./http";

/**
 * Wraps every query against the HOSTED database.
 *
 * The local DB is on this machine; the hosted one is somewhere on the internet —
 * it going down, the network dropping, or a password changing will all happen.
 * Unwrapped, the Comments and Stats pages return "something unexpected went
 * wrong", the least useful message possible at the moment you most need to know.
 *
 * This is an error the USER can act on (start the DB, fix PLAYER_DATABASE_URL),
 * so it returns 400 with the reason rather than a 500 that hides it.
 */
export async function withPlayerDb<T>(fn: () => Promise<T>): Promise<T> {
  try {
    return await fn();
  } catch (err) {
    const message = describe(err);
    if (message) throw new UserError(message);
    throw err;
  }
}

/**
 * Recognise connection failures by PHRASE in Prisma's message.
 *
 * Two details verified by causing real failures (Prisma 6.19):
 * - `errorCode` is NOT set on PrismaClientInitializationError, so matching on
 *   P1001 and friends catches nothing.
 * - The real cause is at the END of the message, after a source excerpt. Taking
 *   the first line gives "Invalid `...` invocation", which says nothing.
 *
 * And never surface the message verbatim: the source excerpt inside it can
 * contain a connection string with a password.
 */
function describe(err: unknown): string | null {
  const e = err as { name?: string; message?: string };
  if (e.name !== "PrismaClientInitializationError") return null;

  const where = playerDbIsSeparate
    ? "DB hosted (PLAYER_DATABASE_URL)"
    : "the database (running on a single database)";
  const msg = e.message ?? "";

  if (msg.includes("Can't reach database server")) {
    return `Cannot reach ${where}. Is it running, and is the address right?`;
  }
  if (msg.includes("Authentication failed")) {
    return `Wrong username or password for ${where}.`;
  }
  if (msg.includes("does not exist")) {
    return `${where} does not exist. Run \`pnpm db:push:player\` to create it?`;
  }
  if (msg.includes("Timed out")) {
    return `${where} did not answer in time.`;
  }
  return `${where} is unusable. Check the API log for detail.`;
}
