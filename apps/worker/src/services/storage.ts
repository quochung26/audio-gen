import { mkdir, writeFile } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import { loadEnv } from "@audio/config";
import { logger } from "../lib/logger";

export interface StoredFile {
  /**
   * The key in the store, e.g. "series/abc/blocks/003.wav".
   *
   * THIS is what goes in the DB, not `url`. See `StorageDriver.resolve`.
   */
  key: string;
  /** A directly readable URL — for logging and returning to the caller only, never stored. */
  url: string;
  sizeBytes: number;
}

export interface StorageDriver {
  readonly name: string;
  put(key: string, data: Buffer, contentType: string): Promise<StoredFile>;
  publicUrl(key: string): string;
  /**
   * Turn what the DB holds into a readable path or URL.
   *
   * Accepts three forms:
   * - a store key → resolved against the current storage root
   * - `http(s)://…` → an external source, returned as is (pasted music URLs, or R2)
   * - `file:///…` → old data from before keys were stored, path returned as is
   */
  resolve(ref: string): string;
}

/** External sources pass through; only keys need resolving against the store root. */
function isAbsoluteRef(ref: string): boolean {
  return ref.startsWith("http://") || ref.startsWith("https://") || ref.startsWith("file://");
}

/**
 * The local driver — writes to disk.
 *
 * Exported so tests can build each driver directly: `getStorage()` caches one instance
 * per env, so both drivers cannot be exercised in one process. Used while building the
 * app and while testing, so running the pipeline does not require an R2 account.
 */
export class LocalDriver implements StorageDriver {
  readonly name = "local";
  #root: string;

  constructor(dir: string) {
    this.#root = resolve(process.cwd(), dir);
  }

  async put(key: string, data: Buffer): Promise<StoredFile> {
    const path = join(this.#root, key);
    await mkdir(dirname(path), { recursive: true });
    await writeFile(path, data);
    return { key, url: `file://${path}`, sizeBytes: data.byteLength };
  }

  publicUrl(key: string): string {
    return `file://${join(this.#root, key)}`;
  }

  resolve(ref: string): string {
    if (ref.startsWith("file://")) return ref.slice("file://".length);
    if (isAbsoluteRef(ref)) return ref;
    return join(this.#root, ref);
  }
}

/**
 * The R2 driver. Install @aws-sdk/client-s3 when it is first used for real (Phase 3) —
 * Phase 1 only needs the interface's shape.
 */
export class R2Driver implements StorageDriver {
  readonly name = "r2";
  #publicUrl: string;

  constructor(publicUrl: string) {
    // `/+` rather than `/`: an extra slash typed into R2_PUBLIC_URL would give a broken URL.
    this.#publicUrl = publicUrl.replace(/\/+$/, "");
  }

  async put(): Promise<StoredFile> {
    throw new Error(
      "The R2 driver is not installed. Add @aws-sdk/client-s3 in Phase 3, " +
        "or set STORAGE_DRIVER=local to run locally.",
    );
  }

  publicUrl(key: string): string {
    return `${this.#publicUrl}/${key}`;
  }

  resolve(ref: string): string {
    if (ref.startsWith("file://")) return ref.slice("file://".length);
    if (isAbsoluteRef(ref)) return ref;
    return this.publicUrl(ref);
  }
}

let driver: StorageDriver | undefined;

export function getStorage(): StorageDriver {
  if (driver) return driver;
  const env = loadEnv();
  driver =
    env.STORAGE_DRIVER === "r2"
      ? new R2Driver(env.R2_PUBLIC_URL)
      : new LocalDriver(env.STORAGE_LOCAL_DIR);
  logger.debug(`[storage] using the "${driver.name}" driver`);
  return driver;
}
