"use client";

import { useActionState } from "react";
import type { AuthState } from "@/app/actions/auth";

export function AuthForm({
  action,
  submit,
  children,
}: {
  action: (prev: AuthState, data: FormData) => Promise<AuthState>;
  submit: string;
  children: React.ReactNode;
}) {
  const [state, formAction, pending] = useActionState(action, {});

  return (
    <form action={formAction} className="space-y-3">
      {children}
      <button
        type="submit"
        disabled={pending}
        className="w-full rounded bg-neutral-100 px-4 py-2.5 text-sm font-medium text-neutral-900 disabled:opacity-50"
      >
        {pending ? "Đang xử lý…" : submit}
      </button>
      {state.error && (
        <p role="alert" className="rounded border border-red-900 bg-red-950/40 p-3 text-sm text-red-200">
          {state.error}
        </p>
      )}
    </form>
  );
}

export function AuthInput({
  name,
  label,
  type = "text",
  ...rest
}: { name: string; label: string } & React.InputHTMLAttributes<HTMLInputElement>) {
  return (
    <label className="block">
      <span className="mb-1 block text-xs text-neutral-400">{label}</span>
      <input
        {...rest}
        name={name}
        type={type}
        className="w-full rounded border border-neutral-800 bg-neutral-900 p-2.5 text-sm outline-none focus:border-neutral-600"
      />
    </label>
  );
}
