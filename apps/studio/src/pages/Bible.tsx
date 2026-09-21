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

/** Where the story is going. Null for a story outlined before this existed. */
interface Direction {
  endingDirection: string;
  centralQuestion: string;
  corePromise: string;
  escalation: string;
  midpointTurn: string;
}

const EMPTY_DIRECTION: Direction = {
  endingDirection: "",
  centralQuestion: "",
  corePromise: "",
  escalation: "",
  midpointTurn: "",
};

export function Bible() {
  const { id } = useParams();
  const { data, isLoading, error } = useApi<{
    world: World;
    direction: Direction | null;
    missingDirection: string[];
    bible: string;
    title: string;
  }>(`/api/series/${id}/world`);
  if (isLoading || !data) return <Loading error={error} />;
  const { world } = data;
  const direction = data.direction ?? EMPTY_DIRECTION;
  const missing = data.missingDirection ?? [];

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

      {/* Above the world setup, because it is a wider scope: the setting is where the
          story happens, this is what it is for. The Story Bible prints them in the same
          order, so the page reads the way the model does. */}
      <Section title="Where this story is going">
        {missing.length > 0 && (
          <p className="rounded border border-amber-900/60 bg-amber-950/20 p-3 text-xs text-amber-200">
            {missing.length === 5
              ? "This story was outlined before it had a destination. Nothing tells the model where it ends, so every episode after this one is being planned without one."
              : `Not said yet: ${missing.join(", ")}. A blank field is left out of the Story Bible entirely.`}
          </p>
        )}
        <Form
          path={`/api/series/${id}/direction`}
          method="PUT"
          submit="Save direction"
          className="space-y-5"
        >
          <Field
            name="endingDirection"
            label="Where it ends up"
            hint="In theme, not plot: what has changed by the end, and for whom. Not the last scene, and never a number of episodes."
            placeholder="The driver stops running from the route and accepts that the last fare was always his own."
            defaultValue={direction.endingDirection}
            rows={2}
          />
          <Field
            name="centralQuestion"
            label="The question the ending answers"
            hint="One question. Everything else is the story getting round to asking it properly."
            placeholder="How long do the living owe the dead?"
            defaultValue={direction.centralQuestion}
            rows={2}
          />
          <Field
            name="corePromise"
            label="What it promises every episode"
            hint="The reason to come back, not the reason to start."
            placeholder="Every episode: one passenger, one old debt called in."
            defaultValue={direction.corePromise}
            rows={2}
          />
          <Field
            name="escalation"
            label="How the pressure rises"
            hint="What the early episodes cost the characters, what the middle costs, what the end costs."
            placeholder="Early: strangers. Middle: people he knew. Late: his own family."
            defaultValue={direction.escalation}
            rows={2}
          />
          <Field
            name="midpointTurn"
            label="When it changes gear"
            hint="Where the way they have been coping stops working. Without one, episode 15 is episode 3 somewhere new."
            placeholder="He stops refusing the fares and starts hunting for the depot himself."
            defaultValue={direction.midpointTurn}
            rows={2}
          />
        </Form>
      </Section>

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
            placeholder={"Old Depot: an abandoned bus station on the edge of town"}
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
