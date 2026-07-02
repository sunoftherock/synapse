import React, { useMemo } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import type { NoteListItem } from "../types";

interface Props {
  content: string;
  notes: NoteListItem[];
  onToggle: (line: number) => void;
  onNavigate: (id: string) => void;
}

const WIKI_PREFIX = "#wiki=";

/**
 * Rewrite [[Wiki Links]] into markdown links (outside code fences) without
 * changing line counts, so checkbox line positions still map to the source.
 */
function preprocess(content: string): string {
  const lines = content.split("\n");
  let inFence = false;
  return lines
    .map((line) => {
      if (/^\s*(```|~~~)/.test(line)) {
        inFence = !inFence;
        return line;
      }
      if (inFence) return line;
      return line.replace(/\[\[([^\][\n]+)\]\]/g, (_, t) => `[${t}](${WIKI_PREFIX}${encodeURIComponent(t)})`);
    })
    .join("\n");
}

/** Re-enable the checkboxes GFM renders as disabled, wiring them to onToggle. */
function enableChecks(children: React.ReactNode, onClick: () => void): React.ReactNode {
  return React.Children.map(children, (child) => {
    if (!React.isValidElement(child)) return child;
    const el = child as React.ReactElement<any>;
    if (el.type === "input" && el.props.type === "checkbox") {
      return React.cloneElement(el, { disabled: false, onChange: onClick, checked: el.props.checked ?? false });
    }
    if (el.type === "p") {
      return React.cloneElement(el, {}, enableChecks(el.props.children, onClick));
    }
    return child;
  });
}

export default function Preview({ content, notes, onToggle, onNavigate }: Props) {
  const processed = useMemo(() => preprocess(content), [content]);
  const byTitle = useMemo(() => {
    const m = new Map<string, string>();
    for (const n of notes) m.set(n.title.trim().toLowerCase(), n.id);
    return m;
  }, [notes]);

  return (
    <div className="md">
      <ReactMarkdown
        remarkPlugins={[remarkGfm]}
        components={{
          a: (props: any) => {
            const href: string = props.href || "";
            if (href.startsWith(WIKI_PREFIX)) {
              const title = decodeURIComponent(href.slice(WIKI_PREFIX.length));
              const target = byTitle.get(title.trim().toLowerCase());
              return (
                <a
                  className={`wikilink ${target ? "" : "wikilink-missing"}`}
                  title={target ? title : `No note titled “${title}” yet`}
                  onClick={(e) => {
                    e.preventDefault();
                    if (target) onNavigate(target);
                  }}
                >
                  {props.children}
                </a>
              );
            }
            return (
              <a href={href} target="_blank" rel="noreferrer">
                {props.children}
              </a>
            );
          },
          li: (props: any) => {
            const { node, className, children, ...rest } = props;
            if (className?.includes("task-list-item") && node?.position) {
              const line: number = node.position.start.line;
              return (
                <li className={className} {...rest}>
                  {enableChecks(children, () => onToggle(line))}
                </li>
              );
            }
            return (
              <li className={className} {...rest}>
                {children}
              </li>
            );
          },
        }}
      >
        {processed}
      </ReactMarkdown>
    </div>
  );
}
