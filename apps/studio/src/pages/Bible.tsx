import { Link, useParams } from "react-router";
import { useApi } from "@/lib/api";
import { Section } from "@/components/ui";
import { Form, Loading } from "@/components/Form";
import { Field } from "@/components/Field";

interface World {
  setting: string;
  tone: string;
  rules: string[];
  constraints: string[];
  glossary: Array<{ term: string; meaning: string }>;
}

export function Bible() {
  const { id } = useParams();
  const { data, isLoading } = useApi<{ world: World; bible: string; title: string }>(
    `/api/series/${id}/world`,
  );
  if (isLoading || !data) return <Loading />;
  const { world } = data;

  return (
    <div className="space-y-8">
      <div>
        <Link to={`/series/${id}`} className="text-xs text-neutral-500 underline">
          ← {data.title}
        </Link>
        <h1 className="mt-2 text-xl font-semibold">World setup</h1>
        <p className="mt-1 max-w-2xl text-sm text-neutral-400">
          This is loaded into every scene, so it is what keeps episode 30 obeying rules set in
          episode 1. Editing here does <strong className="text-neutral-200">not</strong> lose the
          outline, and regenerating the outline does{" "}
          <strong className="text-neutral-200">not</strong> lose this.
        </p>
      </div>

      <div className="grid gap-8 lg:grid-cols-2">
        <Form path={`/api/series/${id}/world`} method="PUT" submit="Save setup" className="space-y-5">
          <Field
            name="setting"
            label="Setting"
            hint="Time, place, atmosphere."
            placeholder="A central-Vietnam highway, 1970s. Night coaches, empty road, fog."
            defaultValue={world.setting}
            rows={3}
          />
          <Field
            name="rules"
            label="World rules"
            hint="One rule per line. Things that are ALWAYS true — the AI may not contradict them."
            placeholder={"Ghosts only appear after midnight\nThe dead never say their own name"}
            defaultValue={world.rules.join("\n")}
            rows={5}
          />
          <Field
            name="tone"
            label="Tone"
            hint="How you want it told."
            placeholder="Slow, full of silences. Fear from atmosphere, not gore."
            defaultValue={world.tone}
            rows={2}
          />
          <Field
            name="constraints"
            label="Forbidden"
            hint="One per line. Things that must NOT appear."
            placeholder={"No violence against children\nNever end on it being a dream"}
            defaultValue={world.constraints.join("\n")}
            rows={3}
          />
          <Field
            name="glossary"
            label="Glossary"
            hint="One per line, as «term: meaning». Keeps the AI from renaming things between episodes."
            placeholder={"Bến Cũ: an abandoned bus depot on the edge of town"}
            defaultValue={world.glossary.map((g) => `${g.term}: ${g.meaning}`).join("\n")}
            rows={3}
          />
        </Form>

        <Section title="Preview — this is what the AI actually reads">
          <pre className="max-h-[36rem] overflow-auto rounded border border-neutral-800 bg-neutral-900/60 p-4 text-xs leading-relaxed whitespace-pre-wrap text-neutral-400">
            {data.bible}
          </pre>
          <p className="text-xs text-neutral-600">
            Loaded into the <code>system</code> prompt for every scene, summary and audio edit.
            Save, then reload to see the new version.
          </p>
        </Section>
      </div>
    </div>
  );
}
