import { Link, useNavigate, useParams } from "react-router";
import { mediaUrl, useApi } from "@/lib/api";
import { Badge, Section, STATUS_TONE } from "@/components/ui";
import { ActionButton, Form, Loading } from "@/components/Form";
import { TagPicker } from "@/components/TagPicker";
import { ModelPicker } from "@/components/ModelPicker";

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
  /** Which kind of turn it closes on. Null = outlined before the label existed. */
  hookType: string | null;
  status: string;
  /** Whether a person has read the draft and approved it. The one gate the machine cannot pass. */
  humanReviewed: boolean;
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
  /** Where they are NOW — rewritten by SUMMARIZE after each episode. */
  state: string | null;
  stateThroughEpisode: number | null;
  isNarrator: boolean;
  voiceHint: string | null;
  voice: { name: string } | null;
}
interface Batch {
  id: string;
  status: string;
  currentEpisodeId: string | null;
  /** The ceiling this run was started with, in USD. Null = it was started without one. */
  budgetUsd: number | null;
  /** What the gateway has charged since the run started, as far as it reported. */
  spentUsd: number;
  error: string | null;
}
interface EndingState {
  verdict:
    | { kind: "empty" }
    | { kind: "open" }
    | { kind: "closing"; blocking: string[] }
    | { kind: "finished"; warnings: string[] };
  wouldBlock: string[];
  facts: { episodes: number; unapproved: number; unwritten: number; openThreads: number };
}

interface Data {
  id: string;
  title: string;
  description: string | null;
  genre: string;
  tags: string[];
  language: string;
  model: string;
  coverUrl: string | null;
  world: World;
  characters: Char[];
  episodes: Ep[];
  batchRuns: Batch[];
  /** The episode this story starts closing from. Null = nobody has said it is closing. */
  finaleFrom: number | null;
  /** Whether it can be finished, and what is in the way. */
  ending?: EndingState;
}

function formatDuration(ms: number): string {
  const t = Math.round(ms / 1000);
  return `${Math.floor(t / 60)}:${String(t % 60).padStart(2, "0")}`;
}

export function Series() {
  const nav = useNavigate();
  const { id } = useParams();
  const { data: s, isLoading, error } = useApi<Data>(`/api/series/${id}`, { refetchMs: 5000 });
  const { data: catalog } = useApi<{ genres: Array<{ name: string; enabled: boolean }> }>(
    "/api/genres",
  );
  if (isLoading || !s) return <Loading error={error} />;

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

      {/* Ordered by how often a person opens this page for it, not by what a story
          has. The episode list is the only way in to the work and used to sit ninth
          of eleven, under the cover-art upload and a wall of sub-genre chips — so
          opening the episode you are writing meant scrolling past every setting you
          set once, on every visit. Settings keep their place, at the end. */}
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
                {/* Listed down the page, a run of the same kind is visible as a run.
                    That is the whole reason the label exists — five hooks written as
                    five sentences cannot be compared without reading all five. */}
                {/* Where the pipeline is STOPPED, when it is stopped on a person.
                    The row said what an episode had — words, a length, a status — and
                    never what it was waiting for, so "which one needs me" meant opening
                    them one at a time. Only the two states that are facts here: a
                    machine step in flight says so on its own page, and how many scenes
                    are left is not in anything this row is given. */}
                {ep._count.chapters === 0 ? (
                  <span className="rounded bg-neutral-800 px-1.5 py-0.5 text-neutral-300">
                    no chapters yet
                  </span>
                ) : ep.status === "DRAFTED" && !ep.humanReviewed ? (
                  <span className="rounded bg-amber-900/60 px-1.5 py-0.5 text-amber-200">
                    waiting on your read
                  </span>
                ) : null}
                {ep.hookType ? <span className="text-neutral-600">ends on {ep.hookType}</span> : null}
                {ep.wordCount ? <span>{ep.wordCount} words</span> : null}
                {ep.durationMs ? <span>~{formatDuration(ep.durationMs)}</span> : null}
                <Badge tone={STATUS_TONE[ep.status]}>{ep.status}</Badge>
              </div>
            </Link>
          ))}
        </div>
      </Section>

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
              {/* Only for a run that asked to be watched. Without a ceiling the figure
                  would be a number nobody set and nobody can act on. */}
              {active.budgetUsd !== null && (
                <span className="text-neutral-400">
                  ${active.spentUsd.toFixed(2)} of ${active.budgetUsd.toFixed(2)}
                </span>
              )}
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

            <label className="block text-sm">
              <span className="mb-1 block text-neutral-400">
                Stop after spending <span className="text-neutral-600">— optional, USD</span>
              </span>
              <input
                type="text"
                name="budgetUsd"
                inputMode="decimal"
                placeholder="blank = no ceiling"
                className="w-48 rounded border border-neutral-700 bg-neutral-900 p-2 text-sm"
              />
              <span className="mt-1 block text-xs text-neutral-600">
                Checked between steps, so a run can end a little over: a call already made is
                paid for either way. Only counts what the gateway reports — a local model
                reports nothing, and the run will say so rather than look thrifty.
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
        {/* A run stopped at its ceiling is CANCELLED with a reason, not FAILED — nothing
            went wrong, it did what it was told. Shown in amber for the same reason. */}
        {run && !active && run.status === "CANCELLED" && run.error && (
          <p className="mt-3 rounded border border-amber-900 bg-amber-950/30 p-3 text-sm text-amber-200">
            {run.error}
          </p>
        )}
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
          {/* No longer gated on the story being "long": every story is written episode by
              episode, so any of them can drift. It was gated on a flag that was always
              SHORT, so the warning never appeared at all. */}
          {worldThin && (
            <p className="text-xs text-amber-600">
              No world rules or tone — later episodes drift away from the first.
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

              {/* Where they are NOW, as opposed to who they are. Written by SUMMARIZE
                  after every episode and read back into the Story Bible on every scene
                  write, so it is the field most likely to be quietly wrong — and it was
                  only visible on the Characters page, two clicks from the cast list
                  anyone actually looks at. */}
              {c.state && (
                <div className="mt-2 rounded border border-neutral-800/80 bg-neutral-900/50 p-2">
                  <span className="text-xs text-neutral-500">
                    Current state
                    {c.stateThroughEpisode ? ` — through episode ${c.stateThroughEpisode}` : ""}
                  </span>
                  <p className="mt-0.5 text-xs leading-relaxed text-neutral-400">{c.state}</p>
                </div>
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

      <EndingPanel series={s} />

      <StylePanel seriesId={s.id} />

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

      <Section title="Model">
        <Form
          path={`/api/series/${s.id}/model`}
          method="PUT"
          submit="Save"
          className="rounded border border-neutral-800 p-4"
        >
          <ModelPicker current={s.model} />
        </Form>
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
            exclude={s.genre}
          />
          <p className="mt-2 text-xs text-neutral-600">
            Click to add or remove. The AI reads them while writing, and they become RSS keywords.
            The <strong className="text-neutral-400">main</strong> genre ({s.genre}) is what decides
            which prompt runs; it is not on the list, and nothing here touches it.
          </p>
        </Form>
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

interface StyleStats {
  scenes: number;
  sentences: { median: number; mean: number; shortRatio: number; longRatio: number };
  phrases: Array<{ text: string; count: number; scenes: number }>;
  repeated: Array<{ text: string; count: number; scenes: number }>;
  opening: { word: string; scenes: number } | null;
  ending: { medianWords: number; shortRatio: number };
}

/**
 * What the prose has been doing, as numbers.
 *
 * The same window the model is handed before it writes, shown so the person deciding
 * whether to change the prompt is looking at the same evidence. No verdicts here either:
 * whether "couldn't help but" seventeen times is a tic or a voice is the writer's call.
 */
function StylePanel({ seriesId }: { seriesId: string }) {
  const { data } = useApi<{ stats: StyleStats | null; minScenes: number }>(
    `/api/series/${seriesId}/style`,
  );
  if (!data) return null;
  const pct = (n: number) => `${Math.round(n * 100)}%`;

  return (
    <Section title="What the prose has been doing">
      {!data.stats ? (
        <p className="rounded border border-neutral-800 p-4 text-xs text-neutral-500">
          Under {data.minScenes} written scenes there is nothing to count: a phrase appearing
          twice is a coincidence, and a median sentence length describes one scene.
        </p>
      ) : (
        <div className="space-y-3 rounded border border-neutral-800 p-4 text-xs text-neutral-400">
          <p>
            Across the last <strong className="text-neutral-200">{data.stats.scenes}</strong>{" "}
            scenes: sentences run {data.stats.sentences.median} words in the middle,{" "}
            {pct(data.stats.sentences.shortRatio)} under 8 and {pct(data.stats.sentences.longRatio)}{" "}
            over 25. Scenes end on {data.stats.ending.medianWords} words,{" "}
            {pct(data.stats.ending.shortRatio)} of them short.
            {data.stats.opening
              ? ` ${data.stats.opening.scenes} of them open on “${data.stats.opening.word}”.`
              : ""}
          </p>
          {data.stats.phrases.length > 0 && (
            <div>
              <span className="text-neutral-500">Phrases it keeps reaching for</span>
              <div className="mt-1 flex flex-wrap gap-2">
                {data.stats.phrases.map((p) => (
                  <span key={p.text} className="rounded bg-neutral-800 px-2 py-0.5">
                    {p.text} <span className="text-neutral-500">×{p.count}</span>
                  </span>
                ))}
              </div>
            </div>
          )}
          {data.stats.repeated.length > 0 && (
            <div>
              <span className="text-neutral-500">Whole sentences reused across scenes</span>
              <ul className="mt-1 space-y-1">
                {data.stats.repeated.map((r) => (
                  <li key={r.text} className="text-amber-300/80">
                    “{r.text.slice(0, 90)}
                    {r.text.length > 90 ? "…" : ""}” ×{r.count}
                  </li>
                ))}
              </ul>
            </div>
          )}
          <p className="text-neutral-600">
            The same numbers go into the prompt before each scene is written.
          </p>
        </div>
      )}
    </Section>
  );
}

/**
 * Declaring that a story is closing.
 *
 * The only part of finishing a story a machine cannot do, and the reason `COMPLETED`
 * never got set: the next episode is always one button away, so "there will be no more"
 * is a decision rather than a fact anything can read off the data.
 *
 * Withdrawing opens the story again. There is no separate reopen — the state is derived
 * from the declaration plus the episodes, which is what keeps the two in step.
 */
function EndingPanel({ series }: { series: Data }) {
  // Absent while an older API is still answering. One section must not take the page
  // down — the same rule every advisory panel here follows.
  if (!series.ending) return null;
  const { verdict, wouldBlock, facts } = series.ending;
  if (verdict.kind === "empty") return null;

  return (
    <Section title="Ending">
      <div className="space-y-3 rounded border border-neutral-800 p-4 text-sm">
        {verdict.kind === "open" ? (
          <>
            <p className="text-neutral-400">
              Nobody has said this story is closing, so it is not finished — and it cannot be.
              The next episode is always one button away, so “there will be no more” is
              something only you can say.
            </p>
            {wouldBlock.length > 0 && (
              <p className="text-xs text-amber-300">
                If you declared it today it would not finish yet: {wouldBlock.join("; ")}.
              </p>
            )}
            <Form
              path={`/api/series/${series.id}/finale`}
              method="PUT"
              submit="This story is closing"
              className="flex items-end gap-3"
            >
              <label className="text-xs text-neutral-500">
                <span className="mb-1 block">From episode</span>
                <input
                  type="text"
                  name="finaleFrom"
                  inputMode="numeric"
                  defaultValue={String(facts.episodes)}
                  className="w-24 rounded border border-neutral-700 bg-neutral-900 p-2 text-sm"
                />
              </label>
            </Form>
          </>
        ) : (
          <>
            <div className="flex flex-wrap items-center gap-3">
              <Badge tone={verdict.kind === "finished" ? "green" : "amber"}>
                {verdict.kind === "finished" ? "finished" : "closing"}
              </Badge>
              <span className="text-neutral-300">
                Closing from episode {series.finaleFrom}.
              </span>
            </div>

            {verdict.kind === "closing" && (
              <p className="text-xs text-amber-300">
                Still in the way: {verdict.blocking.join("; ")}.
              </p>
            )}

            {/* Warned about, never blocking. A person ending a story knows what they are
                leaving open, and a gate that argues with them is a gate that locks a
                finished story out of being finished. */}
            {verdict.kind === "finished" && verdict.warnings.length > 0 && (
              <p className="text-xs text-amber-300">
                {verdict.warnings.join("; ")} — ending anyway, as declared.
              </p>
            )}

            <Form
              path={`/api/series/${series.id}/finale`}
              method="PUT"
              submit="Not closing after all"
              className="pt-1"
            >
              <input type="hidden" name="finaleFrom" value="" />
            </Form>
          </>
        )}
      </div>
    </Section>
  );
}
