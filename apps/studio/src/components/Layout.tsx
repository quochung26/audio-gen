import type { ReactNode } from "react";
import { Link, NavLink } from "react-router";

/** Day-to-day work: your content. */
const NAV = [
  ["/series", "Stories"],
  // Character cards, genres and the music library sit here rather than under
  // Settings: all three are MATERIAL you collect over time and bring into a story,
  // not part of how the machine runs. A genre is picked on the New story form the
  // same way a character card is, and its description is the writer's own words
  // about how that genre should read — tuned like a prompt, but owned like content.
  ["/character-cards", "Character cards"],
  ["/genres", "Genres"],
  ["/tracks", "Music library"],
  ["/stats", "Stats"],
  ["/comments", "Comments"],
] as const;

/**
 * How the machine runs — kept apart, at the bottom of the column.
 *
 * A group, not a dropdown: opening a menu to reveal two items costs a click
 * and hides nothing worth hiding.
 *
 * Prompts live here rather than in the main nav because they are how the MACHINE
 * writes, not content of yours — same category as picking a model.
 */
const SETTINGS_NAV = [
  ["/prompts", "Prompt"],
  ["/model", "Models & language"],
] as const;

function itemClass({ isActive }: { isActive: boolean }): string {
  return `block rounded px-3 py-1.5 text-sm transition ${
    isActive ? "bg-neutral-800 text-neutral-100" : "text-neutral-400 hover:bg-neutral-900 hover:text-neutral-100"
  }`;
}

export function Layout({ children }: { children: ReactNode }) {
  return (
    // Stack on narrow screens so the sidebar does not eat half the width; two
    // columns from md up.
    <div className="flex min-h-screen flex-col md:flex-row">
      <aside className="shrink-0 border-b border-neutral-800 px-4 py-5 md:sticky md:top-0 md:h-screen md:w-56 md:border-b-0 md:border-r">
        <div className="flex h-full flex-col gap-6">
          <Link to="/" className="px-3 text-sm font-semibold leading-tight">
            Audio Truyện
            <span className="block text-xs font-normal text-neutral-500">Studio</span>
          </Link>

          <Link
            to="/series/new"
            className="rounded bg-neutral-100 px-3 py-1.5 text-center text-sm font-medium text-neutral-900 hover:bg-white"
          >
            New story
          </Link>

          <nav className="flex flex-wrap gap-1 md:flex-col">
            {NAV.map(([to, label]) => (
              <NavLink key={to} to={to} className={itemClass}>
                {label}
              </NavLink>
            ))}
          </nav>

          {/* Pushed to the bottom when there is room — settings are not daily work. */}
          <nav className="flex flex-wrap gap-1 md:mt-auto md:flex-col">
            <span className="px-3 pb-1 text-xs uppercase tracking-wide text-neutral-600">
              Settings
            </span>
            {SETTINGS_NAV.map(([to, label]) => (
              <NavLink key={to} to={to} className={itemClass}>
                {label}
              </NavLink>
            ))}
          </nav>
        </div>
      </aside>

      <main className="min-w-0 flex-1 px-6 py-8">
        <div className="mx-auto max-w-5xl">{children}</div>
      </main>
    </div>
  );
}
