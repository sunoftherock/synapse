// File-backed storage. Notes are individual .md files in data/notes; links and
// settings are small JSON files. Everything is held in memory and written
// through on change — plenty for a personal corpus of thousands of notes.
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { parseNote, serializeNote } from "./notes.js";

const DATA_DIR = path.join(path.dirname(fileURLToPath(import.meta.url)), "..", "data");
const NOTES_DIR = path.join(DATA_DIR, "notes");
const TRASH_DIR = path.join(DATA_DIR, "trash");
const LINKS_FILE = path.join(DATA_DIR, "links.json");
const SETTINGS_FILE = path.join(DATA_DIR, "settings.json");

const notes = new Map();
let selfWriteAt = 0;
// links: [{a, b, kind: 'wiki'|'manual'|'ai', by?, created}] with a < b canonically.
// dismissed: ["idA|idB"] pairs the user never wants suggested again.
let linksData = { links: [], dismissed: [] };
let settings = {};

export function pairKey(a, b) {
  return a < b ? `${a}|${b}` : `${b}|${a}`;
}

function atomicWrite(file, content) {
  const tmp = file + ".tmp";
  try {
    fs.writeFileSync(tmp, content, "utf8");
    fs.renameSync(tmp, file);
  } catch {
    // OneDrive can briefly lock files mid-sync; fall back to a direct write.
    fs.writeFileSync(file, content, "utf8");
    try { fs.rmSync(tmp, { force: true }); } catch { /* ignore */ }
  }
}

function readJson(file, fallback) {
  try {
    return { ...fallback, ...JSON.parse(fs.readFileSync(file, "utf8")) };
  } catch {
    return { ...fallback };
  }
}

export function init() {
  for (const dir of [DATA_DIR, NOTES_DIR, TRASH_DIR]) fs.mkdirSync(dir, { recursive: true });
  notes.clear();
  for (const file of fs.readdirSync(NOTES_DIR)) {
    if (!file.endsWith(".md")) continue;
    const raw = fs.readFileSync(path.join(NOTES_DIR, file), "utf8");
    const note = parseNote(raw, path.basename(file, ".md"));
    notes.set(note.id, note);
  }
  linksData = readJson(LINKS_FILE, { links: [], dismissed: [] });
  settings = readJson(SETTINGS_FILE, {});
}

export function allNotes() {
  return notes;
}

export function getNote(id) {
  return notes.get(id);
}

export function putNote(note) {
  notes.set(note.id, note);
  selfWriteAt = Date.now();
  atomicWrite(path.join(NOTES_DIR, note.id + ".md"), serializeNote(note));
  return note;
}

export function removeNote(id) {
  const note = notes.get(id);
  if (!note) return false;
  notes.delete(id);
  selfWriteAt = Date.now();
  const src = path.join(NOTES_DIR, id + ".md");
  try {
    fs.renameSync(src, path.join(TRASH_DIR, `${Date.now()}-${id}.md`));
  } catch {
    try { fs.rmSync(src, { force: true }); } catch { /* already gone */ }
  }
  // Drop links involving this note.
  linksData.links = linksData.links.filter((l) => l.a !== id && l.b !== id);
  saveLinks();
  return true;
}

export function getLinks() {
  return linksData;
}

export function saveLinks() {
  atomicWrite(LINKS_FILE, JSON.stringify(linksData, null, 2));
}

export function addLink(a, b, kind, by) {
  if (a === b) return;
  const [x, y] = a < b ? [a, b] : [b, a];
  if (linksData.links.some((l) => l.a === x && l.b === y)) return;
  linksData.links.push({ a: x, b: y, kind, by, created: new Date().toISOString() });
  linksData.dismissed = linksData.dismissed.filter((k) => k !== pairKey(a, b));
  saveLinks();
}

export function removeLink(a, b) {
  const key = pairKey(a, b);
  linksData.links = linksData.links.filter((l) => pairKey(l.a, l.b) !== key);
  saveLinks();
}

export function dismissPair(a, b) {
  const key = pairKey(a, b);
  if (!linksData.dismissed.includes(key)) linksData.dismissed.push(key);
  saveLinks();
}

export function linkedIds(noteId) {
  const out = new Map(); // otherId -> kind
  for (const l of linksData.links) {
    if (l.a === noteId) out.set(l.b, l.kind);
    else if (l.b === noteId) out.set(l.a, l.kind);
  }
  return out;
}

/**
 * Watch data/notes for changes made outside the app (another editor, Obsidian,
 * a sync client, the seed script) and reload when they happen. Our own writes
 * are suppressed via the selfWriteAt timestamp.
 */
export function watchNotes(onExternalChange) {
  let timer = null;
  try {
    fs.watch(NOTES_DIR, () => {
      if (Date.now() - selfWriteAt < 1000) return;
      clearTimeout(timer);
      timer = setTimeout(onExternalChange, 500);
    });
  } catch (e) {
    console.warn("Note watching unavailable:", e.message);
  }
}

export function getSettings() {
  return settings;
}

export function saveSettings(next) {
  settings = next;
  atomicWrite(SETTINGS_FILE, JSON.stringify(settings, null, 2));
}
