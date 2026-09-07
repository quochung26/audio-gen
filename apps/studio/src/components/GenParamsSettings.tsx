import { Link } from "react-router";
import { useApi } from "@/lib/api";
import { Section } from "@/components/ui";
import { Form, Loading } from "@/components/Form";
import { GenParamsFields, type GenParamSpec } from "@/components/GenParamsFields";

interface P {
  id: string;
  step: string;
  genre: string;
  version: number;
  active: boolean;
  wins: boolean;
  params: Record<string, number>;
  unknownParams: string[];
}

/**
 * Tune generation parameters for every step on one screen.
 *
 * Lists only the WINNING version of each step — the one the worker actually
 * uses. Listing every variant makes a long table where most rows have no effect
 * on the next run; to edit a variant, open its prompt page.
 */
export function GenParamsSettings() {
  const { data, isLoading } = useApi<{ prompts: P[]; genParams: GenParamSpec[] }>("/api/prompts");
  if (isLoading || !data) return <Loading />;

  const winners = data.prompts.filter((p) => p.wins);

  return (
    <Section title="Generation parameters">
      <p className="-mt-1 text-xs text-neutral-500">
        Each step gets its own parameters because they need different ones: writing wants a
        high <code>temperature</code> for varied prose, while editing and summarising want it low
        to stay close to the source. An empty box falls back to the provider default — the greyed
        number in the box is that default.
      </p>

      <div className="divide-y divide-neutral-900 rounded border border-neutral-800">
        {winners.map((p) => (
          <Form
            key={p.id}
            path={`/api/prompts/${p.id}/params`}
            method="PUT"
            submit="Save"
            className="px-4 py-3"
          >
            <div className="mb-2 flex flex-wrap items-center gap-2">
              <span className="font-mono text-sm text-neutral-200">{p.step}</span>
              {p.genre !== "*" && <span className="text-xs text-neutral-500">· {p.genre}</span>}
              <Link
                to={`/prompts/${p.id}`}
                className="text-xs text-neutral-500 underline hover:text-neutral-300"
              >
                edit prompt
              </Link>
            </div>
            <GenParamsFields
              specs={data.genParams}
              params={p.params}
              unknownParams={p.unknownParams}
              compact
            />
          </Form>
        ))}
      </div>
    </Section>
  );
}
