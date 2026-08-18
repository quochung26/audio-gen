export function Badge({ children, tone = "neutral" }: { children: React.ReactNode; tone?: string }) {
  const tones: Record<string, string> = {
    neutral: "bg-neutral-800 text-neutral-300",
    blue: "bg-blue-900/60 text-blue-200",
    green: "bg-emerald-900/60 text-emerald-200",
    red: "bg-red-900/60 text-red-200",
    amber: "bg-amber-900/60 text-amber-200",
  };
  return <span className={`rounded px-2 py-0.5 text-xs ${tones[tone]}`}>{children}</span>;
}

export const STATUS_TONE: Record<string, string> = {
  IDEA: "neutral",
  OUTLINED: "neutral",
  DRAFTING: "blue",
  DRAFTED: "amber",
  SCRIPTED: "green",
  RENDERING: "blue",
  READY: "green",
  PUBLISHED: "green",
  FAILED: "red",
  QUEUED: "neutral",
  RUNNING: "blue",
  DONE: "green",
  CANCELLED: "neutral",
};

export function Button({
  children,
  variant = "default",
  ...props
}: React.ButtonHTMLAttributes<HTMLButtonElement> & { variant?: "default" | "primary" | "ghost" }) {
  const styles = {
    default: "border border-neutral-700 hover:bg-neutral-800",
    primary: "bg-neutral-100 text-neutral-900 hover:bg-white font-medium",
    ghost: "text-neutral-400 hover:text-neutral-100",
  };
  return (
    <button
      {...props}
      className={`rounded px-3 py-1.5 text-sm transition disabled:opacity-40 ${styles[variant]}`}
    >
      {children}
    </button>
  );
}

export function Section({ title, children, action }: { title: string; children: React.ReactNode; action?: React.ReactNode }) {
  return (
    <section className="space-y-3">
      <div className="flex items-center justify-between">
        <h2 className="text-sm font-medium text-neutral-300">{title}</h2>
        {action}
      </div>
      {children}
    </section>
  );
}
