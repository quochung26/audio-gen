import { Link, useNavigate, useParams } from "react-router";
import { mediaUrl, useApi } from "@/lib/api";
import { Badge, Section, STATUS_TONE } from "@/components/ui";
import { ActionButton, Form, Loading } from "@/components/Form";
import { TagPicker } from "@/components/TagPicker";

interface World {
  setting: string;
  tone: string;
  rules: string[];
  constraints: string[];
  glossary: Array<{ term: string; meaning: string }>;
}
interface Ep {
  id: string;
  number: number;
  title: string;
  status: string;
  wordCount: number | null;
  durationMs: number | null;
  _count: { chapters: number; blocks: number };
  exports: Array<{ id: string }>;
}
interface Char {
  id: string;
  name: string;
  role: string | null;
  description: string | null;
  isNarrator: boolean;
  voiceHint: string | null;
  voice: { name: string } | null;
}
interface Batch {
  id: string;
  status: string;
  currentEpisodeId: string | null;
  error: string | null;
}
interface Data {
  id: string;
  title: string;
  description: string | null;
  genre: string;
  tags: string[];
  language: string;
  kind: string;
  arcSummary: string | null;
  arcThroughEpisode: number | null;
  coverUrl: string | null;
  world: World;
  characters: Char[];
  episodes: Ep[];
  batchRuns: Batch[];
}

function formatDuration(ms: number): string {
  const t = Math.round(ms / 1000);
  return `${Math.floor(t / 60)}:${String(t % 60).padStart(2, "0")}`;
}

export function Series() {
  const nav = useNavigate();
  const { id } = useParams();
  const { data: s, isLoading } = useApi<Data>(`/api/series/${id}`, { refetchMs: 5000 });
  const { data: catalog } = useApi<{ genres: Array<{ name: string; enabled: boolean }> }>(
    "/api/genres",
  );
  if (isLoading || !s) return <Loading />;

  const run = s.batchRuns[0];
  const active = run && (run.status === "RUNNING" || run.status === "WAITING_REVIEW") ? run : null;
  const waiting = active?.currentEpisodeId
    ? s.episodes.find((e) => e.id === active.currentEpisodeId)
    : undefined;

  // Count from real data rather than Episode.status: status drifts when you click
  // things by hand mid-run, whereas "how many blocks" is always true.
  const written = s.episodes.filter((e) => e._count.chapters > 0).length;
  const scripted = s.episodes.filter((e) => e._count.blocks > 0).length;
  const exported = s.episodes.filter((e) => e.exports.length > 0).length;
  const worldThin = s.world.rules.length === 0 && !s.world.tone.trim();

  return (
    <div className="space-y-8">
      <div>
        <div className="flex items-center gap-3">
          <h1 className="text-xl font-semibold">{s.title}</h1>
          <Badge>{s.kind === "SHORT" ? "short story" : "long story"}</Badge>
          <Badge>{s.genre}</Badge>
          {s.tags.map((t) => (
            <Badge key={t} tone="blue">
              {t}
            </Badge>
          ))}
          {/* Always shown: language decides what the model writes and which voices can read it. */}
          <Badge tone={s.language === "en" ? "blue" : "neutral"}>
            {s.language === "en" ? "English" : "Vietnamese"}
          </Badge>
        </div>
        {s.description && <p className="mt-2 text-sm text-neutral-400">{s.description}</p>}
      </div>

      <Section title="Cover art">
        <div className="flex flex-wrap items-start gap-4 rounded border border-neutral-800 p-4">
          {s.coverUrl ? (
            <img
              src={mediaUrl(s.coverUrl)}
              alt=""
              className="size-32 shrink-0 rounded object-cover"
            />
          ) : (
            <div className="flex size-32 shrink-0 items-center justify-center rounded border border-dashed border-neutral-700 text-xs text-neutral-600">
              none
            </div>
          )}

          <div className="min-w-60 flex-1 space-y-3">
            <p className="text-xs text-neutral-500">
              Shown on the player and in the podcast feed. Apple Podcasts requires{" "}
              <strong className="text-neutral-400">square JPEG/PNG, at least 1400×1400</strong> —
              anything smaller still uploads, but the feed gets rejected.
            </p>
            <Form path={`/api/series/${s.id}/cover`} method="PUT" submit="Upload">
              <input
                type="file"
                name="file"
                accept="image/*"
                className="w-full rounded border border-neutral-700 bg-neutral-900 p-2 text-sm file:mr-3 file:rounded file:border-0 file:bg-neutral-800 file:px-2 file:py-1 file:text-neutral-200"
              />
            </Form>
            {s.coverUrl && (
              <ActionButton path={`/api/series/${s.id}/cover`} method="DELETE">
                remove cover
              </ActionButton>
            )}
          </div>
        </div>
      </Section>

      <Section
        title="World setup"
        action={
          <Link to={`/series/${s.id}/bible`} className="text-xs text-neutral-400 underline">
            edit
          </Link>
        }
      >
        <div className="space-y-2 rounded border border-neutral-800 p-4 text-sm">
          <p className="text-neutral-400">{s.world.setting || "no setting yet"}</p>
          <p className="text-xs text-neutral-600">
            {s.world.rules.length} world rules · {s.world.constraints.length} forbidden ·{" "}
            {s.world.glossary.length} glossary terms
          </p>
          {worldThin && s.kind === "LONG" && (
            <p className="text-xs text-amber-600">
              A long story with no world rules or tone — later episodes drift away from the first.
            </p>
          )}
        </div>
      </Section>

      <Section
        title={`Characters (${s.characters.length})`}
        action={
          <Link to={`/series/${s.id}/characters`} className="text-xs text-neutral-400 underline">
            edit
          </Link>
        }
      >
        <div className="grid gap-2 sm:grid-cols-2">
          {s.characters.map((c) => (
            <div key={c.id} className="rounded border border-neutral-800 p-3">
              <div className="flex items-center gap-2">
                <span className="font-medium">{c.name}</span>
                {c.isNarrator && <Badge tone="blue">narrator</Badge>}
              </div>
              <p className="mt-1 text-xs text-neutral-500">{c.role}</p>
              {c.description && (
                <p className="mt-1.5 text-xs leading-relaxed text-neutral-400">{c.description}</p>
              )}
              <p className="mt-2 text-xs text-neutral-600">
                voice hint: {c.voiceHint ?? "—"}
                <br />
                cast: {c.voice?.name ?? <span className="text-amber-500">not yet</span>}
                {!c.description && (
                  <>
                    <br />
                    <span className="text-amber-600">no personality described</span>
                  </>
                )}
              </p>
            </div>
          ))}
        </div>
      </Section>

      <Section
        title="Story facts"
        action={
          <Link to={`/series/${s.id}/facts`} className="text-xs text-neutral-400 underline">
            xem
          </Link>
        }
      >
        <p className="rounded border border-neutral-800 p-4 text-xs text-neutral-500">
          Facts carry their own vectors and are retrieved per scene beat.
        </p>
      </Section>

      {(s.arcSummary || s.episodes.length > 6) && (
        <Section title="The story so far">
          <Form path={`/api/series/${s.id}/arc-summary`} method="PUT" submit="Save" className="space-y-2">
            <textarea
              name="arcSummary"
              rows={5}
              defaultValue={s.arcSummary ?? ""}
              placeholder="Generated once the story is long enough — compresses older episodes so context stops growing with the episode count."
              className="w-full rounded border border-neutral-800 bg-neutral-900 p-3 text-sm leading-relaxed outline-none placeholder:text-neutral-700 focus:border-neutral-600"
            />
            <span className="text-xs text-neutral-600">
              {s.arcThroughEpisode
                ? `Compressed through episode ${s.arcThroughEpisode}. Later episodes keep their summaries verbatim.`
                : "Not compressed yet — per-episode summaries are still loaded in full."}
            </span>
          </Form>
        </Section>
      )}

      <Section title="Batch run">
        {active ? (
          <div className="space-y-3 rounded border border-blue-900 bg-blue-950/30 p-4">
            <div className="flex flex-wrap items-center gap-2 text-sm">
              <Badge tone={active.status === "WAITING_REVIEW" ? "amber" : "blue"}>
                {active.status === "WAITING_REVIEW" ? "awaiting review" : "running"}
              </Badge>
              <span className="text-neutral-300">
                {written}/{s.episodes.length} episodes written · {scripted} scripted · {exported} with MP3
              </span>
            </div>

            {active.status === "WAITING_REVIEW" && waiting ? (
              <p className="text-sm text-amber-200">
                Stopped at episode {waiting.number}: {waiting.title}. The draft needs a human before
                audio —{" "}
                <Link to={`/episode/${waiting.id}`} className="underline">
                  open the episode to read and approve
                </Link>
. Once approved the run continues on its own.
              </p>
            ) : (
              <p className="text-xs text-neutral-400">
                Running in the worker — closing this tab changes nothing.
              </p>
            )}

            <ActionButton path={`/api/series/${s.id}/batch/${active.id}`} method="DELETE">
              stop the run
            </ActionButton>
          </div>
        ) : (
          <Form
            path={`/api/series/${s.id}/batch`}
            submit="Start"
            className="space-y-3 rounded border border-neutral-800 p-4"
          >
            <p className="text-sm text-neutral-400">
              Takes each episode through the whole chain: write scenes → approve → audio script →
              summarise → speak → mix MP3. One episode at a time, because each needs the summary and
              facts of the one before.
            </p>
            <p className="text-xs text-neutral-600">
              {written}/{s.episodes.length} episodes written · {scripted} scripted · {exported}
              with MP3. Anything already done is skipped.
            </p>

            <label className="flex items-start gap-2 text-sm">
              <input type="checkbox" name="withAudio" defaultChecked className="mt-1" />
              <span>
                Also run TTS and mix the MP3
                <span className="block text-xs text-neutral-600">
                  Uncheck to stop once the audio script exists.
                </span>
              </span>
            </label>

            <label className="flex items-start gap-2 text-sm">
              <input type="checkbox" name="autoApprove" className="mt-1" />
              <span>
                Auto-approve drafts
                <span className="block text-xs text-amber-600/80">
                  Skips the one gate stopping raw drafts. Only while experimenting.
                </span>
              </span>
            </label>
          </Form>
        )}

        {run && !active && run.status === "FAILED" && (
          <p className="mt-3 rounded border border-red-900 bg-red-950/40 p-3 text-sm text-red-200">
            The previous run failed: {run.error}
          </p>
        )}
      </Section>

      <Section title="Sub-genres">
        <Form
          path={`/api/series/${s.id}/tags`}
          method="PUT"
          submit="Save"
          className="rounded border border-neutral-800 p-4"
        >
          <TagPicker
            genres={(catalog?.genres ?? []).filter((g) => g.enabled).map((g) => g.name)}
            initial={s.tags}
          />
          <p className="mt-2 text-xs text-neutral-600">
            Click to add or remove. The AI reads them while writing, and they become RSS keywords.
            The <strong className="text-neutral-400">main</strong> genre ({s.genre}) is what decides
            which prompt runs — changing things here does not touch it.
          </p>
        </Form>
      </Section>

      <Section
        title={`Episodes (${s.episodes.length})`}
        action={
          <ActionButton
            path={`/api/series/${s.id}/episodes`}
            variant="default"
            onDone={(r) => {
              const jobId = (r as { jobId?: string }).jobId;
              if (jobId) nav(`/job/${jobId}`);
            }}
          >
            New episode
          </ActionButton>
        }
      >
        <div className="divide-y divide-neutral-900 rounded border border-neutral-800">
          {s.episodes.map((ep) => (
            <Link
              key={ep.id}
              to={`/episode/${ep.id}`}
              className="flex items-center justify-between px-4 py-3 hover:bg-neutral-900"
            >
              <div>
                <span className="text-sm text-neutral-500">Episode {ep.number}</span>
                <span className="ml-3 text-sm">{ep.title}</span>
              </div>
              <div className="flex items-center gap-3 text-xs text-neutral-500">
                {ep.wordCount ? <span>{ep.wordCount} words</span> : null}
                {ep.durationMs ? <span>~{formatDuration(ep.durationMs)}</span> : null}
                <Badge tone={STATUS_TONE[ep.status]}>{ep.status}</Badge>
              </div>
            </Link>
          ))}
        </div>
      </Section>

      {/* At the bottom, away from the run buttons: deleting a whole story is rare
          and cannot be undone, so putting it near daily buttons invites mistakes. */}
      <Section title="Danger zone">
        <div className="flex flex-wrap items-center gap-3 rounded border border-red-950 bg-red-950/20 p-4">
          <ActionButton
            path={`/api/series/${s.id}`}
            method="DELETE"
            confirmText={`Delete "${s.title}" with its ${s.episodes.length} episodes, every draft, character and rendered audio? This cannot be undone.`}
            onDone={() => nav("/series")}
          >
            Delete the whole story
          </ActionButton>
          <span className="text-xs text-neutral-500">
            Also deletes episodes, scenes, characters, facts and any audio files only this story
            uses. Published episodes must be unpublished first.
          </span>
        </div>
      </Section>
    </div>
  );
}
