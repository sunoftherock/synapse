// Demo/sample data. `npm run seed` loads a small set of interconnected work
// notes so the graph and suggestions have something to show on day one.
// Delete them from the UI (or wipe data/notes) whenever you like.
import { pathToFileURL } from "node:url";
import * as store from "./store.js";
import { newId, nowIso } from "./notes.js";

export function welcomeNote() {
  return {
    id: newId(),
    title: "Welcome to Synapse",
    type: "note",
    tags: ["meta"],
    created: nowIso(),
    updated: nowIso(),
    content: `Synapse is your connected brain for work notes. Everything lives as plain markdown files in \`data/notes/\` — no lock-in, ever.

## How it works

- **Capture anything** — hit *Capture* in the sidebar and paste a meeting transcript, a Jira ticket, or just type. Synapse detects what it is and titles it for you.
- **Connections find themselves** — as you write, the brain compares notes and suggests related ones in the right panel, with the shared terms as the reason. Accept the good ones, dismiss the rest.
- **Link explicitly with wikilinks** — type \`[[\` in the editor and pick a note. Linked notes show up in each other's panels and in the graph.
- **Action items are checkboxes** — any \`- [ ] task\` line in any note appears on the *Actions* dashboard. Add \`(due: 2026-07-10)\` to set a date.
- **The Graph** is your mind map — solid lines are real links, dashed lines are the brain's suggestions.

## Optional: give it a brain upgrade

Add an Anthropic API key in *Settings* and Synapse will use Claude to summarize pastes, extract action items from transcripts, and explain *why* notes are connected — not just that they share words.

## Try it now

- [ ] Paste something into Capture
- [ ] Open the Graph view
`,
  };
}

const day = 24 * 60 * 60 * 1000;
const daysAgo = (n) => new Date(Date.now() - n * day).toISOString();

const SAMPLES = [
  {
    title: "Glossary: procurement terms",
    type: "note",
    tags: ["reference"],
    age: 17,
    content: `Quick reference for the procurement domain.

- **PO (Purchase Order)** — the commercial document sent to a vendor to buy goods/services.
- **PO list page** — the main grid in the procurement module showing all POs with filters.
- **Vendor master** — the canonical record for each supplier (name, terms, contacts, tax info).
- **GRN (Goods Received Note)** — confirmation that ordered goods arrived.
- **Three-way match** — invoice vs PO vs GRN before payment is released.
`,
  },
  {
    title: "Sprint planning — procurement module",
    type: "meeting",
    tags: ["sprint"],
    age: 16,
    content: `Attendees: me, Sarah, Marcus, Dev team

Discussed the PO list page work for this sprint. The vendor filter (PROC-142) is the top ask from purchasing — they currently export to Excel just to filter by vendor, which is embarrassing.

Marcus flagged that the PO page filters have a pagination bug: changing any filter keeps you on page 4 of 2 results. Needs a ticket.

Sarah wants the filter work designed so saved views can build on it later — don't paint ourselves into a corner.

Decisions:
- Vendor filter ships this sprint (PROC-142)
- Pagination bug gets its own ticket, fix alongside

## Action Items
- [x] File the pagination bug ticket — Marcus
- [ ] Design filter state to support saved views later — me
- [ ] Demo vendor filter to purchasing on Friday (due: 2026-07-03)
`,
  },
  {
    title: "PROC-142: Add vendor filter to PO list page",
    type: "jira",
    tags: [],
    age: 16,
    content: `PROC-142

Description:
Purchasing needs to filter the PO list page by vendor. Today the only workaround is exporting the full PO list and filtering in Excel.

Acceptance Criteria:
- Vendor dropdown in the PO list page filter bar, searchable, sourced from vendor master
- Filter combines with existing status and date filters
- Selected vendor persists in the URL query params so views can be shared
- Pagination resets to page 1 when the filter changes

Story Points: 5
Sprint: 2026-S14
Reporter: Sarah Lin
`,
  },
  {
    title: "Research: PO page filter behavior",
    type: "research",
    tags: ["frontend"],
    age: 14,
    content: `Dug into how the PO list page filters actually work before building [[PROC-142: Add vendor filter to PO list page]].

Findings:
- Filter state lives in three places: component state, URL query params, and a cached "last filter" in localStorage. They disagree after back-navigation. This is the root cause of most filter weirdness.
- Pagination is separate state and nothing resets it when filters change — that's the bug Marcus hit in sprint planning.
- The status filter re-fetches on every keystroke; needs a debounce.

Recommendation: make URL query params the single source of truth for filter + page state. Everything else derives from it. This also gives us shareable filtered views for free, which the reporting dashboard idea could reuse.
`,
  },
  {
    title: "Vendor master data sync kickoff",
    type: "meeting",
    tags: ["integration"],
    age: 12,
    content: `Attendees: me, Sarah, Priya (ERP team)

Kickoff for syncing vendor master data from the ERP into our procurement module. Today vendor records are hand-entered and drift out of date, which pollutes everything downstream — including the vendor dropdown we're about to ship on the PO list page.

Priya: ERP exposes a vendor API, paginated, updated nightly. ~4,200 active vendor records.

Open questions:
- Dedupe strategy — ERP has duplicate vendors with different codes
- Do we sync payment terms too, or just identity fields?

## Action Items
- [ ] Priya to share vendor API docs and a sandbox key
- [ ] Draft field mapping ERP → vendor master — me (due: 2026-07-08)
- [ ] Sarah to decide on payment terms scope
`,
  },
  {
    title: "PROC-158: Pagination resets when PO filters change",
    type: "jira",
    tags: [],
    age: 9,
    content: `PROC-158

Description:
On the PO list page, changing any filter (status, date range) does not reset pagination. If you are on page 4 and apply a filter that returns 2 results, you see an empty grid.

Steps to reproduce:
1. Open PO list page, go to page 4
2. Apply status filter "Draft"
3. Grid is empty; page indicator still shows 4

Expected: applying or changing any filter returns to page 1.

Note from research: filter state is split across component state, URL params, and localStorage — fix should consolidate on URL params as source of truth.

Priority: High
Sprint: 2026-S14
Reporter: Marcus Webb
`,
  },
  {
    title: "Ideas: procurement reporting dashboard",
    type: "note",
    tags: ["ideas"],
    age: 6,
    content: `Sketching what a procurement reporting dashboard could look like if we pitch it for Q4.

- Spend by vendor over time (needs clean vendor master — depends on the sync project)
- Open PO aging: how long POs sit in each status
- Filter bar should reuse the PO page filter work — [[Research: PO page filter behavior]] recommends URL-param filter state, which would make dashboard views shareable links too
- Export that doesn't require the Excel dance purchasing does today

Rough take: most of the value is vendor spend + aging. Everything else is nice-to-have.
`,
  },
  {
    title: "1:1 with Sarah — Q3 priorities",
    type: "meeting",
    tags: ["1-1"],
    age: 4,
    content: `Attendees: me, Sarah

Q3 priorities for the procurement module, in order:
1. Ship the vendor filter + pagination fix (in flight)
2. Vendor master sync with ERP — biggest lever for data quality, purchasing feels the pain daily
3. Reporting dashboard is a Q4 pitch, not a Q3 commitment — but keep collecting requirements

Sarah asked me to own the vendor sync project end to end. Headcount: we get a contractor for the ERP integration work if the scope doc lands by mid-July.

## Action Items
- [ ] Write vendor sync scope doc (due: 2026-07-15)
- [ ] Collect dashboard requirements from purchasing informally
- [x] Send Sarah the filter demo recording
`,
  },
  {
    title: "URL as Single Source of Truth",
    type: "concept",
    tags: ["frontend", "state-management"],
    age: 2,
    content: `> **Definition:** Keep UI state (filters, page, sort) in the URL query string and derive everything else from it.

When state lives in several places at once — component state, localStorage, the URL — they inevitably disagree after back-navigation or refresh. Making the URL canonical eliminates the drift, and every view becomes a shareable, bookmarkable link for free.

## Key principles
- One writer: user actions update the URL; the UI only reads from it
- Refresh, back button, and shared links all reproduce the exact view
- Derived caches (localStorage "last view") are hints, never authority

## Examples
- PO list page filters: root cause of the filter weirdness was three competing state stores
- A saved view is then just a named URL

## Connections
- [[Shareable Saved Views]] — saved views fall out for free once the URL is canonical

## Sources
- [[Research: PO page filter behavior]]
- [[PROC-158: Pagination resets when PO filters change]]
`,
  },
  {
    title: "Shareable Saved Views",
    type: "concept",
    tags: ["frontend", "product"],
    age: 2,
    content: `> **Definition:** Let users save a filter/sort/column combination as a named view they can share with the team.

Power users build the same filtered views over and over (or export to Excel to get them). Naming and sharing views turns individual workarounds into team workflows, and it's the foundation reporting dashboards can reuse.

## Key principles
- A view is data (a name + query params), not a screenshot of UI state
- Design filter state for this from day one — retrofitting is painful
- Default views per user beat one global default

## Examples
- Purchasing exporting the PO list to Excel just to filter by vendor is the anti-pattern this replaces

## Connections
- [[URL as Single Source of Truth]] — the prerequisite that makes views trivially serializable

## Sources
- [[Ideas: procurement reporting dashboard]]
- [[Sprint planning — procurement module]]
`,
  },
  {
    title: "Master Data Quality",
    type: "concept",
    tags: ["data-quality", "integration"],
    age: 2,
    content: `> **Definition:** The accuracy and deduplication of canonical records (vendors, items, customers) that everything downstream depends on.

Hand-entered master data drifts: duplicates, stale terms, missing fields. Every feature built on top of it — filters, reports, matching — inherits the pollution. Syncing from the system of record fixes the class of problem instead of each symptom.

## Key principles
- Fix data at the source system, not at each consumer
- Dedupe needs an explicit strategy (match keys, survivorship rules) — it never "just works"
- Scope early: identity fields first, enrichment fields (payment terms) as a separate decision

## Examples
- ~4,200 vendor records syncing nightly from the ERP; duplicates with different codes are the known hazard
- The vendor dropdown on the PO page is only as good as the vendor master behind it

## Connections
- [[URL as Single Source of Truth]] — same principle, different layer: one canonical writer, everything else derives

## Sources
- [[Vendor master data sync kickoff]]
- [[Glossary: procurement terms]]
`,
  },
];

function main() {
  store.init();
  const force = process.argv.includes("--force");
  const existing = new Set([...store.allNotes().values()].map((n) => n.title));
  if (!force && SAMPLES.every((s) => existing.has(s.title))) {
    console.log("Sample notes already present — nothing to do. (Use --force to re-add.)");
    return;
  }
  if (store.allNotes().size === 0) {
    store.putNote(welcomeNote());
    console.log("Created welcome note.");
  }
  let added = 0;
  for (const s of SAMPLES) {
    if (!force && existing.has(s.title)) continue;
    store.putNote({
      id: newId(),
      title: s.title,
      type: s.type,
      tags: s.tags,
      created: daysAgo(s.age),
      updated: daysAgo(s.age - 0.5),
      content: s.content,
    });
    added++;
  }
  console.log(`Seeded ${added} sample notes into data/notes/. Restart the dev server (or it hot-reloads) and explore.`);
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main();
}
