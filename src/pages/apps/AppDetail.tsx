import { useEffect, useMemo, useRef, useState, type RefObject } from "react";
import Editor, { type Monaco, type OnMount } from "@monaco-editor/react";
import type * as MonacoApi from "monaco-editor";
import { useParams } from "react-router-dom";
import { FolderPlus, PlusSquare, Sparkles } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { api } from "@/lib/api";
import { EnvironmentVariablesModal } from "@/components/apps/EnvironmentVariablesModal";

type StepKeyword = "Given" | "When" | "Then" | "And" | "But";
type TreeItem = {
  id: string;
  name: string;
  path: string;
  type: "folder" | "file";
};

const LANGUAGE_ID = "gherkin-controlled";
const PLACEHOLDER_REGEX = /\{(string|int|double|long)\}/g;
const KEYWORD_SNIPPETS = ["Feature:", "Scenario:", "Given", "When", "Then", "And"];
const DEFAULT_FEATURE_CONTENT = "Feature: New Feature\n\nScenario: New Scenario\n  Given ";
let languageRegistered = false;
let completionProviderDisposable: MonacoApi.IDisposable | null = null;

function normalizePathSegment(value: string) {
  return value.trim().replace(/^\/+|\/+$/g, "");
}

function normalizeFolderPath(path: string) {
  return path
    .split("/")
    .map((segment) => normalizePathSegment(segment))
    .filter(Boolean)
    .join("/");
}

function toItemId(type: TreeItem["type"], path: string) {
  return `${type}-${path.replace(/[^a-z0-9]/gi, "-")}`;
}

function getParentPath(path: string) {
  const cleanPath = normalizeFolderPath(path);
  const lastSlash = cleanPath.lastIndexOf("/");
  return lastSlash === -1 ? "" : cleanPath.slice(0, lastSlash);
}

function getItemDepth(path: string) {
  return Math.max(path.split("/").filter(Boolean).length - 1, 0);
}

function getItemName(path: string) {
  const cleanPath = normalizeFolderPath(path);
  const segments = cleanPath.split("/").filter(Boolean);
  return segments[segments.length - 1] ?? cleanPath;
}

function sortTreeItems(items: TreeItem[]) {
  return [...items].sort((a, b) => {
    if (a.path === b.path) return 0;
    const depth = getItemDepth(a.path) - getItemDepth(b.path);
    if (depth !== 0) return depth;
    if (a.type !== b.type) return a.type === "folder" ? -1 : 1;
    return a.path.localeCompare(b.path);
  });
}

function ensureFolderChain(items: TreeItem[], folderPath: string) {
  const normalized = normalizeFolderPath(folderPath);
  if (!normalized) return items;
  const existing = new Set(items.filter((item) => item.type === "folder").map((item) => item.path));
  const next = [...items];
  const segments = normalized.split("/");
  let runningPath = "";

  segments.forEach((segment) => {
    runningPath = runningPath ? `${runningPath}/${segment}` : segment;
    if (existing.has(runningPath)) return;
    next.push({
      id: toItemId("folder", runningPath),
      name: segment,
      path: runningPath,
      type: "folder",
    });
    existing.add(runningPath);
  });

  return next;
}

function normalizeStepPattern(step: string) {
  return step.replace(/\s+/g, " ").trim();
}

function flattenSteps(response: unknown): string[] {
  const buckets = (response as { data?: { steps?: Record<string, string[]> } })?.data?.steps;
  if (!buckets) return [];
  const all = new Map<string, string>();
  Object.values(buckets).forEach((list) =>
    list.forEach((item) => {
      const normalized = normalizeStepPattern(item);
      if (!normalized) return;
      const key = normalized.toLowerCase();
      if (!all.has(key)) all.set(key, normalized);
    }),
  );
  return [...all.values()];
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
  if (!languageRegistered) {
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

    languageRegistered = true;
  }

  completionProviderDisposable?.dispose();
  completionProviderDisposable = monaco.languages.registerCompletionItemProvider(LANGUAGE_ID, {
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
        const seen = new Set<string>();
        const filtered = stepsRef.current
          .map((step) => normalizeStepPattern(step))
          .filter((step) => {
            const key = step.toLowerCase();
            if (!step || seen.has(key)) return false;
            seen.add(key);
            return true;
          })
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

      const uniqueSuggestions = suggestions.filter((item, index, all) => {
        const key = `${item.label}-${item.insertText}`;
        return index === all.findIndex((candidate) => `${candidate.label}-${candidate.insertText}` === key);
      });

      return { suggestions: uniqueSuggestions };
    },
  });
}

export default function AppDetail() {
  const { id } = useParams();
  const appId = id ?? "";
  const [steps, setSteps] = useState<string[]>([]);
  const [showStepPicker, setShowStepPicker] = useState(false);
  const [items, setItems] = useState<TreeItem[]>([]);
  const [selectedFilePath, setSelectedFilePath] = useState("");
  const [fileContents, setFileContents] = useState<Record<string, string>>({});
  const [newFolderName, setNewFolderName] = useState("");
  const [newFileName, setNewFileName] = useState("");
  const [selectedFolderPath, setSelectedFolderPath] = useState("features");
  const editorRef = useRef<MonacoApi.editor.IStandaloneCodeEditor | null>(null);
  const monacoRef = useRef<Monaco | null>(null);
  const initializedRef = useRef(false);
  const stepsRef = useRef<string[]>([]);

  useEffect(() => {
    stepsRef.current = steps;
  }, [steps]);

  useEffect(() => {
    if (!appId) return;
    void api
      .get(`/steps/apps/${appId}`)
      .then((response) => {
        setSteps(flattenSteps(response.data));
      })
      .catch(() => setSteps([]));
  }, [appId]);

  useEffect(() => {
    const root: TreeItem = { id: "folder-features", name: "features", path: "features", type: "folder" };
    const starterPath = "features/main.feature";
    const starterFile: TreeItem = {
      id: "file-features-main-feature",
      name: "main.feature",
      path: starterPath,
      type: "file",
    };
    setItems([root, starterFile]);
    setSelectedFolderPath(root.path);
    setSelectedFilePath(starterPath);
    setFileContents({ [starterPath]: DEFAULT_FEATURE_CONTENT });
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

  const selectedContent = fileContents[selectedFilePath] ?? "";
  const orderedItems = useMemo(() => sortTreeItems(items), [items]);

  const insertAtCursor = (text: string) => {
    const editor = editorRef.current;
    if (!editor) return;
    editor.executeEdits("gherkin-controls", [
      {
        range: editor.getSelection() ?? editor.getModel()!.getFullModelRange(),
        text,
        forceMoveMarkers: true,
      },
    ]);
    editor.focus();
    editor.trigger("gherkin-controls", "editor.action.triggerSuggest", {});
  };

  const insertScenarioAtEnd = () => {
    const editor = editorRef.current;
    const model = editor?.getModel();
    if (!editor || !model) return;

    const content = model.getValue();
    const prefix = content.trim().length === 0 ? "" : "\n\n";
    const insertion = `${prefix}Scenario: New Scenario\n  Given `;
    const lastLine = model.getLineCount();
    const lastColumn = model.getLineMaxColumn(lastLine);

    editor.executeEdits("gherkin-controls", [
      {
        range: {
          startLineNumber: lastLine,
          startColumn: lastColumn,
          endLineNumber: lastLine,
          endColumn: lastColumn,
        },
        text: insertion,
        forceMoveMarkers: true,
      },
    ]);

    const endPosition = model.getPositionAt(model.getValueLength());
    editor.setPosition(endPosition);
    editor.revealPositionInCenter(endPosition);
    editor.focus();
  };

  const createFolder = () => {
    const folderName = normalizeFolderPath(newFolderName);
    if (!folderName) return;

    const baseFolder = normalizeFolderPath(selectedFolderPath || "features");
    const fullPath = normalizeFolderPath(`${baseFolder}/${folderName}`);
    if (!fullPath) return;
    if (items.some((item) => item.path === fullPath)) return;

    setItems((prev) => sortTreeItems(ensureFolderChain(prev, fullPath)));
    setSelectedFolderPath(fullPath);
    setNewFolderName("");
  };

  const createFeatureFile = () => {
    const fileName = normalizeFolderPath(newFileName);
    if (!fileName) return;

    const baseFolder = normalizeFolderPath(selectedFolderPath || "features");
    const normalizedFileName = fileName.endsWith(".feature") ? fileName : `${fileName}.feature`;
    const fullPath = normalizeFolderPath(`${baseFolder}/${normalizedFileName}`);
    if (!fullPath) return;
    if (items.some((item) => item.path === fullPath)) return;

    const parentFolder = getParentPath(fullPath);

    setItems((prev) => {
      const withFolders = ensureFolderChain(prev, parentFolder || baseFolder);
      return sortTreeItems([
        ...withFolders,
        { id: toItemId("file", fullPath), name: getItemName(fullPath), path: fullPath, type: "file" },
      ]);
    });
    setFileContents((prev) => ({ ...prev, [fullPath]: DEFAULT_FEATURE_CONTENT }));
    setSelectedFilePath(fullPath);
    setSelectedFolderPath(parentFolder || baseFolder);
    setNewFileName("");
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
    editor.onDidChangeModelContent(() => validate());
    validate();
  };

  return (
    <div className="flex h-screen flex-col gap-4 bg-[#f6f8fa] p-6">
      <header className="rounded border border-[#d0d7de] bg-white p-4">
        <h1 className="text-xl font-semibold text-[#24292f]">Intelligent Gherkin Editor</h1>
        <p className="text-sm text-[#57606a]">App {appId || "unknown"} • Monaco DSL editor with controlled suggestions.</p>
      </header>

      <div className="grid flex-1 gap-4 lg:grid-cols-[280px_1fr]">
        <aside className="rounded border border-[#d0d7de] bg-white p-3">
          <p className="mb-2 text-sm font-semibold text-[#24292f]">Feature workspace</p>

          <div className="mb-3 grid gap-2">
            <Input
              placeholder="new-folder"
              value={newFolderName}
              onChange={(e) => setNewFolderName(e.target.value)}
            />
            <p className="text-xs text-[#57606a]">Current folder: {selectedFolderPath}</p>
            <Button size="sm" variant="outline" onClick={createFolder}>
              <FolderPlus className="mr-2 h-4 w-4" /> Create folder
            </Button>
            <Input
              placeholder="new-feature-file"
              value={newFileName}
              onChange={(e) => setNewFileName(e.target.value)}
            />
            <Button size="sm" onClick={createFeatureFile}>
              <PlusSquare className="mr-2 h-4 w-4" /> Create feature file
            </Button>
          </div>

          <div className="space-y-1">
            {orderedItems.map((item) => (
              <button
                key={item.id}
                type="button"
                onClick={() => {
                  if (item.type === "folder") {
                    setSelectedFolderPath(item.path);
                    return;
                  }
                  setSelectedFilePath(item.path);
                  setSelectedFolderPath(getParentPath(item.path) || "features");
                }}
                className={`w-full rounded px-2 py-1 text-left text-sm ${
                  item.type === "folder"
                    ? selectedFolderPath === item.path
                      ? "bg-[#ddf4ff] font-semibold text-[#0969da]"
                      : "bg-[#f6f8fa] font-semibold text-[#57606a] hover:bg-[#eef2f6]"
                    : selectedFilePath === item.path
                    ? "bg-[#ddf4ff] text-[#0969da]"
                    : "hover:bg-[#f6f8fa]"
                }`}
              >
                <span style={{ paddingLeft: `${getItemDepth(item.path) * 12}px` }} className="inline-block">
                  {item.type === "folder" ? "📁" : "📄"} {getItemName(item.path)}
                </span>
              </button>
            ))}
          </div>
        </aside>

        <div className="rounded border border-[#d0d7de] bg-white p-3">
          <div className="mb-3 flex flex-wrap items-center gap-2">
            <EnvironmentVariablesModal appId={appId} />

            <Button size="sm" onClick={insertScenarioAtEnd}>
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
            key={selectedFilePath}
            height="70vh"
            defaultLanguage={LANGUAGE_ID}
            value={selectedContent}
            onChange={(next) => setFileContents((prev) => ({ ...prev, [selectedFilePath]: next ?? "" }))}
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
    </div>
  );
}
