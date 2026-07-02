import { useEffect, useRef, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { api } from "../api";
import { useApp } from "../App";
import type { AskMessage } from "../types";
import { TYPE_COLORS } from "../types";
import Preview from "../components/Preview";

const STARTERS = [
  "What's on my plate this week?",
  "Summarize everything I have about the PO page filters",
  "What decisions have we made about the vendor sync?",
  "Which of my concepts apply to designing the reporting dashboard?",
];

export default function AskPage() {
  const navigate = useNavigate();
  const { notes, settings } = useApp();
  const [messages, setMessages] = useState<AskMessage[]>([]);
  const [input, setInput] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const bottomRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, busy]);

  const send = async (q?: string) => {
    const question = (q ?? input).trim();
    if (!question || busy) return;
    setInput("");
    setError(null);
    const history = messages.map((m) => ({ role: m.role, content: m.content }));
    setMessages((ms) => [...ms, { role: "user", content: question }]);
    setBusy(true);
    try {
      const { answer, sources } = await api.ask(question, history);
      setMessages((ms) => [...ms, { role: "assistant", content: answer, sources }]);
    } catch (e: any) {
      setError(e.message);
      setMessages((ms) => ms.slice(0, -1)); // roll back the unanswered question
      setInput(question);
    } finally {
      setBusy(false);
    }
  };

  if (!settings?.aiAvailable) {
    return (
      <div className="ask-page">
        <div className="ask-empty">
          <h1>✦ Ask your brain</h1>
          <p className="muted">
            Ask questions across everything you've captured — Synapse finds the relevant notes and Claude synthesizes
            an answer that cites them.
          </p>
          <p>
            This needs an Anthropic API key. Add one in <Link to="/settings">Settings</Link> and come back.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="ask-page">
      <div className="ask-scroll">
        <div className="ask-thread">
          {messages.length === 0 && (
            <div className="ask-empty">
              <h1>✦ Ask your brain</h1>
              <p className="muted">
                Questions are answered from your own notes, with citations you can click. Try one of these:
              </p>
              <div className="ask-starters">
                {STARTERS.map((s) => (
                  <button key={s} className="chip" onClick={() => send(s)}>
                    {s}
                  </button>
                ))}
              </div>
            </div>
          )}
          {messages.map((m, i) =>
            m.role === "user" ? (
              <div className="ask-msg user" key={i}>
                {m.content}
              </div>
            ) : (
              <div className="ask-msg assistant" key={i}>
                <Preview
                  content={m.content}
                  notes={notes}
                  onToggle={() => {}}
                  onNavigate={(id) => navigate(`/note/${id}`)}
                />
                {m.sources && m.sources.length > 0 && (
                  <div className="ask-sources">
                    <span className="muted small">consulted:</span>
                    {m.sources.map((s) => (
                      <button key={s.id} className="chip" onClick={() => navigate(`/note/${s.id}`)} title={s.snippet}>
                        <span className="type-dot inline" style={{ background: TYPE_COLORS[s.type] }} />
                        {s.title.length > 38 ? s.title.slice(0, 38) + "…" : s.title}
                      </button>
                    ))}
                  </div>
                )}
              </div>
            )
          )}
          {busy && <div className="ask-msg assistant muted">Reading your notes…</div>}
          {error && <div className="conn-error">{error}</div>}
          <div ref={bottomRef} />
        </div>
      </div>
      <div className="ask-input-row">
        <textarea
          className="ask-input"
          placeholder="Ask anything about your notes…  (Enter to send, Shift+Enter for a new line)"
          value={input}
          rows={2}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && !e.shiftKey) {
              e.preventDefault();
              send();
            }
          }}
        />
        <button className="btn btn-accent" onClick={() => send()} disabled={busy || !input.trim()}>
          {busy ? "…" : "Ask"}
        </button>
      </div>
    </div>
  );
}
