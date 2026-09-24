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
| The `"horror"` genre default in `outline.job.ts`, `routes/series.ts`, `write-story.ts` | Not Vietnamese any more, but listed here for the same reason: it has to match a seeded `Genre.name` exactly or the story gets a genre nothing describes. |
| Vietnamese fixtures in tests | They exercise the Vietnamese path: diacritic stripping in `slugify` / `safeFileName`, XML escaping in the feed, the pronunciation dictionary. |
| The mock provider's placeholder prose | Stands in for a Vietnamese story, and runs through word counting and slugs like the real thing. |
| Two label assertions in `providers/mock.test.ts` | They pin that the OLD Vietnamese prompt labels still parse — the `Prompt` table keeps them until a reseed. |
| The AI disclosure in `lib/rss.ts` | Follows `series.language`, not the reader's language: a feed carries the story's language. Not the same string as the UI's `aiDisclosure`. |

### Genre names are English, and that is not settled

`Genre.name` used to be Vietnamese and is now English (`horror`, `danmei`,
`western setting`). It is still the label a LISTENER sees — the Player page and the RSS
`itunes:keywords` — so a Vietnamese story currently advertises an English genre. That is
known and deliberate; it gets fixed on the Player side, by giving it its own labels, not
by renaming the catalogue back.

`Genre.promptName` survives for the cases where the model wants a fuller label than the
listener does (`xianxia` → `xianxia (cultivation fantasy)`). Blank falls back to `name`,
which is now most of them.

A name is a lookup key in `Series.genre`, `Series.tags` and `Prompt.genre`, none of them
foreign keys. Renaming one in `seed.ts` alone strips the description from the Bible of
every story still on the old name, and nothing reports it — the prose just drifts a run
or two later. Rename through `scripts/rename-genres-en.mts`, which moves the columns in
the same transaction.

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

## Looking at the UI

**Use Playwright, not the Claude-in-Chrome tools.** The extension cannot open Studio at
all: `localhost:3000` and `127.0.0.1:3000` both come back as an error page while `curl`
on the same URL returns 200, and reaching it over the machine's LAN address is the only
thing that works. It also drops its connection mid-session and loses its tab group
between calls, so a page you were halfway through inspecting has to be reopened.

Playwright opens `localhost` directly, survives a whole session, and can drive a form and
then read what changed — which is the part that actually verifies something. It is not a
dependency of this repo; run it from the scratchpad:

```bash
# once; ~200MB lands in ~/Library/Caches/ms-playwright
npx --yes playwright@1.63.0 install chromium --only-shell
cd "$SCRATCHPAD" && npm install playwright@1.63.0 --no-save
node shot.mjs
```

Drive the real thing rather than screenshotting it. The page tests run under jsdom with
`fetch` stubbed, so they never touch the API — that is how a fixture counting
`_count.scenes` where the route returns `_count.chapters` survived until something read
it. A Playwright run catches that class, and the failing-request log catches the rest:
listen for `response` with `status() >= 400` across the pages you touched.

Two things to get right, both learned by getting them wrong:

- **Wait for the state you expect, not for a duration.** `waitForFunction` on the text
  that should appear. A fixed `waitForTimeout` after a submit reported a button missing
  that was there, and the bug was in the check.
- **Put back what you changed.** Driving a form writes to the real database. Undo it in
  the same script and assert the undo landed.

## Working agreement

A change is done when it is committed, pushed, and green — not when it compiles.
