import { useMemo } from "react";
import CodeMirror from "@uiw/react-codemirror";
import { markdown } from "@codemirror/lang-markdown";
import { EditorView } from "@codemirror/view";
import { autocompletion, type CompletionContext } from "@codemirror/autocomplete";

interface Props {
  value: string;
  onChange: (v: string) => void;
  noteTitles: string[];
  autoFocus?: boolean;
}

/** Markdown editor with [[wikilink]] autocompletion over existing note titles. */
export default function Editor({ value, onChange, noteTitles, autoFocus }: Props) {
  const extensions = useMemo(() => {
    const wikiComplete = (ctx: CompletionContext) => {
      const match = ctx.matchBefore(/\[\[([^\][\n]*)$/);
      if (!match) return null;
      return {
        from: match.from + 2,
        options: noteTitles.map((t) => ({ label: t, type: "text", apply: `${t}]]` })),
        validFor: /^[^\][\n]*$/,
      };
    };
    return [
      markdown(),
      EditorView.lineWrapping,
      autocompletion({ override: [wikiComplete], activateOnTyping: true }),
    ];
  }, [noteTitles]);

  return (
    <CodeMirror
      value={value}
      onChange={onChange}
      extensions={extensions}
      theme="dark"
      autoFocus={autoFocus}
      basicSetup={{
        lineNumbers: false,
        foldGutter: false,
        highlightActiveLine: false,
        highlightSelectionMatches: false,
      }}
      className="editor"
      placeholder="Write in markdown. Type [[ to link another note."
    />
  );
}
