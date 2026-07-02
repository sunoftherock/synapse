export type NoteType = "note" | "meeting" | "jira" | "research" | "concept";

export interface NoteListItem {
  id: string;
  title: string;
  type: NoteType;
  tags: string[];
  created: string;
  updated: string;
  snippet: string;
}

export interface Note extends Omit<NoteListItem, "snippet"> {
  content: string;
}

export interface Suggestion {
  note: NoteListItem;
  score: number;
  sharedTerms: string[];
}

export interface LinkedNote {
  note: NoteListItem;
  kind: "wiki" | "manual" | "ai";
}

export interface Bundle {
  note: Note;
  concepts: string[];
  linked: LinkedNote[];
  suggestions: Suggestion[];
  mentions: NoteListItem[];
  aiUsed?: boolean;
  aiError?: string | null;
}

export interface ActionItem {
  noteId: string;
  noteTitle: string;
  noteType: NoteType;
  line: number;
  text: string;
  done: boolean;
  due: string | null;
  noteUpdated: string;
}

export interface Settings {
  aiAvailable: boolean;
  aiSource: "env" | "saved" | null;
  keyMasked: string | null;
  model: string;
  threshold: number;
  models: { id: string; label: string }[];
  customInstructions: string;
}

export interface AskUsage {
  input: number;
  cacheWrite: number;
  cacheRead: number;
  output: number;
  turns: number;
  cost: number;
}

export interface AskMessage {
  role: "user" | "assistant";
  content: string;
  sources?: NoteListItem[];
  trace?: string[];
  usage?: AskUsage;
}

export interface GraphNode {
  id: string;
  title: string;
  type: NoteType;
  degree: number;
}

export interface GraphEdge {
  source: string;
  target: string;
  kind: "link" | "suggested";
  label: string;
}

export interface GraphData {
  nodes: GraphNode[];
  edges: GraphEdge[];
}

export interface DeepConnection {
  note: NoteListItem;
  reason: string;
  strength: number;
}

export const TYPE_COLORS: Record<NoteType, string> = {
  note: "#56c78c",
  meeting: "#e5a54b",
  jira: "#4b9fe5",
  research: "#b26ce0",
  concept: "#ec6f9d",
};

export const TYPE_LABELS: Record<NoteType, string> = {
  note: "Note",
  meeting: "Meeting",
  jira: "Jira",
  research: "Research",
  concept: "Concept",
};
