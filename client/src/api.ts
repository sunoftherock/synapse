import type {
  ActionItem,
  AskUsage,
  Bundle,
  DeepConnection,
  GraphData,
  Note,
  NoteListItem,
  Settings,
  Suggestion,
} from "./types";

async function req<T>(url: string, options?: RequestInit): Promise<T> {
  const res = await fetch(url, {
    headers: { "Content-Type": "application/json" },
    ...options,
  });
  if (!res.ok) {
    let message = `Request failed (${res.status})`;
    try {
      const body = await res.json();
      if (body.error) message = body.error;
    } catch {
      /* non-JSON error */
    }
    throw new Error(message);
  }
  return res.json();
}

export const api = {
  listNotes: (q = "", type = "") =>
    req<NoteListItem[]>(`/api/notes?q=${encodeURIComponent(q)}&type=${encodeURIComponent(type)}`),

  createNote: (payload: { content: string; title?: string; type?: string; useAI?: boolean }) =>
    req<Bundle>("/api/notes", { method: "POST", body: JSON.stringify(payload) }),

  getNote: (id: string) => req<Bundle>(`/api/notes/${id}`),

  updateNote: (id: string, payload: { title?: string; content?: string; type?: string; tags?: string[] }) =>
    req<Bundle>(`/api/notes/${id}`, { method: "PUT", body: JSON.stringify(payload) }),

  deleteNote: (id: string) => req<{ ok: boolean }>(`/api/notes/${id}`, { method: "DELETE" }),

  toggleCheck: (id: string, line: number) =>
    req<{ note: Note }>(`/api/notes/${id}/toggle-check`, { method: "POST", body: JSON.stringify({ line }) }),

  suggest: (payload: { content: string; title?: string; excludeId?: string }) =>
    req<{ suggestions: Suggestion[] }>("/api/suggest", { method: "POST", body: JSON.stringify(payload) }),

  link: (a: string, b: string) => req<{ ok: boolean }>("/api/links", { method: "POST", body: JSON.stringify({ a, b }) }),

  unlink: (a: string, b: string) =>
    req<{ ok: boolean }>("/api/links/remove", { method: "POST", body: JSON.stringify({ a, b }) }),

  dismiss: (a: string, b: string) =>
    req<{ ok: boolean }>("/api/links/dismiss", { method: "POST", body: JSON.stringify({ a, b }) }),

  graph: () => req<GraphData>("/api/graph"),

  actions: () => req<{ items: ActionItem[] }>("/api/actions"),

  getSettings: () => req<Settings>("/api/settings"),

  putSettings: (payload: { apiKey?: string; model?: string; threshold?: number; customInstructions?: string }) =>
    req<Settings>("/api/settings", { method: "PUT", body: JSON.stringify(payload) }),

  deepConnections: (id: string) =>
    req<{ connections: DeepConnection[] }>(`/api/ai/deep/${id}`, { method: "POST" }),

  distill: (id: string) =>
    req<{ created: NoteListItem[]; updated: NoteListItem[] }>(`/api/ai/distill/${id}`, { method: "POST" }),

  ask: (question: string, history: { role: string; content: string }[]) =>
    req<{ answer: string; sources: NoteListItem[]; trace: string[]; usage?: AskUsage }>("/api/ai/ask", {
      method: "POST",
      body: JSON.stringify({ question, history }),
    }),
};

export function timeAgo(iso: string): string {
  const ms = Date.now() - new Date(iso).getTime();
  const min = Math.floor(ms / 60000);
  if (min < 1) return "just now";
  if (min < 60) return `${min}m ago`;
  const hr = Math.floor(min / 60);
  if (hr < 24) return `${hr}h ago`;
  const days = Math.floor(hr / 24);
  if (days < 30) return `${days}d ago`;
  return new Date(iso).toLocaleDateString(undefined, { month: "short", day: "numeric" });
}
