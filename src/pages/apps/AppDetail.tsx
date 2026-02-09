import { useMemo, useState } from "react";
import { useParams } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import {
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
} from "@/components/ui/tabs";
import Editor from "@monaco-editor/react";
import { api } from "@/lib/api";

interface TreeNode {
  name: string;
  type: "folder" | "file";
  content?: string; // only for files
  children?: TreeNode[];
}

type VariableEntry = { key: string; value: string };

const VARIABLE_CATEGORIES = [
  { value: "xpaths", label: "Xpaths" },
  { value: "userData", label: "User Data" },
  { value: "queries", label: "Queries" },
  { value: "hosts", label: "Hosts" },
];

function Tree({
  nodes,
  onFolderClick,
  onFileClick,
}: {
  nodes: TreeNode[];
  onFolderClick: (folder: TreeNode) => void;
  onFileClick: (file: TreeNode) => void;
}) {
  return (
    <ul className="ml-4">
      {nodes.map((node, idx) => (
        <li key={idx}>
          <div
            className="cursor-pointer hover:bg-gray-100 px-1 rounded"
            onClick={() =>
              node.type === "folder" ? onFolderClick(node) : onFileClick(node)
            }
          >
            {node.type === "folder" ? "📁" : "📄"} {node.name}
          </div>
        </li>
      ))}
    </ul>
  );
}

// Helper: walk structure and stringify for API
function stringifyTree(nodes: TreeNode[], indent = 0): string {
  let result = "";
  const pad = "  ".repeat(indent);
  for (const node of nodes) {
    if (node.type === "folder") {
      result += `${pad}[Folder] ${node.name}\n`;
      if (node.children) {
        result += stringifyTree(node.children, indent + 1);
      }
    } else {
      result += `${pad}[File] ${node.name}\n`;
      if (node.content) {
        // indent file content properly
        const content = node.content
          .split("\n")
          .map((line) => `${pad}  ${line}`)
          .join("\n");
        result += content + "\n";
      }
    }
  }
  return result;
}

export default function AppDetail() {
  const { id } = useParams();
  const appId = id ?? "";
  const [tree, setTree] = useState<TreeNode[]>([
    {
      name: "src",
      type: "folder",
      children: [],
    },
  ]);
  const [currentPath, setCurrentPath] = useState<TreeNode[]>([]);
  const [selectedFile, setSelectedFile] = useState<TreeNode | null>(null);
  const [activeCategory, setActiveCategory] = useState(
    VARIABLE_CATEGORIES[0]?.value ?? "xpaths"
  );
  const [entriesByCategory, setEntriesByCategory] = useState<
    Record<string, VariableEntry[]>
  >(() =>
    VARIABLE_CATEGORIES.reduce<Record<string, VariableEntry[]>>(
      (acc, category) => {
        acc[category.value] = [{ key: "", value: "" }];
        return acc;
      },
      {}
    )
  );
  const [saveStatus, setSaveStatus] = useState<
    Record<string, { type: "idle" | "saving" | "success" | "error"; message?: string }>
  >(() =>
    VARIABLE_CATEGORIES.reduce(
      (acc, category) => {
        acc[category.value] = { type: "idle" as const };
        return acc;
      },
      {} as Record<
        string,
        { type: "idle" | "saving" | "success" | "error"; message?: string }
      >
    )
  );

  const categoryLabel = useMemo(
    () =>
      VARIABLE_CATEGORIES.reduce<Record<string, string>>((acc, category) => {
        acc[category.value] = category.label;
        return acc;
      }, {}),
    []
  );

  const currentFolder = currentPath[currentPath.length - 1];
  const nodes = currentFolder ? currentFolder.children || [] : tree;

  const updateTree = (updater: (folder: TreeNode[]) => TreeNode[]) => {
    if (currentFolder) {
      currentFolder.children = updater(currentFolder.children || []);
      setTree([...tree]);
    } else {
      setTree(updater(tree));
    }
  };

  const addFolder = () => {
    const name = window.prompt("Folder name");
    if (!name) return;
    updateTree((list) => [...list, { name, type: "folder", children: [] }]);
  };

  const addFile = () => {
    const name = window.prompt("File name (ex: test.feature)");
    if (!name) return;
    updateTree((list) => [
      ...list,
      { name, type: "file", content: "Feature: \n\n  Scenario: \n" },
    ]);
  };

  const addScenario = () => {
    if (!selectedFile) return;
    const scenarioTemplate =
      `\n  Scenario: New scenario\n` +
      `    Given some precondition\n` +
      `    When some action happens\n` +
      `    Then expect some outcome\n`;
    selectedFile.content = (selectedFile.content || "") + scenarioTemplate;
    setTree([...tree]);
  };

  const saveFeature = async () => {
    const payload = stringifyTree(tree);
    console.log("Sending to API:\n", payload);

    await fetch("/api/save-feature", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ structure: payload }),
    });
    alert("Feature saved!");
  };

  const updateEntry = (
    category: string,
    index: number,
    field: keyof VariableEntry,
    value: string
  ) => {
    setEntriesByCategory((prev) => {
      const next = { ...prev };
      const entries = [...(next[category] ?? [])];
      entries[index] = { ...entries[index], [field]: value };
      next[category] = entries;
      return next;
    });
  };

  const addEntry = (category: string) => {
    setEntriesByCategory((prev) => ({
      ...prev,
      [category]: [...(prev[category] ?? []), { key: "", value: "" }],
    }));
  };

  const removeEntry = (category: string, index: number) => {
    setEntriesByCategory((prev) => {
      const nextEntries = [...(prev[category] ?? [])];
      nextEntries.splice(index, 1);
      return { ...prev, [category]: nextEntries.length ? nextEntries : [{ key: "", value: "" }] };
    });
  };

  const saveVariables = async (category: string) => {
    if (!appId) {
      setSaveStatus((prev) => ({
        ...prev,
        [category]: { type: "error", message: "Missing app id in URL." },
      }));
      return;
    }

    const entries = (entriesByCategory[category] ?? []).filter(
      (entry) => entry.key.trim() && entry.value.trim()
    );

    if (!entries.length) {
      setSaveStatus((prev) => ({
        ...prev,
        [category]: { type: "error", message: "Add at least one key/value pair." },
      }));
      return;
    }

    try {
      setSaveStatus((prev) => ({
        ...prev,
        [category]: { type: "saving", message: "Saving..." },
      }));
      await api.post(`/variables/apps/${appId}`, { category, entries });
      setSaveStatus((prev) => ({
        ...prev,
        [category]: { type: "success", message: "Saved successfully." },
      }));
    } catch (error) {
      const message =
        error instanceof Error ? error.message : "Unable to save variables.";
      setSaveStatus((prev) => ({
        ...prev,
        [category]: { type: "error", message },
      }));
    }
  };

  return (
    <div className="flex h-screen">
      {/* Left File Tree */}
      <div className="w-1/3 border-r p-4">
        <h1 className="mb-4 text-xl font-bold">File Explorer</h1>
        <div className="mb-4 flex gap-2 flex-wrap">
          <Button onClick={addFolder}>Add Folder</Button>
          <Button onClick={addFile}>Add File</Button>
          {selectedFile && <Button onClick={addScenario}>Add Scenario</Button>}
          <Button onClick={saveFeature}>Save</Button>
          <Dialog>
            <DialogTrigger asChild>
              <Button variant="outline">Manage Variables</Button>
            </DialogTrigger>
            <DialogContent className="max-h-[90vh] overflow-y-auto">
              <DialogHeader>
                <DialogTitle>Environment Variables</DialogTitle>
                <DialogDescription>
                  Store reusable variables for this app by category.
                </DialogDescription>
              </DialogHeader>
              <Tabs value={activeCategory} onValueChange={setActiveCategory}>
                <TabsList>
                  {VARIABLE_CATEGORIES.map((category) => (
                    <TabsTrigger key={category.value} value={category.value}>
                      {category.label}
                    </TabsTrigger>
                  ))}
                </TabsList>
                {VARIABLE_CATEGORIES.map((category) => {
                  const entries = entriesByCategory[category.value] ?? [];
                  const status = saveStatus[category.value];
                  return (
                    <TabsContent key={category.value} value={category.value}>
                      <div className="space-y-4">
                        <p className="text-sm text-gray-500">
                          Add key/value pairs for{" "}
                          <span className="font-medium text-gray-700">
                            {categoryLabel[category.value]}
                          </span>
                          .
                        </p>
                        <div className="space-y-3">
                          {entries.map((entry, index) => (
                            <div
                              key={`${category.value}-${index}`}
                              className="grid gap-3 md:grid-cols-[1fr_1.5fr_auto]"
                            >
                              <Input
                                placeholder="Key"
                                value={entry.key}
                                onChange={(event) =>
                                  updateEntry(
                                    category.value,
                                    index,
                                    "key",
                                    event.target.value
                                  )
                                }
                              />
                              <textarea
                                className="min-h-[42px] w-full rounded-md border border-input bg-transparent px-3 py-2 text-sm shadow-xs focus-visible:border-ring focus-visible:ring-ring/50 focus-visible:ring-[3px]"
                                placeholder="Value"
                                value={entry.value}
                                onChange={(event) =>
                                  updateEntry(
                                    category.value,
                                    index,
                                    "value",
                                    event.target.value
                                  )
                                }
                              />
                              <Button
                                type="button"
                                variant="ghost"
                                className="self-start"
                                onClick={() =>
                                  removeEntry(category.value, index)
                                }
                              >
                                Remove
                              </Button>
                            </div>
                          ))}
                        </div>
                        <div className="flex flex-wrap gap-2">
                          <Button
                            type="button"
                            variant="outline"
                            onClick={() => addEntry(category.value)}
                          >
                            Add entry
                          </Button>
                          <Button
                            type="button"
                            onClick={() => saveVariables(category.value)}
                            disabled={status?.type === "saving"}
                          >
                            {status?.type === "saving"
                              ? "Saving..."
                              : `Save ${category.label}`}
                          </Button>
                        </div>
                        {status?.message && (
                          <p
                            className={`text-sm ${
                              status.type === "error"
                                ? "text-red-600"
                                : status.type === "success"
                                ? "text-green-600"
                                : "text-gray-500"
                            }`}
                          >
                            {status.message}
                          </p>
                        )}
                      </div>
                    </TabsContent>
                  );
                })}
              </Tabs>
            </DialogContent>
          </Dialog>
        </div>
        {currentPath.length > 0 && (
          <div
            className="cursor-pointer mb-2 text-blue-600"
            onClick={() => setCurrentPath(currentPath.slice(0, -1))}
          >
            🔙 ..
          </div>
        )}
        {nodes.length === 0 ? (
          <p>No files yet</p>
        ) : (
          <Tree
            nodes={nodes}
            onFolderClick={(folder) => setCurrentPath([...currentPath, folder])}
            onFileClick={(file) => setSelectedFile(file)}
          />
        )}
      </div>

      {/* Right Editor */}
      <div className="flex-1 p-4">
        {selectedFile ? (
          <>
            <h2 className="mb-2 font-semibold">Editing: {selectedFile.name}</h2>
            <Editor
              height="90vh"
              defaultLanguage="gherkin"
              value={selectedFile.content}
              onChange={(value) => {
                if (selectedFile) {
                  selectedFile.content = value || "";
                  setTree([...tree]);
                }
              }}
              theme="vs-dark"
            />
          </>
        ) : (
          <p className="text-gray-500">Select a file to start editing</p>
        )}
      </div>
    </div>
  );
}
