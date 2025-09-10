import { useParams } from "react-router-dom";
import { useState } from "react";
import { Button } from "@/components/ui/button";

interface TreeNode {
  name: string;
  type: "folder" | "file";
  children?: TreeNode[];
}

function Tree({ nodes }: { nodes: TreeNode[] }) {
  return (
    <ul className="ml-4">
      {nodes.map((node, idx) => (
        <li key={idx}>
          <div>
            {node.type === "folder" ? "📁" : "📄"} {node.name}
          </div>
          {node.children && node.children.length > 0 && (
            <Tree nodes={node.children} />
          )}
        </li>
      ))}
    </ul>
  );
}

function AppDetail() {
  const { id } = useParams<{ id: string }>();
  const [tree, setTree] = useState<TreeNode[]>([]);

  const addFolder = () => {
    const name = window.prompt("Folder name");
    if (!name) return;
    setTree([...tree, { name, type: "folder", children: [] }]);
  };

  const addFile = () => {
    const name = window.prompt("Feature file name");
    if (!name) return;
    setTree([...tree, { name, type: "file" }]);
  };

  return (
    <div className="p-4">
      <h1 className="mb-4 text-xl">App {id}</h1>
      <div className="mb-4 flex gap-2">
        <Button onClick={addFolder}>Add Folder</Button>
        <Button onClick={addFile}>Add Feature File</Button>
      </div>
      {tree.length === 0 ? <p>No files yet</p> : <Tree nodes={tree} />}
    </div>
  );
}

export default AppDetail;

