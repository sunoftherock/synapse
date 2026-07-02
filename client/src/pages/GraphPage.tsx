import { useEffect, useMemo, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import ForceGraph2D from "react-force-graph-2d";
import { api } from "../api";
import type { GraphData, NoteType } from "../types";
import { TYPE_COLORS, TYPE_LABELS } from "../types";

const ALL_TYPES = Object.keys(TYPE_COLORS) as NoteType[];

const endId = (v: any) => (typeof v === "object" ? v.id : v);

export default function GraphPage() {
  const navigate = useNavigate();
  const [data, setData] = useState<GraphData | null>(null);
  const [hover, setHover] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [enabled, setEnabled] = useState<Set<NoteType>>(new Set(ALL_TYPES));
  const wrapRef = useRef<HTMLDivElement>(null);
  const fgRef = useRef<any>(null);
  const didFit = useRef(false);
  const [size, setSize] = useState({ w: 800, h: 600 });

  useEffect(() => {
    api.graph().then(setData).catch(console.error);
  }, []);

  useEffect(() => {
    const el = wrapRef.current;
    if (!el) return;
    const update = () => setSize({ w: el.clientWidth, h: el.clientHeight });
    update();
    const ro = new ResizeObserver(update);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  // The force-graph lib mutates node objects; give it copies, filtered by type.
  const graphData = useMemo(() => {
    if (!data) return { nodes: [], links: [] };
    const nodes = data.nodes.filter((n) => enabled.has(n.type)).map((n) => ({ ...n }));
    const ids = new Set(nodes.map((n) => n.id));
    const links = data.edges.filter((e) => ids.has(e.source) && ids.has(e.target)).map((e) => ({ ...e }));
    return { nodes, links };
  }, [data, enabled]);

  const neighbors = useMemo(() => {
    const map = new Map<string, Set<string>>();
    for (const l of graphData.links) {
      const a = endId(l.source);
      const b = endId(l.target);
      if (!map.has(a)) map.set(a, new Set());
      if (!map.has(b)) map.set(b, new Set());
      map.get(a)!.add(b);
      map.get(b)!.add(a);
    }
    return map;
  }, [graphData]);

  const matches = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return null;
    return new Set(graphData.nodes.filter((n: any) => n.title.toLowerCase().includes(q)).map((n: any) => n.id));
  }, [search, graphData]);

  // Obsidian-ish physics: stronger repulsion, roomier links.
  useEffect(() => {
    const fg = fgRef.current;
    if (!fg) return;
    fg.d3Force("charge")?.strength(-110);
    fg.d3Force("link")?.distance(55);
    didFit.current = false;
  }, [graphData]);

  const nodeAlpha = (id: string) => {
    if (matches && !matches.has(id)) return 0.08;
    if (hover && id !== hover && !neighbors.get(hover)?.has(id)) return 0.15;
    return 1;
  };

  const toggleType = (t: NoteType) => {
    setEnabled((prev) => {
      const next = new Set(prev);
      if (next.has(t)) next.delete(t);
      else next.add(t);
      return next.size === 0 ? new Set(ALL_TYPES) : next;
    });
  };

  return (
    <div className="graph-page" ref={wrapRef}>
      {data && data.nodes.length < 2 && (
        <div className="graph-empty">
          <h2>Your brain is still small</h2>
          <p className="muted">Capture a few notes and the map draws itself.</p>
        </div>
      )}
      <ForceGraph2D
        ref={fgRef}
        width={size.w}
        height={size.h}
        graphData={graphData}
        backgroundColor="#111116"
        nodeLabel={() => ""}
        linkLabel={(l: any) => (l.kind === "suggested" ? `suggested: ${l.label}` : l.label)}
        linkColor={(l: any) => {
          const a = endId(l.source);
          const b = endId(l.target);
          if (hover && a !== hover && b !== hover) return "rgba(88,88,104,0.08)";
          if (matches && (!matches.has(a) || !matches.has(b))) return "rgba(88,88,104,0.06)";
          if (hover) return l.kind === "link" ? "#8d7ef5" : "rgba(141,126,245,0.55)";
          return l.kind === "link" ? "#585868" : "rgba(124,108,240,0.35)";
        }}
        linkWidth={(l: any) => {
          const touching = hover && (endId(l.source) === hover || endId(l.target) === hover);
          return touching ? 2.2 : l.kind === "link" ? 1.6 : 1;
        }}
        linkLineDash={(l: any) => (l.kind === "suggested" ? [3, 3] : null)}
        onNodeHover={(n: any) => setHover(n ? n.id : null)}
        nodeCanvasObject={(node: any, ctx, globalScale) => {
          const alpha = nodeAlpha(node.id);
          const focused = hover === node.id || (hover && neighbors.get(hover)?.has(node.id)) || (matches?.has(node.id) ?? false);
          const r = 4 + Math.min(node.degree ?? 0, 6);
          ctx.globalAlpha = alpha;
          ctx.beginPath();
          ctx.arc(node.x, node.y, r, 0, 2 * Math.PI);
          ctx.fillStyle = TYPE_COLORS[node.type as NoteType] || "#888";
          ctx.fill();
          if (hover === node.id || matches?.has(node.id)) {
            ctx.strokeStyle = "rgba(232,232,238,0.9)";
            ctx.lineWidth = 1.5 / globalScale;
            ctx.stroke();
          }
          if ((globalScale > 0.9 && alpha === 1) || focused) {
            const fontSize = Math.max(11 / globalScale, 3.2);
            ctx.font = `${focused ? "600 " : ""}${fontSize}px ui-sans-serif, system-ui`;
            ctx.textAlign = "center";
            ctx.textBaseline = "top";
            ctx.fillStyle = focused ? "rgba(240,240,248,0.98)" : "rgba(232,232,238,0.8)";
            const label = node.title.length > 34 ? node.title.slice(0, 34) + "…" : node.title;
            ctx.fillText(label, node.x, node.y + r + 2);
          }
          ctx.globalAlpha = 1;
        }}
        nodePointerAreaPaint={(node: any, color, ctx) => {
          ctx.beginPath();
          ctx.arc(node.x, node.y, 10, 0, 2 * Math.PI);
          ctx.fillStyle = color;
          ctx.fill();
        }}
        onNodeClick={(node: any) => navigate(`/note/${node.id}`)}
        cooldownTicks={120}
        onEngineStop={() => {
          if (!didFit.current && graphData.nodes.length > 1) {
            didFit.current = true;
            fgRef.current?.zoomToFit(400, 70);
          }
        }}
      />

      <div className="graph-toolbar">
        <input
          className="input graph-search"
          placeholder="Find in graph…"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
        <div className="chip-row">
          {ALL_TYPES.map((t) => (
            <button
              key={t}
              className={`chip ${enabled.has(t) ? "chip-active" : ""}`}
              onClick={() => toggleType(t)}
              title={`Toggle ${TYPE_LABELS[t]}`}
            >
              <span className="type-dot inline" style={{ background: TYPE_COLORS[t] }} />
              {TYPE_LABELS[t]}
            </button>
          ))}
        </div>
        <button className="btn" onClick={() => fgRef.current?.zoomToFit(400, 70)} title="Zoom to fit">
          ⤢ Fit
        </button>
      </div>

      <div className="graph-legend">
        <span className="legend-item"><span className="legend-line solid" /> linked</span>
        <span className="legend-item"><span className="legend-line dashed" /> suggested</span>
        <span className="legend-item muted">hover a node to see its neighborhood · click to open</span>
      </div>
    </div>
  );
}
