// Note model: parsing/serializing markdown files with a simple frontmatter block.
// Notes live on disk as plain .md so they stay portable (Obsidian, git, any editor).

export const NOTE_TYPES = ["note", "meeting", "jira", "research", "concept"];

export function newId() {
  return "n_" + Date.now().toString(36) + "-" + Math.random().toString(36).slice(2, 6);
}

export function nowIso() {
  return new Date().toISOString();
}

/** Parse a raw .md file (frontmatter + body) into a note object. */
export function parseNote(raw, fallbackId) {
  const note = {
    id: fallbackId,
    title: "Untitled",
    type: "note",
    tags: [],
    created: nowIso(),
    updated: nowIso(),
    content: raw,
  };
  if (raw.startsWith("---\n") || raw.startsWith("---\r\n")) {
    const end = raw.indexOf("\n---", 3);
    if (end !== -1) {
      const head = raw.slice(raw.indexOf("\n") + 1, end);
      const bodyStart = raw.indexOf("\n", end + 1);
      note.content = bodyStart === -1 ? "" : raw.slice(bodyStart + 1).replace(/^\r?\n/, "");
      for (const line of head.split(/\r?\n/)) {
        const sep = line.indexOf(":");
        if (sep === -1) continue;
        const key = line.slice(0, sep).trim();
        const value = line.slice(sep + 1).trim();
        if (key === "tags") {
          note.tags = value ? value.split(",").map((t) => t.trim()).filter(Boolean) : [];
        } else if (key === "type") {
          note.type = NOTE_TYPES.includes(value) ? value : "note";
        } else if (["id", "title", "created", "updated"].includes(key)) {
          if (value) note[key] = value;
        }
      }
    }
  }
  return note;
}

export function serializeNote(note) {
  const title = String(note.title || "Untitled").replace(/\s+/g, " ").trim();
  const head = [
    "---",
    `id: ${note.id}`,
    `title: ${title}`,
    `type: ${note.type}`,
    `tags: ${(note.tags || []).join(", ")}`,
    `created: ${note.created}`,
    `updated: ${note.updated}`,
    "---",
    "",
  ].join("\n");
  return head + (note.content || "");
}

/** Strip markdown syntax for snippets and search text. */
export function stripMd(text) {
  return String(text || "")
    .replace(/```[\s\S]*?```/g, " ")
    .replace(/`([^`]*)`/g, "$1")
    .replace(/!\[[^\]]*\]\([^)]*\)/g, " ")
    .replace(/\[\[([^\]]+)\]\]/g, "$1")
    .replace(/\[([^\]]*)\]\([^)]*\)/g, "$1")
    .replace(/^#{1,6}\s+/gm, "")
    .replace(/^\s*[-*+]\s+\[[ xX]\]\s+/gm, "")
    .replace(/^\s*[-*+]\s+/gm, "")
    .replace(/^\s*>\s?/gm, "")
    .replace(/[*_~]{1,3}([^*_~]+)[*_~]{1,3}/g, "$1")
    .replace(/\s+/g, " ")
    .trim();
}

export function snippet(content, max = 150) {
  const text = stripMd(content);
  return text.length > max ? text.slice(0, max).trimEnd() + "…" : text;
}

/** Shape sent to the client in note lists. */
export function toListItem(note) {
  return {
    id: note.id,
    title: note.title,
    type: note.type,
    tags: note.tags,
    created: note.created,
    updated: note.updated,
    snippet: snippet(note.content),
  };
}

/** All [[wikilink]] targets in a note body. */
export function wikiTargets(content) {
  const out = [];
  const re = /\[\[([^\]\n]+)\]\]/g;
  let m;
  while ((m = re.exec(content || ""))) {
    const t = m[1].trim();
    if (t) out.push(t);
  }
  return out;
}
