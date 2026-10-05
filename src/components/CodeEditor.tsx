"use client";

import { useEffect, useState, useRef } from "react";
import Editor, { OnMount } from "@monaco-editor/react";

interface CodeEditorProps {
  value: string;
  onChange: (val: string) => void;
  readOnly?: boolean;
}

export default function CodeEditor({ value, onChange, readOnly = false }: CodeEditorProps) {
  const [isMobile, setIsMobile] = useState<boolean>(false);
  const textareaRef = useRef<HTMLTextAreaElement | null>(null);

  // Detect mobile user agent
  useEffect(() => {
    const checkMobile = () => {
      const userAgent = navigator.userAgent || navigator.vendor;
      const isTouch = /android|iphone|ipad|ipod|blackberry|iemobile|opera mini/i.test(userAgent.toLowerCase());
      const isSmallScreen = window.innerWidth < 768;
      setIsMobile(isTouch || isSmallScreen);
    };

    checkMobile();
    window.addEventListener("resize", checkMobile);
    return () => window.removeEventListener("resize", checkMobile);
  }, []);

  // Handle Tab and Enter key indents on mobile textarea
  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === "Tab") {
      e.preventDefault();
      const target = e.currentTarget;
      const start = target.selectionStart;
      const end = target.selectionEnd;
      const updated = value.substring(0, start) + "    " + value.substring(end);
      onChange(updated);
      setTimeout(() => {
        target.selectionStart = target.selectionEnd = start + 4;
      }, 0);
    } else if (e.key === "Enter") {
      const target = e.currentTarget;
      const cursor = target.selectionStart;
      const lineBefore = value.substring(0, cursor).split("\n").pop() || "";

      // Auto-indent 4 spaces if previous line starts with JIKA, LAINNYA, FOR, or WHILE
      if (/^\s*(JIKA|LAINNYA|FOR|WHILE)\b/i.test(lineBefore)) {
        e.preventDefault();
        const currentIndent = lineBefore.match(/^\s*/)?.[0] || "";
        const extraIndent = "    ";
        const insertText = "\n" + currentIndent + extraIndent;
        const updated = value.substring(0, cursor) + insertText + value.substring(target.selectionEnd);
        onChange(updated);
        setTimeout(() => {
          target.selectionStart = target.selectionEnd = cursor + insertText.length;
        }, 0);
      }
    }
  };

  // -------------------------------------------------------------
  // 1. MOBILE RESPONSIVE IDE TEXTAREA (Zero Overlap, 100% Reliable)
  // -------------------------------------------------------------
  if (isMobile) {
    const lines = value ? value.split("\n") : [""];

    return (
      <div className="w-full flex bg-[#1e1e1e] font-mono text-sm border-t border-slate-800 rounded-b-xl overflow-hidden min-h-[320px]">
        {/* Line numbers column */}
        <div className="bg-[#181818] text-slate-600 select-none py-3 px-2 text-right text-xs leading-6 border-r border-slate-800/80 min-w-[36px]">
          {lines.map((_, i) => (
            <div key={i}>{i + 1}</div>
          ))}
        </div>

        {/* Pure native editable code area */}
        <textarea
          ref={textareaRef}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          onKeyDown={handleKeyDown}
          disabled={readOnly}
          spellCheck={false}
          autoCapitalize="none"
          autoComplete="off"
          autoCorrect="off"
          placeholder="// Tulis pseudocode di sini..."
          className="flex-1 bg-transparent text-slate-100 p-3 leading-6 text-sm font-mono outline-none resize-none overflow-y-auto min-h-[320px] placeholder:text-slate-600"
        />
      </div>
    );
  }

  // -------------------------------------------------------------
  // 2. DESKTOP MONACO EDITOR
  // -------------------------------------------------------------
  const handleEditorDidMount: OnMount = (editor, monaco) => {
    monaco.languages.register({ id: "pseudocode" });

    monaco.languages.setMonarchTokensProvider("pseudocode", {
      keywords: [
        "JIKA",
        "LAINNYA",
        "FOR",
        "WHILE",
        "in",
        "END",
        "ADD",
        "REMOVE",
        "TO",
        "FROM",
        "print",
      ],
      operators: ["AND", "OR", "NOT", "==", "!=", "<=", ">=", "<", ">", "="],
      booleans: ["TRUE", "FALSE"],

      tokenizer: {
        root: [
          [/\/\/.*$/, "comment"],
          [/#.*$/, "comment"],
          [/"([^"\\]|\\.)*"/, "string"],
          [/'([^'\\]|\\.)*'/, "string"],
          [/\b\d+\b/, "number"],
          [
            /[a-zA-Z_]\w*/,
            {
              cases: {
                "@keywords": "keyword",
                "@booleans": "constant",
                "@operators": "operator",
                "@default": "identifier",
              },
            },
          ],
          [/[{}()[\]]/, "@brackets"],
          [/==|!=|<=|>=|[<>=+\-*/]/, "operator"],
        ],
      },
    });

    monaco.languages.setLanguageConfiguration("pseudocode", {
      comments: {
        lineComment: "//",
      },
      brackets: [
        ["[", "]"],
        ["(", ")"],
      ],
      autoClosingPairs: [
        { open: "[", close: "]" },
        { open: "(", close: ")" },
        { open: '"', close: '"' },
        { open: "'", close: "'" },
      ],
      indentationRules: {
        increaseIndentPattern: /^\s*(JIKA\b.*|LAINNYA\b.*|FOR\b.*|WHILE\b.*)/,
        decreaseIndentPattern: /^\s*(LAINNYA\b.*|END\s+(FOR|WHILE)\b.*)/,
      },
    });

    editor.updateOptions({
      tabSize: 4,
      insertSpaces: true,
      detectIndentation: false,
    });
  };

  return (
    <div className="w-full h-full min-h-[350px]">
      <Editor
        height="100%"
        defaultLanguage="pseudocode"
        theme="vs-dark"
        value={value}
        onChange={(val) => onChange(val || "")}
        options={{
          readOnly,
          minimap: { enabled: false },
          fontSize: 14,
          fontFamily: "'Fira Code', 'JetBrains Mono', Menlo, monospace",
          lineNumbers: "on",
          lineDecorationsWidth: 10,
          scrollBeyondLastLine: false,
          automaticLayout: true,
          wordWrap: "on",
          tabSize: 4,
          insertSpaces: true,
          renderLineHighlight: "all",
          cursorBlinking: "smooth",
          contextmenu: false,
        }}
        onMount={handleEditorDidMount}
      />
    </div>
  );
}