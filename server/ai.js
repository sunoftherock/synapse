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

const ASK_TOOLS = [
  {
    name: "search_notes",
    description:
      "Search the knowledge base for notes about a topic, system, person, ticket, or work item. Returns ranked " +
      "matches with short snippets. Call this whenever the question touches something you haven't located yet, and " +
      "again with reformulated or narrower queries as you learn more. Distinctive terms work best (system names, " +
      "ticket keys like PROC-142, people, feature names).",
    input_schema: {
      type: "object",
      properties: { query: { type: "string", description: "Search terms." } },
      required: ["query"],
      additionalProperties: false,
    },
  },
  {
    name: "read_note",
    description:
      "Read a note's FULL content, plus the titles of notes linked to it and its key concepts. Snippets and index " +
      "lines are never enough to judge relevance or draw conclusions — always read a note before using it in your " +
      "answer. Follow the linkedNotes trail by reading connected notes when they bear on the question.",
    input_schema: {
      type: "object",
      properties: { title: { type: "string", description: "Exact note title, from the index or search results." } },
      required: ["title"],
      additionalProperties: false,
    },
  },
];

/**
 * Agentic Q&A over the vault: Claude drives its own retrieval with search and
 * read tools (callbacks supplied by the route), then synthesizes an answer in
 * markdown that cites notes as [[wikilinks]].
 */
export async function askBrain(settings, question, history, vaultIndex, tools) {
  const anthropic = client(settings);
  if (!anthropic) return { error: "No API key configured." };
  const MAX_TURNS = 8;
  const messages = [
    ...history.slice(-8).map((m) => ({ role: m.role, content: String(m.content).slice(0, 6000) })),
    {
      role: "user",
      content: `${question}\n\n<vault-index>\n${vaultIndex || "(empty)"}\n</vault-index>`,
    },
  ];
  const base = {
    model: settings.model || DEFAULT_MODEL,
    max_tokens: 8000,
    thinking: { type: "adaptive" },
    tools: ASK_TOOLS,
    system: sys(
      settings,
      "You are the reasoning layer of the user's personal knowledge base (their work notes, meetings, tickets, " +
        "research, and concept pages). Each question includes a <vault-index> — a one-line catalog of every note. " +
        "You have tools to search the vault and read full notes. Workflow: find candidate notes (index + search), " +
        "then READ every note you intend to rely on — typically 2-6 reads; index lines and snippets are not enough " +
        "to judge relevance, and you must never present a conclusion based only on a title or snippet. Follow " +
        "linkedNotes into connected notes when they bear on the question. Never tell the user a note 'might be " +
        "relevant' or suggest they check it themselves — read it yourself and incorporate what it actually says. " +
        "Cite a note as [[Exact Note Title]] every time you draw on it (these render as clickable links). " +
        "Synthesize: combine information across notes, reconcile conflicts (prefer newer notes), and surface " +
        "connections and implications the user may not have seen. If after searching and reading the notes " +
        "genuinely don't cover something, say so plainly — and clearly mark anything you add from outside the " +
        "notes. Be concise and practical. Answer in markdown. Never claim the knowledge base is empty or " +
        "disconnected while the index has entries."
    ),
  };
  try {
    let response;
    for (let turn = 0; turn < MAX_TURNS; turn++) {
      const params = { ...base, messages };
      if (turn === MAX_TURNS - 1) params.tool_choice = { type: "none" }; // out of budget — answer now
      response = await anthropic.messages.create(params);
      if (response.stop_reason === "refusal") throw new Error("Claude declined to answer this question.");
      if (response.stop_reason !== "tool_use") break;

      messages.push({ role: "assistant", content: response.content });
      const results = [];
      for (const block of response.content) {
        if (block.type !== "tool_use") continue;
        let out;
        try {
          if (block.name === "search_notes") out = tools.search(String(block.input?.query || ""));
          else if (block.name === "read_note") out = tools.read(String(block.input?.title || ""));
          else out = { error: `Unknown tool ${block.name}` };
        } catch (e) {
          out = { error: e.message };
        }
        results.push({ type: "tool_result", tool_use_id: block.id, content: JSON.stringify(out) });
      }
      messages.push({ role: "user", content: results });
    }
    const answer = response.content
      .filter((b) => b.type === "text")
      .map((b) => b.text)
      .join("\n");
    return { result: answer };
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
