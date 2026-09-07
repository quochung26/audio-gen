import { mkdir, rm, readFile } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { concatBlocks, exportMp3, mixBgm, mixSfx, normalizeLoudness, type SfxCue } from "@audio/audio";
import { EpisodeStatus, ExportType, prisma } from "@audio/database";
import type { JobHandler } from "../lanes/create-lane";
import { enqueue } from "../services/queue";
import { getStorage } from "../services/storage";
import { logger } from "../lib/logger";

/**
 * Steps 4–5 — join the blocks into an episode, normalise loudness, export MP3.
 *
 * Runs on the FFMPEG lane (CPU) with `vramMb = 0`, so it overlaps with the LLM writing
 * the next episode — see PLAN.md section 3, point 3.
 *
 * Background music is optional: an episode with a track chosen in Studio gets it mixed
 * in with ducking; one without goes straight from joined blocks to normalisation.
 */
export const mixJob: JobHandler = async ({ job, setProgress }) => {
  const episodeId = String(job.data.episodeId ?? "");
  if (!episodeId) throw new Error("episodeId is required");

  const episode = await prisma.episode.findUniqueOrThrow({
    where: { id: episodeId },
    include: {
      series: { select: { id: true, title: true } },
      bgmTrack: { select: { id: true, title: true, url: true, licenseType: true } },
      blocks: {
        orderBy: { order: "asc" },
        include: {
          audioAsset: { select: { url: true, durationMs: true } },
          sfxTrack: { select: { id: true, title: true, url: true } },
        },
      },
    },
  });

  const missing = episode.blocks.filter((b) => !b.audioAsset);
  if (episode.blocks.length === 0) throw new Error("This episode has no blocks yet");
  if (missing.length > 0) {
    throw new Error(
      `${missing.length}/${episode.blocks.length} blocks have no audio. Run the TTS job first.`,
    );
  }

  const workDir = join(tmpdir(), `audio-truyen-mix-${episodeId}`);
  await mkdir(workDir, { recursive: true });

  try {
    await setProgress(10);

    // The DB holds store keys; `storage.resolve` turns them into a local path (local
    // driver) or an http URL (R2 driver, which must be downloaded before ffmpeg reads it).
    const blockPaths = await Promise.all(
      episode.blocks.map(async (b, i) => ({
        path: await localPath(b.audioAsset!.url, workDir, `block-${String(i).padStart(4, "0")}.wav`),
        pauseAfterMs: b.pauseAfter,
      })),
    );

    await setProgress(25);

    const rawPath = join(workDir, "raw.wav");
    const { durationMs } = await concatBlocks({
      blocks: blockPaths,
      outPath: rawPath,
      workDir,
    });
    logger.info(`[mix] joined ${blockPaths.length} blocks → ${(durationMs / 1000).toFixed(1)}s`);

    await setProgress(45);

    // Effects go in BEFORE the music: ducking uses the speech track as its control
    // signal, so an effect inside that track pulls the music down too.
    let voicePath = rawPath;
    const cues = await sfxCues(episode.blocks, workDir);
    if (cues.length > 0) {
      voicePath = join(workDir, "with-sfx.wav");
      await mixSfx({ voicePath: rawPath, cues, outPath: voicePath });
      logger.info(`[mix] inserted ${cues.length} effects`);
    }

    await setProgress(50);

    // Music is mixed BEFORE normalisation, not after: loudnorm has to measure the
    // finished thing. Normalising the speech and then layering music on top pushes the
    // episode past the level it was normalised to, by exactly the music added.
    let mixedPath = voicePath;
    if (episode.bgmTrack) {
      const bgmPath = await localPath(
        episode.bgmTrack.url,
        workDir,
        `bgm${extensionOf(episode.bgmTrack.url)}`,
      );
      mixedPath = join(workDir, "with-bgm.wav");
      await mixBgm({
        voicePath,
        bgmPath,
        outPath: mixedPath,
        volume: episode.bgmVolume,
      });
      logger.info(
        `[mix] mixed in background music "${episode.bgmTrack.title}" at ${Math.round(episode.bgmVolume * 100)}%`,
      );
    }

    await setProgress(60);

    // Normalised to -16 LUFS for web. The two loudnorm passes live in normalizeLoudness.
    const normPath = join(workDir, "normalized.wav");
    await normalizeLoudness({ inPath: mixedPath, outPath: normPath, target: "web" });

    await setProgress(75);

    const mp3Path = join(workDir, "episode.mp3");
    const mp3 = await exportMp3({
      inPath: normPath,
      outPath: mp3Path,
      bitrateKbps: 160,
      title: episode.title,
      album: episode.series.title,
      artist: "Audio Truyện",
    });

    await setProgress(90);

    const storage = getStorage();
    const stored = await storage.put(
      `series/${episode.series.id}/episodes/${episode.slug}.mp3`,
      await readFile(mp3Path),
      "audio/mpeg",
    );

    // `Export` is its own table rather than a URL column on Episode — so it can hold
    // several files of one type (a TikTok cut into parts). docs/database.md section 2.8.
    await prisma.export.upsert({
      where: {
        episodeId_type_part: { episodeId, type: ExportType.AUDIO_MP3, part: 1 },
      },
      update: {
        url: stored.key,
        sizeBytes: mp3.sizeBytes,
        durationMs: mp3.durationMs,
        bitrateKbps: 160,
        sampleRate: 44100,
        lufs: -16,
        codec: "mp3",
      },
      create: {
        episodeId,
        type: ExportType.AUDIO_MP3,
        part: 1,
        partTotal: 1,
        url: stored.key,
        sizeBytes: mp3.sizeBytes,
        durationMs: mp3.durationMs,
        bitrateKbps: 160,
        sampleRate: 44100,
        lufs: -16,
        codec: "mp3",
      },
    });

    // A PUBLISHED episode keeps its status and gets re-pushed to hosted — re-exporting
    // the MP3 while live still points at the old one is drift nobody would notice.
    const wasPublished = episode.status === EpisodeStatus.PUBLISHED;

    await prisma.episode.update({
      where: { id: episodeId },
      data: {
        status: wasPublished ? EpisodeStatus.PUBLISHED : EpisodeStatus.READY,
        durationMs: mp3.durationMs,
      },
    });

    if (wasPublished) {
      await enqueue({ type: "PUBLISH", episodeId, payload: { episodeId } });
      logger.info(`[mix] episode is published — queued a re-sync job`);
    }

    await setProgress(100);
    logger.info(
      `[mix] episode ${episode.number} done: ${(mp3.durationMs / 1000 / 60).toFixed(1)} minutes, ` +
        `${(mp3.sizeBytes / 1024 / 1024).toFixed(1)} MB`,
    );

    return {
      episodeId,
      // The caller needs a path it can open right away, unlike what gets stored.
      url: stored.url,
      durationMs: mp3.durationMs,
      sizeBytes: mp3.sizeBytes,
      blocks: blockPaths.length,
    };
  } finally {
    await rm(workDir, { recursive: true, force: true }).catch(() => {});
  }
};

/**
 * The timestamp for each effect, measured from the start of the episode.
 *
 * `concatBlocks` lays out block[0], silence(pauseAfter[0]), block[1], … so block i starts
 * at the total length of the preceding blocks plus the total preceding silence. It has to
 * match the joining EXACTLY — one silence out and every effect after it lands in the
 * wrong place.
 *
 * Effects are placed at the START of a block — `sfxHint` in the script describes the
 * sound accompanying that passage, not a sound after it has been read.
 */
async function sfxCues(
  blocks: Array<{
    audioAsset: { durationMs: number } | null;
    pauseAfter: number;
    sfxTrack: { id: string; title: string; url: string } | null;
  }>,
  workDir: string,
): Promise<SfxCue[]> {
  const cues: SfxCue[] = [];
  let atMs = 0;

  for (const [i, b] of blocks.entries()) {
    if (b.sfxTrack) {
      cues.push({
        path: await localPath(
          b.sfxTrack.url,
          workDir,
          `sfx-${b.sfxTrack.id}${extensionOf(b.sfxTrack.url)}`,
        ),
        atMs,
      });
    }
    atMs += b.audioAsset?.durationMs ?? 0;
    // The silence after the LAST block is not inserted — see concatBlocks.
    if (b.pauseAfter > 0 && i < blocks.length - 1) atMs += b.pauseAfter;
  }
  return cues;
}

/** The file extension from a URL — ffmpeg guesses the format better with the right one. */
function extensionOf(url: string): string {
  const ext = /\.([a-z0-9]{2,4})(?:[?#]|$)/i.exec(url)?.[1];
  return ext ? `.${ext.toLowerCase()}` : ".mp3";
}

/** Returns a local path for ffmpeg to read, downloading first when it is an http URL. */
async function localPath(ref: string, workDir: string, filename: string): Promise<string> {
  const url = getStorage().resolve(ref);
  if (!url.startsWith("http")) return url;

  const res = await fetch(url);
  if (!res.ok) throw new Error(`Could not download ${url}: HTTP ${res.status}`);
  const dest = join(workDir, filename);
  const { writeFile } = await import("node:fs/promises");
  await writeFile(dest, Buffer.from(await res.arrayBuffer()));
  return dest;
}
