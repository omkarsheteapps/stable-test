import { useEffect, useMemo, useState } from "react";
import { useParams } from "react-router-dom";
import {
  ChevronLeft,
  ChevronRight,
  FileCode2,
  Folder,
  FolderPlus,
  GitBranch,
  PlusSquare,
  Save,
  Sparkles,
  Trash2,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { EnvironmentVariablesModal } from "@/components/apps/EnvironmentVariablesModal";
import { api } from "@/lib/api";

type StepKeyword = "Given" | "When" | "Then";
type StepSource = "existing" | "custom";
type PlaceholderType = "string" | "int" | "long" | "double";

interface Placeholder {
  raw: string;
  type: PlaceholderType;
}

interface ScenarioStep {
  id: string;
  keyword: StepKeyword;
  source: StepSource;
  pattern?: string;
  customText?: string;
  args: string[];
}

interface ScenarioModel {
  id: string;
  name: string;
  steps: ScenarioStep[];
}

interface FeatureModel {
  featureName: string;
  scenarios: ScenarioModel[];
}

interface TreeNode {
  name: string;
  type: "folder" | "file";
  content?: string;
  featureModel?: FeatureModel;
  children?: TreeNode[];
}

const PLACEHOLDER_REGEX = /\{(string|int|long|double)\}/g;

function uid() {
  return Math.random().toString(36).slice(2, 10);
}

function createDefaultFeatureModel(fileName?: string): FeatureModel {
  const safe = (fileName ?? "Feature").replace(/\.feature$/i, "").trim();
  return { featureName: safe || "Feature", scenarios: [] };
}

function extractPlaceholders(pattern: string): Placeholder[] {
  const matches = Array.from(pattern.matchAll(PLACEHOLDER_REGEX));
  return matches.map((match) => ({ raw: match[0], type: match[1] as PlaceholderType }));
}

function defaultArg(type: PlaceholderType): string {
  if (type === "string") return "value";
  if (type === "double") return "1.0";
  return "1";
}

function formatArg(type: PlaceholderType, value: string): string {
  if (type === "string") return `"${value || ""}"`;
  return value || "0";
}

function materializePattern(pattern: string, args: string[]): string {
  const placeholders = extractPlaceholders(pattern);
  let index = 0;
  return pattern.replace(PLACEHOLDER_REGEX, () => {
    const placeholder = placeholders[index];
    const value = formatArg(placeholder?.type ?? "string", args[index] ?? "");
    index += 1;
    return value;
  });
}

function highlightPattern(pattern: string) {
  return pattern.split(/(\{[^}]+\})/g).map((part, index) =>
    /^\{[^}]+\}$/.test(part) ? (
      <span key={`${part}-${index}`} className="rounded bg-[#fff8c5] px-1 text-[#9a6700]">
        {part}
      </span>
    ) : (
      <span key={`${part}-${index}`}>{part}</span>
    ),
  );
}

function fuzzyScore(query: string, text: string): number | null {
  const q = query.toLowerCase().trim();
  const t = text.toLowerCase();
  if (!q) return 0;
  if (t.includes(q)) return t.indexOf(q);

  let qIndex = 0;
  let jumps = 0;
  for (let i = 0; i < t.length && qIndex < q.length; i += 1) {
    if (t[i] === q[qIndex]) {
      qIndex += 1;
    } else {
      jumps += 1;
    }
  }
  return qIndex === q.length ? 100 + jumps : null;
}

function flattenSteps(response: unknown): string[] {
  const buckets = (response as { data?: { steps?: Record<string, string[]> } })?.data?.steps;
  if (!buckets) return [];
  const set = new Set<string>();
  Object.values(buckets).forEach((list) => list.forEach((item) => set.add(item)));
  return Array.from(set);
}

function buildFeatureContent(model: FeatureModel): string {
  const lines = [`Feature: ${model.featureName}`, ""];
  model.scenarios.forEach((scenario) => {
    lines.push(`Scenario: ${scenario.name}`);
    scenario.steps.forEach((step) => {
      const body = step.source === "existing" && step.pattern
        ? materializePattern(step.pattern, step.args)
        : step.customText || "";
      lines.push(`  ${step.keyword} ${body}`);
    });
    lines.push("");
  });
  return lines.join("\n").trimEnd() + "\n";
}

function allowedKeywords(steps: ScenarioStep[]): StepKeyword[] {
  const hasWhen = steps.some((step) => step.keyword === "When");
  const hasThen = steps.some((step) => step.keyword === "Then");
  if (!hasWhen && !hasThen) return ["Given", "When"];
  if (hasWhen && !hasThen) return ["When", "Then"];
  return ["Then"];
}

function Tree({
  nodes,
  selectedFileName,
  onFolderClick,
  onFileClick,
}: {
  nodes: TreeNode[];
  selectedFileName?: string;
  onFolderClick: (folder: TreeNode) => void;
  onFileClick: (file: TreeNode) => void;
}) {
  return (
    <ul>
      {nodes.map((node) => {
        const isSelected = node.type === "file" && selectedFileName === node.name;
        return (
          <li key={`${node.type}-${node.name}`}>
            <button
              type="button"
              className={`flex w-full items-center gap-2 border-b border-[#d8dee4] px-3 py-2 text-left text-sm transition last:border-b-0 ${
                isSelected ? "bg-[#ddf4ff] text-[#0969da]" : "text-[#24292f] hover:bg-[#f6f8fa]"
              }`}
              onClick={() => (node.type === "folder" ? onFolderClick(node) : onFileClick(node))}
            >
              {node.type === "folder" ? (
                <Folder className="h-4 w-4 text-[#bf8700]" />
              ) : (
                <FileCode2 className="h-4 w-4 text-[#57606a]" />
              )}
              <span className="truncate">{node.name}</span>
            </button>
          </li>
        );
      })}
    </ul>
  );
}

function stringifyTree(nodes: TreeNode[], indent = 0): string {
  let result = "";
  const pad = "  ".repeat(indent);
  for (const node of nodes) {
    if (node.type === "folder") {
      result += `${pad}[Folder] ${node.name}\n`;
      if (node.children) result += stringifyTree(node.children, indent + 1);
    } else {
      result += `${pad}[File] ${node.name}\n`;
      if (node.content) {
        const content = node.content.split("\n").map((line) => `${pad}  ${line}`).join("\n");
        result += `${content}\n`;
      }
    }
  }
  return result;
}

export default function AppDetail() {
  const { id } = useParams();
  const appId = id ?? "";

  const [tree, setTree] = useState<TreeNode[]>([{ name: "src", type: "folder", children: [] }]);
  const [currentPath, setCurrentPath] = useState<TreeNode[]>([]);
  const [selectedFile, setSelectedFile] = useState<TreeNode | null>(null);
  const [newFolderName, setNewFolderName] = useState("");
  const [newFileName, setNewFileName] = useState("");
  const [isSidebarOpen, setIsSidebarOpen] = useState(true);
  const [isAddMenuOpen, setIsAddMenuOpen] = useState(false);
  const [newScenarioName, setNewScenarioName] = useState("");
  const [selectedScenarioId, setSelectedScenarioId] = useState<string>("");
  const [stepKeyword, setStepKeyword] = useState<StepKeyword>("Given");
  const [stepSource, setStepSource] = useState<StepSource>("existing");
  const [stepQuery, setStepQuery] = useState("");
  const [selectedPattern, setSelectedPattern] = useState<string>("");
  const [customStepText, setCustomStepText] = useState("");
  const [activeSuggestion, setActiveSuggestion] = useState(0);
  const [definitions, setDefinitions] = useState<string[]>([]);
  const [validationMessage, setValidationMessage] = useState<string>("");

  const currentFolder = currentPath[currentPath.length - 1];
  const nodes = currentFolder ? currentFolder.children || [] : tree;
  const activePathLabel = currentPath.length ? `/${currentPath.map((node) => node.name).join("/")}` : "/";

  useEffect(() => {
    if (!appId) return;
    void api.get(`/steps/apps/${appId}`).then((response) => {
      setDefinitions(flattenSteps(response.data));
    }).catch(() => {
      setDefinitions([]);
    });
  }, [appId]);

  const updateTree = (updater: (folder: TreeNode[]) => TreeNode[]) => {
    if (currentFolder) {
      currentFolder.children = updater(currentFolder.children || []);
      setTree([...tree]);
      return;
    }
    setTree(updater(tree));
  };

  const addFolder = () => {
    const clean = newFolderName.trim();
    if (!clean) return;
    updateTree((list) => [...list, { name: clean, type: "folder", children: [] }]);
    setNewFolderName("");
  };

  const addFile = () => {
    const clean = newFileName.trim();
    if (!clean) return;
    updateTree((list) => [...list, {
      name: clean,
      type: "file",
      featureModel: createDefaultFeatureModel(clean),
      content: `Feature: ${clean.replace(/\.feature$/i, "")}`,
    }]);
    setNewFileName("");
  };

  const featureModel = selectedFile?.featureModel;

  const currentScenario = useMemo(
    () => featureModel?.scenarios.find((scenario) => scenario.id === selectedScenarioId),
    [featureModel, selectedScenarioId],
  );

  const allowedForScenario = currentScenario ? allowedKeywords(currentScenario.steps) : ["Given"];

  const suggestions = useMemo(() => {
    const sourceText = stepSource === "existing" ? stepQuery : customStepText;
    return definitions
      .map((definition) => ({ definition, score: fuzzyScore(sourceText, definition) }))
      .filter((item): item is { definition: string; score: number } => item.score !== null)
      .sort((a, b) => a.score - b.score)
      .slice(0, 8)
      .map((item) => item.definition);
  }, [customStepText, definitions, stepQuery, stepSource]);

  useEffect(() => {
    setActiveSuggestion(0);
  }, [stepQuery, customStepText, stepSource]);

  const syncSelectedFile = () => {
    if (!selectedFile?.featureModel) return;
    selectedFile.content = buildFeatureContent(selectedFile.featureModel);
    setTree([...tree]);
  };

  const addScenario = () => {
    if (!selectedFile?.featureModel) return;
    const name = newScenarioName.trim();
    if (!name) {
      setValidationMessage("Scenario name is required.");
      return;
    }
    const scenario: ScenarioModel = { id: uid(), name, steps: [] };
    selectedFile.featureModel.scenarios.push(scenario);
    setSelectedScenarioId(scenario.id);
    setNewScenarioName("");
    setValidationMessage("");
    syncSelectedFile();
  };

  const addStep = () => {
    if (!selectedFile?.featureModel || !currentScenario) {
      setValidationMessage("Select a scenario before adding steps.");
      return;
    }
    if (!allowedForScenario.includes(stepKeyword)) {
      setValidationMessage("Invalid keyword order. Steps must follow Given → When → Then.");
      return;
    }

    if (stepSource === "existing") {
      if (!selectedPattern) {
        setValidationMessage("Choose a matching step definition.");
        return;
      }
      const placeholders = extractPlaceholders(selectedPattern);
      currentScenario.steps.push({
        id: uid(),
        keyword: stepKeyword,
        source: "existing",
        pattern: selectedPattern,
        args: placeholders.map((item) => defaultArg(item.type)),
      });
    } else {
      const clean = customStepText.trim();
      if (!clean) {
        setValidationMessage("Custom step text is required.");
        return;
      }
      currentScenario.steps.push({
        id: uid(),
        keyword: stepKeyword,
        source: "custom",
        customText: clean,
        args: [],
      });
    }

    setValidationMessage("");
    setStepQuery("");
    setSelectedPattern("");
    setCustomStepText("");
    syncSelectedFile();
  };

  const saveFeature = async () => {
    const payload = stringifyTree(tree);
    await fetch("/api/save-feature", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ structure: payload }),
    });
    window.alert("Feature saved!");
  };

  const validationIssues = useMemo(() => {
    if (!featureModel) return [] as string[];
    const issues: string[] = [];
    if (!featureModel.scenarios.length) issues.push("Feature must contain at least one scenario.");
    featureModel.scenarios.forEach((scenario) => {
      if (!scenario.steps.length) issues.push(`Scenario \"${scenario.name}\" cannot be empty.`);
    });
    return issues;
  }, [featureModel]);

  const autocompleteInput = stepSource === "existing" ? stepQuery : customStepText;

  return (
    <div className="flex h-screen flex-col overflow-hidden bg-[#f6f8fa]">
      <header className="shrink-0 border-b border-[#d0d7de] bg-gradient-to-r from-white via-[#f8fbff] to-[#eef7ff] px-4 py-4 shadow-sm sm:px-6">
        <div className="mx-auto flex w-full max-w-7xl flex-wrap items-center justify-between gap-3">
          <div>
            <p className="text-xs font-semibold uppercase tracking-wide text-[#57606a]">Repository</p>
            <h1 className="text-xl font-semibold text-[#24292f]">app / {appId || "unknown"}</h1>
          </div>
          <div className="flex items-center gap-3">
            <div className="inline-flex items-center gap-2 rounded-full border border-[#d0d7de] bg-white/90 px-3 py-1 text-sm text-[#57606a]">
              <GitBranch className="h-4 w-4" /> main
            </div>
            <div className="rounded-full border border-[#b6d4fe] bg-gradient-to-r from-[#1f6feb] via-[#218bff] to-[#54aeff] px-4 py-1.5 text-sm font-semibold tracking-wide text-white shadow-sm">
              Stable Test
            </div>
          </div>
        </div>
      </header>

      <div className="mx-auto grid w-full max-w-7xl flex-1 min-h-0 grid-cols-1 gap-4 overflow-hidden p-4 sm:p-6 xl:grid-cols-[auto_1fr]">
        <aside className={`min-h-0 flex flex-col ${isSidebarOpen ? "xl:w-[360px]" : "xl:w-[56px]"}`}>
          <div className="mb-3 flex justify-end xl:mb-4">
            <Button
              type="button"
              variant="outline"
              size="icon"
              onClick={() => setIsSidebarOpen((value) => !value)}
              aria-label={isSidebarOpen ? "Collapse file sidebar" : "Open file sidebar"}
              title={isSidebarOpen ? "Collapse sidebar" : "Open sidebar"}
            >
              {isSidebarOpen ? <ChevronLeft className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
            </Button>
          </div>

          {isSidebarOpen ? (
            <div className="flex min-h-0 flex-1 flex-col gap-4">
              <div className="rounded-lg border border-[#d0d7de] bg-white">
                <div className="border-b border-[#d8dee4] px-4 py-3">
                  <p className="text-sm font-semibold text-[#24292f]">Files</p>
                  <p className="text-xs text-[#57606a]">Path: {activePathLabel}</p>
                </div>
                <div className="space-y-2 p-3">
                  {currentPath.length > 0 && (
                    <Button variant="outline" size="sm" className="w-full justify-start" onClick={() => setCurrentPath(currentPath.slice(0, -1))}>
                      <ChevronLeft className="mr-1 h-4 w-4" /> Back to parent
                    </Button>
                  )}
                  <div className="grid gap-2">
                    <div className="flex gap-2">
                      <Input placeholder="New folder" value={newFolderName} onChange={(event) => setNewFolderName(event.target.value)} />
                      <Button onClick={addFolder} className="gap-1" variant="outline"><FolderPlus className="h-4 w-4" /> Add</Button>
                    </div>
                    <div className="flex gap-2">
                      <Input placeholder="New file (e.g. test.feature)" value={newFileName} onChange={(event) => setNewFileName(event.target.value)} />
                      <Button onClick={addFile} className="gap-1" variant="outline"><PlusSquare className="h-4 w-4" /> Add</Button>
                    </div>
                  </div>
                  <div className="flex flex-wrap gap-2 border-t border-[#d8dee4] pt-3">
                    <Button onClick={saveFeature} size="sm" className="bg-[#2da44e] hover:bg-[#2c974b]"><Save className="mr-1 h-4 w-4" /> Commit structure</Button>
                    <EnvironmentVariablesModal appId={appId} />
                  </div>
                </div>
              </div>

              <div className="min-h-0 flex-1 overflow-hidden rounded-lg border border-[#d0d7de] bg-white">
                <div className="h-full overflow-y-auto">
                  {nodes.length === 0 ? <p className="p-4 text-sm text-[#57606a]">No files yet. Add folders or files to get started.</p> : (
                    <Tree
                      nodes={nodes}
                      selectedFileName={selectedFile?.name}
                      onFolderClick={(folder) => {
                        setCurrentPath([...currentPath, folder]);
                        setSelectedFile(null);
                      }}
                      onFileClick={(file) => {
                        if (!file.featureModel) {
                          file.featureModel = createDefaultFeatureModel(file.name);
                          file.content = buildFeatureContent(file.featureModel);
                        }
                        setSelectedFile(file);
                        const firstScenario = file.featureModel.scenarios[0];
                        setSelectedScenarioId(firstScenario?.id ?? "");
                        setValidationMessage("");
                      }}
                    />
                  )}
                </div>
              </div>
            </div>
          ) : null}
        </aside>

        <main className="flex min-h-0 min-w-0 flex-col overflow-hidden rounded-lg border border-[#d0d7de] bg-white">
          <div className="border-b border-[#d8dee4] bg-[#f6f8fa] px-4 py-3">
            <h2 className="text-sm font-semibold text-[#24292f]">{selectedFile ? selectedFile.name : "Select a file to start"}</h2>
            <p className="text-xs text-[#57606a]">{selectedFile ? "Low-code scenario builder with guarded Gherkin generation." : "Use file explorer to open or create a .feature file."}</p>
          </div>

          {selectedFile?.featureModel ? (
            <div className="grid min-h-0 flex-1 gap-4 overflow-hidden p-4 lg:grid-cols-[1.2fr_1fr]">
              <div className="min-h-0 overflow-y-auto space-y-4">
                <div className="rounded border border-[#d0d7de] p-3">
                  <label className="mb-1 block text-xs font-semibold text-[#57606a]">Feature name</label>
                  <Input
                    value={selectedFile.featureModel.featureName}
                    onChange={(event) => {
                      selectedFile.featureModel!.featureName = event.target.value;
                      syncSelectedFile();
                    }}
                    placeholder="User API Testing"
                  />
                </div>

                <div className="rounded border border-[#d0d7de] p-3 space-y-3">
                  <div className="flex items-center justify-between">
                    <p className="text-sm font-semibold">Scenario builder</p>
                    <div className="relative">
                      <Button size="sm" variant="outline" onClick={() => setIsAddMenuOpen((v) => !v)}><Sparkles className="mr-1 h-4 w-4" /> + Add</Button>
                      {isAddMenuOpen && (
                        <div className="absolute right-0 z-20 mt-1 w-40 rounded border border-[#d0d7de] bg-white shadow">
                          <button className="block w-full px-3 py-2 text-left text-sm hover:bg-[#f6f8fa]" onClick={() => { setIsAddMenuOpen(false); }}>Add Step</button>
                          <button className="block w-full px-3 py-2 text-left text-sm hover:bg-[#f6f8fa]" onClick={() => { setIsAddMenuOpen(false); }}>Add New Scenario</button>
                        </div>
                      )}
                    </div>
                  </div>

                  <div className="grid gap-2 rounded border border-[#d8dee4] p-3">
                    <label className="text-xs font-semibold text-[#57606a]">Add New Scenario</label>
                    <div className="flex gap-2">
                      <Input value={newScenarioName} onChange={(event) => setNewScenarioName(event.target.value)} placeholder="Get users list" />
                      <Button size="sm" onClick={addScenario}>Create</Button>
                    </div>
                  </div>

                  <div className="grid gap-2 rounded border border-[#d8dee4] p-3">
                    <label className="text-xs font-semibold text-[#57606a]">Add Step</label>
                    <select
                      className="rounded border border-[#d0d7de] bg-white px-2 py-2 text-sm"
                      value={selectedScenarioId}
                      onChange={(event) => setSelectedScenarioId(event.target.value)}
                    >
                      <option value="">Select Scenario</option>
                      {selectedFile.featureModel.scenarios.map((scenario) => (
                        <option key={scenario.id} value={scenario.id}>{scenario.name}</option>
                      ))}
                    </select>

                    <select className="rounded border border-[#d0d7de] bg-white px-2 py-2 text-sm" value={stepKeyword} onChange={(event) => setStepKeyword(event.target.value as StepKeyword)}>
                      {(["Given", "When", "Then"] as StepKeyword[]).map((keyword) => (
                        <option key={keyword} value={keyword} disabled={!allowedForScenario.includes(keyword)}>{keyword}</option>
                      ))}
                    </select>

                    <select className="rounded border border-[#d0d7de] bg-white px-2 py-2 text-sm" value={stepSource} onChange={(event) => { setStepSource(event.target.value as StepSource); setSelectedPattern(""); }}>
                      <option value="existing">Use Existing Step</option>
                      <option value="custom">Create New Step</option>
                    </select>

                    <div className="relative">
                      <Input
                        placeholder={stepSource === "existing" ? "Search step definitions" : "Type custom step intent"}
                        value={autocompleteInput}
                        onChange={(event) => {
                          if (stepSource === "existing") {
                            setStepQuery(event.target.value);
                            setSelectedPattern("");
                          } else {
                            setCustomStepText(event.target.value);
                          }
                        }}
                        onKeyDown={(event) => {
                          if (!suggestions.length) return;
                          if (event.key === "ArrowDown") {
                            event.preventDefault();
                            setActiveSuggestion((value) => Math.min(value + 1, suggestions.length - 1));
                          }
                          if (event.key === "ArrowUp") {
                            event.preventDefault();
                            setActiveSuggestion((value) => Math.max(value - 1, 0));
                          }
                          if (event.key === "Enter") {
                            event.preventDefault();
                            const selected = suggestions[activeSuggestion];
                            if (!selected) return;
                            if (stepSource === "existing") {
                              setSelectedPattern(selected);
                              setStepQuery(selected);
                            } else {
                              setCustomStepText(selected);
                            }
                          }
                        }}
                      />
                      {suggestions.length > 0 && (
                        <div className="absolute z-20 mt-1 max-h-48 w-full overflow-y-auto rounded border border-[#d0d7de] bg-white shadow">
                          {suggestions.map((suggestion, index) => (
                            <button
                              key={`${suggestion}-${index}`}
                              className={`block w-full px-3 py-2 text-left text-xs ${activeSuggestion === index ? "bg-[#ddf4ff]" : "hover:bg-[#f6f8fa]"}`}
                              onClick={() => {
                                if (stepSource === "existing") {
                                  setSelectedPattern(suggestion);
                                  setStepQuery(suggestion);
                                } else {
                                  setCustomStepText(suggestion);
                                }
                              }}
                            >
                              {highlightPattern(suggestion)}
                            </button>
                          ))}
                        </div>
                      )}
                    </div>

                    {stepSource === "custom" && customStepText.trim() && !definitions.includes(customStepText.trim()) && (
                      <p className="text-xs text-amber-700">Warning: this step does not exactly match an existing definition.</p>
                    )}

                    <Button size="sm" onClick={addStep}>Add Step</Button>
                  </div>
                </div>

                <div className="space-y-3">
                  {selectedFile.featureModel.scenarios.map((scenario) => (
                    <div key={scenario.id} className="rounded border border-[#d0d7de] p-3">
                      <Input
                        value={scenario.name}
                        onChange={(event) => {
                          scenario.name = event.target.value;
                          syncSelectedFile();
                        }}
                        className="mb-2"
                      />
                      <div className="space-y-2">
                        {scenario.steps.map((step) => {
                          const placeholders = step.pattern ? extractPlaceholders(step.pattern) : [];
                          return (
                            <div key={step.id} className="rounded border border-[#d8dee4] p-2 text-sm">
                              <div className="flex items-start justify-between gap-2">
                                <p><span className="font-semibold text-[#0969da]">{step.keyword}</span> {step.source === "existing" && step.pattern ? materializePattern(step.pattern, step.args) : step.customText}</p>
                                <button
                                  type="button"
                                  className="text-[#cf222e]"
                                  onClick={() => {
                                    scenario.steps = scenario.steps.filter((item) => item.id !== step.id);
                                    syncSelectedFile();
                                  }}
                                >
                                  <Trash2 className="h-4 w-4" />
                                </button>
                              </div>
                              {step.source === "existing" && placeholders.length > 0 && (
                                <div className="mt-2 grid gap-2 md:grid-cols-2">
                                  {placeholders.map((placeholder, index) => (
                                    <Input
                                      key={`${step.id}-${placeholder.raw}-${index}`}
                                      type={placeholder.type === "string" ? "text" : "number"}
                                      value={step.args[index] || ""}
                                      onChange={(event) => {
                                        step.args[index] = event.target.value;
                                        syncSelectedFile();
                                      }}
                                      placeholder={`${placeholder.raw}`}
                                    />
                                  ))}
                                </div>
                              )}
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              <div className="min-h-0 overflow-y-auto rounded border border-[#d0d7de] bg-[#f6f8fa] p-3">
                <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-[#57606a]">Generated Gherkin (read-only)</p>
                <pre className="whitespace-pre-wrap text-sm text-[#24292f]">{selectedFile.content}</pre>
                {validationMessage && <p className="mt-3 text-xs text-[#cf222e]">{validationMessage}</p>}
                {validationIssues.length > 0 && (
                  <div className="mt-3 rounded border border-amber-300 bg-amber-50 p-2">
                    {validationIssues.map((issue) => <p key={issue} className="text-xs text-amber-800">• {issue}</p>)}
                  </div>
                )}
              </div>
            </div>
          ) : (
            <div className="flex h-full items-center justify-center px-6 text-sm text-[#57606a]">Select a file from the explorer to open the controlled builder.</div>
          )}
        </main>
      </div>
    </div>
  );
}
