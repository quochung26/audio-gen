import { Link } from "react-router";
import { useApi } from "@/lib/api";
import { Badge, Section } from "@/components/ui";
import { Form, Loading } from "@/components/Form";

/** What each step does — so you know what you are editing without reading PLAN. */
const STEP_LABEL: Record<string, { title: string; desc: string }> = {
  OUTLINE: { title: "Outline", desc: "Turns one line of idea into an episode outline and a cast." },
  NEXT_EPISODE: {
    title: "Next episode",
    desc: "Outlines one more episode, knowing how the last one ended.",
  },
  CHARACTER: {
    title: "Character",
    desc: "Invents one character to fit the story — the “let the AI write one” button.",
  },
  WRITE_SCENE: { title: "Write scene", desc: "Writes one scene, held to the Story Bible and the previous scene." },
  STORY_SO_FAR: {
    title: "The story so far",
    desc: "Folds each scene into one rolling paragraph — the running account every later scene reads.",
  },
  TRANSLATE: {
    title: "Rewrite into the output language",
    desc: "Only runs when the draft language differs from the story's.",
  },
  AUDIO_EDIT: {
    title: "Audio script",
    desc: "Edits the draft into speakable lines, splits it into blocks and assigns speakers.",
  },
  SUMMARIZE: { title: "Episode summary", desc: "Compresses one episode to 150-250 words and extracts facts." },
  ARC_SUMMARY: { title: "Arc summary", desc: "Compresses older episodes so context stops growing." },
  METADATA: { title: "Metadata", desc: "Title, description, hashtags." },
};

interface P {
  id: string;
  step: string;
  genre: string;
  version: number;
  active: boolean;
  note: string | null;
  content: string;
  wins: boolean;
}

export function Prompts() {
  const { data, isLoading } = useApi<{ prompts: P[]; steps: string[] }>("/api/prompts");
  const { data: genres } = useApi<string[]>("/api/series/genres");
  if (isLoading || !data) return <Loading />;

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-xl font-semibold">Prompt</h1>
        <p className="mt-1 max-w-2xl text-sm text-neutral-400">
          This is where you tune how the AI writes. Each step has one{" "}
          <strong className="text-neutral-200">default</strong> used for every genre, and can have{" "}
          <strong className="text-neutral-200">genre variants</strong> — a variant always beats the
          default when the story is in that genre.
        </p>
        <p className="mt-2 max-w-2xl text-xs text-neutral-600">
          Prompts are not the only lever: per-story settings (setting, world rules, tone, what to
          avoid) live in the Story Bible and are loaded into <em>every</em> scene.
        </p>
      </div>

      {data.steps.map((step) => {
        const forStep = data.prompts.filter((p) => p.step === step);
        const label = STEP_LABEL[step] ?? { title: step, desc: "" };

        return (
          <Section key={step} title={`${label.title} · ${step}`}>
            <p className="-mt-1 text-xs text-neutral-500">{label.desc}</p>

            {forStep.length === 0 ? (
              <p className="rounded border border-amber-900 bg-amber-950/40 p-3 text-sm text-amber-200">
                No prompt for this step — the job will fail. Run <code>pnpm db:seed</code>.
              </p>
            ) : (
              <div className="divide-y divide-neutral-900 rounded border border-neutral-800">
                {forStep.map((p) => (
                  <Link
                    key={p.id}
                    to={`/prompts/${p.id}`}
                    className="flex items-center justify-between gap-3 px-4 py-3 hover:bg-neutral-900"
                  >
                    <div className="flex min-w-0 flex-wrap items-center gap-2">
                      <Badge tone={p.genre === "*" ? "neutral" : "blue"}>
                        {p.genre === "*" ? "default" : p.genre}
                      </Badge>
                      <span className="text-xs text-neutral-600">v{p.version}</span>
                      {!p.active && <Badge tone="red">off</Badge>}
                      {p.active && p.wins && <Badge tone="green">in use</Badge>}
                      {p.active && !p.wins && (
                        <span className="text-xs text-neutral-600">overridden</span>
                      )}
                      <span className="truncate text-xs text-neutral-600">{p.note}</span>
                    </div>
                    <span className="shrink-0 text-xs text-neutral-600">
                      {p.content.length.toLocaleString("en")} characters
                    </span>
                  </Link>
                ))}
              </div>
            )}

            <Form path={`/api/prompts/variants/${step}`} submit="Create, copied from the default">
              <label className="block">
                <span className="mb-1 block text-xs text-neutral-500">
                  Add a variant for a genre
                </span>
                <input
                  name="genre"
                  list="genres-in-use"
                  placeholder="horror"
                  className="rounded border border-neutral-700 bg-neutral-900 p-2 text-sm"
                />
              </label>
            </Form>
          </Section>
        );
      })}

      {/* Suggest the genres stories actually use — a variant for a genre no story
          has will never be reached. */}
      <datalist id="genres-in-use">
        {(genres ?? []).map((g) => (
          <option key={g} value={g} />
        ))}
      </datalist>

      {genres && genres.length > 0 && (
        <p className="text-xs text-neutral-600">
          Genres in use: {genres.join(", ")}. A variant named anything else will never be
          reached.
        </p>
      )}
    </div>
  );
}
