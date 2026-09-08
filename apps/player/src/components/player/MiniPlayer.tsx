"use client";

import Link from "next/link";
import { useState } from "react";
import { usePlayer } from "./PlayerProvider";
import { useLocale } from "../LocaleProvider";
import { Cover } from "../Cover";
import { Back15Icon, Forward15Icon, PauseIcon, PlayIcon, TimerIcon } from "../Icon";

const RATES = [0.75, 1, 1.25, 1.5, 1.75, 2];
const SLEEP_OPTIONS = [10, 20, 30, 45, 60];

function fmt(ms: number): string {
  const total = Math.max(0, Math.round(ms / 1000));
  const m = Math.floor(total / 60);
  const s = total % 60;
  return `${m}:${String(s).padStart(2, "0")}`;
}

/** A chip in the rate / sleep panels. One shape, so the two panels cannot drift apart. */
function Chip({
  on,
  onClick,
  children,
}: {
  on?: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      onClick={onClick}
      aria-pressed={on}
      className={`rounded-full px-3.5 py-1.5 text-sm transition ${
        on
          ? "bg-accent font-medium text-neutral-950"
          : "bg-raised text-neutral-300 hover:bg-neutral-700"
      }`}
    >
      {children}
    </button>
  );
}

export function MiniPlayer() {
  const { t, href } = useLocale();
  const p = usePlayer();
  const [panel, setPanel] = useState<"none" | "rate" | "sleep">("none");

  if (!p.track) return null;

  const pct = p.durationMs > 0 ? (p.positionMs / p.durationMs) * 100 : 0;
  const sleepLeft = p.sleepAt ? Math.max(0, p.sleepAt - Date.now()) : 0;

  return (
    <div className="fixed inset-x-0 bottom-0 z-50 border-t border-line bg-surface/95 pb-safe backdrop-blur-md">
      {/* The seek bar rides the top EDGE — the easiest place on a phone to hit without
          looking, and it doubles as the line separating the bar from the page. */}
      <input
        type="range"
        min={0}
        max={Math.max(1, p.durationMs)}
        value={p.positionMs}
        onChange={(e) => p.seek(Number(e.target.value))}
        aria-label={t.playbackPosition}
        className="seek block h-3 w-full"
        style={{
          background: `linear-gradient(to right, var(--color-accent) ${pct}%, var(--color-line) ${pct}%)`,
          backgroundSize: "100% 3px",
          backgroundPosition: "0 0",
          backgroundRepeat: "no-repeat",
        }}
      />

      {panel === "rate" && (
        <div className="mx-auto flex max-w-3xl flex-wrap gap-2 border-b border-line px-4 pb-3">
          {RATES.map((r) => (
            <Chip
              key={r}
              on={p.rate === r}
              onClick={() => {
                p.setRate(r);
                setPanel("none");
              }}
            >
              {r}×
            </Chip>
          ))}
        </div>
      )}

      {panel === "sleep" && (
        <div className="mx-auto flex max-w-3xl flex-wrap items-center gap-2 border-b border-line px-4 pb-3">
          {SLEEP_OPTIONS.map((m) => (
            <Chip key={m} onClick={() => { p.setSleepMinutes(m); setPanel("none"); }}>
              {t.minutes(m)}
            </Chip>
          ))}
          {p.sleepAt && (
            <button
              onClick={() => {
                p.setSleepMinutes(null);
                setPanel("none");
              }}
              className="px-2 py-1.5 text-sm text-neutral-500 underline hover:text-neutral-300"
            >
              {t.cancelTimer}
            </button>
          )}
        </div>
      )}

      <div className="mx-auto flex max-w-3xl items-center gap-3 px-3 py-2.5">
        <Link
          href={href(`/listen/${p.track.episodeId}`)}
          className="flex min-w-0 flex-1 items-center gap-3"
        >
          <Cover src={p.track.coverUrl ?? null} size={44} />
          <span className="min-w-0 flex-1">
            <span className="block truncate text-sm font-medium">{p.track.title}</span>
            <span className="block truncate text-xs text-neutral-500">
              {p.track.seriesTitle} · {fmt(p.positionMs)} / {fmt(p.durationMs)}
              {p.sleepAt ? t.stopsIn(fmt(sleepLeft)) : ""}
            </span>
          </span>
        </Link>

        {/* Skip is hidden on the narrowest phones: at that width the five controls
            squeezed the title down to a couple of words. The listen page keeps them. */}
        <button
          onClick={() => p.skip(-15000)}
          aria-label={t.back15}
          className="hidden size-10 shrink-0 place-items-center rounded-full text-neutral-400 hover:bg-raised hover:text-neutral-100 sm:grid"
        >
          <Back15Icon size={22} />
        </button>

        <button
          onClick={p.toggle}
          aria-label={p.playing ? t.pause : t.play}
          className="grid size-12 shrink-0 place-items-center rounded-full bg-neutral-100 text-neutral-950 transition active:scale-95"
        >
          {p.playing ? <PauseIcon size={22} /> : <PlayIcon size={22} />}
        </button>

        <button
          onClick={() => p.skip(15000)}
          aria-label={t.forward15}
          className="hidden size-10 shrink-0 place-items-center rounded-full text-neutral-400 hover:bg-raised hover:text-neutral-100 sm:grid"
        >
          <Forward15Icon size={22} />
        </button>

        <button
          onClick={() => setPanel(panel === "rate" ? "none" : "rate")}
          aria-pressed={panel === "rate"}
          className={`grid h-10 shrink-0 place-items-center rounded-full px-2.5 text-xs tabular-nums transition ${
            panel === "rate" ? "bg-raised text-neutral-100" : "text-neutral-400 hover:bg-raised"
          }`}
        >
          {p.rate}×
        </button>

        <button
          onClick={() => setPanel(panel === "sleep" ? "none" : "sleep")}
          aria-label={t.sleepTimer}
          aria-pressed={panel === "sleep"}
          className={`grid size-10 shrink-0 place-items-center rounded-full transition ${
            p.sleepAt ? "text-accent" : "text-neutral-400"
          } ${panel === "sleep" ? "bg-raised" : "hover:bg-raised"}`}
        >
          <TimerIcon size={20} />
        </button>
      </div>
    </div>
  );
}
