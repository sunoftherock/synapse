# Synapse

A personal connected-brain notetaker. Like Notion, but yours: meeting notes, Jira pastes, articles, and raw thoughts — automatically linked into a knowledge graph, distilled into concept wiki pages, and queryable in plain English.

Everything is local. Every note is a plain markdown file. The AI layer is optional.

> Inspired by the vault + schema + Claude workflow in Evgeni Rusev's ["How I Built My Second Brain with Obsidian + Claude Code"](https://medium.com/@evgeni.n.rusev/how-i-built-my-second-brain-with-obsidian-claude-code-9fb54b7665ca), reimagined as a self-contained app with the connection engine built in.

## Quick start

```
npm install
npm run seed     # optional: sample notes so the graph has something to show
npm run dev      # → http://localhost:5173
```

For an everyday "just run it" setup:

```
npm run build
npm start        # single process on http://localhost:5178
```

Requires Node 20+.

## What it does

**Capture anything.** Paste a meeting transcript, a Jira ticket, an article, or type freeform. Synapse auto-detects what it is, titles it, and extracts action items.

**Connections find themselves.** Every note is analyzed locally (term extraction + TF-IDF similarity). Related notes are suggested *with the reason* ("both mention: po page, vendor filter"), live while you type. Accept ✓ to link, dismiss ✕ to never see the pairing again. `[[Wikilinks]]` (with autocomplete) make explicit links; they work in both directions.

**The graph is your mind map.** Sources radiate out to concepts; solid edges are real links, dashed edges are suggestions. Hover a node to light up its neighborhood, search to find nodes, filter by type, click to open.

**Concept wiki pages** (`✦ Distill into concept pages` on any note, with an API key): Claude reads a source note and distills the durable ideas into standalone pages — one concept, one file, with a definition, key principles, examples, and *selective* connections ("only link where understanding one genuinely changes how you see the other"). Distill your tenth source and it links into everything the first nine created — the knowledge compounds.

**Ask your brain** (`Ask` in the sidebar, with an API key): ask questions across everything you've captured. Synapse retrieves the relevant notes locally and Claude synthesizes an answer that cites your notes as clickable links. It's not just retrieval — it combines ideas across notes and tells you when your notes don't cover something.

**Action items are checkboxes.** Any `- [ ] task` line in any note aggregates onto the Actions dashboard. Add `(due: 2026-07-10)` for dates. Checking one edits the source markdown — one source of truth.

**Your schema.** In Settings, write standing instructions for how the AI should maintain *your* knowledge base — what counts as a concept, your tagging conventions, your quality bar. It's appended to every AI operation. Vague schema, vague output; precise schema, precise output.

## Your data is files

- Notes: `data/notes/*.md` — markdown with a small frontmatter block. Open the folder in Obsidian or any editor; **external edits hot-reload while the app runs**, so you can use both side by side.
- Links & dismissals: `data/links.json`
- Settings (including a saved API key): `data/settings.json`
- Deleted notes go to `data/trash/` first.

The whole `data/` directory is gitignored — your notes never leave your machine unless you send a question or note to the Claude API yourself.

## AI setup (optional)

Set the `ANTHROPIC_API_KEY` environment variable, or paste a key in **Settings → Claude** ([get one here](https://platform.claude.com/)). Default model is Claude Opus 4.8; Sonnet 5 and Haiku 4.5 are selectable for lower cost. Without a key, capture/linking/graph/actions all work — the suggestions just come from local text analysis alone.

| Feature | Works offline | With API key |
|---|---|---|
| Capture + type detection | ✅ | + AI titles, summaries, action-item extraction |
| Connection suggestions | ✅ (TF-IDF, with shared-term reasons) | + "why these connect" explanations |
| Graph, wikilinks, actions | ✅ | — |
| Distill into concept pages | — | ✅ |
| Ask your brain (Q&A) | — | ✅ |

## How the brain works

`server/brain.js` extracts distinctive terms from each note — unigrams, bigram phrases ("po page", "vendor sync"), acronyms (PO, ERP), and ticket keys (PROC-142) — weights them with TF-IDF (titles, tags, and wikilink targets boosted), and scores note pairs by cosine similarity. Pairs above the sensitivity threshold (Settings) become suggestions, and their top shared terms become the explanation. All local, all instant. The Claude layer sits on top for semantic judgment: distillation, connection reasoning, and synthesis.

## Layout

```
server/   Express API (plain ESM JS): store, brain, ingest, actions, ai
client/   React + TypeScript UI (Vite): sidebar, notes, capture, graph, ask, actions, settings
data/     your notes and app state (created on first run, gitignored)
```

## License

MIT
