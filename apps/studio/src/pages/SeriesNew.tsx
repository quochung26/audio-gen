import { useNavigate } from "react-router";
import { useApi } from "@/lib/api";
import { Form } from "@/components/Form";
import { Field } from "@/components/Field";
import { ModelPicker } from "@/components/ModelPicker";
import { DraftLanguagePicker, LanguagePicker } from "@/components/LanguagePicker";
import { TagPicker } from "@/components/TagPicker";
import { CastPicker } from "@/components/CastPicker";


export function SeriesNew() {
  const nav = useNavigate();
  // From the catalogue rather than hard-coded: add a genre under Settings and it
  // shows up here immediately, carrying the description the model reads.
  const { data } = useApi<{ genres: Array<{ name: string; description: string; enabled: boolean }> }>(
    "/api/genres",
  );
  const genres = (data?.genres ?? []).filter((g) => g.enabled);

  return (
    <div className="max-w-2xl space-y-6">
      <div>
        <h1 className="text-xl font-semibold">New story</h1>
        <p className="mt-1 text-sm text-neutral-400">
          Write one line of idea. The machine builds an outline, a cast and the{" "}
          <strong className="text-neutral-200">first episode</strong> — you edit before anything is
          written. Later episodes come one at a time from “New episode” on the story page, so each
          is planned knowing how the previous one ended.
        </p>
      </div>

      <Form
        path="/api/series"
        submit="Build the outline"
        className="space-y-4"
        onDone={(r) => {
          const jobId = (r as unknown as { jobId?: string }).jobId;
          if (jobId) nav(`/job/${jobId}`);
        }}
      >
        <Field
          name="idea"
          label="Idea"
          placeholder="a night-bus driver picks up a passenger who died three years ago"
          rows={3}
        />

        <div className="flex flex-wrap gap-4">
          <label className="flex-1">
            <span className="mb-1 block text-sm text-neutral-400">Main genre</span>
            <select
              name="genre"
              key={genres.length}
              disabled={genres.length === 0}
              className="w-full rounded border border-neutral-700 bg-neutral-900 p-2 text-sm disabled:text-neutral-600"
            >
              {/* Say so in one line when the catalogue is empty. A select with no
                  options opens a blank list — it looks broken. */}
              {genres.length === 0 ? (
                <option value="">— no genres yet —</option>
              ) : (
                genres.map((g) => (
                  <option key={g.name} value={g.name}>
                    {g.name}
                  </option>
                ))
              )}
            </select>
            {genres.length === 0 && (
              <span className="mt-1 block text-xs text-amber-500">
                The genre catalogue is empty — add one under Settings → Genres.
              </span>
            )}
          </label>
          <LanguagePicker />
          <DraftLanguagePicker />
        </div>

        <label className="block">
          <span className="mb-1 block text-sm text-neutral-400">
            Sub-genres <span className="text-neutral-600">— optional</span>
          </span>
          <TagPicker genres={genres.map((g) => g.name)} />
          <span className="mt-1 block text-xs text-neutral-600">
            Click to pick; pick as many as you like. The AI reads them while writing — the main
            genre decides which prompt runs, sub-genres steer tone and events. They also become
            keywords listeners search by.
          </span>
        </label>

        <ModelPicker />

        <details className="rounded border border-neutral-800">
          <summary className="cursor-pointer px-4 py-3 text-sm text-neutral-300">
            Characters{" "}
            <span className="text-neutral-600">— optional, from cards or written here</span>
          </summary>
          <div className="space-y-4 border-t border-neutral-800 px-4 py-4">
            <p className="text-xs text-neutral-500">
              Leave it empty and the AI invents the cast. Pick up front and the AI must use these
              exact people — useful when you have a cast you like and want it in a new story.
            </p>
            <CastPicker />
          </div>
        </details>

        <details className="rounded border border-neutral-800">
          <summary className="cursor-pointer px-4 py-3 text-sm text-neutral-300">
            World setup up front{" "}
            <span className="text-neutral-600">— optional, but worth it for a long story</span>
          </summary>
          <div className="space-y-4 border-t border-neutral-800 px-4 py-4">
            <p className="text-xs text-neutral-500">
              Leave it empty and the AI invents a setting you fix later in the Story Bible. Fill it
              in and the AI is held to it from the outline on — less rewriting.
            </p>
            <Field
              name="setting"
              label="Setting"
              placeholder="A central-Vietnam highway, 1970s. Empty road, fog, buses running through the night."
              rows={2}
            />
            <Field
              name="rules"
              label="World rules — one per line"
              placeholder={"Ghosts only appear after midnight\nThe dead never say their own name"}
              rows={3}
            />
            <Field
              name="tone"
              label="Tone"
              placeholder="Slow, full of silences. Fear from atmosphere, not gore."
              rows={2}
            />
            <Field
              name="constraints"
              label="Forbidden — one per line"
              placeholder="Never end on it being a dream"
              rows={2}
            />
          </div>
        </details>
      </Form>
    </div>
  );
}
