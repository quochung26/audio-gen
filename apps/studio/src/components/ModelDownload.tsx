import { useEffect, useState } from "react";
import { useApi } from "@/lib/api";
import { ErrorNote, Form } from "@/components/Form";
import { Section } from "@/components/ui";

interface Variant {
  quant: string;
  sizeBytes: number;
  /** More than 1 means this build is split across files. */
  parts: number;
  /** The full name `ollama pull` understands. */
  tag: string;
}

/**
 * Quantisation — the trade between size and prose quality.
 *
 * Lower numbers are smaller and faster, but the writing flattens out. Q4_K_M is
 * the balance point most people use; Q6_K is ~35% larger and noticeably smoother.
 *
 * This FIXED list is only right for Ollama's own library. Hugging Face repos
 * each do their own thing, so those get scanned for real — see below.
 */
const QUANTS = [
  { tag: "q4_K_M", label: "Q4_K_M — balanced, most common", hint: "smallest that still holds up" },
  { tag: "q5_K_M", label: "Q5_K_M — a step up from Q4", hint: "~12% larger" },
  { tag: "q6_K", label: "Q6_K — noticeably smoother prose", hint: "~35% larger than Q4" },
  { tag: "q8_0", label: "Q8_0 — near the original", hint: "twice the size of Q4" },
  { tag: "", label: "(Ollama default)", hint: "usually Q4_K_M" },
];

const SUGGESTED = [
  "qwen3:14b",
  "qwen3:8b",
  "gemma3:12b",
  "bge-m3",
  "https://huggingface.co/Qwen/Qwen3-14B-GGUF",
];

/**
 * DECIMAL sizes, to match the numbers Hugging Face shows on a repo page.
 * See the note on the Models page.
 */
function gb(bytes: number): string {
  if (bytes <= 0) return "—";
  return bytes >= 1e9 ? `${(bytes / 1e9).toFixed(1)} GB` : `${Math.round(bytes / 1e6)} MB`;
}

/**
 * Does the Model box point at a Hugging Face repo, or at Ollama's library?
 *
 * Only used to decide WHICH quantisation list to show. Parsing the repo name and
 * checking it exists is the API's job, so guessing wrong here at worst shows the
 * wrong picker and then a clear error. Names in Ollama's library (`qwen3:14b`,
 * `bge-m3`) never contain a "/", so a "/" is a good enough signal.
 */
export function looksLikeHfRepo(input: string): boolean {
  return input.trim().includes("/");
}

/** Wait until typing stops before scanning — one API call per keystroke wastes both ends. */
function useDebounced<T>(value: T, ms: number): T {
  const [settled, setSettled] = useState(value);
  useEffect(() => {
    const t = setTimeout(() => setSettled(value), ms);
    return () => clearTimeout(t);
  }, [value, ms]);
  return settled;
}

/**
 * Pull a model — from Ollama's library or straight from a GGUF repo on Hugging Face.
 *
 * One Model box for both, because from the user's side it is the same job. They
 * differ in where the quantisation list comes from: Ollama's library uses the
 * familiar fixed list, while an HF repo is asked directly and shows only the
 * builds that really exist, with sizes — guessing a tag that is not there earns
 * nothing but an error.
 */
export function ModelDownload({ busy }: { busy: boolean }) {
  const [base, setBase] = useState("qwen3:14b");
  const [quant, setQuant] = useState("q4_K_M");
  const [hfQuant, setHfQuant] = useState("");

  const typed = base.trim();
  const hf = looksLikeHfRepo(typed);
  const repo = useDebounced(typed, 300);

  // Only ask once the box goes quiet. Without the `repo === typed` clause, right
  // after pasting a link `hf` is already true while `repo` still holds the OLD
  // value — the page scans the thing that was just replaced and lists its builds.
  const ready = hf && repo === typed;
  const scan = useApi<{ repo: string; variants: Variant[] }>(
    ready ? `/api/models/hf?repo=${encodeURIComponent(repo)}` : null,
  );
  const scanning = hf && (!ready || scan.isLoading);

  const variants = scan.data?.variants ?? [];
  // The smallest build is the default, and the fallback when switching to a repo
  // that does not have the currently selected level.
  const chosen = variants.find((v) => v.quant === hfQuant) ?? variants[0];
  const tag = hf ? (chosen?.tag ?? "") : quant ? `${base}-${quant}` : base;

  return (
    <Section title="Download a model">
      <Form
        path="/api/models/pull"
        submit={tag ? `Pull ${tag}` : "Pull"}
        // One at a time: pulling two 9 GB models over one connection makes both
        // slow, and the progress bar unreadable.
        disabled={busy || !tag}
        className="space-y-3 rounded border border-neutral-800 p-4"
      >
        <input type="hidden" name="model" value={tag} />

        <label className="block">
          <span className="mb-1 block text-xs text-neutral-500">Model</span>
          <input
            value={base}
            onChange={(e) => setBase(e.target.value)}
            list="model-suggestions"
            aria-label="Model"
            className="w-full rounded border border-neutral-700 bg-neutral-900 p-2 text-sm"
          />
        </label>
        <datalist id="model-suggestions">
          {SUGGESTED.map((m) => (
            <option key={m} value={m} />
          ))}
        </datalist>

        <label className="block">
          <span className="mb-1 block text-xs text-neutral-500">Quantisation</span>
          {hf ? (
            <>
              <select
                value={chosen?.quant ?? ""}
                onChange={(e) => setHfQuant(e.target.value)}
                disabled={variants.length === 0}
                aria-label="Quantisation"
                className="w-full rounded border border-neutral-700 bg-neutral-900 p-2 text-sm disabled:text-neutral-600"
              >
                {variants.length === 0 ? (
                  <option value="">
                    {scanning ? "scanning the repo…" : "— could not scan the repo —"}
                  </option>
                ) : (
                  variants.map((v) => (
                    <option key={v.quant} value={v.quant}>
                      {v.quant} — {gb(v.sizeBytes)}
                      {v.parts > 1 && ` · ${v.parts} parts`}
                    </option>
                  ))
                )}
              </select>
              <span className="mt-1 block text-xs text-neutral-600">
                {chosen && chosen.parts > 1
                  ? "This build is split into parts — the size above is the total."
                  : "Straight from the repo: only builds it actually has."}
              </span>
            </>
          ) : (
            <>
              <select
                value={quant}
                onChange={(e) => setQuant(e.target.value)}
                aria-label="Quantisation"
                className="w-full rounded border border-neutral-700 bg-neutral-900 p-2 text-sm"
              >
                {QUANTS.map((q) => (
                  <option key={q.tag} value={q.tag}>
                    {q.label}
                  </option>
                ))}
              </select>
              <span className="mt-1 block text-xs text-neutral-600">
                {QUANTS.find((q) => q.tag === quant)?.hint}
              </span>
            </>
          )}
        </label>

        {hf && scan.data && (
          <p className="text-xs text-neutral-500">
            <span className="font-mono text-neutral-300">{scan.data.repo}</span> ·{" "}
            {scan.data.variants.length} builds
          </p>
        )}
        <ErrorNote error={scan.error} />

        {tag && (
          <p className="rounded bg-neutral-900 p-2 font-mono text-xs text-neutral-400">
            ollama pull {tag}
          </p>
        )}
        <p className="text-xs text-neutral-600">
          {hf ? (
            <>
              Paste a GGUF repo link and it scans automatically. Ollama only runs{" "}
              <strong className="text-neutral-400">GGUF</strong>, so look for repos ending in{" "}
              <code>-GGUF</code>.
            </>
          ) : (
            "Not every model comes in every quantisation. A tag that does not exist makes Ollama fail, and the error shows up right here."
          )}
        </p>
        {busy && <p className="text-xs text-neutral-600">Another pull is running — wait for it to finish.</p>}
      </Form>
    </Section>
  );
}
