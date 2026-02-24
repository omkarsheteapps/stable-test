import { useEffect, useMemo, useRef, useState, type RefObject } from "react";
import Editor, { type Monaco, type OnMount } from "@monaco-editor/react";
import type * as MonacoApi from "monaco-editor";
import { useParams } from "react-router-dom";
import { PlusSquare, Sparkles } from "lucide-react";
import { Button } from "@/components/ui/button";
import { api } from "@/lib/api";

type StepKeyword = "Given" | "When" | "Then" | "And" | "But";

const LANGUAGE_ID = "gherkin-controlled";
const PLACEHOLDER_REGEX = /\{(string|int|double|long)\}/g;
const KEYWORD_SNIPPETS = ["Feature:", "Scenario:", "Given", "When", "Then", "And"];

function flattenSteps(response: unknown): string[] {
  const buckets = (response as { data?: { steps?: Record<string, string[]> } })?.data?.steps;
  if (!buckets) return [];
  const all = new Set<string>();
  Object.values(buckets).forEach((list) => list.forEach((item) => all.add(item)));
  return [...all];
}

function buildStepSnippet(keyword: StepKeyword, pattern: string): string {
  let index = 1;
  const body = pattern.replace(PLACEHOLDER_REGEX, (_raw, type: "string" | "int" | "double" | "long") => {
    if (type === "string") return '"${' + index++ + ':value}"';
    if (type === "double") return '${' + index++ + ':0.0}';
    return '${' + index++ + ':0}';
  });
  return `${keyword} ${body}`;
}

function fuzzyScore(query: string, value: string) {
  const q = query.toLowerCase().trim();
  const v = value.toLowerCase();
  if (!q) return 0;
  if (v.includes(q)) return v.indexOf(q);

  let qi = 0;
  let gaps = 0;
  for (let i = 0; i < v.length && qi < q.length; i += 1) {
    if (v[i] === q[qi]) qi += 1;
    else gaps += 1;
  }
  return qi === q.length ? 100 + gaps : null;
}

function validateModel(model: MonacoApi.editor.ITextModel, monaco: Monaco): MonacoApi.editor.IMarkerData[] {
  const markers: MonacoApi.editor.IMarkerData[] = [];
  const lines = model.getLinesContent();
  let featureCount = 0;
  let inScenario = false;
  let scenarioName = "";
  let scenarioStepCount = 0;
  let seenGiven = false;
  let seenWhen = false;

  const push = (line: number, message: string) => {
    const maxColumn = model.getLineMaxColumn(line);
    markers.push({
      severity: monaco.MarkerSeverity.Error,
      message,
      startLineNumber: line,
      endLineNumber: line,
      startColumn: 1,
      endColumn: maxColumn,
    });
  };

  lines.forEach((rawLine, index) => {
    const lineNumber = index + 1;
    const line = rawLine.trim();
    if (!line) return;

    if (/^Feature\s*:/i.test(line)) {
      featureCount += 1;
      if (featureCount > 1) push(lineNumber, "Only one Feature block is allowed.");
      return;
    }

    if (/^Scenario\s*:/i.test(line)) {
      if (inScenario && scenarioStepCount === 0) {
        push(lineNumber - 1 > 0 ? lineNumber - 1 : lineNumber, `Scenario \"${scenarioName || "Unnamed Scenario"}\" cannot be empty.`);
      }
      inScenario = true;
      scenarioStepCount = 0;
      seenGiven = false;
      seenWhen = false;
      scenarioName = line.replace(/^Scenario\s*:\s*/i, "") || "Unnamed Scenario";
      return;
    }

    const stepMatch = line.match(/^(Given|When|Then|And|But)\b/i);
    if (!stepMatch) return;

    scenarioStepCount += 1;
    if (!inScenario) {
      push(lineNumber, "Step cannot appear outside of a Scenario.");
      return;
    }

    const keyword = stepMatch[1] as StepKeyword;
    if (keyword === "When" && !seenGiven) {
      push(lineNumber, "When step cannot appear before a Given step.");
    }
    if (keyword === "Then" && !seenWhen) {
      push(lineNumber, "Then step cannot appear before a When step.");
    }
    if (keyword === "Given") seenGiven = true;
    if (keyword === "When") seenWhen = true;
  });

  if (inScenario && scenarioStepCount === 0) {
    push(lines.length || 1, `Scenario \"${scenarioName || "Unnamed Scenario"}\" cannot be empty.`);
  }

  return markers;
}

function registerLanguage(monaco: Monaco, stepsRef: RefObject<string[]>) {
  monaco.languages.register({ id: LANGUAGE_ID });

  monaco.languages.setLanguageConfiguration(LANGUAGE_ID, {
    autoClosingPairs: [{ open: '"', close: '"' }],
    onEnterRules: [
      {
        beforeText: /^\s*Scenario:\s.*$/,
        action: { indentAction: monaco.languages.IndentAction.Indent },
      },
    ],
  });

  monaco.languages.setMonarchTokensProvider(LANGUAGE_ID, {
    tokenizer: {
      root: [
        [/^\s*Feature:/, "keyword.feature"],
        [/^\s*Scenario:/, "keyword.scenario"],
        [/^\s*(Given|When|Then|And|But)\b/, "keyword.step"],
        [/\{(string|int|double|long)\}/, "type.identifier"],
      ],
    },
  });

  monaco.editor.defineTheme("gherkinControlledTheme", {
    base: "vs",
    inherit: true,
    rules: [
      { token: "keyword.feature", foreground: "7f3fbf", fontStyle: "bold" },
      { token: "keyword.scenario", foreground: "005cc5", fontStyle: "bold" },
      { token: "keyword.step", foreground: "0a7d34", fontStyle: "bold" },
      { token: "type.identifier", foreground: "b26a00" },
    ],
    colors: {},
  });

  monaco.languages.registerCompletionItemProvider(LANGUAGE_ID, {
    triggerCharacters: [" ", "G", "W", "T", "S", "F", "A", "B", "g", "w", "t", "s", "f", "a", "b"],
    provideCompletionItems(model, position) {
      const linePrefix = model.getValueInRange({
        startLineNumber: position.lineNumber,
        startColumn: 1,
        endLineNumber: position.lineNumber,
        endColumn: position.column,
      });
      const suggestions: MonacoApi.languages.CompletionItem[] = [];
      const trimmed = linePrefix.trimStart();
      const leadingSpaces = linePrefix.length - trimmed.length;
      const keywordMatch = trimmed.match(/^(Given|When|Then|And|But)\s+(.+)?$/i);

      if (!trimmed || /^[A-Za-z]*$/.test(trimmed)) {
        suggestions.push(
          ...KEYWORD_SNIPPETS.map((keyword) => ({
            label: keyword,
            kind: monaco.languages.CompletionItemKind.Keyword,
            insertText: `${keyword} `,
            insertTextRules: monaco.languages.CompletionItemInsertTextRule.InsertAsSnippet,
            range: {
              startLineNumber: position.lineNumber,
              endLineNumber: position.lineNumber,
              startColumn: leadingSpaces + 1,
              endColumn: position.column,
            },
          })),
        );
      }

      if (keywordMatch) {
        const activeKeyword = keywordMatch[1] as StepKeyword;
        const query = keywordMatch[2] ?? "";
        const filtered = stepsRef.current
          .map((step) => ({ step, score: fuzzyScore(query, step) }))
          .filter((entry): entry is { step: string; score: number } => entry.score !== null)
          .sort((a, b) => a.score - b.score)
          .slice(0, 50);

        suggestions.push(
          ...filtered.map(({ step }) => ({
            label: step,
            kind: monaco.languages.CompletionItemKind.Snippet,
            insertText: buildStepSnippet(activeKeyword, step),
            insertTextRules: monaco.languages.CompletionItemInsertTextRule.InsertAsSnippet,
            range: {
              startLineNumber: position.lineNumber,
              endLineNumber: position.lineNumber,
              startColumn: linePrefix.indexOf(keywordMatch[1]) + 1,
              endColumn: position.column,
            },
            detail: `Step definition (${activeKeyword})`,
          })),
        );
      }

      return { suggestions };
    },
  });
}

export default function AppDetail() {
  const { id } = useParams();
  const appId = id ?? "";
  const [steps, setSteps] = useState<string[]>([]);
  const [value, setValue] = useState("Feature: New Feature\n\nScenario: New Scenario\n  Given ");
  const [showStepPicker, setShowStepPicker] = useState(false);
  const editorRef = useRef<MonacoApi.editor.IStandaloneCodeEditor | null>(null);
  const monacoRef = useRef<Monaco | null>(null);
  const initializedRef = useRef(false);
  const stepsRef = useRef<string[]>([]);

  useEffect(() => {
    stepsRef.current = steps;
  }, [steps]);

  useEffect(() => {
    if (!appId) return;
    void api.get(`/steps/apps/${appId}`).then((response) => {
      setSteps(flattenSteps(response.data));
    }).catch(() => setSteps([]));
  }, [appId]);

  const validate = useMemo(() => {
    return () => {
      const monaco = monacoRef.current;
      const editor = editorRef.current;
      if (!monaco || !editor) return;
      const model = editor.getModel();
      if (!model) return;
      monaco.editor.setModelMarkers(model, LANGUAGE_ID, validateModel(model, monaco));
    };
  }, []);

  const insertAtCursor = (text: string) => {
    const editor = editorRef.current;
    if (!editor) return;
    editor.executeEdits("gherkin-controls", [{
      range: editor.getSelection() ?? editor.getModel()!.getFullModelRange(),
      text,
      forceMoveMarkers: true,
    }]);
    editor.focus();
    editor.trigger("gherkin-controls", "editor.action.triggerSuggest", {});
  };

  const onMount: OnMount = (editor, monaco) => {
    editorRef.current = editor;
    monacoRef.current = monaco;
    if (!initializedRef.current) {
      registerLanguage(monaco, stepsRef);
      initializedRef.current = true;
    }
    monaco.editor.setTheme("gherkinControlledTheme");
    const model = editor.getModel();
    if (model) monaco.editor.setModelLanguage(model, LANGUAGE_ID);

    editor.onDidChangeModelContent(() => {
      validate();
    });

    validate();
  };

  return (
    <div className="flex h-screen flex-col gap-4 bg-[#f6f8fa] p-6">
      <header className="rounded border border-[#d0d7de] bg-white p-4">
        <h1 className="text-xl font-semibold text-[#24292f]">Intelligent Gherkin Editor</h1>
        <p className="text-sm text-[#57606a]">App {appId || "unknown"} • Monaco DSL editor with controlled suggestions.</p>
      </header>

      <div className="rounded border border-[#d0d7de] bg-white p-3">
        <div className="mb-3 flex items-center gap-2">
          <Button size="sm" onClick={() => insertAtCursor("Scenario: New Scenario\n  ")}>
            <PlusSquare className="mr-2 h-4 w-4" />
            Add Scenario
          </Button>

          <Button size="sm" variant="outline" onClick={() => setShowStepPicker((open) => !open)}>
            <Sparkles className="mr-2 h-4 w-4" />
            Add Step
          </Button>

          {showStepPicker && (
            <div className="inline-flex items-center gap-2 rounded border border-[#d0d7de] px-2 py-1">
              {(["Given", "When", "Then"] as const).map((keyword) => (
                <Button
                  key={keyword}
                  size="sm"
                  variant="ghost"
                  onClick={() => {
                    insertAtCursor(`${keyword} `);
                    setShowStepPicker(false);
                  }}
                >
                  {keyword}
                </Button>
              ))}
            </div>
          )}
        </div>

        <Editor
          height="70vh"
          defaultLanguage={LANGUAGE_ID}
          value={value}
          onChange={(next) => setValue(next ?? "")}
          onMount={onMount}
          options={{
            minimap: { enabled: false },
            quickSuggestions: { other: true, comments: false, strings: true },
            suggestOnTriggerCharacters: true,
            autoIndent: "advanced",
            tabCompletion: "on",
            formatOnType: true,
            wordBasedSuggestions: "off",
          }}
        />
      </div>
    </div>
  );
}
