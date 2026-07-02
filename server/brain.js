// The connection engine. Extracts distinctive terms from every note (unigrams,
// bigram phrases, acronyms like "PO", Jira keys like PROC-142), builds TF-IDF
// vectors, and scores note-to-note similarity so related notes surface
// automatically — with the shared terms as the human-readable "why".
import { stripMd, wikiTargets } from "./notes.js";

const STOPWORDS = new Set(
  (
    "a about above after again against all also am an and any are aren as at be because been before being below between " +
    "both but by can cannot could couldn did didn do does doesn doing don down during each few for from further get got had " +
    "hadn has hasn have haven having he her here hers herself him himself his how i if in into is isn it its itself just let " +
    "like make me more most mustn my myself no nor not now of off on once only or other our ours ourselves out over own re " +
    "really said same she should shouldn so some something such than that the their theirs them themselves then there these " +
    "they this those through to too under until up us use used using very want was wasn we were weren what when where which " +
    "while who whom why will with won would wouldn you your yours yourself yourselves " +
    "one two three thing things way lot bit going go goes went come came still even much many may might per via etc yeah yes " +
    "ok okay hmm um uh know think see look looks looking need needs needed new old right left good bad well actually maybe " +
    "kind sort just really basically stuff item items note notes today yesterday tomorrow week day time am pm todo take talk " +
    "talked say says said tell told ask asked work working works meeting"
  ).split(/\s+/)
);

// "meeting" is stopworded above because every meeting note contains it — it
// would otherwise dominate similarity between unrelated meetings.

const JIRA_RE = /\b[A-Z][A-Z0-9]{1,9}-\d+\b/g;
const ACRONYM_RE = /\b[A-Z][A-Z0-9]{1,5}s?\b/g;

function singularize(t) {
  if (t.length > 3 && t.endsWith("s") && !t.endsWith("ss") && !t.endsWith("us") && !t.endsWith("is")) {
    return t.slice(0, -1);
  }
  return t;
}

/**
 * Extract weighted terms from text: Map<term, count>.
 * Includes unigrams and bigram phrases ("po page", "vendor sync").
 */
export function extractTerms(text, weight = 1) {
  const counts = new Map();
  if (!text) return counts;
  const bump = (term, w = weight) => counts.set(term, (counts.get(term) || 0) + w);

  // Jira ticket keys are strong identity signals — count them whole.
  const jiraKeys = text.match(JIRA_RE) || [];
  for (const key of jiraKeys) bump(key.toLowerCase(), weight * 2);
  let cleaned = text.replace(JIRA_RE, " ").replace(/https?:\/\/\S+/g, " ");

  // Acronyms (PO, QA, MES…) survive the min-length filter below.
  const acronyms = new Set();
  for (const m of cleaned.match(ACRONYM_RE) || []) {
    acronyms.add(singularize(m.toLowerCase()));
  }

  const plain = stripMd(cleaned).toLowerCase();
  for (const line of plain.split(/[.!?;\n]+/)) {
    const words = line.match(/[a-z0-9][a-z0-9_'/-]*/g) || [];
    const kept = words.map((w) => {
      const t = singularize(w.replace(/^['-]+|['-]+$/g, ""));
      if (!t || STOPWORDS.has(t)) return null;
      if (/^\d+([./-]\d+)*$/.test(t)) return null; // bare numbers
      if (t.length < 3 && !acronyms.has(t) && !/\d/.test(t)) return null;
      return t;
    });
    for (let i = 0; i < kept.length; i++) {
      if (!kept[i]) continue;
      bump(kept[i]);
      if (kept[i + 1]) bump(`${kept[i]} ${kept[i + 1]}`, weight * 1.5);
    }
  }
  return counts;
}

/** Raw term counts for a note, with title/tags/wikilinks boosted. */
function noteTerms(note) {
  const counts = extractTerms(note.content, 1);
  for (const [term, c] of extractTerms(note.title, 3)) counts.set(term, (counts.get(term) || 0) + c);
  for (const tag of note.tags || []) {
    for (const [term, c] of extractTerms(tag, 4)) counts.set(term, (counts.get(term) || 0) + c);
  }
  for (const target of wikiTargets(note.content)) {
    for (const [term, c] of extractTerms(target, 2)) counts.set(term, (counts.get(term) || 0) + c);
  }
  return counts;
}

// ---- Index state (rebuilt on every write — cheap at personal scale) ----
const state = { vectors: new Map(), df: new Map(), N: 0 };

export function refresh(notesMap) {
  const rawByNote = new Map();
  state.df = new Map();
  state.N = notesMap.size;
  for (const note of notesMap.values()) {
    const counts = noteTerms(note);
    rawByNote.set(note.id, counts);
    for (const term of counts.keys()) state.df.set(term, (state.df.get(term) || 0) + 1);
  }
  state.vectors = new Map();
  for (const [id, counts] of rawByNote) {
    state.vectors.set(id, normalize(weigh(counts)));
  }
}

function idf(term) {
  return Math.log(1 + state.N / (state.df.get(term) || 1));
}

function weigh(counts) {
  const vec = new Map();
  for (const [term, count] of counts) {
    vec.set(term, (1 + Math.log(count)) * idf(term));
  }
  return vec;
}

function normalize(vec) {
  let sum = 0;
  for (const w of vec.values()) sum += w * w;
  const norm = Math.sqrt(sum) || 1;
  for (const [t, w] of vec) vec.set(t, w / norm);
  return vec;
}

/** Vector for unsaved draft text (live suggestions while typing). */
export function vectorForDraft(content, title = "") {
  const counts = extractTerms(content, 1);
  for (const [term, c] of extractTerms(title, 3)) counts.set(term, (counts.get(term) || 0) + c);
  return normalize(weigh(counts));
}

function cosine(a, b) {
  const [small, large] = a.size <= b.size ? [a, b] : [b, a];
  let dot = 0;
  for (const [t, w] of small) {
    const w2 = large.get(t);
    if (w2) dot += w * w2;
  }
  return dot;
}

function sharedTerms(a, b, k = 4) {
  const shared = [];
  const [small, large] = a.size <= b.size ? [a, b] : [b, a];
  for (const [t, w] of small) {
    const w2 = large.get(t);
    if (w2) shared.push([t, w * w2]);
  }
  shared.sort((x, y) => y[1] - x[1]);
  // Drop unigrams that are already covered by a stronger phrase ("po" vs "po page").
  const out = [];
  for (const [t] of shared) {
    if (out.some((seen) => seen.includes(t) || t.includes(seen))) continue;
    out.push(t);
    if (out.length === k) break;
  }
  return out;
}

/** Rank notes similar to the given vector. */
export function similarTo(vec, { excludeIds = new Set(), threshold = 0.1, limit = 6 } = {}) {
  if (!vec || vec.size === 0) return [];
  const results = [];
  for (const [id, other] of state.vectors) {
    if (excludeIds.has(id)) continue;
    const score = cosine(vec, other);
    if (score >= threshold) {
      results.push({ id, score, sharedTerms: sharedTerms(vec, other) });
    }
  }
  results.sort((a, b) => b.score - a.score);
  return results.slice(0, limit);
}

export function suggestionsFor(noteId, opts = {}) {
  const vec = state.vectors.get(noteId);
  const excludeIds = new Set([noteId, ...(opts.excludeIds || [])]);
  return similarTo(vec, { ...opts, excludeIds });
}

/** The most distinctive terms of a note — its "concepts". */
export function conceptsOf(noteId, k = 8) {
  const vec = state.vectors.get(noteId);
  if (!vec) return [];
  const ranked = [...vec.entries()].sort((a, b) => b[1] - a[1]);
  const out = [];
  for (const [term] of ranked) {
    if (out.some((seen) => seen.includes(term) || term.includes(seen))) continue;
    out.push(term);
    if (out.length === k) break;
  }
  return out;
}

/** Nodes + edges for the mind-map view. */
export function graph(notesMap, links, dismissed, { threshold = 0.1 } = {}) {
  const nodes = [];
  const edges = [];
  const seen = new Set();
  const degree = new Map();

  for (const l of links) {
    if (!notesMap.has(l.a) || !notesMap.has(l.b)) continue;
    seen.add(`${l.a}|${l.b}`);
    edges.push({ source: l.a, target: l.b, kind: "link", label: l.kind });
    degree.set(l.a, (degree.get(l.a) || 0) + 1);
    degree.set(l.b, (degree.get(l.b) || 0) + 1);
  }

  const dismissedSet = new Set(dismissed);
  for (const id of notesMap.keys()) {
    const sugg = suggestionsFor(id, { threshold: threshold * 1.3, limit: 3 });
    for (const s of sugg) {
      const key = id < s.id ? `${id}|${s.id}` : `${s.id}|${id}`;
      if (seen.has(key) || dismissedSet.has(key)) continue;
      seen.add(key);
      edges.push({ source: id, target: s.id, kind: "suggested", label: s.sharedTerms.join(", ") });
      degree.set(id, (degree.get(id) || 0) + 1);
      degree.set(s.id, (degree.get(s.id) || 0) + 1);
    }
  }

  for (const note of notesMap.values()) {
    nodes.push({ id: note.id, title: note.title, type: note.type, degree: degree.get(note.id) || 0 });
  }
  return { nodes, edges };
}
