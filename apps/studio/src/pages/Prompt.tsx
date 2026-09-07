import { Link, useNavigate, useParams } from "react-router";
import { GenParamsFields, type GenParamSpec } from "@/components/GenParamsFields";
import { useApi } from "@/lib/api";
import { Badge, Section } from "@/components/ui";
import { ActionButton, Form, Loading } from "@/components/Form";
import { TextInput } from "@/components/Field";

interface Data {
  prompt: {
    id: string;
    step: string;
    genre: string;
    version: number;
    active: boolean;
    content: string;
    model: string | null;
    note: string | null;
    params: Record<string, number>;
    unknownParams: string[];
    updatedAt: string;
  };
  genParams: GenParamSpec[];
  wins: boolean;
  check: { used: string[]; unknown: string[]; unused: string[] };
  available: string[];
  runs: number;
}

export function Prompt() {
  const { id } = useParams();
  const nav = useNavigate();
  const { data, isLoading } = useApi<Data>(`/api/prompts/${id}`);
  if (isLoading || !data) return <Loading />;

  const { prompt: p, check, available } = data;

  return (
    <div className="space-y-8">
      <div>
        <Link to="/prompts" className="text-xs text-neutral-500 underline">
          ← Prompt
        </Link>
        <div className="mt-2 flex flex-wrap items-center gap-3">
          <h1 className="text-xl font-semibold">{p.step}</h1>
          <Badge tone={p.genre === "*" ? "neutral" : "blue"}>
            {p.genre === "*" ? "default — every genre" : `genre: ${p.genre}`}
          </Badge>
          <span className="text-xs text-neutral-600">v{p.version}</span>
          {!p.active ? (
            <Badge tone="red">off</Badge>
          ) : data.wins ? (
            <Badge tone="green">in use</Badge>
          ) : (
            <Badge tone="amber">on, but overridden</Badge>
          )}
        </div>
        <p className="mt-1 text-xs text-neutral-600">
          {data.runs > 0 ? `Used in ${data.runs} runs` : "No run has used this version"} · updated{" "}
          {new Date(p.updatedAt).toLocaleString("vi")}
        </p>
      </div>

      <Section title="Available variables">
        <div className="space-y-2 rounded border border-neutral-800 p-4">
          <div className="flex flex-wrap gap-2">
            {available.map((v) => (
              <code
                key={v}
                className={`rounded px-2 py-0.5 text-xs ${
                  check.used.includes(v)
                    ? "bg-emerald-900/50 text-emerald-200"
                    : "bg-neutral-800 text-neutral-500"
                }`}
              >
                {`{{${v}}}`}
              </code>
            ))}
          </div>
          <p className="text-xs text-neutral-600">
            Green is in use; grey is passed in by this step but ignored by the prompt. Using a
            variable outside the list is blocked on save — slip one through and the job dies midway
            through a run.
          </p>
          {check.unknown.length > 0 && (
            <p className="rounded border border-red-900 bg-red-950/40 p-2 text-xs text-red-200">
              Using variables that do not exist: {check.unknown.map((v) => `{{${v}}}`).join(", ")}
            </p>
          )}
        </div>
      </Section>

      <Section title="Content">
        <Form path={`/api/prompts/${p.id}`} method="PUT" submit="Save" className="space-y-3">
          <textarea
            name="content"
            rows={26}
            defaultValue={p.content}
            spellCheck={false}
            className="w-full rounded border border-neutral-800 bg-neutral-900 p-3 font-mono text-xs leading-relaxed outline-none focus:border-neutral-600"
          />

          <div className="grid gap-3 sm:grid-cols-2">
            <TextInput
              name="model"
              label="Model (blank = the configured default)"
              defaultValue={p.model ?? ""}
              placeholder="qwen3:14b"
            />
            <TextInput name="note" label="Note" defaultValue={p.note ?? ""} />
          </div>

          <div>
            <span className="mb-2 block text-xs text-neutral-500">
              Generation parameters — blank uses the provider default (the greyed number)
            </span>
            <GenParamsFields
              specs={data.genParams}
              params={p.params}
              unknownParams={p.unknownParams}
            />
          </div>
        </Form>
      </Section>

      <Section title="Other">
        <div className="flex flex-wrap items-center gap-3 rounded border border-neutral-800 p-4">
          <ActionButton path={`/api/prompts/${p.id}/toggle`} method="PUT">
            {p.active ? "turn this off" : "turn back on"}
          </ActionButton>
          {p.genre !== "*" && (
            <ActionButton
              path={`/api/prompts/${p.id}`}
              method="DELETE"
              confirmText={`Delete the "${p.genre}" variant?`}
              onDone={() => nav("/prompts")}
            >
              delete variant
            </ActionButton>
          )}
          <span className="text-xs text-neutral-600">
            {p.genre === "*"
              ? "The default cannot be deleted — every genre without a variant falls back to it."
              : `Delete it and "${p.genre}" stories go back to the default.`}
          </span>
        </div>
      </Section>
    </div>
  );
}
