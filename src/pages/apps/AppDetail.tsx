import { useState } from "react";
import { Button } from "@/components/ui/button";
import Editor from "@monaco-editor/react";

interface TreeNode {
  name: string;
  type: "folder" | "file";
  content?: string; // only for files
  children?: TreeNode[];
}

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
  const [tree, setTree] = useState<TreeNode[]>([
    {
      name: "src",
      type: "folder",
      children: [],
    },
  ]);
  const [currentPath, setCurrentPath] = useState<TreeNode[]>([]);
  const [selectedFile, setSelectedFile] = useState<TreeNode | null>(null);

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
