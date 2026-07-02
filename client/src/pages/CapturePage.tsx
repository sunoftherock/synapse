import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { api } from "../api";
import { useApp } from "../App";
import type { NoteType, Suggestion } from "../types";
import { TYPE_COLORS, TYPE_LABELS } from "../types";

export const NOTE_TYPE_OPTIONS: { value: NoteType; label: string }[] = [
  { value: "note", label: "Note" },
  { value: "meeting", label: "Meeting" },
  { value: "jira", label: "Jira" },
  { value: "research", label: "Research" },
  { value: "concept", label: "Concept" },
];

/** Lightweight mirror of the server's type detection, for instant feedback. */
function guessType(text: string): NoteType {
  const head = text.slice(0, 600);
  const jiraFields = (text.match(/^\s*(acceptance criteria|story points?|sprint|reporter|assignee|epic|priority)s?\s*[::]/gim) || []).length;
  if (jiraFields >= 1 && /(^|\s)[A-Z][A-Z0-9]{1,9}-\d+\b/.test(head)) return "jira";
  if (jiraFields >= 2) return "jira";
  const speakers = (text.match(/^\s*[A-Z][\w.'-]{1,20}(?: [A-Z][\w.'-]{1,20})?\s*:\s+\S/gm) || []).length;
  if (speakers >= 3 || /\b(attendees|agenda|meeting notes|minutes|standup|sync|1:1|retro)\b/i.test(head)) return "meeting";
  return "note";
}

export default function CapturePage() {
  const navigate = useNavigate();
  const { refresh, settings } = useApp();
  const [text, setText] = useState("");
  const [title, setTitle] = useState("");
  const [typeChoice, setTypeChoice] = useState<"auto" | NoteType>("auto");
  const [useAI, setUseAI] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [related, setRelated] = useState<Suggestion[]>([]);

  const detected = useMemo(() => (text.trim() ? guessType(text) : "note"), [text]);
  const aiAvailable = Boolean(settings?.aiAvailable);

  // Live "this relates to…" while pasting/typing.
  useEffect(() => {
    if (text.trim().length < 30) {
      setRelated([]);
      return;
    }
    const t = setTimeout(async () => {
      try {
        const { suggestions } = await api.suggest({ content: text, title });
        setRelated(suggestions.slice(0, 4));
      } catch {
        /* non-fatal */
      }
    }, 600);
    return () => clearTimeout(t);
  }, [text, title]);

  const submit = async () => {
    if (!text.trim() || saving) return;
    setSaving(true);
    setError(null);
    try {
      const bundle = await api.createNote({
        content: text,
        title: title.trim() || undefined,
        type: typeChoice === "auto" ? undefined : typeChoice,
        useAI: aiAvailable && useAI,
      });
      await refresh();
      navigate(`/note/${bundle.note.id}`, { state: { aiError: bundle.aiError || null } });
    } catch (e: any) {
      setError(e.message);
      setSaving(false);
    }
  };

  return (
    <div className="capture-page">
      <div className="capture-inner">
        <h1>Capture</h1>
        <p className="muted">
          Paste anything — a meeting transcript, a Jira ticket, or your own thoughts. Synapse figures out what it is,
          extracts action items, and connects it to what you already know.
        </p>

        <input
          className="input capture-title"
          placeholder="Title (optional — leave blank to auto-title)"
          value={title}
          onChange={(e) => setTitle(e.target.value)}
        />

        <textarea
          className="capture-text"
          placeholder={"Paste or type here…\n\nTip: Ctrl+Enter saves."}
          value={text}
          autoFocus
          onChange={(e) => setText(e.target.value)}
          onKeyDown={(e) => {
            if ((e.ctrlKey || e.metaKey) && e.key === "Enter") submit();
          }}
        />

        <div className="capture-row">
          <span className="muted">Save as:</span>
          <button
            className={`chip ${typeChoice === "auto" ? "chip-active" : ""}`}
            onClick={() => setTypeChoice("auto")}
            title="Let Synapse decide"
          >
            Auto{text.trim() ? ` (${TYPE_LABELS[detected]})` : ""}
          </button>
          {NOTE_TYPE_OPTIONS.map((t) => (
            <button
              key={t.value}
              className={`chip ${typeChoice === t.value ? "chip-active" : ""}`}
              onClick={() => setTypeChoice(t.value)}
            >
              <span className="type-dot inline" style={{ background: TYPE_COLORS[t.value] }} />
              {t.label}
            </button>
          ))}
          <span className="spacer" />
          {aiAvailable && (
            <label className="ai-toggle" title="Claude titles, summarizes, and extracts action items">
              <input type="checkbox" checked={useAI} onChange={(e) => setUseAI(e.target.checked)} />
              ✦ Analyze with Claude
            </label>
          )}
          <button className="btn btn-accent" onClick={submit} disabled={!text.trim() || saving}>
            {saving ? (aiAvailable && useAI ? "Analyzing with Claude…" : "Saving…") : "Save note"}
          </button>
        </div>

        {error && <div className="conn-error">{error}</div>}

        {related.length > 0 && (
          <div className="capture-related">
            <h3 className="conn-head">The brain thinks this relates to…</h3>
            {related.map((s) => (
              <div className="conn-card" key={s.note.id}>
                <div className="conn-row">
                  <button className="conn-note" onClick={() => navigate(`/note/${s.note.id}`)}>
                    <span className="type-dot" style={{ background: TYPE_COLORS[s.note.type] }} />
                    <span className="conn-note-title">{s.note.title}</span>
                  </button>
                </div>
                {s.sharedTerms.length > 0 && (
                  <div className="shared-terms">
                    both mention: {s.sharedTerms.map((t) => <code key={t}>{t}</code>)}
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
