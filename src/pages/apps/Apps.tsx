import { useEffect, useState, type FormEvent } from "react";
import { Link } from "react-router-dom";
import { GitBranch, Plus, Rocket } from "lucide-react";
import { api } from "@/lib/api";
import { getProjects } from "@/lib/projects";
import type { App, GetAppsResponse } from "@/types/app";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
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
    <div className="min-h-screen bg-[#f6f8fa] p-4 sm:p-6">
      <div className="mx-auto w-full max-w-5xl">
        <div className="mb-6 rounded-xl border border-[#d0d7de] bg-white p-5 shadow-sm">
          <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <p className="text-sm font-medium text-[#57606a]">Project Apps</p>
              <h1 className="mt-1 text-2xl font-semibold text-[#24292f]">Application Repositories</h1>
              <p className="mt-1 text-sm text-[#57606a]">
                Browse and manage automation apps using a familiar GitHub-style workspace.
              </p>
            </div>
            <Button onClick={() => setOpen(true)} className="gap-2 bg-[#2da44e] hover:bg-[#2c974b]">
              <Plus className="h-4 w-4" /> New app
            </Button>
          </div>
        </div>

        {apps.length === 0 ? (
          <Card className="border-[#d0d7de] bg-white shadow-sm">
            <CardContent className="flex flex-col items-center gap-3 py-12 text-center">
              <Rocket className="h-8 w-8 text-[#57606a]" />
              <p className="text-lg font-semibold text-[#24292f]">No apps yet</p>
              <p className="max-w-md text-sm text-[#57606a]">
                Create your first app to start adding test files, scenarios, and environment variables.
              </p>
              <Button onClick={() => setOpen(true)} className="mt-2 gap-2 bg-[#2da44e] hover:bg-[#2c974b]">
                <Plus className="h-4 w-4" /> Create app
              </Button>
            </CardContent>
          </Card>
        ) : (
          <div className="overflow-hidden rounded-xl border border-[#d0d7de] bg-white shadow-sm">
            <div className="border-b border-[#d0d7de] bg-[#f6f8fa] px-4 py-3 text-sm font-medium text-[#57606a]">
              {apps.length} app{apps.length > 1 ? "s" : ""}
            </div>
            <ul>
              {apps.map((app) => (
                <li key={app.app_id} className="border-b border-[#d8dee4] last:border-b-0">
                  <Link
                    to={`/app/${app.app_id}`}
                    className="block px-4 py-4 transition hover:bg-[#f6f8fa]"
                  >
                    <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                      <div>
                        <p className="text-base font-semibold text-[#0969da]">{app.name}</p>
                        <p className="mt-1 text-sm text-[#57606a]">
                          {app.description?.trim() || "No description provided."}
                        </p>
                      </div>
                      <span className="inline-flex items-center gap-1 text-xs font-medium text-[#57606a]">
                        <GitBranch className="h-3.5 w-3.5" /> Open details
                      </span>
                    </div>
                  </Link>
                </li>
              ))}
            </ul>
          </div>
        )}
      </div>

      {open && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 px-4">
          <Card className="w-full max-w-lg border-[#d0d7de]">
            <CardHeader className="border-b border-[#d8dee4] pb-4">
              <CardTitle className="text-xl text-[#24292f]">Create new app</CardTitle>
            </CardHeader>
            <CardContent className="p-4">
              <form onSubmit={createApp} className="grid gap-4">
                <div className="flex flex-col gap-2">
                  <Label htmlFor="app-title">App name</Label>
                  <Input
                    id="app-title"
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    placeholder="my-automation-app"
                    required
                  />
                </div>
                <div className="flex flex-col gap-2">
                  <Label htmlFor="app-description">Description</Label>
                  <Input
                    id="app-description"
                    value={description}
                    onChange={(e) => setDescription(e.target.value)}
                    placeholder="Optional short summary"
                  />
                </div>
                <div className="mt-2 flex justify-end gap-2">
                  <Button type="button" variant="outline" onClick={() => setOpen(false)}>
                    Cancel
                  </Button>
                  <Button type="submit" className="bg-[#2da44e] hover:bg-[#2c974b]">
                    Save app
                  </Button>
                </div>
              </form>
            </CardContent>
          </Card>
        </div>
      )}
    </div>
  );
}

export default Apps;
