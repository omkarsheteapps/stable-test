import { useState } from "react";
import { useParams } from "react-router-dom";
import { ChevronLeft, FileCode2, Folder, FolderPlus, PlusSquare, Save } from "lucide-react";
import Editor from "@monaco-editor/react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { EnvironmentVariablesModal } from "@/components/apps/EnvironmentVariablesModal";

interface TreeNode {
  name: string;
  type: "folder" | "file";
  content?: string;
  children?: TreeNode[];
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
    <ul className="space-y-1">
      {nodes.map((node) => {
        const isSelected = node.type === "file" && selectedFileName === node.name;

        return (
          <li key={`${node.type}-${node.name}`}>
            <button
              type="button"
              className={`flex w-full items-center gap-2 rounded-md px-2 py-2 text-left text-sm transition ${
                isSelected
                  ? "bg-indigo-50 text-indigo-700"
                  : "text-slate-700 hover:bg-slate-100 hover:text-slate-900"
              }`}
              onClick={() =>
                node.type === "folder" ? onFolderClick(node) : onFileClick(node)
              }
            >
              {node.type === "folder" ? (
                <Folder className="h-4 w-4 text-amber-500" />
              ) : (
                <FileCode2 className="h-4 w-4 text-indigo-500" />
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
      if (node.children) {
        result += stringifyTree(node.children, indent + 1);
      }
    } else {
      result += `${pad}[File] ${node.name}\n`;
      if (node.content) {
        const content = node.content
          .split("\n")
          .map((line) => `${pad}  ${line}`)
          .join("\n");
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

  const currentFolder = currentPath[currentPath.length - 1];
  const nodes = currentFolder ? currentFolder.children || [] : tree;
  const activePathLabel = currentPath.length
    ? `/${currentPath.map((node) => node.name).join("/")}`
    : "/";

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
    updateTree((list) => [
      ...list,
      { name: clean, type: "file", content: "Feature: \n\n  Scenario: \n" },
    ]);
    setNewFileName("");
  };

  const addScenario = () => {
    if (!selectedFile) return;
    selectedFile.content =
      (selectedFile.content || "") +
      "\n  Scenario: New scenario\n    Given some precondition\n    When some action happens\n    Then expect some outcome\n";
    setTree([...tree]);
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

  return (
    <div className="flex h-screen bg-slate-100">
      <aside className="flex w-[420px] flex-col border-r border-slate-200 bg-white p-5">
        <div className="mb-4">
          <h1 className="text-2xl font-semibold text-slate-900">Automation Workspace</h1>
          <p className="mt-1 text-sm text-slate-500">Manage files, scenarios, and environment data.</p>
        </div>

        <div className="mb-4 rounded-lg border bg-slate-50 p-3">
          <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-500">Current path</p>
          <p className="truncate text-sm font-medium text-slate-800">{activePathLabel}</p>
          {currentPath.length > 0 && (
            <Button
              variant="ghost"
              className="mt-2 h-8 px-2 text-slate-700"
              onClick={() => setCurrentPath(currentPath.slice(0, -1))}
            >
              <ChevronLeft className="mr-1 h-4 w-4" /> Back to parent
            </Button>
          )}
        </div>

        <div className="mb-4 space-y-2 rounded-lg border bg-white p-3 shadow-sm">
          <div className="flex gap-2">
            <Input
              placeholder="New folder"
              value={newFolderName}
              onChange={(event) => setNewFolderName(event.target.value)}
            />
            <Button onClick={addFolder}>
              <FolderPlus className="mr-1 h-4 w-4" /> Add
            </Button>
          </div>
          <div className="flex gap-2">
            <Input
              placeholder="New file (e.g. test.feature)"
              value={newFileName}
              onChange={(event) => setNewFileName(event.target.value)}
            />
            <Button onClick={addFile}>
              <PlusSquare className="mr-1 h-4 w-4" /> Add
            </Button>
          </div>
          <div className="flex flex-wrap gap-2 pt-1">
            <Button onClick={saveFeature}>
              <Save className="mr-1 h-4 w-4" /> Save Structure
            </Button>
            {selectedFile && (
              <Button variant="outline" onClick={addScenario}>
                Add Scenario
              </Button>
            )}
            <EnvironmentVariablesModal appId={appId} />
          </div>
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto rounded-lg border bg-white p-3 shadow-sm">
          {nodes.length === 0 ? (
            <p className="text-sm text-slate-500">No files yet. Add folders or files to get started.</p>
          ) : (
            <Tree
              nodes={nodes}
              selectedFileName={selectedFile?.name}
              onFolderClick={(folder) => {
                setCurrentPath([...currentPath, folder]);
                setSelectedFile(null);
              }}
              onFileClick={(file) => setSelectedFile(file)}
            />
          )}
        </div>
      </aside>

      <main className="flex min-w-0 flex-1 flex-col p-5">
        <div className="mb-3 rounded-lg border bg-white px-4 py-3 shadow-sm">
          <h2 className="text-lg font-semibold text-slate-900">
            {selectedFile ? `Editing: ${selectedFile.name}` : "Editor"}
          </h2>
          <p className="text-sm text-slate-500">
            {selectedFile
              ? "Make updates to your feature file and save your structure when ready."
              : "Select a file from the explorer to start editing."}
          </p>
        </div>

        <div className="min-h-0 flex-1 overflow-hidden rounded-lg border bg-[#1e1e1e] shadow-lg">
          {selectedFile ? (
            <Editor
              height="100%"
              defaultLanguage="gherkin"
              value={selectedFile.content}
              onChange={(value) => {
                if (selectedFile) {
                  selectedFile.content = value || "";
                  setTree([...tree]);
                }
              }}
              theme="vs-dark"
              options={{
                minimap: { enabled: false },
                fontSize: 14,
                scrollBeyondLastLine: false,
                padding: { top: 16 },
              }}
            />
          ) : (
            <div className="flex h-full items-center justify-center text-slate-300">
              Select a file from the left panel to begin.
            </div>
          )}
        </div>
      </main>
    </div>
  );
}
