import { useRef } from "react";
import { Link, useNavigate, useParams } from "react-router";
import { useApi } from "@/lib/api";
import { Badge, Section, STATUS_TONE } from "@/components/ui";
import { Field, TextInput } from "@/components/Field";
import { PassageReviser } from "@/components/PassageReviser";
import { ReadingModal } from "@/components/ReadingModal";
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

/** Mirrors SCENES_PER_CHAPTER in @audio/config, for the same reason as the line above. */
const SCENES_PER_CHAPTER = 3;

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

interface Violation {
  rule: string;
  target: string;
  actual: string;
  limit?: string;
  severity: "error" | "warning";
}

/**
 * What each rule found, in words. The rule names are the stored fact; these are for
 * reading, and they name the DEFECT rather than the check — "copied from the scene
 * before it" is something to go and look at, `copied_previous_scene` is a grep key.
 */
const LINT_LABEL: Record<string, string> = {
  english_residue: "English left in the Vietnamese",
  self_duplication: "a paragraph repeated inside the scene",
  copied_previous_scene: "copied from the scene before it",
  broken_word: "a word split across a paragraph break",
  markdown_residue: "markdown left in the prose",
  invisible_characters: "characters in the text that are not on the page",
};

interface Scene {
  /** The scene in the other language, for reading. Replaces nothing — see READING_COPY. */
  reading: string | null;
  readingLanguage: string | null;
  id: string;
  order: number;
  beat: string;
  characterIds: string[];
  setup: SceneSetup | null;
  text: string | null;
  /**
   * Written against material the story has since moved off — the Bible, the beat, the
   * setups, the scene before it, or the WRITE_SCENE prompt. See Scene.inputDigest.
   */
  stale: boolean;
  /** What this scene must NOT do — written by the planner, editable. */
  forbidden: string[];
  /** What to check the scene against before writing it. */
  continuity: string[];
  /**
   * What the mechanical checks found in this scene — facts, not a verdict. Null means
   * the scene predates the checks, which is not the same as clean.
   */
  lintViolations: Violation[] | null;
  /** The draft before the rewrite. Null means this scene has not been through it. */
  sourceText: string | null;
  /**
   * The whole story as it stood after this scene, in one paragraph.
   *
   * Folded by STORY_SO_FAR right after the scene is written, and read by every scene
   * after it — the one account of the story a scene write gets.
   */
  /**
   * What this scene said before an edit — kept only while the episode is PUBLISHED.
   * Newest first, capped at five by the API.
   */
  revisions: { id: string; text: string; createdAt: string }[];
}
interface Chapter {
  id: string;
  order: number;
  title: string | null;
  setup: ChapterSetup | null;
  /** The scene this chapter ends on. Null = nobody has said; the length is a guess. */
  endsAtScene: number | null;
  scenes: Scene[];
}
interface ReviewIssue {
  dimension: string;
  severity: "critical" | "error" | "warning";
  scene: number;
  what: string;
  evidence: string;
  /**
   * What to do about it. Empty is a real answer — see reviewSchema.
   *
   * Optional on the wire, not because a review may omit it but because the reviews
   * already stored were made before it existed. The API hands the row over as it is,
   * so the page has to survive one.
   */
  suggestion?: string;
  /** Whether it has to be fixed before approving. Not everything reported is work. */
  requiresChange: boolean;
}
interface EpisodeReview {
  id: string;
  verdict: string;
  summary: string;
  scores: Record<string, number>;
  issues: ReviewIssue[];
  contractBreaks: Array<{ scene: number; broke: string; evidence: string }>;
  scenes: number[];
  /** Set when the verdict disagreed with the findings and was settled against them. */
  correction: string | null;
  createdAt: string;
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
  /** The scenes joined together. Empty while it has not been assembled from them. */
  draftText: string | null;
  series: {
    id: string;
    title: string;
    language: string;
    draftLanguage: string;
    model: string;
    characters: Array<{ id: string; name: string; isNarrator: boolean }>;
  };
  chapters: Chapter[];
  /** The latest review of this draft, if one has been asked for. */
  reviews: EpisodeReview[];
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

  /**
   * Whether a chapter starts expanded — decided the FIRST time it is seen, then
   * remembered.
   *
   * `open` on `<details>` is a real prop, not an initial value. Recomputed from live
   * data it would be re-asserted on every render, so a chapter would snap shut under
   * the writer at the moment its last scene finished, and a chapter they had collapsed
   * on purpose would spring back open on the next 3-second poll. Frozen here, React
   * sets it once and the toggle belongs to the reader after that.
   */
  const openedOnce = useRef(new Map<string, boolean>());
  function startsOpen(
    chapter: { id: string; scenes: Array<{ text: string | null }> },
    /** Whether the review found anything in this chapter. */
    reviewed: boolean,
  ): boolean {
    const decided = openedOnce.current.get(chapter.id);
    if (decided !== undefined) return decided;
    // Open the chapters there is still work in: one with an unwritten scene, and a
    // brand-new empty one. A chapter with nothing left to write is finished, and on a
    // long episode it is mostly scrollbar.
    //
    // A chapter a reader found fault with also has work in it, and used to be the one
    // case this shut. Every scene written is exactly the state a review arrives in, so
    // the page closed the findings at the moment they appeared.
    const open =
      chapter.scenes.length === 0 || chapter.scenes.some((sc) => !sc.text) || reviewed;
    openedOnce.current.set(chapter.id, open);
    return open;
  }

  if (isLoading || !ep) return <Loading error={error} />;

  // Count across the WHOLE EPISODE: chapters are only a grouping, and "is it
  // written" is an episode-level question — the approval gate and the audio edit
  // both work at that level.
  const scenes = ep.chapters.flatMap((ch) => ch.scenes);
  const written = scenes.filter((s) => s.text).length;
  // Findings go to the scenes they name; what is left is about the episode, and stays
  // in the panel next to the verdict.
  const found = findingsByScene(ep.reviews?.[0], ep.chapters);
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
            <ModelPicker seriesModel={ep.series.model} />
            <p className="mt-2 text-xs text-neutral-600">
              One long job, and nothing is readable until it finishes. To see sooner, use{" "}
              <strong className="text-neutral-400">write this scene</strong> on each scene below —
              read scene 1 and fix its beat before spending time on scene 2.
            </p>
          </Form>
        )}

        <div className="space-y-6">
          {ep.chapters.map((chapter) => (
            <details
              key={chapter.id}
              open={startsOpen(
                chapter,
                chapter.scenes.some((sc) => (found.byScene.get(sc.id) ?? []).length > 0),
              )}
            >
              <summary className="mb-2 flex cursor-pointer flex-wrap items-baseline gap-2">
                <h2 className="text-sm font-medium text-neutral-200">
                  Chapter {chapter.order}
                  {chapter.title ? `: ${chapter.title}` : ""}
                </h2>
                <span className="text-xs text-neutral-600">
                  {chapter.scenes.filter((sc) => sc.text).length}/{chapter.scenes.length} scenes
                </span>
              </summary>

              <details className="mb-3 rounded border border-neutral-800">
                <summary className="cursor-pointer px-4 py-2 text-xs text-neutral-500">
                  Chapter {chapter.order} — title and setup
                </summary>
                <div className="border-t border-neutral-800 px-4 py-4">
                  {/* Its own form, and its own route: a title is what the chapter is
                      CALLED, while everything below is what is true inside it. The
                      rename endpoint existed from the start and nothing ever called it,
                      so a title could only be whatever NEXT_CHAPTER happened to pick. */}
                  <Form
                    path={`/api/episodes/${ep.id}/chapters/${chapter.id}`}
                    method="PUT"
                    submit="Rename"
                    className="mb-5 max-w-md"
                  >
                    <TextInput
                      name="title"
                      label="Chapter title"
                      placeholder="Untitled — shown as just “Chapter 2”"
                      defaultValue={chapter.title ?? ""}
                    />
                  </Form>

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
                    {/* `items-start`, not `items-center`: the beat is prose and has to
                        be allowed its second line. Centred, it was one crushed line
                        fighting the buttons for width — and since a flex child will
                        not shrink below its content without `min-w-0`, it won that
                        fight and the buttons broke into "another" / "beat". */}
                    <div className="flex items-start gap-3 border-b border-neutral-900 px-4 py-2.5">
                      <div className="min-w-0 flex-1">
                        <div className="flex items-baseline gap-2 text-xs text-neutral-600">
                          <span className="tabular-nums">
                            Scene {chapter.order}.{scene.order}
                          </span>
                          {/* The length, where the question about a written scene is
                              usually whether it came out near the target at all. */}
                          {scene.text && <span>{words(scene.text)} words</span>}
                          {/* Says WHICH way it is out of date is not possible — the
                              digest is one number over everything the scene was written
                              from. What it can say is that rewriting is the fix, which
                              is the button directly to the right. */}
                          {scene.stale && (
                            <span
                              className="rounded bg-amber-900/60 px-1.5 py-0.5 text-amber-200"
                              title={
                                "The Bible, the beat, a setup, the scene before this one or the " +
                                "WRITE_SCENE prompt has changed since this scene was written. " +
                                "The prose is fine — it just no longer matches what the story says."
                              }
                            >
                              written against an older version
                            </span>
                          )}
                          {/* So a scene with work in it can be found by scanning the
                              headings rather than by reading every band under them. */}
                          {toFix(found.byScene.get(scene.id)) > 0 && (
                            <span className="rounded bg-red-950/60 px-1.5 py-0.5 text-red-200">
                              {toFix(found.byScene.get(scene.id))} to fix
                            </span>
                          )}
                        </div>
                        <p className="mt-1 text-xs leading-relaxed text-neutral-400">{scene.beat}</p>
                      </div>
                      {/* One scene at a time: 600–900 words already takes tens of
                          seconds on a real GPU, so a whole episode is one long
                          wait with nothing to look at. Same endpoint — it nulls
                          `text` and queues WRITE_SCENE for that scene, so an
                          unwritten scene works too. */}
                      {!active && (
                        <div className="flex shrink-0 items-center gap-1">
                          {/* A beat could only be retyped until now — the one step of
                              outlining with no button. Leaves any prose alone; the
                              rewrite next to it is the one that replaces that. */}
                          <ActionButton path={`/api/episodes/${ep.id}/scenes/${scene.id}/beat`}>
                            another beat
                          </ActionButton>
                          <ActionButton path={`/api/episodes/${ep.id}/scenes/${scene.id}/write`}>
                            {scene.text ? "rewrite" : "write this scene"}
                          </ActionButton>
                          {/* "another beat" replaces a beat in place, for when the scene
                              should exist and say something else. This is for when it
                              should not exist at all. */}
                          <ActionButton
                            path={`/api/episodes/${ep.id}/scenes/${scene.id}`}
                            method="DELETE"
                            variant="danger"
                            confirmText={
                              scene.text
                                ? `Delete scene ${chapter.order}.${scene.order} and its ${words(scene.text)} written words? This cannot be undone.`
                                : `Delete scene ${chapter.order}.${scene.order}?`
                            }
                          >
                            delete
                          </ActionButton>
                        </div>
                      )}
                    </div>
                    {/* Findings sit between the beat and the prose, because they are
                        about the prose and the first thing to do about them is read it.
                        Nothing here acts on its own — these are facts, and whether a
                        scene needs rewriting is the writer's call. */}
                    {(scene.lintViolations ?? []).length > 0 && (
                      <div className="flex flex-wrap gap-x-4 gap-y-1 border-b border-neutral-900 px-4 py-2 text-xs">
                        {(scene.lintViolations ?? []).map((v, i) => (
                          <span
                            key={`${v.rule}-${i}`}
                            className={v.severity === "error" ? "text-red-300" : "text-amber-300"}
                            title={v.target}
                          >
                            {LINT_LABEL[v.rule] ?? v.rule} — {v.actual}
                            {v.limit ? ` (over ${v.limit})` : ""}
                          </span>
                        ))}
                      </div>
                    )}
                    {/* Then what a reader found, directly above the prose it is about.
                        Longest of the three bands, so it sits closest to it. */}
                    <SceneFindings
                      list={found.byScene.get(scene.id) ?? []}
                      text={scene.text}
                      revisePath={`/api/episodes/${ep.id}/scenes/${scene.id}/revise`}
                    />
                    {/* An unwritten scene gets one thin line rather than the full
                        prose band. Three empty bands the height of a paragraph was
                        most of what a freshly outlined chapter showed. */}
                    {stream?.sceneId === scene.id ? (
                      <div className="px-4 py-3 text-sm leading-relaxed whitespace-pre-wrap text-neutral-300">
                        {stream.text}
                        {/* Blinking cursor: tells "still writing" apart from
                            "finished, and that is all there was". */}
                        <span className="ml-0.5 inline-block h-4 w-2 animate-pulse bg-neutral-500 align-text-bottom" />
                      </div>
                    ) : scene.text ? (
                      /* Selecting inside the prose asks for just that part to be
                         rewritten. Wrapped rather than placed beside it, so the
                         selection and the form cannot disagree about what is on
                         screen. Not while streaming: the text is still moving. */
                      <PassageReviser
                        path={`/api/episodes/${ep.id}/scenes/${scene.id}/revise`}
                        text={scene.text}
                        actions={
                          <ReadingModal
                            title={`Scene ${chapter.order}.${scene.order}`}
                            subtitle={`${ep.number}. ${ep.title}`}
                            text={scene.text}
                          />
                        }
                      >
                        <div className="px-4 py-3 text-sm leading-relaxed whitespace-pre-wrap text-neutral-300">
                          {scene.text}
                        </div>
                      </PassageReviser>
                    ) : (
                      <div className="px-4 py-2 text-xs text-neutral-600">not written</div>
                    )}

                    {/* Reading, not generating — so it sits with the other things done
                        TO a finished scene rather than in the row that makes one. The
                        panel is folded away because it is a second copy of a scene
                        already on screen, and open by default would double the length
                        of every episode page. */}
                    {scene.text && !active && (
                      <details className="border-t border-neutral-900">
                        <summary className="cursor-pointer px-4 py-2 text-xs text-neutral-500">
                          {scene.reading
                            ? `Read in ${languageLabel(scene.readingLanguage ?? "")}`
                            : "Read it in another language"}
                        </summary>
                        <div className="border-t border-neutral-900 px-4 py-3">
                          {scene.reading ? (
                            <>
                              <p className="max-h-40 overflow-hidden text-sm leading-relaxed whitespace-pre-wrap text-neutral-400">
                                {scene.reading}
                              </p>
                              {/* The panel is a preview; reading happens full-screen. At
                                  14px with tight leading, Vietnamese diacritics sit on
                                  top of each other. */}
                              <div className="mt-2">
                                <ReadingModal
                                  title={`Scene ${chapter.order}.${scene.order}`}
                                  subtitle={`${ep.number}. ${ep.title} — in ${languageLabel(scene.readingLanguage ?? "")}`}
                                  text={scene.reading}
                                />
                              </div>
                            </>
                          ) : (
                            <p className="text-sm text-neutral-500">
                              Not translated yet.
                            </p>
                          )}
                          {/* A Form rather than a bare button, so the picker's
                              `<select name="model">` is actually submitted — an
                              ActionButton posts a fixed body and would drop it. */}
                          <Form
                            path={`/api/episodes/${ep.id}/scenes/${scene.id}/reading`}
                            submit={scene.reading ? "translate again" : "translate"}
                            className="mt-3 border-t border-neutral-900 pt-3"
                          >
                            {/* Vietnamese by default, because that is the copy anyone
                                asks for — unless the story is already in it, where the
                                same language would be a rewrite of itself and the job
                                refuses. The story's own language is not offered. */}
                            <label className="mb-3 block w-56">
                              <span className="mb-1 block text-xs text-neutral-500">
                                Read it in
                              </span>
                              <select
                                name="language"
                                defaultValue={
                                  scene.readingLanguage ??
                                  (ep.series.language === "vi" ? "en" : "vi")
                                }
                                className="w-full rounded border border-neutral-700 bg-neutral-900 p-2 text-sm"
                              >
                                {["vi", "en"]
                                  .filter((c) => c !== ep.series.language)
                                  .map((c) => (
                                    <option key={c} value={c}>
                                      {languageLabel(c)}
                                    </option>
                                  ))}
                              </select>
                            </label>
                            {/* No seriesModel: TRANSLATE is not one of the steps a story's model applies
                                to, so naming it here would be the same lie in the other direction. */}
                            <ModelPicker kind="translate" />
                            <p className="mt-2 text-xs text-neutral-600">
                              For reading only — never spoken, never exported, and no prompt
                              reads it. Editing the scene above does not update it.
                            </p>
                          </Form>
                        </div>
                      </details>
                    )}

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
                            {/* Keyed for the reason above: WRITE_SCENE replaces it. */}
                            <textarea
                              key={scene.text}
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
                              {ep.status === "PUBLISHED" && (
                                <>
                                  {" "}
                                  This episode is <strong className="text-amber-500">published</strong>,
                                  so what it says now is kept below before the change.
                                </>
                              )}
                            </p>
                          </Form>

                          {/* `?? []` because Studio and the API restart separately:
                              a page newer than the server it is talking to should show
                              one section less, not a blank screen. */}
                          {(scene.revisions ?? []).length > 0 && (
                            <div className="mt-4 space-y-2 border-t border-neutral-900 pt-3">
                              <p className="text-xs text-neutral-500">
                                Earlier versions — kept because the episode was already
                                published when it was edited.
                              </p>
                              {(scene.revisions ?? []).map((rev) => (
                                <details key={rev.id} className="rounded border border-neutral-900">
                                  <summary className="cursor-pointer px-3 py-2 text-xs text-neutral-500">
                                    {new Date(rev.createdAt).toLocaleString()}
                                  </summary>
                                  <div className="border-t border-neutral-900 px-3 py-2">
                                    <p className="whitespace-pre-wrap text-sm leading-relaxed text-neutral-400">
                                      {rev.text}
                                    </p>
                                    {/* Restoring is the same save as any other, so it goes
                                        through the same route and is itself kept. */}
                                    <Form
                                      path={`/api/episodes/${ep.id}/scenes/${scene.id}`}
                                      method="PUT"
                                      submit="Put this back"
                                      className="mt-2"
                                    >
                                      <input type="hidden" name="text" value={rev.text} />
                                    </Form>
                                  </div>
                                </details>
                              ))}
                            </div>
                          )}
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
                          {/* Keyed for the reason above: "another beat" replaces it. */}
                          <Field
                            key={scene.beat}
                            name="beat"
                            label="Beat — what happens in the scene"
                            rows={2}
                            defaultValue={scene.beat}
                          />
                          {/* Under the beat, because they are part of the assignment
                              rather than notes about it — the prompt prints them in the
                              same place, directly beneath it. */}
                          <Field
                            key={`forbidden-${scene.beat}`}
                            name="forbidden"
                            label="Not in this scene"
                            hint="One per line. What the story might invite that belongs later: what stays unresolved, who does not find out yet. Written by the planner; yours replaces it."
                            placeholder={"Tài must not learn who bought the ticket\nThe argument does not get settled here"}
                            rows={2}
                            defaultValue={(scene.forbidden ?? []).join("\n")}
                          />
                          <Field
                            key={`continuity-${scene.beat}`}
                            name="continuity"
                            label="Still true when this scene opens"
                            hint="One per line. Only what THIS scene could get wrong — a state somebody is still in, something they still do not know."
                            placeholder={"Her left hand is still bandaged\nThe bus has not been repaired"}
                            rows={2}
                            defaultValue={(scene.continuity ?? []).join("\n")}
                          />
                          <ScenePeoplePicker
                            characters={ep.series.characters}
                            initial={scene.characterIds}
                          />
                          <Field
                            name="note"
                            label="Note for this scene"
                            hint="Read alongside the beat, and it wins where the two disagree — so it can add what happens, not only how it is written. Applies the next time the scene is written; it does not change prose already there."
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

              {/* One scene at a time, for the same reason the chapter holding them
                  arrives one at a time: a beat planned before the scene before it was
                  written is planned against a plan, and the prose always says something
                  the plan did not. See the NEXT_SCENE step. */}
              {!active && (
                <div className="mt-2 flex items-baseline gap-3">
                  {/* A chapter the writer has closed takes no more scenes. Which scene
                      ends it is not readable off the data — the next one is always a
                      button away — so it is said, or it is guessed. */}
                  {chapter.endsAtScene !== null &&
                  chapter.scenes.length >= chapter.endsAtScene ? (
                    <span className="text-xs text-neutral-500">
                      Ends on scene {chapter.endsAtScene}.
                    </span>
                  ) : (
                    <ActionButton path={`/api/episodes/${ep.id}/chapters/${chapter.id}/scenes`}>
                      + Outline scene {chapter.order}.{chapter.scenes.length + 1}
                    </ActionButton>
                  )}
                  <ChapterEnd episodeId={ep.id} chapter={chapter} />
                  <span className="flex-1 text-xs text-neutral-600">
                    {chapter.endsAtScene === null
                      ? `A chapter usually runs to about ${SCENES_PER_CHAPTER} scenes — until you say, the last scene is a guess. Say a higher number to leave room for more.`
                      : chapter.endsAtScene > chapter.scenes.length
                        ? `Ending on scene ${chapter.endsAtScene}: ${chapter.endsAtScene - chapter.scenes.length} still to come, and each one before the last is told NOT to resolve the chapter.`
                        : `Ending on scene ${chapter.endsAtScene}, so that scene is told to land it.`}
                  </span>
                  {/* Chapters arrive one at a time to be accepted or rejected, and until
                      now there was no reject — the only way out was deleting the episode.
                      Later chapters are renumbered, so no gap is left behind. */}
                  <ActionButton
                    path={`/api/episodes/${ep.id}/chapters/${chapter.id}`}
                    method="DELETE"
                    confirmText={`Delete chapter ${chapter.order}${chapter.title ? ` "${chapter.title}"` : ""} with its ${chapter.scenes.length} scene${chapter.scenes.length === 1 ? "" : "s"}? This cannot be undone.`}
                  >
                    delete chapter
                  </ActionButton>
                </div>
              )}
            </details>
          ))}
        </div>

        {ep.chapters.length === 0 && (
          <p className="text-sm text-neutral-400">
            Nothing in this episode yet. Creating a story writes its title and its closing
            hook and stops — planning six beats from one line of idea makes the last five a
            guess at a draft nobody has written. Outline the first chapter below: it arrives
            with its opening scene, and grows a scene at a time from there.
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
              <ModelPicker seriesModel={ep.series.model} />
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

      {/* Above the gate, because it exists to be read before the decision is made.
          It decides nothing: no status moves, nothing is queued off the back of it. */}
      {allWritten && untranslated === 0 && <ReviewPanel ep={ep} active={active} found={found} />}

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

      {/* Shown whenever there IS a summary, not only while every scene is written.
          `allWritten` alone was right when an episode was outlined whole: you wrote the
          scenes, then summarised, and it stayed true. Outlining a chapter at a time
          broke that — asking for the next chapter creates an unwritten scene, so the
          moment you do, `allWritten` flips and the summary you just generated
          disappears off the page along with the box holding it. Which reads exactly
          like "summarise again does not put anything in the box". */}
      {(allWritten || ep.summary) && (
        <Section
          title="Summary"
          action={
            // Still gated on every scene being written: summarising an episode with a
            // hole in it produces a summary with the same hole, and that text is what
            // the NEXT episode is written from.
            !active && allWritten ? (
              <ActionButton path={`/api/episodes/${ep.id}/summarize`}>
                {ep.summary ? "summarise again" : "summarise"}
              </ActionButton>
            ) : null
          }
        >
          {/* Said HERE, not only in the banner at the top of the page. An episode page
              runs to several screens, and this section is at the bottom of it — so the
              banner is out of frame exactly when you are staring at this box waiting
              for it to change. Without this line, a summary still being written looks
              identical to one that finished and did nothing. */}
          {active?.type === "SUMMARIZE" && (
            <p className="mb-3 text-xs text-blue-300">
              Writing a new summary — {active.progress}%. The text below is the previous
              one, and is replaced when it finishes.
            </p>
          )}

          {!allWritten && (
            <p className="mb-3 text-xs text-neutral-600">
              {scenes.length - written} scene{scenes.length - written === 1 ? "" : "s"} still
              unwritten, so this cannot be summarised again yet — it would summarise the gap
              too. You can still edit the text below by hand.
            </p>
          )}
          {/* Editable, not just displayed. "summarise again" is a re-roll, and what is
              usually wanted is fixing the one sentence the fold got wrong — this text is
              read verbatim by the NEXT episode's scenes, and it is the description
              listeners see on the episode in the feed. */}
          <div className="rounded border border-neutral-800 p-4">
            <Form path={`/api/episodes/${ep.id}/summary`} method="PUT" submit="Save the summary">
              {/* Keyed for the reason above: SUMMARIZE replaces it, and this is the
                  box where the staleness was noticed. */}
              <textarea
                key={ep.summary ?? ""}
                name="summary"
                rows={6}
                defaultValue={ep.summary ?? ""}
                placeholder="Nothing yet — press summarise above, or write it yourself."
                className="w-full rounded border border-neutral-800 bg-neutral-900 p-3 text-sm leading-relaxed outline-none focus:border-neutral-600"
              />
              <p className="mt-2 text-xs text-neutral-600">
                Read by the next episode&apos;s scenes as “the summary of the previous
                episode”, and used as this episode&apos;s description in the podcast feed.
                Empty means the next episode is written without it.
              </p>
            </Form>
          </div>
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

/**
 * Where a finding's quote is in the scene, if it is there at all.
 *
 * Verbatim first. Failing that, once more with a pair of outer quote marks removed:
 * `prompts/review.md` forbids adding them and the model mostly obeys now, but a passage
 * of narration that ENDS on a line of dialogue still comes back wrapped. Measured on the
 * last read, that is the only way a quote misses any more — 2 of 11, the same passage
 * twice, its interior matching the draft character for character.
 *
 * Stripping is tried ONLY when the raw string was not found, and the result is used only
 * when the stripped one is: a quote that already matched is never touched, and a quote
 * that is simply wrong does not get mangled into a near-miss.
 */
function locate(text: string, evidence: string): { passage: string; at: number } | null {
  const raw = evidence.trim();
  const at = text.indexOf(raw);
  if (at >= 0) return { passage: raw, at };

  const inner = raw.replace(/^["“”']\s*/, "").replace(/\s*["“”']$/, "");
  if (inner === raw) return null;
  const innerAt = text.indexOf(inner);
  return innerAt >= 0 ? { passage: inner, at: innerAt } : null;
}

/**
 * The instruction sent with a passage, built from the findings against it.
 *
 * A broken contract always goes in, whatever else is there: it is the one finding that
 * is not a matter of taste, and a rewrite that fixes the pacing while going past the
 * same forbidden line has not fixed the passage.
 *
 * For the rest, the suggestions where there are any, since those already say what to
 * do. Where there are none it falls back to the faults, which at least say what is
 * wrong — worse direction than a suggestion, and better than an empty box.
 */
function reviseNote(items: Finding[]): string {
  const parts = items
    .filter((f) => f.kind === "break")
    .map((f) => (f.kind === "break" ? `Do not go past what the beat forbade: ${f.broke}.` : ""));

  const issues = items.filter((f) => f.kind === "issue");
  const fixes = issues.map((f) => (f.kind === "issue" ? (f.suggestion ?? "").trim() : "")).filter(Boolean);
  parts.push(...(fixes.length > 0 ? fixes : issues.map((f) => (f.kind === "issue" ? f.what : ""))));

  return parts.filter(Boolean).join(" ");
}

/** How many of a scene's findings are work rather than something to know. */
function toFix(list: Finding[] | undefined): number {
  return (list ?? []).filter((f) => f.kind === "break" || f.requiresChange).length;
}

/** Word count for a written scene — the target is SCENE_TARGET_WORDS. */
function words(text: string): number {
  return text.trim().split(/\s+/).length;
}

/**
 * One thing the review said about one scene — a contract break or an issue, flattened
 * so that the two can be shown in a single ordered list.
 */
type Finding = (
  | { kind: "break"; broke: string; evidence: string }
  | {
      kind: "issue";
      dimension: string;
      severity: string;
      requiresChange: boolean;
      what: string;
      evidence: string;
      suggestion?: string;
    }
) & {
  /** Set when the review named a scene its own quote is not in. See `findingsByScene`. */
  movedFrom?: number;
};

/**
 * The review's findings, filed under the scene each one is about.
 *
 * A review numbers scenes by their place in the EPISODE, because that is the order it
 * was shown them in. This page numbers them `chapter.scene`. Nothing reconciled the two,
 * so the panel said "Scene 4" while the heading above the prose said "Scene 2.1", and
 * the writer did the arithmetic every time.
 *
 * Findings whose number lands outside the episode are NOT filed — they come back
 * separately so the panel can say so. A model that invents scene 9 of a two-scene
 * episode has still said something, and dropping it looks exactly like it never did.
 */
function findingsByScene(
  review: EpisodeReview | undefined,
  chapters: Chapter[],
): { byScene: Map<string, Finding[]>; episode: Finding[]; orphans: Finding[] } {
  const byScene = new Map<string, Finding[]>();
  const episode: Finding[] = [];
  const orphans: Finding[] = [];
  if (!review) return { byScene, episode, orphans };

  const inOrder = chapters.flatMap((ch) => ch.scenes);

  /**
   * The scene a finding is really about, when the number it was given is wrong.
   *
   * The quote decides. A finding whose passage is not in the scene it names, but is in
   * exactly one other, belongs to that one — the same reasoning as `settleReview`, where
   * the findings outrank the verdict: between a claim that can be checked against the
   * draft and a number that cannot, the checkable one wins.
   *
   * Not a hypothetical. The review that prompted this named scene 1 for five of its
   * seven findings while every passage they quoted was in scene 2, because the draft the
   * review reads had no scene boundaries in it at all — fixed in review.job.ts, which
   * stops it happening again but does nothing for the reviews already stored.
   *
   * Only when EXACTLY one scene contains it. Two scenes with the same sentence is a
   * different fault, and picking one of them would be a guess dressed as a correction.
   */
  function whereItReallyIs(stated: Scene | undefined, evidence: string): Scene | undefined {
    if (stated?.text && locate(stated.text, evidence)) return stated;
    const found = inOrder.filter((sc) => sc.text && locate(sc.text, evidence));
    return found.length === 1 ? found[0] : stated;
  }

  function file(n: number, f: Finding) {
    // Zero is the review's way of saying "the episode, not a scene in it".
    if (n === 0 && f.kind === "issue") {
      episode.push(f);
      return;
    }
    const stated = inOrder[n - 1];
    const scene = whereItReallyIs(stated, f.evidence);
    if (!scene) {
      orphans.push(f);
      return;
    }
    const list = byScene.get(scene.id) ?? [];
    list.push(scene === stated ? f : { ...f, movedFrom: n });
    byScene.set(scene.id, list);
  }

  for (const b of review.contractBreaks) file(b.scene, { kind: "break", ...b });
  for (const i of review.issues) file(i.scene, { kind: "issue", ...i });

  // The order the rewrite gets them in — see sceneFindings in @audio/core. A break is
  // the one finding that is not a matter of taste, and a thing the writer has to do
  // outranks a thing the writer should merely know.
  const rank = (f: Finding) => (f.kind === "break" ? 0 : f.requiresChange ? 1 : 2);
  for (const list of byScene.values()) list.sort((a, b) => rank(a) - rank(b));

  return { byScene, episode, orphans };
}

const SEVERITY_TONE: Record<string, string> = {
  critical: "text-red-300",
  error: "text-red-300/80",
  warning: "text-amber-300/80",
};

const VERDICT_TONE: Record<string, string> = {
  accept: "green",
  polish: "amber",
  rewrite: "red",
};

/**
 * What the review said about THIS scene, shown against it.
 *
 * It used to live in one list at the bottom of the page, every line of it opening with a
 * scene number, under a closing note reading "Rewrite a scene from the button next to
 * it". The button next to it was three sections up, inside a chapter that had collapsed
 * itself because every scene in it was written. So the writer read a finding here,
 * scrolled, expanded, counted scenes, and by then had lost the wording of the finding
 * they went looking for.
 */
function SceneFindings({
  list,
  text,
  revisePath,
}: {
  list: Finding[];
  /** The scene as stored, so a quote can be located in it. */
  text: string | null;
  /** POST target for revising one passage of this scene. */
  revisePath: string;
}) {
  if (list.length === 0) return null;
  return (
    <div className="border-b border-neutral-900 bg-neutral-950/40 px-4 py-2.5">
      <FindingList list={list} text={text} revisePath={revisePath} />
    </div>
  );
}

/**
 * The findings themselves. The panel shows the episode-level ones the same way.
 *
 * Quotes are NOT given quote marks. The panel used to add a pair, the model had often
 * added its own, and together they rendered ““like this””. Dialogue arrives carrying the
 * draft's own marks and narration arrives with none, which is right both times — so the
 * rule is that the border separates the quote and nothing is added to the text.
 */
function FindingList({
  list,
  text,
  revisePath,
}: {
  list: Finding[];
  text?: string | null;
  revisePath?: string;
}) {
  // Findings that quote the same passage are shown together, under one copy of it.
  //
  // Not a saving of space so much as the truth about the draft: one passage usually
  // breaks several things at once, and a real scene had four findings against the same
  // two sentences. Printed apart, each with its own copy, it read as four separate
  // faults to go and find. Eleven findings on one scene came to five passages.
  //
  // Order is kept by whichever of them ranked highest, since that one arrived first.
  const groups: Array<{ evidence: string; items: Finding[] }> = [];
  for (const f of list) {
    const evidence = f.evidence.trim();
    const existing = groups.find((g) => g.evidence === evidence);
    if (existing) existing.items.push(f);
    else groups.push({ evidence, items: [f] });
  }

  return (
    <ul className="space-y-2">
      {groups.map((g, i) => (
        <li key={i} className="text-xs">
          {g.items.map((f, j) => (
            <p key={j}>
              {f.kind === "break" ? (
                <>
                  <span className="text-red-300">went past its beat</span>{" "}
                  <span className="text-neutral-300">{f.broke}</span>
                </>
              ) : (
                <>
                  <span className={SEVERITY_TONE[f.severity] ?? "text-neutral-400"}>
                    {f.dimension}
                  </span>{" "}
                  {f.requiresChange ? (
                    <span className="rounded bg-neutral-800 px-1 text-neutral-300">
                      needs a change
                    </span>
                  ) : (
                    <span className="text-neutral-600">worth knowing</span>
                  )}{" "}
                  <span className="text-neutral-300">{f.what}</span>
                </>
              )}
              {/* Said, not done quietly. A finding moved without a word looks like one
                  the review filed correctly, and nobody reading the two together could
                  tell which of them had been wrong. */}
              {f.movedFrom !== undefined && (
                <span className="text-neutral-600"> (the review said scene {f.movedFrom})</span>
              )}
            </p>
          ))}
          {/* What to do about it, told apart from what is wrong with it. ainovel-cli
              prints this the same way, one line under the finding behind an arrow. */}
          {g.items.some((f) => f.kind === "issue" && (f.suggestion ?? "").trim()) && (
            <p className="text-blue-300/80">
              {g.items
                .map((f) => (f.kind === "issue" ? (f.suggestion ?? "").trim() : ""))
                .filter(Boolean)
                .join(" ")}
            </p>
          )}
          {/* The located passage where it was found, so what is shown is what would be
              sent — and so a quote the model wrapped is shown as the draft has it. */}
          <p className="mt-1 border-l-2 border-neutral-800 pl-2 text-neutral-500">
            {(text ? locate(text, g.evidence) : null)?.passage ?? g.evidence}
          </p>
          {/* The whole reason the review is made to quote verbatim: a quote that is in
              the draft can be handed straight to the step that rewrites one passage,
              with the suggestions as its instruction. Offered only when the quote is
              actually there — a paraphrase would send the job looking for nothing. */}
          {(() => {
            const found = text && revisePath ? locate(text, g.evidence) : null;
            if (!found) return null;
            const note = reviseNote(g.items);
            return (
              <ActionButton
                path={revisePath!}
                body={{ passage: found.passage, at: String(found.at), note }}
                confirmText={`Rewrite just this passage?\n\n${found.passage}\n\nInstruction:\n${note}`}
              >
                fix this passage
              </ActionButton>
            );
          })()}
        </li>
      ))}
    </ul>
  );
}

/**
 * What a reader found, shown before the person is asked to approve.
 *
 * Advice, and it is labelled as advice. Nothing here moves a status or queues work: the
 * rewrite button is next to each scene and always has been, and a machine that both
 * judges the prose and acts on the judgement has quietly removed the only gate this
 * pipeline has.
 */
function ReviewPanel({
  ep,
  active,
  found,
}: {
  ep: Ep;
  active?: { type: string; progress: number };
  found: ReturnType<typeof findingsByScene>;
}) {
  const review = ep.reviews?.[0];

  // Every other action on this page is hidden while a job runs, and this one was not:
  // the button stayed live through its own review and queued a second read of the same
  // draft — a model call to produce the answer the first one was already producing.
  const busy = active ? (
    <span className="text-xs text-neutral-500">
      {active.type === "REVIEW"
        ? `Reading the draft… ${active.progress}%`
        : `${active.type} is running — nothing can be read until it finishes.`}
    </span>
  ) : null;

  return (
    <Section title="What a reader found">
      {!review ? (
        <div className="space-y-3 rounded border border-neutral-800 p-4">
          <p className="text-sm text-neutral-400">
            Nobody has read this draft yet. A review reports what is wrong with it and
            decides nothing — you still approve it, or send a scene back.
          </p>
          {/* The draft is the scenes joined together, and it is what a review reads. It
              can be missing while every scene already has prose — a write in flight saves
              the scene several steps before it assembles the draft, and the page counts
              that scene as written. Offering the button through that window gave an error
              where an explanation belonged. */}
          {busy ? (
            busy
          ) : ep.draftText?.trim() ? (
            <ActionButton path={`/api/episodes/${ep.id}/review`}>read the draft</ActionButton>
          ) : (
            <p className="text-xs text-amber-300">
              {ep.renderJobs.some((j) => j.status === "QUEUED" || j.status === "RUNNING")
                ? "The scenes are still being written — the draft is assembled at the end of that. Nothing to read yet."
                : "The draft has not been assembled from the scenes yet, so there is nothing to read. Writing the episode puts it together: on one whose scenes are all written it does nothing else."}
            </p>
          )}
        </div>
      ) : (
        <div className="space-y-4 rounded border border-neutral-800 p-4">
          <div className="flex flex-wrap items-start gap-3">
            <Badge tone={VERDICT_TONE[review.verdict] ?? "neutral"}>{review.verdict}</Badge>
            <p className="min-w-48 flex-1 text-sm text-neutral-300">{review.summary}</p>
            {busy ?? (
              <ActionButton path={`/api/episodes/${ep.id}/review`}>read it again</ActionButton>
            )}
          </div>

          <div className="flex flex-wrap gap-x-5 gap-y-1 text-xs">
            {Object.entries(review.scores).map(([name, score]) => (
              <span key={name} className={score < 60 ? "text-amber-300" : "text-neutral-500"}>
                {name} <span className="tabular-nums">{score}</span>
              </span>
            ))}
          </div>

          {/* Said out loud. A corrected answer that says nothing about having been
              corrected cannot be told from one that was right. */}
          {review.correction && <p className="text-xs text-neutral-500">{review.correction}</p>}

          {/* Where the rest of it went. The scene-by-scene findings are shown against
              their own scenes, beside the button that acts on them. */}
          {found.byScene.size > 0 && (
            <p className="text-xs text-neutral-500">
              {[...found.byScene.values()].flat().length} findings against {found.byScene.size}{" "}
              scene{found.byScene.size === 1 ? "" : "s"} — each one is above, with the scene
              it is about.
            </p>
          )}

          {/* What is left is about the episode rather than any one scene in it. */}
          {found.episode.length > 0 && <FindingList list={found.episode} />}

          {/* Filed against a scene this episode does not have. Shown rather than
              dropped: a number nobody can place is still a reader saying something,
              and silence would look like it said nothing. */}
          {found.orphans.length > 0 && (
            <div className="rounded border border-amber-900/60 bg-amber-950/20 p-3">
              <p className="mb-2 text-xs text-amber-200">
                Filed against a scene number this episode does not have. Read them against
                the whole thing, or read it again.
              </p>
              <FindingList list={found.orphans} />
            </div>
          )}

          <p className="text-xs text-neutral-600">
            Read {new Date(review.createdAt).toLocaleString("en-GB")}. Advice only — nothing
            here changed anything.
          </p>
        </div>
      )}
    </Section>
  );
}

/**
 * Saying which scene ends a chapter.
 *
 * Until it is said, `scenePosition` guesses from the usual length and tells scene three
 * to land the chapter whether or not it is the last — which closed chapters that had
 * another movement left in them. Saying it replaces the guess with a fact.
 */
function ChapterEnd({ episodeId, chapter }: { episodeId: string; chapter: Chapter }) {
  // `!= null`, catching undefined too: a chapter served without the field at all — an
  // older cache, a route that forgot to select it — read as "the writer has said", and
  // the form offered to undo a declaration nobody had made.
  const closed = chapter.endsAtScene != null && chapter.scenes.length >= chapter.endsAtScene;

  if (chapter.endsAtScene != null) {
    return (
      <Form
        path={`/api/episodes/${episodeId}/chapters/${chapter.id}/ends`}
        method="PUT"
        submit={closed ? "reopen it" : "not ending there"}
      >
        <input type="hidden" name="endsAtScene" value="" />
      </Form>
    );
  }

  const now = chapter.scenes.length || 1;
  return (
    <Form
      path={`/api/episodes/${episodeId}/chapters/${chapter.id}/ends`}
      method="PUT"
      submit="ends here"
      className="flex items-baseline gap-2"
    >
      {/* A FIELD, not a hidden value.
          
          It was hidden and pinned to the scene count, which made this button mean only
          "stop the chapter now" — while the whole reason the column exists is to say
          the length BEFORE the scenes are written, so the ones before the last are told
          not to resolve. `scenePosition` has always had the two messages and the route
          has always taken any number at or above what exists; the form was the one
          place that could not say it, and the comment here described the ability it was
          removing. */}
      <label className="text-xs text-neutral-500">
        ends on scene{" "}
        <input
          type="number"
          name="endsAtScene"
          defaultValue={now}
          min={now}
          className="w-14 rounded border border-neutral-700 bg-neutral-900 px-1.5 py-0.5 text-xs tabular-nums outline-none focus:border-neutral-500"
        />
      </label>
    </Form>
  );
}
