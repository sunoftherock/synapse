// Optional Claude-powered analysis. Everything in the app works without this;
// with an API key configured it upgrades ingestion (title/summary/action-item
// extraction) and adds "deep connection" explanations between notes.
import Anthropic from "@anthropic-ai/sdk";

export const DEFAULT_MODEL = "claude-opus-4-8";
export const MODELS = [
  { id: "claude-opus-4-8", label: "Claude Opus 4.8 — most capable (default)" },
  { id: "claude-sonnet-5", label: "Claude Sonnet 5 — fast and smart" },
  { id: "claude-haiku-4-5", label: "Claude Haiku 4.5 — cheapest" },
];

export function resolveKey(settings) {
  if (process.env.ANTHROPIC_API_KEY) return { key: process.env.ANTHROPIC_API_KEY, source: "env" };
  if (settings.anthropicApiKey) return { key: settings.anthropicApiKey, source: "saved" };
  return { key: null, source: null };
}

function client(settings) {
  const { key } = resolveKey(settings);
  return key ? new Anthropic({ apiKey: key }) : null;
}

const ANALYZE_SCHEMA = {
  type: "object",
  properties: {
    title: { type: "string", description: "Short, specific title for this note. Max 70 characters." },
    type: { type: "string", enum: ["note", "meeting", "jira", "research"] },
    summary: { type: "string", description: "2-3 sentence summary of what this is about and what was decided." },
    actionItems: {
      type: "array",
      description: "Concrete follow-ups or commitments stated in the text. Do not invent any.",
      items: {
        type: "object",
        properties: {
          text: { type: "string" },
          owner: { anyOf: [{ type: "string" }, { type: "null" }], description: "Person responsible, if stated." },
          due: { anyOf: [{ type: "string" }, { type: "null" }], description: "Due date as YYYY-MM-DD, if stated." },
        },
        required: ["text", "owner", "due"],
        additionalProperties: false,
      },
    },
    concepts: { type: "array", items: { type: "string" }, description: "5-10 key topics, systems, or entities mentioned." },
  },
  required: ["title", "type", "summary", "actionItems", "concepts"],
  additionalProperties: false,
};

const DEEP_SCHEMA = {
  type: "object",
  properties: {
    connections: {
      type: "array",
      items: {
        type: "object",
        properties: {
          id: { type: "string", description: "The candidate note id." },
          related: { type: "boolean", description: "True only if there is a genuine, useful connection." },
          reason: { type: "string", description: "One sentence, max 140 chars, explaining the connection in concrete terms." },
          strength: { type: "integer", enum: [1, 2, 3, 4, 5], description: "5 = same topic/work item, 1 = loosely related." },
        },
        required: ["id", "related", "reason", "strength"],
        additionalProperties: false,
      },
    },
  },
  required: ["connections"],
  additionalProperties: false,
};

/** Base system prompt + the user's own schema/instructions from Settings. */
function sys(settings, base) {
  const custom = (settings.customInstructions || "").trim();
  return custom ? `${base}\n\nThe user's own instructions for how their knowledge base should be maintained:\n${custom}` : base;
}

function parseStructured(response) {
  if (response.stop_reason === "refusal") {
    throw new Error("Claude declined to analyze this content.");
  }
  const block = response.content.find((b) => b.type === "text");
  if (!block) throw new Error("Empty response from Claude.");
  return JSON.parse(block.text);
}

const DISTILL_SCHEMA = {
  type: "object",
  properties: {
    concepts: {
      type: "array",
      description: "The distinct, reusable concepts worth their own wiki page. Quality over quantity — usually 2-6.",
      items: {
        type: "object",
        properties: {
          title: { type: "string", description: "Concept name in Title Case, max 60 chars. Reuse an existing concept title verbatim if this is the same idea." },
          definition: { type: "string", description: "One-line definition." },
          core: { type: "string", description: "The core idea in 2-4 sentences — why it matters and when it applies." },
          principles: { type: "array", items: { type: "string" }, description: "2-5 key principles or rules of thumb." },
          examples: { type: "array", items: { type: "string" }, description: "1-3 concrete examples, drawn from the source where possible." },
          related: {
            type: "array",
            description: "Connections to OTHER concepts (existing ones or others in this batch). Keep tight — only link where understanding one genuinely changes how you see the other. Max 3.",
            items: {
              type: "object",
              properties: {
                title: { type: "string", description: "Exact title of the related concept." },
                why: { type: "string", description: "One short clause: why the connection matters." },
              },
              required: ["title", "why"],
              additionalProperties: false,
            },
          },
          tags: { type: "array", items: { type: "string" }, description: "1-3 lowercase kebab-case domain tags, e.g. frontend, data-quality, process." },
        },
        required: ["title", "definition", "core", "principles", "examples", "related", "tags"],
        additionalProperties: false,
      },
    },
  },
  required: ["concepts"],
  additionalProperties: false,
};

/**
 * Distill a source note into standalone concept wiki pages (one idea, one
 * page), selectively linked to the concepts that already exist.
 */
export async function distillConcepts(settings, note, existingConceptTitles) {
  const anthropic = client(settings);
  if (!anthropic) return { error: "No API key configured." };
  const existing = existingConceptTitles.length
    ? `Concept pages that already exist in the knowledge base (reuse these exact titles when the idea is the same, and consider them for connections):\n${existingConceptTitles.map((t) => `- ${t}`).join("\n")}`
    : "The knowledge base has no concept pages yet — these are the first.";
  try {
    const response = await anthropic.messages.create({
      model: settings.model || DEFAULT_MODEL,
      max_tokens: 12000,
      thinking: { type: "adaptive" },
      system: sys(
        settings,
        "You maintain a personal knowledge base. Given a source note (meeting, ticket, article, research), distill " +
          "the durable, reusable concepts into standalone wiki pages — one idea per page. A concept is something the " +
          "user will want to reference long after the source is stale: a pattern, a principle, a system, a domain " +
          "term, a decision rationale. Skip one-off logistics and statuses. Be faithful to the source; do not pad. " +
          "Keep connections tight — only link where understanding one concept genuinely changes how you see the other."
      ),
      messages: [
        {
          role: "user",
          content: `${existing}\n\nDistill this source note:\n\n<source title="${note.title}" type="${note.type}">\n${note.content.slice(0, 20000)}\n</source>`,
        },
      ],
      output_config: { format: { type: "json_schema", schema: DISTILL_SCHEMA } },
    });
    return { result: parseStructured(response).concepts };
  } catch (e) {
    return { error: friendlyError(e) };
  }
}

/**
 * Answer a question from the user's own notes. Returns markdown that cites
 * notes as [[wikilinks]] so the client can render them as clickable links.
 */
export async function askBrain(settings, question, history, contextNotes, vaultIndex) {
  const anthropic = client(settings);
  if (!anthropic) return { error: "No API key configured." };
  const context = contextNotes.length
    ? contextNotes
        .map((n) => `<note title="${n.title}" type="${n.type}" updated="${n.updated.slice(0, 10)}">\n${n.excerpt}\n</note>`)
        .join("\n\n")
    : "(no notes matched this question textually)";
  const messages = [
    ...history.slice(-8).map((m) => ({ role: m.role, content: String(m.content).slice(0, 6000) })),
    {
      role: "user",
      content:
        `${question}\n\n<vault-index>\n${vaultIndex || "(empty)"}\n</vault-index>\n\n` +
        `<relevant-notes>\n${context}\n</relevant-notes>`,
    },
  ];
  try {
    const response = await anthropic.messages.create({
      model: settings.model || DEFAULT_MODEL,
      max_tokens: 8000,
      thinking: { type: "adaptive" },
      system: sys(
        settings,
        "You are the synthesis layer of the user's personal knowledge base (their work notes, meetings, tickets, " +
          "research, and concept pages). Each question comes with two context blocks: <vault-index>, a one-line-per-" +
          "note catalog of EVERYTHING in the knowledge base, and <relevant-notes>, full excerpts of the notes a " +
          "keyword search matched. Answer from these. For broad questions about the vault as a whole (themes, what " +
          "the user works on, what exists), reason from the index — never claim the knowledge base is empty or " +
          "disconnected while the index has entries. Cite a note as [[Exact Note Title]] every time you draw on it — " +
          "these render as clickable links; if an index entry looks relevant but has no excerpt, cite it and suggest " +
          "asking about it specifically. Synthesize across notes rather than summarizing them one by one; surface " +
          "connections and implications the user may not have seen. If the notes genuinely don't cover something, " +
          "say so plainly — and clearly mark anything you add from outside the notes. Be concise and practical. " +
          "Answer in markdown."
      ),
      messages,
    });
    if (response.stop_reason === "refusal") throw new Error("Claude declined to answer this question.");
    const block = response.content.find((b) => b.type === "text");
    return { result: block ? block.text : "" };
  } catch (e) {
    return { error: friendlyError(e) };
  }
}

function friendlyError(e) {
  if (e?.status === 401) return "Anthropic API key is invalid. Check it in Settings.";
  if (e?.status === 429) return "Rate limited by the Anthropic API — try again in a moment.";
  if (e?.status >= 500) return "Anthropic API is temporarily unavailable.";
  return e?.message || "AI request failed.";
}

/** Extract structured metadata (title, summary, action items, concepts) from pasted text. */
export async function analyzeNote(settings, text) {
  const anthropic = client(settings);
  if (!anthropic) return { error: "No API key configured." };
  try {
    const response = await anthropic.messages.create({
      model: settings.model || DEFAULT_MODEL,
      max_tokens: 8000,
      system: sys(
        settings,
        "You extract structured metadata from a person's work notes — meeting transcripts, Jira tickets, research " +
          "notes, or raw thoughts. Be faithful to the source text. Action items are only concrete follow-ups or " +
          "commitments actually stated; never invent them. Keep the summary specific (name systems, decisions, people)."
      ),
      messages: [{ role: "user", content: `Analyze this note:\n\n<note>\n${text.slice(0, 24000)}\n</note>` }],
      output_config: { format: { type: "json_schema", schema: ANALYZE_SCHEMA } },
    });
    return { result: parseStructured(response) };
  } catch (e) {
    return { error: friendlyError(e) };
  }
}

/**
 * Given a note and candidate related notes (pre-ranked by the local TF-IDF
 * brain), have Claude judge which connections are real and explain why.
 */
export async function deepConnections(settings, note, candidates) {
  const anthropic = client(settings);
  if (!anthropic) return { error: "No API key configured." };
  const candidateBlock = candidates
    .map((c) => `<candidate id="${c.id}">\nTitle: ${c.title} (${c.type})\n${c.excerpt}\n</candidate>`)
    .join("\n\n");
  try {
    const response = await anthropic.messages.create({
      model: settings.model || DEFAULT_MODEL,
      max_tokens: 8000,
      thinking: { type: "adaptive" },
      system: sys(
        settings,
        "You analyze a person's work notes and identify genuine connections between them — shared work items, " +
          "systems, decisions that affect each other, or follow-ups on earlier discussions. Be selective: a vague " +
          "topical overlap is not a connection. Reasons must be concrete and reference specifics from both notes."
      ),
      messages: [
        {
          role: "user",
          content:
            `Here is the current note:\n\n<current>\nTitle: ${note.title} (${note.type})\n${note.content.slice(0, 6000)}\n</current>\n\n` +
            `Judge whether each candidate is genuinely connected to it:\n\n${candidateBlock}`,
        },
      ],
      output_config: { format: { type: "json_schema", schema: DEEP_SCHEMA } },
    });
    return { result: parseStructured(response).connections };
  } catch (e) {
    return { error: friendlyError(e) };
  }
}
