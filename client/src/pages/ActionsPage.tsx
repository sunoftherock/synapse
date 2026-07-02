import { useCallback, useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { api } from "../api";
import type { ActionItem } from "../types";
import { TYPE_COLORS } from "../types";

type Filter = "open" | "all" | "done";

export default function ActionsPage() {
  const [items, setItems] = useState<ActionItem[]>([]);
  const [filter, setFilter] = useState<Filter>("open");
  const [loaded, setLoaded] = useState(false);

  const load = useCallback(async () => {
    const { items } = await api.actions();
    setItems(items);
    setLoaded(true);
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const filtered = useMemo(
    () => items.filter((i) => (filter === "all" ? true : filter === "done" ? i.done : !i.done)),
    [items, filter]
  );

  const groups = useMemo(() => {
    const map = new Map<string, ActionItem[]>();
    for (const item of filtered) {
      const list = map.get(item.noteId) || [];
      list.push(item);
      map.set(item.noteId, list);
    }
    return [...map.values()];
  }, [filtered]);

  const today = new Date().toISOString().slice(0, 10);
  const openCount = items.filter((i) => !i.done).length;

  const toggle = async (item: ActionItem) => {
    await api.toggleCheck(item.noteId, item.line);
    await load();
  };

  return (
    <div className="page-pad actions-page">
      <div className="page-title-row">
        <h1>Action items</h1>
        <span className="muted">{openCount} open across all notes</span>
        <span className="spacer" />
        <div className="chip-row">
          {(["open", "all", "done"] as Filter[]).map((f) => (
            <button key={f} className={`chip ${filter === f ? "chip-active" : ""}`} onClick={() => setFilter(f)}>
              {f[0].toUpperCase() + f.slice(1)}
            </button>
          ))}
        </div>
      </div>

      {loaded && filtered.length === 0 && (
        <div className="empty-hint big">
          {filter === "open" ? "Nothing open — nice." : "No action items yet."}
          <p className="muted">Any “- [ ] task” checkbox in any note shows up here. Add “(due: 2026-07-10)” for a date.</p>
        </div>
      )}

      {groups.map((group) => (
        <section className="action-group" key={group[0].noteId}>
          <Link to={`/note/${group[0].noteId}`} className="action-group-title">
            <span className="type-dot" style={{ background: TYPE_COLORS[group[0].noteType] }} />
            {group[0].noteTitle}
          </Link>
          {group.map((item) => (
            <label className={`action-row ${item.done ? "done" : ""}`} key={`${item.noteId}:${item.line}`}>
              <input type="checkbox" checked={item.done} onChange={() => toggle(item)} />
              <span className="action-text">{item.text}</span>
              {item.due && (
                <span className={`due-badge ${!item.done && item.due < today ? "overdue" : ""}`}>
                  {!item.done && item.due < today ? "overdue · " : "due "}
                  {item.due}
                </span>
              )}
            </label>
          ))}
        </section>
      ))}
    </div>
  );
}
