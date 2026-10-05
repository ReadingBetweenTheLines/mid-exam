"use client";

import dynamic from "next/dynamic";

// Dynamically import Monaco Editor to avoid SSR issues
const Editor = dynamic(() => import("@monaco-editor/react"), { ssr: false });

interface CodeEditorProps {
  value: string;
  onChange: (value: string) => void;
  readOnly?: boolean;
}

export default function CodeEditor({ value, onChange, readOnly = false }: CodeEditorProps) {
  return (
    <div className="w-full h-full min-h-[300px] overflow-hidden">
      <Editor
        height="100%"
        defaultLanguage="javascript"
        theme="vs-dark"
        value={value}
        onChange={(val) => onChange(val || "")}
        options={{
          readOnly,
          minimap: { enabled: false }, // Saves screen real estate on mobile
          fontSize: 14,
          lineNumbers: "on",
          lineNumbersMinChars: 3,
          wordWrap: "on", // Prevents horizontal runaway on narrow mobile screens
          wrappingIndent: "indent",
          scrollBeyondLastLine: false,
          automaticLayout: true,
          tabSize: 2,
          renderLineHighlight: "all",
          smoothScrolling: true,
          padding: { top: 12, bottom: 64 }, // Extra bottom padding so on-screen keyboard doesn't occlude code
          folding: false, // Cleaner touch targets
          glyphMargin: false,
          quickSuggestions: false, // Prevents mobile autocomplete popup clashes
        }}
      />
    </div>
  );
}