"use client";

import Editor, { OnMount } from "@monaco-editor/react";

interface CodeEditorProps {
  value: string;
  onChange: (val: string) => void;
  readOnly?: boolean;
}

export default function CodeEditor({ value, onChange, readOnly = false }: CodeEditorProps) {
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
    // Crucial for mobile typing: select-text allows soft keyboard interaction
    <div className="w-full h-full min-h-[300px] select-text">
      <Editor
        height="100%"
        defaultLanguage="pseudocode"
        theme="vs-dark"
        value={value}
        onChange={(val) => onChange(val || "")}
        options={{
          readOnly,
          minimap: { enabled: false },
          fontSize: 15,
          fontFamily: "'Fira Code', 'JetBrains Mono', monospace",
          lineNumbers: "on",
          lineDecorationsWidth: 6,
          scrollBeyondLastLine: false,
          automaticLayout: true,
          wordWrap: "on",
          tabSize: 4,
          insertSpaces: true,
          renderLineHighlight: "all",
          cursorBlinking: "smooth",
          contextmenu: false,
          // Mobile Virtual Keyboard & Touch Configuration
          glyphMargin: false,
          folding: false,
          dragAndDrop: false,
          mouseWheelZoom: false,
          smoothScrolling: true,
          accessibilitySupport: "off",
          domReadOnly: readOnly,
          // Allows standard phone touch events to focus the hidden input buffer
          fastScrollSensitivity: 4,
        }}
        onMount={handleEditorDidMount}
      />
    </div>
  );
}