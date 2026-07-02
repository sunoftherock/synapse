import { useNavigate } from "react-router-dom";
import type { Bundle, DeepConnection, NoteListItem, Suggestion } from "../types";
import { TYPE_COLORS } from "../types";

interface Props {
  bundle: Bundle;
  suggestions: Suggestion[];
  live: boolean;
  aiAvailable: boolean;
  deep: { results: DeepConnection[] | null; loading: boolean; error: string | null };
  distill: { created: NoteListItem[]; updated: NoteListItem[]; loading: boolean; error: string | null; ran: boolean };
  onRunDeep: () => void;
  onRunDistill: () => void;
  onLink: (otherId: string) => void;
  onUnlink: (otherId: string) => void;
  onDismiss: (otherId: string) => void;
}

function NoteRow({ note, onClick }: { note: NoteListItem; onClick: () => void }) {
  return (
    <button className="conn-note" onClick={onClick} title={note.snippet}>
      <span className="type-dot" style={{ background: TYPE_COLORS[note.type] }} />
      <span className="conn-note-title">{note.title}</span>
    </button>
  );
}

export default function ConnectionsPanel({
  bundle,
  suggestions,
  live,
  aiAvailable,
  deep,
  distill,
  onRunDeep,
  onRunDistill,
  onLink,
  onUnlink,
  onDismiss,
}: Props) {
  const navigate = useNavigate();
  const open = (id: string) => navigate(`/note/${id}`);

  return (
    <aside className="connections">
      <section>
        <h3 className="conn-head">Linked notes</h3>
        {bundle.linked.length === 0 && <div className="conn-empty">Nothing linked yet.</div>}
        {bundle.linked.map((l) => (
          <div className="conn-row" key={l.note.id}>
            <NoteRow note={l.note} onClick={() => open(l.note.id)} />
            <span className="conn-kind">{l.kind}</span>
            <button className="icon-btn" title="Unlink" onClick={() => onUnlink(l.note.id)}>
              ✕
            </button>
          </div>
        ))}
      </section>

      <section>
        <h3 className="conn-head">
          Suggested {live && <span className="live-pill">live</span>}
        </h3>
        {suggestions.length === 0 && (
          <div className="conn-empty">No suggestions yet — the brain connects notes as you add more.</div>
        )}
        {suggestions.map((s) => (
          <div className="conn-card" key={s.note.id}>
            <div className="conn-row">
              <NoteRow note={s.note} onClick={() => open(s.note.id)} />
              <div className="conn-actions">
                <button className="icon-btn ok" title="Link these notes" onClick={() => onLink(s.note.id)}>
                  ✓
                </button>
                <button className="icon-btn" title="Dismiss — don't suggest again" onClick={() => onDismiss(s.note.id)}>
                  ✕
                </button>
              </div>
            </div>
            <div className="score-bar" title={`similarity ${(s.score * 100).toFixed(0)}%`}>
              <div className="score-fill" style={{ width: `${Math.min(100, s.score * 260)}%` }} />
            </div>
            {s.sharedTerms.length > 0 && (
              <div className="shared-terms">
                both mention: {s.sharedTerms.map((t) => <code key={t}>{t}</code>)}
              </div>
            )}
          </div>
        ))}
      </section>

      <section>
        <h3 className="conn-head">Deeper analysis</h3>
        {!aiAvailable && (
          <div className="conn-empty">
            Add an Anthropic API key in Settings and Claude will explain <em>why</em> notes connect.
          </div>
        )}
        {aiAvailable && (
          <>
            <button className="btn btn-ghost full" onClick={onRunDeep} disabled={deep.loading || distill.loading}>
              {deep.loading ? "Claude is reading your notes…" : "✦ Ask Claude for connections"}
            </button>
            {bundle.note.type !== "concept" && (
              <button className="btn btn-ghost full" onClick={onRunDistill} disabled={distill.loading || deep.loading}>
                {distill.loading ? "Distilling concepts…" : "✦ Distill into concept pages"}
              </button>
            )}
            {distill.error && <div className="conn-error">{distill.error}</div>}
            {distill.ran && !distill.loading && !distill.error && (
              <div className="distill-result">
                {distill.created.length + distill.updated.length === 0 && (
                  <div className="conn-empty">No durable concepts found in this note.</div>
                )}
                {distill.created.map((n) => (
                  <div className="conn-row" key={n.id}>
                    <span className="distill-tag new">new</span>
                    <NoteRow note={n} onClick={() => open(n.id)} />
                  </div>
                ))}
                {distill.updated.map((n) => (
                  <div className="conn-row" key={n.id}>
                    <span className="distill-tag">updated</span>
                    <NoteRow note={n} onClick={() => open(n.id)} />
                  </div>
                ))}
              </div>
            )}
            {deep.error && <div className="conn-error">{deep.error}</div>}
            {deep.results?.length === 0 && <div className="conn-empty">Claude found no meaningful connections.</div>}
            {deep.results?.map((c) => (
              <div className="conn-card deep" key={c.note.id}>
                <div className="conn-row">
                  <NoteRow note={c.note} onClick={() => open(c.note.id)} />
                  <div className="conn-actions">
                    <span className="strength" title={`strength ${c.strength}/5`}>
                      {"●".repeat(c.strength)}
                      {"○".repeat(5 - c.strength)}
                    </span>
                    <button className="icon-btn ok" title="Link these notes" onClick={() => onLink(c.note.id)}>
                      ✓
                    </button>
                  </div>
                </div>
                <div className="deep-reason">{c.reason}</div>
              </div>
            ))}
          </>
        )}
      </section>

      {bundle.mentions.length > 0 && (
        <section>
          <h3 className="conn-head">Unlinked mentions</h3>
          {bundle.mentions.map((n) => (
            <div className="conn-row" key={n.id}>
              <NoteRow note={n} onClick={() => open(n.id)} />
              <button className="icon-btn ok" title="Link" onClick={() => onLink(n.id)}>
                ✓
              </button>
            </div>
          ))}
        </section>
      )}
    </aside>
  );
}
