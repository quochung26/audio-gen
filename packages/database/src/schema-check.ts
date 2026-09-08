import { readFileSync } from "node:fs";
import { resolve } from "node:path";

/**
 * The values of each enum declared in schema.prisma.
 *
 * A value per line, skipping the `///` documentation Prisma allows between them.
 */
export function declaredEnums(schemaText: string): Record<string, string[]> {
  const out: Record<string, string[]> = {};
  for (const block of schemaText.matchAll(/^enum\s+(\w+)\s*\{([^}]*)\}/gm)) {
    out[block[1]!] = block[2]!
      .split("\n")
      .map((line) => line.trim())
      .filter((line) => /^[A-Za-z_][A-Za-z0-9_]*$/.test(line));
  }
  return out;
}

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
 * A reminder when the client knows an ENUM but not all of its values.
 *
 * Separate from the model check because adding a value changes no model, so that
 * check passes and the process starts fine. It then dies at the first request that
 * uses the new value, with "Invalid value for argument `type`. Expected JobType." —
 * halfway through a feature, as a 500, naming neither the cause nor the command.
 *
 * `pnpm db:push` rather than `db:generate`: an enum value has to exist in Postgres
 * too, and a regenerated client alone turns the error into a different one at insert
 * time. Push does both.
 */
export function staleEnumMessage(
  schemaText: string,
  generated: Record<string, Record<string, unknown>>,
): string | null {
  const missing: string[] = [];

  for (const [name, values] of Object.entries(declaredEnums(schemaText))) {
    const built = generated[name];
    // An enum absent altogether is not reported here: it means the client predates the
    // whole type, and the model check has almost certainly already said so in plainer
    // words. Reporting both only buries the useful one.
    if (!built) continue;
    for (const v of values) if (!(v in built)) missing.push(`${name}.${v}`);
  }

  if (missing.length === 0) return null;
  return (
    `The Prisma client is older than the schema — it does not know ${missing.join(", ")}. ` +
    "Run `pnpm db:push` (it adds the value to Postgres and regenerates the client)."
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
export function checkPrismaClient(
  client: object,
  enums: Record<string, Record<string, unknown>> = {},
): void {
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
  const message = staleClientMessage(schema, generated) ?? staleEnumMessage(schema, enums);
  if (message) throw new Error(message);
}
