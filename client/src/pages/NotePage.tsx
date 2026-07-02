import { useCallback, useEffect, useRef, useState } from "react";
import { useLocation, useNavigate, useParams } from "react-router-dom";
import { api, timeAgo } from "../api";
import { useApp } from "../App";
import type { Bundle, DeepConnection, NoteListItem, Suggestion } from "../types";
import { NOTE_TYPE_OPTIONS } from "./CapturePage";
import Editor from "../components/Editor";
import Preview from "../components/Preview";
import ConnectionsPanel from "../components/ConnectionsPanel";

export default function NotePage() {
  const { id = "" } = useParams();
  const navigate = useNavigate();
  const location = useLocation();
  const { notes, refresh, settings, setQuery } = useApp();

  const [bundle, setBundle] = useState<Bundle | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState("");
  const [title, setTitle] = useState("");
  const [tagsText, setTagsText] = useState("");
  const [saving, setSaving] = useState(false);
  const [liveSuggestions, setLiveSuggestions] = useState<Suggestion[] | null>(null);
  const [deep, setDeep] = useState<{ results: DeepConnection[] | null; loading: boolean; error: string | null }>({
    results: null,
    loading: false,
    error: null,
  });
  const emptyDistill = { created: [], updated: [], loading: false, error: null, ran: false };
  const [distill, setDistill] = useState<{
    created: NoteListItem[];
    updated: NoteListItem[];
    loading: boolean;
    error: string | null;
    ran: boolean;
  }>(emptyDistill);
  const [banner, setBanner] = useState<string | null>((location.state as any)?.aiError || null);
  const dirty = useRef(false);

  const load = useCallback(async () => {
    try {
      const b = await api.getNote(id);
      setBundle(b);
      setDraft(b.note.content);
      setTitle(b.note.title);
      setTagsText(b.note.tags.join(", "));
      setError(null);
    } catch (e: any) {
      setError(e.message);
    }
  }, [id]);

  useEffect(() => {
    setEditing(Boolean((location.state as any)?.edit));
    setLiveSuggestions(null);
    setDeep({ results: null, loading: false, error: null });
    setDistill(emptyDistill);
    dirty.current = false;
    load();
  }, [id, load]); // eslint-disable-line react-hooks/exhaustive-deps

  const save = useCallback(
    async (patch?: { type?: string }) => {
      if (!bundle) return;
      setSaving(true);
      try {
        const b = await api.updateNote(id, {
          title,
          content: draft,
          tags: tagsText.split(",").map((t) => t.trim()).filter(Boolean),
          ...patch,
        });
        setBundle(b);
        dirty.current = false;
        refresh();
      } catch (e: any) {
        setBanner(e.message);
      } finally {
        setSaving(false);
      }
    },
    [bundle, id, title, draft, tagsText, refresh]
  );

  // Auto-save while editing (debounced), plus live suggestions for the draft.
  useEffect(() => {
    if (!editing || !bundle || !dirty.current) return;
    const t = setTimeout(save, 1200);
    const s = setTimeout(async () => {
      try {
        const { suggestions } = await api.suggest({ content: draft, title, excludeId: id });
        setLiveSuggestions(suggestions);
      } catch {
        /* non-fatal */
      }
    }, 700);
    return () => {
      clearTimeout(t);
      clearTimeout(s);
    };
  }, [draft, title, tagsText, editing]); // eslint-disable-line react-hooks/exhaustive-deps

  // Ctrl+S save, Ctrl+E toggle edit.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key === "s") {
        e.preventDefault();
        save();
      }
      if ((e.ctrlKey || e.metaKey) && e.key === "e") {
        e.preventDefault();
        setEditing((v) => !v);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [save]);

  if (error) {
    return (
      <div className="page-pad">
        <div className="conn-error">{error}</div>
      </div>
    );
  }
  if (!bundle) return <div className="page-pad muted">Loading…</div>;
  const note = bundle.note;

  const onToggleCheck = async (line: number) => {
    const { note: updated } = await api.toggleCheck(id, line);
    setBundle({ ...bundle, note: updated });
    setDraft(updated.content);
  };

  const runDeep = async () => {
    setDeep({ results: null, loading: true, error: null });
    try {
      const { connections } = await api.deepConnections(id);
      setDeep({ results: connections, loading: false, error: null });
    } catch (e: any) {
      setDeep({ results: null, loading: false, error: e.message });
    }
  };

  const runDistill = async () => {
    setDistill({ ...emptyDistill, loading: true });
    try {
      const { created, updated } = await api.distill(id);
      setDistill({ created, updated, loading: false, error: null, ran: true });
      await refresh(); // new concept pages appear in the sidebar
      await load(); // and in this note's links
    } catch (e: any) {
      setDistill({ ...emptyDistill, error: e.message, ran: true });
    }
  };

  const relink = async (fn: () => Promise<unknown>) => {
    await fn();
    await load();
  };

  return (
    <div className="note-layout">
      <div className="note-main">
        {banner && (
          <div className="banner" onClick={() => setBanner(null)}>
            ⚠ {banner} <span className="muted">(click to dismiss)</span>
          </div>
        )}
        <div className="note-head">
          <input
            className="title-input"
            value={title}
            onChange={(e) => {
              setTitle(e.target.value);
              dirty.current = true;
            }}
            onBlur={() => dirty.current && save()}
            placeholder="Untitled"
          />
          <div className="note-meta">
            <select
              className="input type-select"
              value={note.type}
              onChange={(e) => save({ type: e.target.value })}
              title="Note type"
            >
              {NOTE_TYPE_OPTIONS.map((t) => (
                <option key={t.value} value={t.value}>
                  {t.label}
                </option>
              ))}
            </select>
            <input
              className="input tags-input"
              value={tagsText}
              placeholder="tags, comma, separated"
              onChange={(e) => {
                setTagsText(e.target.value);
                dirty.current = true;
              }}
              onBlur={() => dirty.current && save()}
            />
            <span className="muted meta-dates" title={`created ${new Date(note.created).toLocaleString()}`}>
              updated {timeAgo(note.updated)} {saving && "· saving…"}
            </span>
            <span className="spacer" />
            <button className="btn" onClick={() => setEditing(!editing)} title="Ctrl+E">
              {editing ? "Done" : "Edit"}
            </button>
            <button
              className="btn btn-danger"
              onClick={async () => {
                if (!confirm(`Delete “${note.title}”? It moves to data/trash.`)) return;
                await api.deleteNote(id);
                await refresh();
                navigate("/");
              }}
            >
              Delete
            </button>
          </div>
          {bundle.concepts.length > 0 && (
            <div className="concepts">
              {bundle.concepts.map((c) => (
                <button key={c} className="concept-chip" title="Search this concept" onClick={() => setQuery(c)}>
                  {c}
                </button>
              ))}
            </div>
          )}
        </div>

        <div className="note-body">
          {editing ? (
            <Editor
              value={draft}
              onChange={(v) => {
                setDraft(v);
                dirty.current = true;
              }}
              noteTitles={notes.filter((n) => n.id !== id).map((n) => n.title)}
              autoFocus
            />
          ) : (
            <Preview
              content={note.content}
              notes={notes}
              onToggle={onToggleCheck}
              onNavigate={(nid) => navigate(`/note/${nid}`)}
            />
          )}
        </div>
      </div>

      <ConnectionsPanel
        bundle={bundle}
        suggestions={editing && liveSuggestions ? liveSuggestions : bundle.suggestions}
        live={editing && liveSuggestions !== null}
        aiAvailable={Boolean(settings?.aiAvailable)}
        deep={deep}
        distill={distill}
        onRunDeep={runDeep}
        onRunDistill={runDistill}
        onLink={(other) => relink(() => api.link(id, other))}
        onUnlink={(other) => relink(() => api.unlink(id, other))}
        onDismiss={(other) => relink(() => api.dismiss(id, other))}
      />
    </div>
  );
}
