// Ingestion heuristics: detect what kind of text was pasted (meeting
// transcript, Jira ticket, plain note) and pull out titles + action items.
// These are the zero-setup fallbacks; the AI layer (ai.js) does a better job
// when an Anthropic API key is configured.

export function detectType(text) {
  const head = text.slice(0, 600);
  const jiraKey = /(^|\s)[A-Z][A-Z0-9]{1,9}-\d+\b/.test(head);
  const jiraFields =
    (text.match(/^\s*(acceptance criteria|story points?|sprint|reporter|assignee|epic( link)?|priority|fix version)s?\s*[::]/gim) || []).length;
  if ((jiraKey && jiraFields >= 1) || jiraFields >= 2 || (jiraKey && /\bdescription\b/i.test(head))) {
    return "jira";
  }

  const speakerLines = (text.match(/^\s*[A-Z][\w.'-]{1,20}(?: [A-Z][\w.'-]{1,20})?\s*(?:\[\d{1,2}:\d{2}(?::\d{2})?\])?\s*:\s+\S/gm) || []).length;
  const meetingWords = /\b(attendees|agenda|meeting notes|minutes|standup|stand-up|sync|1:1|retro(spective)?|kick-?off)\b/i.test(head);
  const timestamps = (text.match(/\b\d{1,2}:\d{2}(:\d{2})?\b/g) || []).length;
  if (speakerLines >= 3 || meetingWords || (speakerLines >= 1 && timestamps >= 2)) {
    return "meeting";
  }
  return "note";
}

export function deriveTitle(text, type) {
  const lines = text.split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
  if (type === "jira") {
    const keyMatch = text.match(/(^|\s)([A-Z][A-Z0-9]{1,9}-\d+)\b/);
    const key = keyMatch ? keyMatch[2] : null;
    // First line that isn't just the key or a field label.
    const summary = lines.find(
      (l) => !/^[A-Z][A-Z0-9]{1,9}-\d+$/.test(l) && !/^\w[\w ]{0,20}:$/.test(l) && l.length > 8
    );
    if (key && summary) return `${key}: ${clip(summary.replace(key, "").replace(/^[\s:—-]+/, ""))}`;
    if (key) return key;
  }
  const first = lines[0] ? clip(lines[0].replace(/^#+\s*/, "")) : "";
  if (type === "meeting") {
    const date = new Date().toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
    if (!first || /^[A-Z][\w.'-]*\s*:/.test(lines[0])) return `Meeting — ${date}`;
    return first;
  }
  return first || "Untitled note";
}

function clip(s, max = 80) {
  s = s.trim();
  return s.length > max ? s.slice(0, max).trimEnd() + "…" : s;
}

/**
 * Heuristic action-item extraction. Finds "Action items:" style sections and
 * inline "action:/todo:" lines. Returns plain strings.
 */
export function extractActionItems(text) {
  const lines = text.split(/\r?\n/);
  const items = [];
  let inSection = false;
  for (const raw of lines) {
    const line = raw.trim();
    if (/^#{0,4}\s*(action items?|next steps?|follow[- ]?ups?|todos?)\s*[::]?\s*$/i.test(line)) {
      inSection = true;
      continue;
    }
    if (inSection) {
      if (!line || /^#{1,6}\s/.test(line)) {
        inSection = false;
      } else {
        const bullet = line.replace(/^[-*+•]\s*(\[[ xX]\]\s*)?/, "").trim();
        if (bullet) items.push(bullet);
        continue;
      }
    }
    const inline = line.match(/^[-*+•]?\s*(?:action(?: item)?|todo|follow[- ]?up)\s*[::]\s*(.+)$/i);
    if (inline) items.push(inline[1].trim());
  }
  return [...new Set(items)];
}

/**
 * For meeting-type ingests without checkboxes, turn detected action items
 * into a checkbox section so they land on the Action Items dashboard.
 */
export function appendActionSection(content, items) {
  if (!items.length || /- \[[ xX]\]/.test(content)) return content;
  const section = "\n\n## Action Items\n" + items.map((i) => `- [ ] ${i}`).join("\n") + "\n";
  return content.trimEnd() + section;
}
