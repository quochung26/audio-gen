"use client";

import Link from "next/link";
import { useState } from "react";
import { usePlayer } from "./PlayerProvider";

const RATES = [0.75, 1, 1.25, 1.5, 1.75, 2];
const SLEEP_OPTIONS = [10, 20, 30, 45, 60];

function fmt(ms: number): string {
  const total = Math.max(0, Math.round(ms / 1000));
  const m = Math.floor(total / 60);
  const s = total % 60;
  return `${m}:${String(s).padStart(2, "0")}`;
}

export function MiniPlayer() {
  const p = usePlayer();
  const [panel, setPanel] = useState<"none" | "rate" | "sleep">("none");

  if (!p.track) return null;

  const pct = p.durationMs > 0 ? (p.positionMs / p.durationMs) * 100 : 0;
  const sleepLeft = p.sleepAt ? Math.max(0, p.sleepAt - Date.now()) : 0;

  return (
    <div className="fixed inset-x-0 bottom-0 z-50 border-t border-neutral-800 bg-neutral-950/95 backdrop-blur">
      {/* Thanh tiến độ kéo được — nằm sát mép trên cho dễ chạm bằng ngón cái */}
      <input
        type="range"
        min={0}
        max={Math.max(1, p.durationMs)}
        value={p.positionMs}
        onChange={(e) => p.seek(Number(e.target.value))}
        aria-label="Vị trí phát"
        className="block h-1 w-full cursor-pointer appearance-none bg-neutral-800 accent-neutral-100"
        style={{
          background: `linear-gradient(to right, #e5e5e5 ${pct}%, #262626 ${pct}%)`,
        }}
      />

      {panel === "rate" && (
        <div className="flex flex-wrap gap-2 border-b border-neutral-900 px-4 py-3">
          {RATES.map((r) => (
            <button
              key={r}
              onClick={() => {
                p.setRate(r);
                setPanel("none");
              }}
              className={`rounded px-3 py-1.5 text-sm ${
                p.rate === r ? "bg-neutral-100 text-neutral-900" : "bg-neutral-800 text-neutral-300"
              }`}
            >
              {r}×
            </button>
          ))}
        </div>
      )}

      {panel === "sleep" && (
        <div className="flex flex-wrap items-center gap-2 border-b border-neutral-900 px-4 py-3">
          {SLEEP_OPTIONS.map((m) => (
            <button
              key={m}
              onClick={() => {
                p.setSleepMinutes(m);
                setPanel("none");
              }}
              className="rounded bg-neutral-800 px-3 py-1.5 text-sm text-neutral-300"
            >
              {m} phút
            </button>
          ))}
          {p.sleepAt && (
            <button
              onClick={() => {
                p.setSleepMinutes(null);
                setPanel("none");
              }}
              className="rounded px-3 py-1.5 text-sm text-neutral-500 underline"
            >
              huỷ hẹn giờ
            </button>
          )}
        </div>
      )}

      <div className="mx-auto flex max-w-3xl items-center gap-3 px-4 py-3">
        <div className="min-w-0 flex-1">
          <Link href={`/nghe/${p.track.episodeId}`} className="block truncate text-sm">
            {p.track.title}
          </Link>
          <div className="truncate text-xs text-neutral-500">
            {p.track.seriesTitle} · {fmt(p.positionMs)} / {fmt(p.durationMs)}
            {p.sleepAt ? ` · tắt sau ${fmt(sleepLeft)}` : ""}
          </div>
        </div>

        <button
          onClick={() => p.skip(-15000)}
          aria-label="Lùi 15 giây"
          className="shrink-0 px-2 py-1 text-xs text-neutral-400"
        >
          −15s
        </button>

        <button
          onClick={p.toggle}
          aria-label={p.playing ? "Tạm dừng" : "Phát"}
          className="grid size-11 shrink-0 place-items-center rounded-full bg-neutral-100 text-neutral-900"
        >
          {p.playing ? "❚❚" : "▶"}
        </button>

        <button
          onClick={() => p.skip(15000)}
          aria-label="Tiến 15 giây"
          className="shrink-0 px-2 py-1 text-xs text-neutral-400"
        >
          +15s
        </button>

        <button
          onClick={() => setPanel(panel === "rate" ? "none" : "rate")}
          className="shrink-0 px-2 py-1 text-xs text-neutral-400"
        >
          {p.rate}×
        </button>

        <button
          onClick={() => setPanel(panel === "sleep" ? "none" : "sleep")}
          aria-label="Hẹn giờ tắt"
          className={`shrink-0 px-2 py-1 text-xs ${p.sleepAt ? "text-amber-400" : "text-neutral-400"}`}
        >
          ⏱
        </button>
      </div>
    </div>
  );
}
