import { useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { request } from "./api";

/** One character as the CHARACTER job hands it back. */
export interface AutoCharacter {
  name: string;
  role: string | null;
  description: string | null;
  speech: string | null;
  outfit: string | null;
  appearance: string | null;
  voiceHint: string | null;
}

interface JobRow {
  status: "QUEUED" | "RUNNING" | "DONE" | "FAILED" | "CANCELLED";
  error: string | null;
  result: { character?: AutoCharacter } | null;
}

const POLL_MS = 1000;
/** A queued job waiting behind a scene write can sit for a while; a dead worker never arrives. */
const GIVE_UP_MS = 5 * 60_000;

/**
 * Ask the model for one character and wait for it.
 *
 * The API only queues — every model call in this project runs in the worker, so
 * there is nothing to await but the job row. Hence the poll: press the button, watch
 * `/api/jobs/:id` until it lands.
 *
 * With a `seriesId` the job SAVES the character and the returned value is only there
 * to say what happened; without one it is the whole delivery, and the caller puts it
 * into the form being typed.
 */
export function useAutoCharacter() {
  const qc = useQueryClient();
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<Error | null>(null);

  async function run(body: FormData): Promise<AutoCharacter | null> {
    setPending(true);
    setError(null);
    try {
      const { jobId } = await request<{ jobId: string }>("/api/characters/auto", {
        method: "POST",
        body,
      });
      const job = await waitFor(jobId);
      // The job may have written a Character row itself — refresh whatever is on screen.
      await qc.invalidateQueries();
      return job.result?.character ?? null;
    } catch (e) {
      setError(e as Error);
      return null;
    } finally {
      setPending(false);
    }
  }

  return { run, pending, error };
}

async function waitFor(jobId: string): Promise<JobRow> {
  const deadline = Date.now() + GIVE_UP_MS;

  for (;;) {
    const job = await request<JobRow>(`/api/jobs/${jobId}`);
    if (job.status === "DONE") return job;
    if (job.status === "FAILED" || job.status === "CANCELLED") {
      throw new Error(job.error ?? "The character job did not finish.");
    }
    if (Date.now() > deadline) {
      throw new Error(
        "Gave up waiting for the character. Is the worker running? (`pnpm worker`) The job may still finish on its own.",
      );
    }
    await new Promise((r) => setTimeout(r, POLL_MS));
  }
}
