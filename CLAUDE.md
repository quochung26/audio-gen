# Conventions

## Language

**Source code is English** — comments, identifiers, log lines, error messages, test names,
and commit messages.

**The Player's interface is English in both locales.** Strings live in
`apps/player/src/lib/i18n.ts`, one dictionary per locale. `vi` is the reference shape and
`en` is typed as `Dict`, so a key added to one and forgotten in the other fails the build.
Never inline a user-facing string in a component — it will be right in one language and
missing in the other.

**Documentation stays Vietnamese** — `README.md`, `PLAN.md`, `docs/`.

### What stays Vietnamese inside the code

These are DATA, not prose. Translating them changes behaviour:

| Thing | Why |
|---|---|
| `"Audio Truyện"` | The product name — page title, manifest, ID3 tag, lock screen. |
| `Genre.name` in `seed.ts` | Both the lookup key (`Series.genre`) and the label listeners see, and it goes into the RSS `itunes:keywords`. The model-facing name is a separate column, `Genre.promptName`. |
| The `"kinh dị"` genre default in `outline.job.ts`, `routes/series.ts`, `write-story.ts` | Has to match a seeded `Genre.name` or the story gets a genre nothing describes. |
| Vietnamese fixtures in tests | They exercise the Vietnamese path: diacritic stripping in `slugify` / `safeFileName`, XML escaping in the feed, the pronunciation dictionary. |
| The mock provider's placeholder prose | Stands in for a Vietnamese story, and runs through word counting and slugs like the real thing. |
| Two label assertions in `providers/mock.test.ts` | They pin that the OLD Vietnamese prompt labels still parse — the `Prompt` table keeps them until a reseed. |
| The AI disclosure in `lib/rss.ts` | Follows `series.language`, not the reader's language: a feed carries the story's language. Not the same string as the UI's `aiDisclosure`. |

## Commits

`type(scope): subject` — English, imperative, lowercase, no trailing period.

Types: `feat` `fix` `refactor` `perf` `test` `docs` `build` `ci` `chore`

Scopes are workspace names without the `@audio/` prefix — `api` `worker` `studio` `player`
`core` `config` `llm` `database` `audio` `tts` — plus `prompts`, `infra`, `deps`. Omit the
scope when a change genuinely spans the repo.

The body explains **why**, in the same register as this codebase's comments: what breaks
without the change, what was measured, which bug it came from. Wrap at 80 columns. Skip the
body when the subject is genuinely the whole story.

```
fix(player): keep the locale when autoplaying the next episode

PlayerProvider navigated with a bare `/listen/<id>`, so finishing an episode
under /en dropped the listener into Vietnamese mid-story.
```

State what you deliberately did NOT do, when it is the kind of thing a reader would
otherwise assume was an oversight — a route left unrenamed, a string left untranslated.

History before this file is Vietnamese and mostly unprefixed. Leave it as it is.

## Working agreement

A change is done when it is committed, pushed, and green — not when it compiles.
