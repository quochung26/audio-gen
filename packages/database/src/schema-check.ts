import { readFileSync } from "node:fs";
import { resolve } from "node:path";

/** The model names declared in schema.prisma. */
function declaredModels(schemaText: string): string[] {
  return [...schemaText.matchAll(/^model\s+(\w+)\s*\{/gm)].map((m) => m[1]!);
}

/**
 * A schema model name (`AudioTrack`) into the client's property name
 * (`prisma.audioTrack`) — Prisma lowercases only the FIRST letter, leaving the rest.
 */
export function accessorName(model: string): string {
  return model.charAt(0).toLowerCase() + model.slice(1);
}

/**
 * A reminder naming the exact command to run, or null if the client still matches.
 *
 * `generated` is the model names the client was built with. A model in the schema
 * but missing there means `prisma generate` has not been rerun since the schema
 * changed: at run time `prisma.genre` is undefined and Node reports "Cannot read
 * properties of undefined (reading 'findMany')" — a sentence that mentions neither
 * Prisma, nor the schema, nor the command to run, and repeats on EVERY request.
 */
export function staleClientMessage(
  schemaText: string,
  generated: readonly string[],
): string | null {
  const missing = declaredModels(schemaText).filter((name) => !generated.includes(name));
  if (missing.length === 0) return null;
  return (
    `The Prisma client is older than the schema — missing model ${missing.join(", ")}. ` +
    "Run `pnpm db:generate`, then `pnpm db:push` if the DB lacks the tables."
  );
}

/**
 * The path to schema.prisma, or null when it cannot be determined.
 *
 * A bundler packing this module strips `import.meta.dirname` — Next building the
 * Player app is one such case. The path is computed here rather than at module
 * scope: `resolve(undefined, …)` throws at import and breaks the whole build, while
 * the only thing lost without a schema is this check.
 */
function schemaPath(): string | null {
  const dir = import.meta.dirname;
  return dir ? resolve(dir, "../prisma/schema.prisma") : null;
}

/**
 * Throw with the exact command to run when the generated client is older than the schema.
 *
 * Called as the client is built in client.ts, so every process running FROM SOURCE
 * is covered: the API, the worker, and the `pnpm story` / `inspect` / `db:seed`
 * scripts. Failing at import with instructions beats running fine and dying on the
 * first request that touches the new model. (The Player app runs from a bundled Next
 * build, so it cannot be checked — see schemaPath.)
 *
 * Asks the thing the code actually calls at run time (`prisma.genre`) rather than
 * `Prisma.dmmf`: dmmf is a different structure, and matching the schema while the
 * accessor is still missing can happen — which is exactly what this guard is for.
 */
export function checkPrismaClient(client: object): void {
  const path = schemaPath();
  if (!path) return;

  let schema: string;
  try {
    schema = readFileSync(path, "utf8");
  } catch {
    // Cannot read the schema (running from a bundle, with no source), so it cannot
    // be checked. Skip quietly rather than blocking startup.
    return;
  }

  const generated = declaredModels(schema).filter((name) => accessorName(name) in client);
  const message = staleClientMessage(schema, generated);
  if (message) throw new Error(message);
}
