import { useEffect, useState } from "react";
import { api } from "../api";
import { useApp } from "../App";
import type { Settings } from "../types";

export default function SettingsPage() {
  const { refreshSettings } = useApp();
  const [settings, setSettings] = useState<Settings | null>(null);
  const [keyInput, setKeyInput] = useState("");
  const [schema, setSchema] = useState("");
  const [status, setStatus] = useState<string | null>(null);

  useEffect(() => {
    api.getSettings().then((s) => {
      setSettings(s);
      setSchema(s.customInstructions || "");
    }).catch(console.error);
  }, []);

  if (!settings) return <div className="page-pad muted">Loading…</div>;

  const apply = async (
    payload: { apiKey?: string; model?: string; threshold?: number; customInstructions?: string },
    message: string
  ) => {
    const next = await api.putSettings(payload);
    setSettings(next);
    await refreshSettings();
    setStatus(message);
    setTimeout(() => setStatus(null), 2500);
  };

  return (
    <div className="page-pad settings-page">
      <h1>Settings</h1>
      {status && <div className="banner ok">{status}</div>}

      <section className="settings-section">
        <h2>✦ Claude (optional)</h2>
        <p className="muted">
          With an Anthropic API key, Synapse uses Claude to title and summarize pastes, pull action items out of
          transcripts, and explain connections between notes. Without one, everything still works — connections come
          from local text analysis only.
        </p>
        <div className="settings-row">
          <span className="settings-label">Status</span>
          {settings.aiSource === "env" && <span className="ok-text">Using ANTHROPIC_API_KEY from your environment</span>}
          {settings.aiSource === "saved" && <span className="ok-text">Key saved ({settings.keyMasked})</span>}
          {!settings.aiAvailable && <span className="muted">No key — AI features off</span>}
        </div>
        <div className="settings-row">
          <span className="settings-label">API key</span>
          <input
            className="input grow"
            type="password"
            placeholder="sk-ant-…"
            value={keyInput}
            onChange={(e) => setKeyInput(e.target.value)}
          />
          <button
            className="btn btn-accent"
            disabled={!keyInput.trim()}
            onClick={async () => {
              await apply({ apiKey: keyInput.trim() }, "API key saved.");
              setKeyInput("");
            }}
          >
            Save key
          </button>
          {settings.keyMasked && (
            <button className="btn" onClick={() => apply({ apiKey: "" }, "API key removed.")}>
              Remove
            </button>
          )}
        </div>
        <p className="muted small">
          The key is stored in <code>data/settings.json</code> on this machine (gitignored). You can also set the
          <code> ANTHROPIC_API_KEY</code> environment variable instead — it takes precedence.
        </p>
        <div className="settings-row">
          <span className="settings-label">Model</span>
          <select
            className="input"
            value={settings.model}
            onChange={(e) => apply({ model: e.target.value }, "Model updated.")}
          >
            {settings.models.map((m) => (
              <option key={m.id} value={m.id}>
                {m.label}
              </option>
            ))}
          </select>
        </div>
      </section>

      <section className="settings-section">
        <h2>Your schema</h2>
        <p className="muted">
          Standing instructions appended to every AI operation — how you want notes summarized, concepts distilled,
          and connections chosen. The more precise the schema, the better the output. Example: <em>"Concepts should be
          procurement/engineering patterns, not project statuses. Tag by domain: frontend, integration, process. Keep
          summaries under 2 sentences."</em>
        </p>
        <textarea
          className="schema-input"
          rows={5}
          placeholder="Leave empty for sensible defaults…"
          value={schema}
          onChange={(e) => setSchema(e.target.value)}
        />
        <button
          className="btn"
          disabled={schema === (settings.customInstructions || "")}
          onClick={() => apply({ customInstructions: schema }, "Schema saved.")}
        >
          Save schema
        </button>
      </section>

      <section className="settings-section">
        <h2>Connection sensitivity</h2>
        <p className="muted">
          How similar two notes must be before the brain suggests a connection. Lower = more (and noisier) suggestions.
        </p>
        <div className="settings-row">
          <span className="settings-label">Threshold</span>
          <input
            type="range"
            min={0.04}
            max={0.3}
            step={0.01}
            value={settings.threshold}
            onChange={(e) => setSettings({ ...settings, threshold: Number(e.target.value) })}
            onMouseUp={() => apply({ threshold: settings.threshold }, "Sensitivity updated.")}
            onTouchEnd={() => apply({ threshold: settings.threshold }, "Sensitivity updated.")}
          />
          <code>{settings.threshold.toFixed(2)}</code>
        </div>
      </section>

      <section className="settings-section">
        <h2>Your data</h2>
        <p className="muted">
          Every note is a plain markdown file in <code>data/notes/</code> — open them in any editor, sync them, back
          them up, or point Obsidian at the folder. Links and dismissals live in <code>data/links.json</code>. Deleted
          notes go to <code>data/trash/</code> first. Run <code>npm run seed</code> for sample notes.
        </p>
      </section>
    </div>
  );
}
