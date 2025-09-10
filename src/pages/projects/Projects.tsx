import { useEffect, useState, type FormEvent } from "react";
import { useNavigate } from "react-router-dom";
import { api } from "@/lib/api";
import { getProjects } from "@/lib/projects";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

function Projects() {
  const navigate = useNavigate();
  const [open, setOpen] = useState(false);
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");

  useEffect(() => {
    (async () => {
      try {
        const projects = await getProjects();
        if (projects.length > 0) {
          navigate("/apps", { replace: true });
        } else {
          setOpen(true);
        }
      } catch {
        setOpen(true);
      }
    })();
  }, [navigate]);

  const createProject = async (e: FormEvent) => {
    e.preventDefault();
    try {
      await api.post("/projects", { name, description, createRepo: false });
      navigate("/apps", { replace: true });
    } catch {
      /* handle error - omitted */
    }
  };

  if (!open) return null;

  return (
    <div className="fixed inset-0 flex items-center justify-center bg-black/50">
      <Card className="w-full max-w-md">
        <CardContent>
          <form onSubmit={createProject} className="grid gap-4 p-4">
            <div className="flex flex-col gap-2">
              <Label htmlFor="title">Title</Label>
              <Input
                id="title"
                value={name}
                onChange={(e) => setName(e.target.value)}
                required
              />
            </div>
            <div className="flex flex-col gap-2">
              <Label htmlFor="description">Description</Label>
              <Input
                id="description"
                value={description}
                onChange={(e) => setDescription(e.target.value)}
              />
            </div>
            <Button type="submit" className="mt-2">
              Save
            </Button>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}

export default Projects;
