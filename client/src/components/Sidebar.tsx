import { NavLink, useNavigate } from "react-router-dom";
import { useApp } from "../App";
import { timeAgo } from "../api";
import { TYPE_COLORS, TYPE_LABELS, type NoteType } from "../types";

const FILTERS: { value: string; label: string }[] = [
  { value: "", label: "All" },
  { value: "note", label: "Notes" },
  { value: "meeting", label: "Meetings" },
  { value: "jira", label: "Jira" },
  { value: "research", label: "Research" },
  { value: "concept", label: "Concepts" },
];

export default function Sidebar() {
  const { notes, loaded, query, setQuery, typeFilter, setTypeFilter } = useApp();
  const navigate = useNavigate();

  return (
    <aside className="sidebar">
      <div className="sidebar-head">
        <div className="brand" onClick={() => navigate("/")} role="button">
          <svg width="22" height="22" viewBox="0 0 100 100" aria-hidden>
            <line x1="30" y1="30" x2="72" y2="45" stroke="#4a4a58" strokeWidth="6" />
            <line x1="30" y1="30" x2="45" y2="75" stroke="#4a4a58" strokeWidth="6" />
            <line x1="72" y1="45" x2="45" y2="75" stroke="#4a4a58" strokeWidth="6" />
            <circle cx="30" cy="30" r="13" fill="#7c6cf0" />
            <circle cx="72" cy="45" r="10" fill="#56c78c" />
            <circle cx="45" cy="75" r="10" fill="#e5a54b" />
          </svg>
          <span>Synapse</span>
        </div>
        <button className="btn btn-accent capture-btn" onClick={() => navigate("/capture")}>
          + Capture
        </button>
        <input
          className="input search"
          placeholder="Search notes…  (tag:x works too)"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
        />
        <div className="chip-row">
          {FILTERS.map((f) => (
            <button
              key={f.value}
              className={`chip ${typeFilter === f.value ? "chip-active" : ""}`}
              onClick={() => setTypeFilter(f.value)}
            >
              {f.label}
            </button>
          ))}
        </div>
      </div>

      <nav className="note-list">
        {loaded && notes.length === 0 && <div className="empty-hint">No notes match.</div>}
        {notes.map((n) => (
          <NavLink key={n.id} to={`/note/${n.id}`} className={({ isActive }) => `note-item ${isActive ? "active" : ""}`}>
            <span className="type-dot" style={{ background: TYPE_COLORS[n.type as NoteType] }} title={TYPE_LABELS[n.type as NoteType]} />
            <span className="note-item-body">
              <span className="note-item-title">{n.title}</span>
              <span className="note-item-snippet">{n.snippet || "Empty note"}</span>
            </span>
            <span className="note-item-time">{timeAgo(n.updated)}</span>
          </NavLink>
        ))}
      </nav>

      <div className="sidebar-foot">
        <NavLink to="/ask" className={({ isActive }) => `foot-link ${isActive ? "active" : ""}`}>
          <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden>
            <path d="M12 3l1.9 5.1L19 10l-5.1 1.9L12 17l-1.9-5.1L5 10l5.1-1.9z" />
            <path d="M19 15l.9 2.1L22 18l-2.1.9L19 21l-.9-2.1L16 18l2.1-.9z" />
          </svg>
          Ask
        </NavLink>
        <NavLink to="/graph" className={({ isActive }) => `foot-link ${isActive ? "active" : ""}`}>
          <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden>
            <circle cx="6" cy="6" r="3" /><circle cx="18" cy="10" r="3" /><circle cx="10" cy="19" r="3" />
            <line x1="8.5" y1="7.5" x2="15.5" y2="9.3" /><line x1="7" y1="8.8" x2="9.3" y2="16.3" />
          </svg>
          Graph
        </NavLink>
        <NavLink to="/actions" className={({ isActive }) => `foot-link ${isActive ? "active" : ""}`}>
          <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden>
            <rect x="3" y="4" width="18" height="17" rx="3" /><polyline points="8 12 11 15 16 9" />
          </svg>
          Actions
        </NavLink>
        <NavLink to="/settings" className={({ isActive }) => `foot-link ${isActive ? "active" : ""}`}>
          <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden>
            <circle cx="12" cy="12" r="3" />
            <path d="M19.4 15a1.7 1.7 0 0 0 .34 1.87l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.7 1.7 0 0 0-1.87-.34 1.7 1.7 0 0 0-1 1.55V21a2 2 0 1 1-4 0v-.09a1.7 1.7 0 0 0-1-1.55 1.7 1.7 0 0 0-1.87.34l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06a1.7 1.7 0 0 0 .34-1.87 1.7 1.7 0 0 0-1.55-1H3a2 2 0 1 1 0-4h.09a1.7 1.7 0 0 0 1.55-1 1.7 1.7 0 0 0-.34-1.87l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06a1.7 1.7 0 0 0 1.87.34h.01a1.7 1.7 0 0 0 1-1.55V3a2 2 0 1 1 4 0v.09a1.7 1.7 0 0 0 1 1.55h.01a1.7 1.7 0 0 0 1.87-.34l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06a1.7 1.7 0 0 0-.34 1.87v.01a1.7 1.7 0 0 0 1.55 1H21a2 2 0 1 1 0 4h-.09a1.7 1.7 0 0 0-1.55 1z" />
          </svg>
          Settings
        </NavLink>
      </div>
    </aside>
  );
}
