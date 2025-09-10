import { useEffect, useState, type FormEvent } from "react";
import { api } from "@/lib/api";
import { getProjects } from "@/lib/projects";
import type { App, GetAppsResponse } from "@/types/app";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

function Apps() {
  const [apps, setApps] = useState<App[]>([]);
  const [projectId, setProjectId] = useState<number | null>(null);
  const [open, setOpen] = useState(false);
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");

  useEffect(() => {
    (async () => {
      try {
        const projects = await getProjects();
        if (projects.length > 0) {
          setProjectId(projects[0].project_id);
        }
      } catch {
        /* ignore */
      }
    })();
  }, []);

  useEffect(() => {
    if (!projectId) return;
    (async () => {
      try {
        const { data } = await api.get<GetAppsResponse>("/apps", {
          params: { projectId },
        });
        setApps(Array.isArray(data?.data) ? data.data : []);
      } catch {
        setApps([]);
      }
    })();
  }, [projectId]);

  const createApp = async (e: FormEvent) => {
    e.preventDefault();
    if (!projectId) return;
    try {
      await api.post("/apps", { projectId, name, description });
      const { data } = await api.get<GetAppsResponse>("/apps", {
        params: { projectId },
      });
      setApps(Array.isArray(data?.data) ? data.data : []);
      setOpen(false);
      setName("");
      setDescription("");
    } catch {
      /* handle error - omitted */
    }
  };

  return (
    <div className="p-4">
      {apps.length === 0 ? (
        <Button onClick={() => setOpen(true)}>Create App</Button>
      ) : (
        <ul className="space-y-2">
          {apps.map((a) => (
            <li key={a.app_id} className="border p-2">
              {a.name}
            </li>
          ))}
        </ul>
      )}

      {open && (
        <div className="fixed inset-0 flex items-center justify-center bg-black/50">
          <Card className="w-full max-w-md">
            <CardContent>
              <form onSubmit={createApp} className="grid gap-4 p-4">
                <div className="flex flex-col gap-2">
                  <Label htmlFor="app-title">Title</Label>
                  <Input
                    id="app-title"
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    required
                  />
                </div>
                <div className="flex flex-col gap-2">
                  <Label htmlFor="app-description">Description</Label>
                  <Input
                    id="app-description"
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
      )}
    </div>
  );
}

export default Apps;
