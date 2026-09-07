import { useRef, type FormEvent, type ReactNode } from "react";
import { ApiError, useAction } from "@/lib/api";
import { Button } from "./ui";

/**
 * A form that posts to the API and shows errors IN PLACE.
 *
 * A validation error is a return value (400 with `{error}`), not an exception
 * that blows up the page — the user keeps what they were typing and gets to
 * read why.
 */
export function Form({
  path,
  method = "POST",
  children,
  submit,
  className,
  onDone,
  resetOnSuccess,
  disabled,
}: {
  path: string;
  method?: "POST" | "PUT" | "DELETE";
  children?: ReactNode;
  submit: string;
  className?: string;
  onDone?: (result: { ok?: string | boolean }) => void;
  resetOnSuccess?: boolean;
  /** Not ready to submit — the button dims; the caller says why. */
  disabled?: boolean;
}) {
  const ref = useRef<HTMLFormElement>(null);
  const action = useAction(method);

  function handle(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const form = e.currentTarget;
    action.mutate(
      { path, body: new FormData(form) },
      {
        onSuccess: (r) => {
          if (resetOnSuccess) form.reset();
          onDone?.(r as { ok?: string | boolean });
        },
      },
    );
  }

  const ok = action.data && typeof (action.data as { ok?: unknown }).ok === "string";
  const warnings = ((action.data as { warnings?: string[] } | undefined)?.warnings ?? []).filter(
    (w): w is string => typeof w === "string",
  );

  return (
    <form ref={ref} onSubmit={handle} className={className}>
      {children}
      <div className="mt-3 flex flex-wrap items-center gap-3">
        <Button variant="primary" type="submit" disabled={action.isPending || disabled}>
          {action.isPending ? "Sending…" : submit}
        </Button>
        {ok && (
          <span role="status" className="text-sm text-emerald-300">
            {String((action.data as { ok: string }).ok)}
          </span>
        )}
      </div>
      {/* A warning is NOT an error: the work is done, but there is something to know. */}
      {warnings.length > 0 && (
        <ul className="mt-2 space-y-1 rounded border border-amber-900 bg-amber-950/30 p-3 text-sm text-amber-200">
          {warnings.map((w) => (
            <li key={w}>{w}</li>
          ))}
        </ul>
      )}
      <ErrorNote error={action.error} />
    </form>
  );
}

/** A button for an action that needs no input — click and it runs. */
export function ActionButton({
  path,
  method = "POST",
  body,
  children,
  variant = "ghost",
  confirmText,
  onDone,
}: {
  path: string;
  method?: "POST" | "PUT" | "DELETE";
  body?: Record<string, string>;
  children: ReactNode;
  variant?: "default" | "primary" | "ghost";
  confirmText?: string;
  onDone?: (result: unknown) => void;
}) {
  const action = useAction(method);
  return (
    <span className="inline-flex flex-col">
      <Button
        variant={variant}
        disabled={action.isPending}
        onClick={() => {
          if (confirmText && !window.confirm(confirmText)) return;
          action.mutate({ path, body }, { onSuccess: onDone });
        }}
      >
        {action.isPending ? "…" : children}
      </Button>
      <ErrorNote error={action.error} />
    </span>
  );
}

export function ErrorNote({ error }: { error: ApiError | Error | null }) {
  if (!error) return null;
  return (
    <p
      role="alert"
      className="mt-2 rounded border border-red-900 bg-red-950/40 p-3 text-sm text-red-200"
    >
      {error.message}
    </p>
  );
}

export function Loading() {
  return <p className="p-6 text-sm text-neutral-600">Loading…</p>;
}
