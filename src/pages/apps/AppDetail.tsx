import { useState } from "react";
import { useParams } from "react-router-dom";
import {
  ChevronLeft,
  FileCode2,
  Folder,
  FolderPlus,
  GitBranch,
  PlusSquare,
  Save,
  Sparkles,
} from "lucide-react";
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
              onClick={() =>
                node.type === "folder" ? onFolderClick(node) : onFileClick(node)
              }
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
    <div className="min-h-screen bg-[#f6f8fa]">
      <header className="border-b border-[#d0d7de] bg-white px-4 py-4 sm:px-6">
        <div className="mx-auto flex w-full max-w-7xl flex-wrap items-center justify-between gap-3">
          <div>
            <p className="text-xs font-semibold uppercase tracking-wide text-[#57606a]">Repository</p>
            <h1 className="text-xl font-semibold text-[#24292f]">app / {appId || "unknown"}</h1>
          </div>
          <div className="inline-flex items-center gap-2 rounded-full border border-[#d0d7de] bg-[#f6f8fa] px-3 py-1 text-sm text-[#57606a]">
            <GitBranch className="h-4 w-4" /> main
          </div>
        </div>
      </header>

      <div className="mx-auto grid w-full max-w-7xl grid-cols-1 gap-4 p-4 sm:p-6 xl:grid-cols-[360px_1fr]">
        <aside className="space-y-4">
          <div className="rounded-lg border border-[#d0d7de] bg-white">
            <div className="border-b border-[#d8dee4] px-4 py-3">
              <p className="text-sm font-semibold text-[#24292f]">Files</p>
              <p className="text-xs text-[#57606a]">Path: {activePathLabel}</p>
            </div>

            <div className="space-y-2 p-3">
              {currentPath.length > 0 && (
                <Button
                  variant="outline"
                  size="sm"
                  className="w-full justify-start"
                  onClick={() => setCurrentPath(currentPath.slice(0, -1))}
                >
                  <ChevronLeft className="mr-1 h-4 w-4" /> Back to parent
                </Button>
              )}

              <div className="grid gap-2">
                <div className="flex gap-2">
                  <Input
                    placeholder="New folder"
                    value={newFolderName}
                    onChange={(event) => setNewFolderName(event.target.value)}
                  />
                  <Button onClick={addFolder} className="gap-1" variant="outline">
                    <FolderPlus className="h-4 w-4" /> Add
                  </Button>
                </div>
                <div className="flex gap-2">
                  <Input
                    placeholder="New file (e.g. test.feature)"
                    value={newFileName}
                    onChange={(event) => setNewFileName(event.target.value)}
                  />
                  <Button onClick={addFile} className="gap-1" variant="outline">
                    <PlusSquare className="h-4 w-4" /> Add
                  </Button>
                </div>
              </div>

              <div className="flex flex-wrap gap-2 border-t border-[#d8dee4] pt-3">
                <Button onClick={saveFeature} size="sm" className="bg-[#2da44e] hover:bg-[#2c974b]">
                  <Save className="mr-1 h-4 w-4" /> Commit structure
                </Button>
                {selectedFile && (
                  <Button variant="outline" onClick={addScenario} size="sm">
                    <Sparkles className="mr-1 h-4 w-4" /> Add scenario
                  </Button>
                )}
                <EnvironmentVariablesModal appId={appId} />
              </div>
            </div>
          </div>

          <div className="overflow-hidden rounded-lg border border-[#d0d7de] bg-white">
            {nodes.length === 0 ? (
              <p className="p-4 text-sm text-[#57606a]">No files yet. Add folders or files to get started.</p>
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

        <main className="min-w-0 overflow-hidden rounded-lg border border-[#d0d7de] bg-white">
          <div className="border-b border-[#d8dee4] bg-[#f6f8fa] px-4 py-3">
            <h2 className="text-sm font-semibold text-[#24292f]">
              {selectedFile ? selectedFile.name : "Select a file to start editing"}
            </h2>
            <p className="text-xs text-[#57606a]">
              {selectedFile
                ? "Edit your feature file and commit updates to your structure."
                : "Use the file explorer to open an existing file or create a new one."}
            </p>
          </div>

          <div className="h-[70vh] min-h-[480px]">
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
                theme="vs"
                options={{
                  minimap: { enabled: false },
                  fontSize: 13,
                  scrollBeyondLastLine: false,
                  padding: { top: 12 },
                }}
              />
            ) : (
              <div className="flex h-full items-center justify-center px-6 text-sm text-[#57606a]">
                Select a file from the explorer to open the editor.
              </div>
            )}
          </div>
        </main>
      </div>
    </div>
  );
}
