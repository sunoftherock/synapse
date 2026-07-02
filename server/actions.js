// Action items live inside notes as GitHub-style checkboxes ("- [ ] …").
// This module scans all notes for them and toggles them in place, so the
// note content stays the single source of truth.

const CHECKBOX_RE = /^(\s*[-*+]\s+\[)([ xX])(\]\s+)(.*)$/;
const DUE_RE = /\(due:\s*(\d{4}-\d{2}-\d{2})\)/i;

export function scanActions(notesMap) {
  const items = [];
  for (const note of notesMap.values()) {
    const lines = (note.content || "").split("\n");
    for (let i = 0; i < lines.length; i++) {
      const m = lines[i].match(CHECKBOX_RE);
      if (!m) continue;
      const text = m[4].trim();
      const due = text.match(DUE_RE);
      items.push({
        noteId: note.id,
        noteTitle: note.title,
        noteType: note.type,
        line: i + 1,
        text: text.replace(DUE_RE, "").trim(),
        done: m[2].toLowerCase() === "x",
        due: due ? due[1] : null,
        noteUpdated: note.updated,
      });
    }
  }
  items.sort((a, b) => {
    if (a.done !== b.done) return a.done ? 1 : -1;
    if (a.due && b.due) return a.due.localeCompare(b.due);
    if (a.due !== b.due) return a.due ? -1 : 1;
    return b.noteUpdated.localeCompare(a.noteUpdated);
  });
  return items;
}

/** Flip the checkbox on a given 1-based line. Returns new content or null. */
export function toggleCheckbox(content, line) {
  const lines = content.split("\n");
  const idx = line - 1;
  if (idx < 0 || idx >= lines.length) return null;
  const m = lines[idx].match(CHECKBOX_RE);
  if (!m) return null;
  const next = m[2].toLowerCase() === "x" ? " " : "x";
  lines[idx] = m[1] + next + m[3] + m[4];
  return lines.join("\n");
}
