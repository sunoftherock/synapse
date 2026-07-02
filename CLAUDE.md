# Synapse — connected-brain notetaker

Personal tool for Rocky (public repo): notes/meetings/Jira pastes stored as markdown files, auto-linked by a local TF-IDF "brain", optional Claude analysis layer (distill-to-concepts, vault Q&A). Second-brain workflow modeled on Evgeni Rusev's Obsidian + Claude Code article (linked in README). See README.md for user-facing docs.

## Commands

- `npm run dev` — API (node --watch, :5178) + Vite (:5173, proxies /api) via concurrently
- `npm run seed` — sample notes (idempotent; `--force` to re-add)
- `npm run typecheck` — tsc over client only (server is plain JS)
- `npm run build && npm start` — production single-process on :5178

## Architecture

- **server/** — Express 5, ESM JS, no database. `store.js` holds everything in memory, writes through to `data/notes/*.md` (frontmatter: id/title/type/tags/created/updated) + `data/links.json` + `data/settings.json`. `brain.js` rebuilds the full TF-IDF index on every write (fine at personal scale). `index.js` wires routes and syncs `[[wikilinks]]` → links on save **and at boot** (boot sync covers seeded/hand-edited files).
- **client/** — React 19 + TS, react-router v7. `App.tsx` provides context (notes list, settings, search). Editor = CodeMirror with `[[` autocomplete; Preview = react-markdown + remark-gfm with clickable checkboxes (line numbers from remark node positions map 1-based onto note content — the wikilink preprocessing preserves line counts, don't break that).
- **AI (server/ai.js)** — structured outputs via `output_config.format` json_schema (analyze, deep-connections, distill). `askBrain` is an **agentic tool-use loop** (max 8 turns, `tool_choice: none` forces an answer on the last): Claude gets the vault index up front plus `search_notes`/`read_note` tools (callbacks injected by the route in index.js, which records a `trace` and the notes actually read as `sources`). It must READ notes before relying on them — no snippet-only conclusions. Answers are markdown citing `[[wikilinks]]` (client renders via Preview → clickable). Default model `claude-opus-4-8`; key from env `ANTHROPIC_API_KEY` or settings; `settings.customInstructions` ("Your schema" in Settings UI) is appended to every AI system prompt via `sys()`. Everything must keep working with no key.
- **Distill** (`POST /api/ai/distill/:id`) creates/updates `concept`-type notes from a source note: template = definition blockquote, core idea, principles, examples, connections (selective, with why), sources. Existing concepts get the new source appended under `## Sources`, never clobbered. All pages are created before `syncWikiLinks` runs so in-batch links resolve.
- **External edits hot-reload**: `store.watchNotes()` watches data/notes (self-writes suppressed via `selfWriteAt`) → full `store.init()` + wiki re-sync + brain refresh. Don't add per-note write paths that bypass `putNote`, or self-write suppression breaks.

## Conventions & gotchas

- Note types are exactly: note, meeting, jira, research, concept (`NOTE_TYPES` in server/notes.js).
- Links are canonical pairs (a < b) with `kind: wiki|manual|ai`; wiki links carry `by` (the declaring note) so stale ones can be pruned on save.
- Action items = GFM checkboxes in note content; the Actions page and preview both toggle via `POST /api/notes/:id/toggle-check {line}` (1-based). Note content is the single source of truth — never store action state elsewhere.
- Suggestion threshold default 0.07 (tuned against seed data: real connections score ~0.08–0.17, noise < 0.06). Graph uses threshold×1.3 for dashed edges, max 3 per note.
- data/ is user data — never wipe it; deletes go through data/trash/.
- WAL/SQLite was deliberately avoided (OneDrive sync folder); atomic tmp+rename writes with direct-write fallback.
