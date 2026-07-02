import express from "express";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import * as store from "./store.js";
import * as brain from "./brain.js";
import * as actions from "./actions.js";
import * as ai from "./ai.js";
import { detectType, deriveTitle, extractActionItems, appendActionSection } from "./ingest.js";
import { newId, nowIso, toListItem, wikiTargets, snippet, NOTE_TYPES } from "./notes.js";
import { welcomeNote } from "./seed.js";

const PORT = 5178;
const app = express();
app.use(express.json({ limit: "10mb" }));

store.init();
if (store.allNotes().size === 0) {
  store.putNote(welcomeNote());
}
brain.refresh(store.allNotes());
// Register [[wikilinks]] for notes that were written to disk directly
// (seed script, hand-edited files) and never passed through the API.
for (const note of store.allNotes().values()) syncWikiLinks(note);

// Pick up files edited outside the app (Obsidian, seed script, sync) live.
store.watchNotes(() => {
  store.init();
  for (const note of store.allNotes().values()) syncWikiLinks(note);
  brain.refresh(store.allNotes());
  console.log(`Reloaded from disk — ${store.allNotes().size} notes`);
});

const threshold = () => store.getSettings().threshold ?? 0.07;

/** Keep wiki links in sync with the [[targets]] currently present in a note. */
function syncWikiLinks(note) {
  const byTitle = new Map();
  for (const n of store.allNotes().values()) byTitle.set(n.title.trim().toLowerCase(), n.id);
  const targets = new Set(
    wikiTargets(note.content)
      .map((t) => byTitle.get(t.toLowerCase()))
      .filter((id) => id && id !== note.id)
  );
  const data = store.getLinks();
  data.links = data.links.filter((l) => {
    if (l.kind !== "wiki" || l.by !== note.id) return true;
    return targets.has(l.a === note.id ? l.b : l.a);
  });
  store.saveLinks();
  for (const target of targets) store.addLink(note.id, target, "wiki", note.id);
}

function dismissedPartners(noteId) {
  const out = new Set();
  for (const key of store.getLinks().dismissed) {
    const [a, b] = key.split("|");
    if (a === noteId) out.add(b);
    if (b === noteId) out.add(a);
  }
  return out;
}

function bundle(note) {
  const linked = [...store.linkedIds(note.id)]
    .map(([id, kind]) => ({ note: toListItem(store.getNote(id)), kind }))
    .filter((l) => l.note);
  const excludeIds = new Set([...store.linkedIds(note.id).keys(), ...dismissedPartners(note.id)]);
  const suggestions = brain
    .suggestionsFor(note.id, { threshold: threshold(), limit: 6, excludeIds })
    .map((s) => ({ note: toListItem(store.getNote(s.id)), score: s.score, sharedTerms: s.sharedTerms }));

  // Unlinked mentions: other notes whose text contains this note's title.
  const mentions = [];
  if (note.title.length >= 5) {
    const needle = note.title.toLowerCase();
    for (const other of store.allNotes().values()) {
      if (other.id === note.id || excludeIds.has(other.id)) continue;
      if (other.content.toLowerCase().includes(needle)) mentions.push(toListItem(other));
      if (mentions.length >= 5) break;
    }
  }

  return { note, concepts: brain.conceptsOf(note.id), linked, suggestions, mentions };
}

// ---------- Notes ----------

app.get("/api/notes", (req, res) => {
  const q = String(req.query.q || "").trim().toLowerCase();
  const type = String(req.query.type || "");
  let notes = [...store.allNotes().values()];
  if (type && NOTE_TYPES.includes(type)) notes = notes.filter((n) => n.type === type);
  if (q) {
    const tagMatch = q.match(/^tag:(\S+)$/);
    if (tagMatch) {
      notes = notes.filter((n) => n.tags.some((t) => t.toLowerCase() === tagMatch[1]));
    } else {
      const words = q.split(/\s+/);
      notes = notes
        .map((n) => {
          const title = n.title.toLowerCase();
          const body = n.content.toLowerCase();
          let score = 0;
          for (const w of words) {
            if (title.includes(w)) score += 3;
            else if (body.includes(w)) score += 1;
            else return null;
          }
          return { n, score };
        })
        .filter(Boolean)
        .sort((a, b) => b.score - a.score || b.n.updated.localeCompare(a.n.updated))
        .map((x) => x.n);
      return res.json(notes.map(toListItem));
    }
  }
  notes.sort((a, b) => b.updated.localeCompare(a.updated));
  res.json(notes.map(toListItem));
});

app.post("/api/notes", async (req, res) => {
  const { content, useAI } = req.body || {};
  if (!content || !String(content).trim()) {
    return res.status(400).json({ error: "Content is empty." });
  }
  const text = String(content);
  let type = NOTE_TYPES.includes(req.body.type) ? req.body.type : detectType(text);
  let title = (req.body.title || "").trim();
  let body = text;
  let aiUsed = false;
  let aiError = null;

  if (useAI && ai.resolveKey(store.getSettings()).key) {
    const { result, error } = await ai.analyzeNote(store.getSettings(), text);
    if (error) {
      aiError = error;
    } else {
      aiUsed = true;
      if (!title) title = result.title;
      if (!req.body.type) type = NOTE_TYPES.includes(result.type) ? result.type : type;
      if (result.summary) body = `> **Summary:** ${result.summary}\n\n${body}`;
      const items = (result.actionItems || []).map(
        (i) => i.text + (i.owner ? ` — ${i.owner}` : "") + (i.due ? ` (due: ${i.due})` : "")
      );
      body = appendActionSection(body, items);
    }
  }
  if (!aiUsed) {
    if (!title) title = deriveTitle(text, type);
    if (type === "meeting") body = appendActionSection(body, extractActionItems(text));
  }

  const note = {
    id: newId(),
    title,
    type,
    tags: Array.isArray(req.body.tags) ? req.body.tags : [],
    created: nowIso(),
    updated: nowIso(),
    content: body,
  };
  store.putNote(note);
  syncWikiLinks(note);
  brain.refresh(store.allNotes());
  res.json({ ...bundle(note), aiUsed, aiError });
});

app.get("/api/notes/:id", (req, res) => {
  const note = store.getNote(req.params.id);
  if (!note) return res.status(404).json({ error: "Note not found." });
  res.json(bundle(note));
});

app.put("/api/notes/:id", (req, res) => {
  const note = store.getNote(req.params.id);
  if (!note) return res.status(404).json({ error: "Note not found." });
  const { title, content, type, tags } = req.body || {};
  if (typeof title === "string" && title.trim()) note.title = title.trim();
  if (typeof content === "string") note.content = content;
  if (NOTE_TYPES.includes(type)) note.type = type;
  if (Array.isArray(tags)) note.tags = tags.map((t) => String(t).trim()).filter(Boolean);
  note.updated = nowIso();
  store.putNote(note);
  syncWikiLinks(note);
  brain.refresh(store.allNotes());
  res.json(bundle(note));
});

app.delete("/api/notes/:id", (req, res) => {
  if (!store.removeNote(req.params.id)) return res.status(404).json({ error: "Note not found." });
  brain.refresh(store.allNotes());
  res.json({ ok: true });
});

app.post("/api/notes/:id/toggle-check", (req, res) => {
  const note = store.getNote(req.params.id);
  if (!note) return res.status(404).json({ error: "Note not found." });
  const next = actions.toggleCheckbox(note.content, Number(req.body?.line));
  if (next === null) return res.status(400).json({ error: "No checkbox on that line." });
  note.content = next;
  note.updated = nowIso();
  store.putNote(note);
  res.json({ note });
});

// ---------- Connections ----------

app.post("/api/suggest", (req, res) => {
  const { content, title, excludeId } = req.body || {};
  const vec = brain.vectorForDraft(String(content || ""), String(title || ""));
  const excludeIds = new Set(excludeId ? [excludeId, ...store.linkedIds(excludeId).keys(), ...dismissedPartners(excludeId)] : []);
  const results = brain
    .similarTo(vec, { threshold: threshold(), limit: 6, excludeIds })
    .map((s) => ({ note: toListItem(store.getNote(s.id)), score: s.score, sharedTerms: s.sharedTerms }));
  res.json({ suggestions: results });
});

app.post("/api/links", (req, res) => {
  const { a, b } = req.body || {};
  if (!store.getNote(a) || !store.getNote(b)) return res.status(404).json({ error: "Note not found." });
  store.addLink(a, b, "manual");
  res.json({ ok: true });
});

app.post("/api/links/remove", (req, res) => {
  store.removeLink(req.body?.a, req.body?.b);
  res.json({ ok: true });
});

app.post("/api/links/dismiss", (req, res) => {
  store.dismissPair(req.body?.a, req.body?.b);
  res.json({ ok: true });
});

app.get("/api/graph", (req, res) => {
  const { links, dismissed } = store.getLinks();
  res.json(brain.graph(store.allNotes(), links, dismissed, { threshold: threshold() }));
});

// ---------- Actions ----------

app.get("/api/actions", (req, res) => {
  res.json({ items: actions.scanActions(store.allNotes()) });
});

// ---------- Settings ----------

function settingsView() {
  const s = store.getSettings();
  const { key, source } = ai.resolveKey(s);
  return {
    aiAvailable: Boolean(key),
    aiSource: source,
    keyMasked: s.anthropicApiKey ? "•••• " + s.anthropicApiKey.slice(-4) : null,
    model: s.model || ai.DEFAULT_MODEL,
    threshold: s.threshold ?? 0.07,
    models: ai.MODELS,
    customInstructions: s.customInstructions || "",
  };
}

app.get("/api/settings", (req, res) => res.json(settingsView()));

app.put("/api/settings", (req, res) => {
  const s = { ...store.getSettings() };
  const { apiKey, model, threshold: th } = req.body || {};
  if (typeof apiKey === "string") {
    if (apiKey.trim()) s.anthropicApiKey = apiKey.trim();
    else delete s.anthropicApiKey;
  }
  if (typeof model === "string" && ai.MODELS.some((m) => m.id === model)) s.model = model;
  if (typeof th === "number" && th >= 0.02 && th <= 0.5) s.threshold = th;
  if (typeof req.body?.customInstructions === "string") {
    const ci = req.body.customInstructions.trim().slice(0, 4000);
    if (ci) s.customInstructions = ci;
    else delete s.customInstructions;
  }
  store.saveSettings(s);
  res.json(settingsView());
});

// ---------- AI deep connections ----------

app.post("/api/ai/deep/:id", async (req, res) => {
  const note = store.getNote(req.params.id);
  if (!note) return res.status(404).json({ error: "Note not found." });
  const excludeIds = new Set([...store.linkedIds(note.id).keys(), ...dismissedPartners(note.id)]);
  const candidates = brain
    .suggestionsFor(note.id, { threshold: Math.max(0.04, threshold() * 0.5), limit: 10, excludeIds })
    .map((s) => {
      const n = store.getNote(s.id);
      return { id: n.id, title: n.title, type: n.type, excerpt: snippet(n.content, 600) };
    });
  if (!candidates.length) return res.json({ connections: [] });

  const { result, error } = await ai.deepConnections(store.getSettings(), note, candidates);
  if (error) return res.status(502).json({ error });
  const connections = result
    .filter((c) => c.related && store.getNote(c.id))
    .sort((a, b) => b.strength - a.strength)
    .map((c) => ({ note: toListItem(store.getNote(c.id)), reason: c.reason, strength: c.strength }));
  res.json({ connections });
});

// ---------- AI distill: source note → concept wiki pages ----------

function conceptContent(c, sourceTitle) {
  const lines = [`> **Definition:** ${c.definition}`, "", String(c.core || "").trim(), ""];
  if (c.principles?.length) lines.push("## Key principles", ...c.principles.map((p) => `- ${p}`), "");
  if (c.examples?.length) lines.push("## Examples", ...c.examples.map((x) => `- ${x}`), "");
  if (c.related?.length) lines.push("## Connections", ...c.related.map((r) => `- [[${r.title}]] — ${r.why}`), "");
  lines.push("## Sources", `- [[${sourceTitle}]]`);
  return lines.join("\n") + "\n";
}

app.post("/api/ai/distill/:id", async (req, res) => {
  const note = store.getNote(req.params.id);
  if (!note) return res.status(404).json({ error: "Note not found." });
  const existingTitles = [...store.allNotes().values()].filter((n) => n.type === "concept").map((n) => n.title);
  const { result, error } = await ai.distillConcepts(store.getSettings(), note, existingTitles);
  if (error) return res.status(502).json({ error });

  const byTitle = new Map([...store.allNotes().values()].map((n) => [n.title.trim().toLowerCase(), n]));
  const created = [];
  const updated = [];
  const touched = [];
  for (const c of result) {
    const title = String(c.title || "").replace(/[\][\n]/g, "").trim().slice(0, 80);
    if (!title) continue;
    const existing = byTitle.get(title.toLowerCase());
    if (existing && existing.type !== "concept") continue; // don't hijack a non-concept note
    if (existing) {
      // Existing concept: add this source (and any new tags) without clobbering content.
      const srcLink = `[[${note.title}]]`;
      if (!existing.content.includes(srcLink)) {
        existing.content = /^## Sources$/m.test(existing.content)
          ? existing.content.replace(/^## Sources$/m, `## Sources\n- ${srcLink}`)
          : existing.content.trimEnd() + `\n\n## Sources\n- ${srcLink}\n`;
      }
      existing.tags = [...new Set([...(existing.tags || []), ...(c.tags || [])])].slice(0, 6);
      existing.updated = nowIso();
      store.putNote(existing);
      touched.push(existing);
      updated.push(existing);
    } else {
      const page = {
        id: newId(),
        title,
        type: "concept",
        tags: (c.tags || []).slice(0, 4),
        created: nowIso(),
        updated: nowIso(),
        content: conceptContent(c, note.title),
      };
      store.putNote(page);
      byTitle.set(title.toLowerCase(), page);
      touched.push(page);
      created.push(page);
    }
  }
  // Sync after all pages exist so in-batch [[links]] resolve.
  for (const page of touched) syncWikiLinks(page);
  brain.refresh(store.allNotes());
  res.json({ created: created.map(toListItem), updated: updated.map(toListItem) });
});

// ---------- AI ask: Q&A over the whole vault ----------

app.post("/api/ai/ask", async (req, res) => {
  const question = String(req.body?.question || "").trim();
  if (!question) return res.status(400).json({ error: "Question is empty." });
  const history = Array.isArray(req.body?.history)
    ? req.body.history.filter((m) => m && (m.role === "user" || m.role === "assistant") && m.content).slice(-8)
    : [];
  // Retrieval: TF-IDF similarity, plus direct title/tag matches the
  // similarity engine misses (it stopwords conversational words).
  const vec = brain.vectorForDraft(question);
  let hits = brain.similarTo(vec, { threshold: 0.02, limit: 8 });
  const hitIds = new Set(hits.map((h) => h.id));
  const qWords = (question.toLowerCase().match(/[a-z0-9][a-z0-9-]+/g) || []).filter((w) => w.length >= 4);
  for (const n of store.allNotes().values()) {
    if (hits.length >= 10) break;
    if (hitIds.has(n.id)) continue;
    const hay = (n.title + " " + n.tags.join(" ")).toLowerCase();
    if (qWords.some((w) => hay.includes(w))) {
      hits.push({ id: n.id });
      hitIds.add(n.id);
    }
  }
  // Broad/meta questions ("what do I focus on?") match nothing textual —
  // fall back to the most recent notes so Claude has something concrete.
  if (hits.length === 0) {
    hits = [...store.allNotes().values()]
      .sort((a, b) => b.updated.localeCompare(a.updated))
      .slice(0, 6)
      .map((n) => ({ id: n.id }));
  }
  const contextNotes = hits.map((h) => {
    const n = store.getNote(h.id);
    return { title: n.title, type: n.type, updated: n.updated, excerpt: snippet(n.content, 1500) };
  });
  // The master catalog: every note, one line each, so vault-wide questions
  // can always be answered even when retrieval finds no excerpts.
  const vaultIndex = [...store.allNotes().values()]
    .sort((a, b) => b.updated.localeCompare(a.updated))
    .slice(0, 200)
    .map((n) => `- "${n.title}" (${n.type}${n.tags.length ? ", tags: " + n.tags.join("/") : ""}) — updated ${n.updated.slice(0, 10)}`)
    .join("\n");
  const { result, error } = await ai.askBrain(store.getSettings(), question, history, contextNotes, vaultIndex);
  if (error) return res.status(502).json({ error });
  res.json({ answer: result, sources: hits.map((h) => toListItem(store.getNote(h.id))) });
});

// ---------- Static (production build) ----------

const DIST = path.join(path.dirname(fileURLToPath(import.meta.url)), "..", "client", "dist");
app.use("/api", (req, res) => res.status(404).json({ error: "Unknown API route." }));
if (fs.existsSync(DIST)) {
  app.use(express.static(DIST));
  app.use((req, res) => res.sendFile(path.join(DIST, "index.html")));
}

app.use((err, req, res, next) => {
  console.error(err);
  res.status(500).json({ error: err.message || "Server error." });
});

app.listen(PORT, () => {
  console.log(`Synapse API listening on http://localhost:${PORT} — ${store.allNotes().size} notes loaded`);
});
