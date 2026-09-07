import { join } from "node:path";
import { Hono } from "hono";
import { AudioTrackKind, LicenseType, prisma } from "@audio/database";
import { ffprobe } from "@audio/audio";
import { loadEnv } from "@audio/config";
import { putLocal, safeFileName, storageRoot } from "../lib/storage";
import { field, UserError } from "../lib/http";

export const tracks = new Hono();

tracks.get("/", async (c) => {
  const rows = await prisma.audioTrack.findMany({
    orderBy: [{ kind: "asc" }, { createdAt: "desc" }],
    include: { _count: { select: { episodesAsBgm: true } } },
  });
  return c.json({ tracks: rows, storageDriver: loadEnv().STORAGE_DRIVER });
});

/**
 * Add background music or an effect to the library.
 *
 * Two ways in, because the storage drivers differ: with `local` you upload and
 * the API writes into the store; with `r2` there are no credentials, so you
 * paste a public URL.
 *
 * `licenseType` may be UNKNOWN — not blocked here, blocked at publish instead.
 * Blocking early would stop you auditioning a track before chasing its licence;
 * blocking late means no episode gets out with music of unclear provenance.
 */
tracks.post("/", async (c) => {
  const body = await c.req.parseBody();
  const title = field(body, "title");
  const kind = field(body, "kind") as AudioTrackKind;
  const licenseType = (field(body, "licenseType") || "UNKNOWN") as LicenseType;

  if (!title) throw new UserError("Missing track title");
  if (!Object.values(AudioTrackKind).includes(kind)) throw new UserError("Invalid track kind");
  if (!Object.values(LicenseType).includes(licenseType)) throw new UserError("Invalid licence");

  // The `url` column holds a storage KEY for uploads, or a public URL when
  // pasted — the two are distinguishable because a key never starts with "http".
  const file = body.file;
  const pastedUrl = field(body, "url");
  let url: string;
  let localFile: string | null = null;

  if (file instanceof File && file.size > 0) {
    const bytes = Buffer.from(await file.arrayBuffer());
    try {
      url = await putLocal(`library/${kind.toLowerCase()}/${safeFileName(file.name)}`, bytes);
    } catch (err) {
      throw new UserError((err as Error).message);
    }
    localFile = join(storageRoot(), url);
  } else if (pastedUrl) {
    url = pastedUrl;
  } else {
    throw new UserError("Choose a file to upload, or paste a URL");
  }

  // The real duration matters: Studio uses it to say how many times the music
  // will loop. ffprobe can only read local files, so a remote URL gets 0.
  const durationMs = localFile ? (await ffprobe(localFile)).durationMs : 0;

  await prisma.audioTrack.create({
    data: {
      title,
      kind,
      url,
      durationMs,
      mood: field(body, "mood") || null,
      tags: field(body, "tags")
        .split(",")
        .map((t) => t.trim())
        .filter(Boolean),
      licenseType,
      licenseNote: field(body, "licenseNote") || null,
      attribution: field(body, "attribution") || null,
    },
  });
  return c.json({ ok: `Added "${title}"` });
});

/**
 * Remove a track from the library.
 *
 * The file on disk STAYS — a published episode may already carry this music, and
 * deleting the source would make that episode unrebuildable.
 */
tracks.delete("/:id", async (c) => {
  const id = c.req.param("id");
  const used = await prisma.episode.count({ where: { bgmTrackId: id } });
  if (used > 0) {
    throw new UserError(`${used} episodes still use this track. Remove it from them first.`);
  }
  await prisma.audioTrack.delete({ where: { id } });
  return c.json({ ok: true });
});
