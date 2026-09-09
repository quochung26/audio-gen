import { Link, useNavigate, useParams } from "react-router";
import { useApi } from "@/lib/api";
import { Badge, Section, STATUS_TONE } from "@/components/ui";
import { Field } from "@/components/Field";
import { ScenePeoplePicker } from "@/components/ScenePeoplePicker";
import { ActionButton, Form, Loading } from "@/components/Form";
import { ModelPicker } from "@/components/ModelPicker";
import { languageLabel } from "@/components/LanguagePicker";

/**
 * How many chapters a full-length episode comes to — 2 × 3 scenes × 750 words ≈ 28 min.
 *
 * Copied rather than imported: Studio is a standalone SPA and takes no `@audio/*`
 * dependency, so it cannot reach `chaptersInAFullEpisode` in @audio/core. It is a HINT in
 * one sentence, not a rule anything enforces — drifting from the real number costs a
 * slightly wrong hint, not a wrong episode.
 */
const CHAPTERS_IN_A_FULL_EPISODE = 2;

interface Streaming {
  sceneId: string;
  order: number;
  text: string;
}

interface CharacterOverride {
  name: string;
  outfit: string;
  note: string;
}
interface SceneSetup {
  note: string;
  characters: CharacterOverride[];
}
interface ChapterSetup {
  focus: string;
  tone: string;
  mustHappen: string[];
  constraints: string[];
  characters: CharacterOverride[];
}

interface Scene {
  id: string;
  order: number;
  beat: string;
  characterIds: string[];
  setup: SceneSetup | null;
  text: string | null;
  /** The draft before the rewrite. Null means this scene has not been through it. */
  sourceText: string | null;
}
interface Chapter {
  id: string;
  order: number;
  title: string | null;
  setup: ChapterSetup | null;
  scenes: Scene[];
}
interface Block {
  id: string;
  order: number;
  speakerLabel: string;
  characterId: string | null;
  pauseAfter: number;
  sfxHint: string | null;
  text: string;
}
interface Ep {
  id: string;
  seriesId: string;
  number: number;
  title: string;
  status: string;
  wordCount: number | null;
  durationMs: number | null;
  summary: string | null;
  humanReviewed: boolean;
  reviewedAt: string | null;
  series: {
    id: string;
    title: string;
    language: string;
    draftLanguage: string;
    characters: Array<{ id: string; name: string; isNarrator: boolean }>;
  };
  chapters: Chapter[];
  blocks: Block[];
  renderJobs: Array<{ id: string; type: string; status: string; progress: number }>;
}

/** Render character overrides back into the one-per-line form they were typed in. */
function renderOverrides(list: CharacterOverride[] | undefined): string {
  return (list ?? [])
    .map((c) => `${c.name}: ${c.outfit}${c.note ? ` | ${c.note}` : ""}`)
    .join("\n");
}

function formatDuration(ms: number): string {
  const total = Math.round(ms / 1000);
  return `${Math.floor(total / 60)}:${String(total % 60).padStart(2, "0")}`;
}

export function Episode() {
  const { id } = useParams();
  const nav = useNavigate();
  const { data: ep, isLoading, error } = useApi<Ep>(`/api/episodes/${id}`, { refetchMs: 3000 });

  const active = ep?.renderJobs.find((j) => j.status === "QUEUED" || j.status === "RUNNING");

  // Every hook must sit BEFORE the early return below, including ones only used
  // once data exists — React compares hook order between renders, and skipping
  // one takes the whole page down.
  //
  // Only ask while a job is producing text; `enabled: path !== null` in useApi
  // switches it off entirely, so an idle page makes no background requests.
  const writing = active?.type === "WRITE_SCENE" || active?.type === "TRANSLATE";
  const { data: stream } = useApi<Streaming | null>(
    writing ? `/api/episodes/${id}/stream` : null,
    // Faster than the page's 3-second beat: this is the one you watch move.
    { refetchMs: 700 },
  );

  if (isLoading || !ep) return <Loading error={error} />;

  // Count across the WHOLE EPISODE: chapters are only a grouping, and "is it
  // written" is an episode-level question — the approval gate and the audio edit
  // both work at that level.
  const scenes = ep.chapters.flatMap((ch) => ch.scenes);
  const written = scenes.filter((s) => s.text).length;
  const allWritten = written === scenes.length && scenes.length > 0;
  // When the story is written directly, `draftLanguage` is empty and the whole
  // rewrite block disappears.
  const untranslated = ep.series.draftLanguage
    ? scenes.filter((s) => s.text && !s.sourceText).length
    : 0;

  return (
    <div className="space-y-8">
      <div>
        <Link to={`/series/${ep.seriesId}`} className="text-xs text-neutral-500 underline">
          ← {ep.series.title}
        </Link>
        <div className="mt-2 flex items-center gap-3">
          <h1 className="text-xl font-semibold">
            Episode {ep.number}: {ep.title}
          </h1>
          <Badge tone={STATUS_TONE[ep.status]}>{ep.status}</Badge>
        </div>
        <p className="mt-1 text-sm text-neutral-500">
          {ep.chapters.length} chapters · {written}/{scenes.length} scenes
          {ep.wordCount ? ` · ${ep.wordCount} words` : ""}
          {ep.durationMs ? ` · ~${formatDuration(ep.durationMs)}` : ""}
        </p>
      </div>

      {active && (
        <Link
          to={`/job/${active.id}`}
          className="block rounded border border-blue-900 bg-blue-950/40 p-3 text-sm text-blue-200"
        >
          {active.type} running — {active.progress}%. Click for progress.
        </Link>
      )}

      <Section title="Chapters & scenes">
        {scenes.length > written && !active && (
          <Form
            path={`/api/episodes/${ep.id}/write-scenes`}
            submit={`Write all ${scenes.length - written} remaining scenes`}
            className="max-w-md rounded border border-neutral-800 p-4"
          >
            <ModelPicker />
            <p className="mt-2 text-xs text-neutral-600">
              One long job, and nothing is readable until it finishes. To see sooner, use{" "}
              <strong className="text-neutral-400">write this scene</strong> on each scene below —
              read scene 1 and fix its beat before spending time on scene 2.
            </p>
          </Form>
        )}

        <div className="space-y-6">
          {ep.chapters.map((chapter) => (
            <div key={chapter.id}>
              <div className="mb-2 flex flex-wrap items-baseline gap-2">
                <h2 className="text-sm font-medium text-neutral-200">
                  Chapter {chapter.order}
                  {chapter.title ? `: ${chapter.title}` : ""}
                </h2>
                <span className="text-xs text-neutral-600">
                  {chapter.scenes.filter((sc) => sc.text).length}/{chapter.scenes.length} scenes
                </span>
              </div>

              <details className="mb-3 rounded border border-neutral-800">
                <summary className="cursor-pointer px-4 py-2 text-xs text-neutral-500">
                  Chapter {chapter.order} setup — applies to every scene in it
                </summary>
                <div className="border-t border-neutral-800 px-4 py-4">
                  <p className="mb-3 text-xs text-neutral-500">
                    The middle tier: the story has{" "}
                    <strong className="text-neutral-400">World setup</strong>, a scene has a{" "}
                    <strong className="text-neutral-400">beat</strong>, and this is what is true of
                    this chapter alone. Character overrides here beat the Story Bible; overrides on
                    a scene beat these.
                  </p>
                  <Form
                    path={`/api/episodes/${ep.id}/chapters/${chapter.id}/setup`}
                    method="PUT"
                    submit="Save"
                    className="space-y-3"
                  >
                    <Field
                      name="focus"
                      label="What this chapter is driving at"
                      hint="The question it has to answer, or the feeling it has to leave behind."
                      placeholder="Sam has to choose: tell the widow the truth, or keep a promise to a dead man."
                      rows={2}
                      defaultValue={chapter.setup?.focus ?? ""}
                    />
                    <Field
                      name="tone"
                      label="Tone for this chapter"
                      hint="Overrides the story tone. Leave blank to keep it."
                      placeholder="Slower than usual. Rain throughout, almost drowning the dialogue."
                      rows={2}
                      defaultValue={chapter.setup?.tone ?? ""}
                    />
                    <Field
                      name="mustHappen"
                      label="Must happen — one per line"
                      placeholder={"Sam goes back to the Old Depot\nThe widow says a name nobody has said yet"}
                      rows={2}
                      defaultValue={(chapter.setup?.mustHappen ?? []).join("\n")}
                    />
                    <Field
                      name="constraints"
                      label="Not in this chapter — one per line"
                      placeholder="Do not let the gatekeeper appear"
                      rows={2}
                      defaultValue={(chapter.setup?.constraints ?? []).join("\n")}
                    />
                    <Field
                      name="characters"
                      label="Character overrides — one person per line"
                      hint="Form: Name: what they wear | note. Overrides the Story Bible for this chapter."
                      placeholder={"Sam: torn raincoat, rubber boots | left wrist bandaged\nThe widow: brown work dress"}
                      rows={3}
                      defaultValue={renderOverrides(chapter.setup?.characters)}
                    />
                  </Form>
                </div>
              </details>

              <div className="space-y-3">
                {chapter.scenes.map((scene) => (
                  <div key={scene.id} className="rounded border border-neutral-800">
                    <div className="flex items-center justify-between border-b border-neutral-900 px-4 py-2">
                      <span className="text-xs text-neutral-500">
                        Scene {chapter.order}.{scene.order} · {scene.beat}
                      </span>
                      {/* One scene at a time: 600–900 words already takes tens of
                          seconds on a real GPU, so a whole episode is one long
                          wait with nothing to look at. Same endpoint — it nulls
                          `text` and queues WRITE_SCENE for that scene, so an
                          unwritten scene works too. */}
                      {!active && (
                        <>
                          {/* A beat could only be retyped until now — the one step of
                              outlining with no button. Leaves any prose alone; the
                              rewrite next to it is the one that replaces that. */}
                          <ActionButton path={`/api/episodes/${ep.id}/scenes/${scene.id}/beat`}>
                            another beat
                          </ActionButton>
                          <ActionButton path={`/api/episodes/${ep.id}/scenes/${scene.id}/write`}>
                            {scene.text ? "rewrite" : "write this scene"}
                          </ActionButton>
                        </>
                      )}
                    </div>
                    <div className="px-4 py-3 text-sm leading-relaxed whitespace-pre-wrap text-neutral-300">
                      {stream && stream.sceneId === scene.id ? (
                        <>
                          {stream.text}
                          {/* Blinking cursor: tells "still writing" apart from
                              "finished, and that is all there was". */}
                          <span className="ml-0.5 inline-block h-4 w-2 animate-pulse bg-neutral-500 align-text-bottom" />
                        </>
                      ) : (
                        (scene.text ?? <span className="text-neutral-600">not written</span>)
                      )}
                    </div>

                    {/* Editing the prose by HAND. A model gets a scene mostly right and
                        one line wrong, and regenerating to fix that line rolls the dice
                        on the rest of it — so the fix has to be a text box.

                        Folded away rather than always open: the read view above is what
                        this page is for, and a dozen textareas make an episode
                        unreadable. Only for a scene that HAS prose; there is nothing to
                        edit before it is written, and "rewrite" is the button for that. */}
                    {scene.text && (
                      <details className="border-t border-neutral-900">
                        <summary className="cursor-pointer px-4 py-2 text-xs text-neutral-500">
                          Edit the text
                        </summary>
                        <div className="border-t border-neutral-900 px-4 py-3">
                          <Form
                            path={`/api/episodes/${ep.id}/scenes/${scene.id}`}
                            method="PUT"
                            submit="Save the text"
                          >
                            {/* `name="text"` alone: the route writes only the fields a
                                form actually sent, so this leaves the beat and the setup
                                exactly as they were. */}
                            <textarea
                              name="text"
                              rows={16}
                              defaultValue={scene.text}
                              className="w-full rounded border border-neutral-800 bg-neutral-900 p-3 font-mono text-sm leading-relaxed outline-none focus:border-neutral-600"
                            />
                            <p className="mt-2 text-xs text-neutral-600">
                              Saving reassembles the episode draft and its word count. The
                              running summary was folded from the OLD text and is not
                              rebuilt — later scenes keep reading that until this one is
                              written again.
                            </p>
                          </Form>
                        </div>
                      </details>
                    )}

                    <details className="border-t border-neutral-900">
                      <summary className="cursor-pointer px-4 py-2 text-xs text-neutral-500">
                        Instructions for this scene
                      </summary>
                      <div className="border-t border-neutral-900 px-4 py-3">
                        <Form
                          path={`/api/episodes/${ep.id}/scenes/${scene.id}`}
                          method="PUT"
                          submit="Save instructions"
                          className="space-y-3"
                        >
                          <Field
                            name="beat"
                            label="Beat — what happens in the scene"
                            rows={2}
                            defaultValue={scene.beat}
                          />
                          <ScenePeoplePicker
                            characters={ep.series.characters}
                            initial={scene.characterIds}
                          />
                          <Field
                            name="note"
                            label="Note for this scene"
                            placeholder="No dialogue in this scene. Only rain and footsteps."
                            rows={2}
                            defaultValue={scene.setup?.note ?? ""}
                          />
                          <Field
                            name="characters"
                            label="Character overrides for this scene"
                            hint="Form: Name: what they wear | note. Overrides the chapter setup FIELD BY FIELD — only write what differs."
                            placeholder="Sam: raincoat off"
                            rows={2}
                            defaultValue={renderOverrides(scene.setup?.characters)}
                          />
                        </Form>
                      </div>
                    </details>
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>

        {ep.chapters.length === 0 && (
          <p className="text-sm text-neutral-400">
            Nothing in this episode yet. Creating a story writes its title and its closing
            hook and stops — planning six beats from one line of idea makes the last five a
            guess at a draft nobody has written. Outline the first chapter below.
          </p>
        )}

        {/* An episode opens EMPTY and grows one chapter at a time — the same reason the
            story grows an episode at a time. */}
        {!active && (
          <div className="rounded border border-dashed border-neutral-800 p-4">
            <Form
              path={`/api/episodes/${ep.id}/chapters`}
              submit={`Outline chapter ${ep.chapters.length + 1}`}
              className="max-w-md"
            >
              <ModelPicker />
              <p className="mt-2 text-xs text-neutral-600">
                Planned from what the episode ACTUALLY says so far, not from the idea it started
                from. A full-length episode is about {CHAPTERS_IN_A_FULL_EPISODE} chapters — but
                that is a guide, not a limit.
                {/* Only when scenes are actually waiting. `allWritten` is false for an
                    episode with NO scenes too, and telling someone to write the scenes
                    above when there are none is the wrong end of the advice. */}
                {scenes.length > written && (
                  <>
                    {" "}
                    Write the scenes above first: outlining on top of beats nobody has written yet
                    is the guesswork this replaces.
                  </>
                )}
              </p>
            </Form>
          </div>
        )}
      </Section>

      {/* Drafting in another language means rewriting BEFORE approval: approving a
          draft in a language that never reaches the speakers gates nothing. */}
      {ep.series.draftLanguage && allWritten && (
        <Section
          title="Rewrite into the output language"
          action={
            !active ? (
              <ActionButton
                path={`/api/episodes/${ep.id}/translate${untranslated > 0 ? "" : "?force=1"}`}
                variant={untranslated > 0 ? "primary" : "default"}
              >
                {untranslated > 0 ? "rewrite" : "run again"}
              </ActionButton>
            ) : null
          }
        >
          <p className="rounded border border-neutral-800 p-4 text-sm text-neutral-400">
            {untranslated > 0
              ? `The draft is in ${languageLabel(ep.series.draftLanguage)}. ${untranslated}/${scenes.length} scenes still need rewriting into ${languageLabel(ep.series.language)}.`
              : `Everything has been rewritten into ${languageLabel(ep.series.language)}. The ${languageLabel(ep.series.draftLanguage)} draft is kept, so you can edit the prompt and run it again.`}
          </p>
        </Section>
      )}

      {/* The gate that stops a raw draft going any further. */}
      {allWritten && untranslated === 0 && (
        <Section title="Approve the draft">
          <div className="rounded border border-neutral-800 p-4">
            {ep.humanReviewed ? (
              <div className="flex items-center justify-between">
                <p className="text-sm text-emerald-300">
                  Approved
                  {ep.reviewedAt ? ` at ${new Date(ep.reviewedAt).toLocaleString("en-GB")}` : ""}
                </p>
                <ActionButton path={`/api/episodes/${ep.id}/unapprove`}>revoke</ActionButton>
              </div>
            ) : (
              <div className="space-y-3">
                <p className="text-sm text-neutral-400">
                  Read the whole draft above. Without approval there is no audio script — this is
                  the one gate stopping a raw draft getting out.
                </p>
                <ActionButton path={`/api/episodes/${ep.id}/approve`} variant="primary">
                  I have read it and approve
                </ActionButton>
              </div>
            )}
          </div>
        </Section>
      )}

      {ep.humanReviewed && (
        <Section
          title={`Audio script${ep.blocks.length ? ` (${ep.blocks.length} blocks)` : ""}`}
          action={
            !active ? (
              <ActionButton path={`/api/episodes/${ep.id}/audio-script`} variant="default">
                {ep.blocks.length ? "rebuild" : "build script"}
              </ActionButton>
            ) : null
          }
        >
          {ep.blocks.length === 0 ? (
            <p className="rounded border border-dashed border-neutral-800 p-4 text-sm text-neutral-500">
              Nothing yet. Use “build script” to split it into blocks and assign speakers.
            </p>
          ) : (
            <div className="divide-y divide-neutral-900 rounded border border-neutral-800">
              {ep.blocks.map((b) => (
                <div key={b.id} className="px-4 py-2.5">
                  <div className="flex flex-wrap items-center gap-2 text-xs">
                    <span className="text-neutral-500">{b.order}.</span>
                    <Badge tone={b.speakerLabel === "narrator" ? "neutral" : "blue"}>
                      {b.speakerLabel === "narrator" ? "narration" : b.speakerLabel}
                    </Badge>
                    {!b.characterId && b.speakerLabel !== "narrator" && (
                      <Badge tone="amber">no matching character</Badge>
                    )}
                    <span className="text-neutral-600">pause {b.pauseAfter}ms</span>
                    {b.sfxHint && <span className="text-neutral-600">sfx: {b.sfxHint}</span>}
                  </div>
                  <p className="mt-1 text-sm text-neutral-300">{b.text}</p>
                </div>
              ))}
            </div>
          )}
        </Section>
      )}

      {ep.blocks.length > 0 && (
        <Section title="Audio">
          <Link
            to={`/episode/${ep.id}/audio`}
            className="flex items-center justify-between rounded border border-neutral-800 px-4 py-3 text-sm hover:bg-neutral-900"
          >
            <span>Listen, approve blocks and export the MP3</span>
            <span className="text-xs text-neutral-500">{ep.blocks.length} block →</span>
          </Link>
        </Section>
      )}

      {allWritten && (
        <Section
          title="Summary"
          action={
            !active ? (
              <ActionButton path={`/api/episodes/${ep.id}/summarize`}>
                {ep.summary ? "summarise again" : "summarise"}
              </ActionButton>
            ) : null
          }
        >
          <p className="rounded border border-neutral-800 p-4 text-sm text-neutral-400">
            {ep.summary ?? "Nothing yet. The summary is loaded as context when writing later episodes."}
          </p>
        </Section>
      )}

      {/* At the bottom, away from daily buttons: deleting an episode cannot be undone. */}
      <Section title="Danger zone">
        <div className="flex flex-wrap items-center gap-3 rounded border border-red-950 bg-red-950/20 p-4">
          <ActionButton
            path={`/api/episodes/${ep.id}`}
            method="DELETE"
            confirmText={`Delete episode ${ep.number} "${ep.title}" with its draft, script, audio and facts? This cannot be undone.`}
            onDone={() => nav(`/series/${ep.seriesId}`)}
          >
            Delete this episode
          </ActionButton>
          <span className="text-xs text-neutral-500">
            Also deletes the episode's facts, so later episodes are no longer steered by it.
            Episodes are not renumbered — the sequence will skip {ep.number}.
          </span>
        </div>
      </Section>
    </div>
  );
}
