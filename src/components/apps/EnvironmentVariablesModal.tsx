import { useEffect, useState } from "react";
import { Loader2, Save } from "lucide-react";
import { api } from "@/lib/api";
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

type SaveStatus = { type: "idle" | "saving" | "success" | "error"; message?: string };

interface EnvironmentVariablesModalProps {
  appId: string;
}

export function EnvironmentVariablesModal({ appId }: EnvironmentVariablesModalProps) {
  const [open, setOpen] = useState(false);
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [status, setStatus] = useState<SaveStatus>({ type: "idle" });
  const [isLoading, setIsLoading] = useState(false);

  useEffect(() => {
    if (!open) return;
    void loadEnvironment();
  }, [open, appId]);

  const loadEnvironment = async () => {
    if (!appId) {
      setStatus({ type: "error", message: "Missing app id in URL." });
      return;
    }

    try {
      setIsLoading(true);
      const response = await api.get(`/environments/apps/${appId}`);
      const payload = (response.data?.data ?? response.data) as {
        name?: string;
        description?: string;
      };
      setName(payload?.name ?? "");
      setDescription(payload?.description ?? "");
      setStatus({ type: "idle" });
    } catch (error) {
      const message = error instanceof Error ? error.message : "Unable to load environment.";
      setStatus({ type: "error", message });
    } finally {
      setIsLoading(false);
    }
  };

  const saveEnvironment = async () => {
    if (!appId) {
      setStatus({ type: "error", message: "Missing app id in URL." });
      return;
    }

    if (!name.trim()) {
      setStatus({ type: "error", message: "Environment name is required." });
      return;
    }

    try {
      setStatus({ type: "saving", message: "Saving..." });
      await api.post(`/environments/apps/${appId}`, {
        name: name.trim(),
        description: description.trim(),
      });
      setStatus({ type: "success", message: "Saved successfully." });
    } catch (error) {
      const message = error instanceof Error ? error.message : "Unable to save environment.";
      setStatus({ type: "error", message });
    }
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="outline" className="bg-white/90">
          Manage Variables
        </Button>
      </DialogTrigger>
      <DialogContent className="border-[#d0d7de] bg-white sm:max-w-lg">
        <DialogHeader>
          <DialogTitle className="text-xl font-semibold text-slate-900">Environment</DialogTitle>
          <DialogDescription className="text-sm text-slate-600">
            Configure environment details for this app.
          </DialogDescription>
        </DialogHeader>

        {isLoading ? (
          <div className="flex min-h-28 items-center justify-center rounded-xl border border-dashed border-slate-300 bg-white/80">
            <Loader2 className="mr-2 h-5 w-5 animate-spin" /> Loading environment...
          </div>
        ) : (
          <div className="space-y-4">
            <div className="space-y-2">
              <label className="text-sm font-medium text-slate-700">Name</label>
              <Input placeholder="staging" value={name} onChange={(event) => setName(event.target.value)} />
            </div>

            <div className="space-y-2">
              <label className="text-sm font-medium text-slate-700">Description</label>
              <textarea
                className="min-h-[88px] w-full rounded-md border border-input bg-white px-3 py-2 text-sm shadow-xs focus-visible:border-ring focus-visible:ring-ring/50 focus-visible:ring-[3px]"
                placeholder="Staging environment"
                value={description}
                onChange={(event) => setDescription(event.target.value)}
              />
            </div>

            <div className="flex justify-end border-t border-slate-200 pt-3">
              <Button type="button" onClick={saveEnvironment} disabled={status.type === "saving"}>
                {status.type === "saving" ? (
                  <>
                    <Loader2 className="mr-1 h-4 w-4 animate-spin" /> Saving...
                  </>
                ) : (
                  <>
                    <Save className="mr-1 h-4 w-4" /> Save Environment
                  </>
                )}
              </Button>
            </div>

            {status.message && (
              <p
                className={`text-sm ${
                  status.type === "error"
                    ? "text-red-600"
                    : status.type === "success"
                    ? "text-emerald-600"
                    : "text-slate-500"
                }`}
              >
                {status.message}
              </p>
            )}
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
