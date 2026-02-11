import { useEffect, useMemo, useState } from "react";
import { Loader2, Plus, Save, Trash2 } from "lucide-react";
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
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";

type VariableEntry = { key: string; value: string };

type SaveStatus = { type: "idle" | "saving" | "success" | "error"; message?: string };

const VARIABLE_CATEGORIES = [
  { value: "xpaths", label: "Xpaths" },
  { value: "userData", label: "User Data" },
  { value: "queries", label: "Queries" },
  { value: "hosts", label: "Hosts" },
] as const;

const EMPTY_ENTRY: VariableEntry = { key: "", value: "" };

function createInitialEntries() {
  return VARIABLE_CATEGORIES.reduce<Record<string, VariableEntry[]>>((acc, category) => {
    acc[category.value] = [{ ...EMPTY_ENTRY }];
    return acc;
  }, {});
}

function createInitialStatus() {
  return VARIABLE_CATEGORIES.reduce<Record<string, SaveStatus>>((acc, category) => {
    acc[category.value] = { type: "idle" };
    return acc;
  }, {});
}

function normalizeEntries(data: unknown): Record<string, VariableEntry[]> {
  const initial = createInitialEntries();

  if (!data || typeof data !== "object") {
    return initial;
  }

  const source = data as Record<string, unknown>;
  const payload = (source.data && typeof source.data === "object"
    ? source.data
    : source) as Record<string, unknown>;

  for (const category of VARIABLE_CATEGORIES) {
    const categoryRaw = payload[category.value];
    const candidate = Array.isArray(categoryRaw)
      ? categoryRaw
      : Array.isArray((categoryRaw as { entries?: unknown } | undefined)?.entries)
      ? ((categoryRaw as { entries?: unknown }).entries as unknown[])
      : [];

    const entries = candidate
      .map((entry) => {
        if (!entry || typeof entry !== "object") return null;
        const cast = entry as Record<string, unknown>;
        const key = typeof cast.key === "string" ? cast.key : "";
        const value = typeof cast.value === "string" ? cast.value : "";
        return { key, value };
      })
      .filter((entry): entry is VariableEntry => Boolean(entry));

    if (entries.length) {
      initial[category.value] = entries;
    }
  }

  return initial;
}

interface EnvironmentVariablesModalProps {
  appId: string;
}

export function EnvironmentVariablesModal({ appId }: EnvironmentVariablesModalProps) {
  const [open, setOpen] = useState(false);
  const [activeCategory, setActiveCategory] = useState<string>(VARIABLE_CATEGORIES[0].value);
  const [entriesByCategory, setEntriesByCategory] =
    useState<Record<string, VariableEntry[]>>(createInitialEntries);
  const [saveStatus, setSaveStatus] = useState<Record<string, SaveStatus>>(createInitialStatus);
  const [isLoading, setIsLoading] = useState(false);

  const categoryLabel = useMemo(
    () =>
      VARIABLE_CATEGORIES.reduce<Record<string, string>>((acc, category) => {
        acc[category.value] = category.label;
        return acc;
      }, {}),
    []
  );

  useEffect(() => {
    if (!open) return;
    void loadVariables();
  }, [open, appId]);

  const loadVariables = async () => {
    if (!appId) {
      setSaveStatus((prev) => ({
        ...prev,
        [activeCategory]: { type: "error", message: "Missing app id in URL." },
      }));
      return;
    }

    try {
      setIsLoading(true);
      const response = await api.get(`/environments/apps/${appId}`);
      setEntriesByCategory(normalizeEntries(response.data));
      setSaveStatus(createInitialStatus());
    } catch (error) {
      const message = error instanceof Error ? error.message : "Unable to load variables.";
      setSaveStatus((prev) => ({
        ...prev,
        [activeCategory]: { type: "error", message },
      }));
    } finally {
      setIsLoading(false);
    }
  };

  const updateEntry = (category: string, index: number, field: keyof VariableEntry, value: string) => {
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
      [category]: [...(prev[category] ?? []), { ...EMPTY_ENTRY }],
    }));
  };

  const removeEntry = (category: string, index: number) => {
    setEntriesByCategory((prev) => {
      const nextEntries = [...(prev[category] ?? [])];
      nextEntries.splice(index, 1);
      return {
        ...prev,
        [category]: nextEntries.length ? nextEntries : [{ ...EMPTY_ENTRY }],
      };
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
      await api.post(`/environments/apps/${appId}`, { category, entries });
      setSaveStatus((prev) => ({
        ...prev,
        [category]: { type: "success", message: "Saved successfully." },
      }));
    } catch (error) {
      const message = error instanceof Error ? error.message : "Unable to save variables.";
      setSaveStatus((prev) => ({
        ...prev,
        [category]: { type: "error", message },
      }));
    }
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="outline" className="bg-white/90">
          Manage Variables
        </Button>
      </DialogTrigger>
      <DialogContent className="flex h-[78vh] max-h-[78vh] flex-col overflow-hidden border-[#d0d7de] bg-gradient-to-b from-white to-slate-50/60 p-0 sm:max-w-4xl">
        <DialogHeader className="px-6 pt-6">
          <DialogTitle className="text-2xl font-semibold tracking-tight text-slate-900">
            Environment Variables
          </DialogTitle>
          <DialogDescription className="text-sm text-slate-600">
            Configure reusable values grouped by category for this app.
          </DialogDescription>
        </DialogHeader>

        {isLoading ? (
          <div className="mx-6 mb-6 flex min-h-52 flex-1 items-center justify-center rounded-xl border border-dashed border-slate-300 bg-white/80">
            <Loader2 className="mr-2 h-5 w-5 animate-spin" /> Loading values...
          </div>
        ) : (
          <Tabs
            value={activeCategory}
            onValueChange={setActiveCategory}
            className="mx-6 mb-6 flex min-h-0 flex-1 flex-col space-y-4"
          >
            <TabsList className="grid w-full grid-cols-2 rounded-xl bg-slate-200/70 p-1 md:grid-cols-4">
              {VARIABLE_CATEGORIES.map((category) => (
                <TabsTrigger
                  key={category.value}
                  value={category.value}
                  className="rounded-lg data-[state=active]:bg-white data-[state=active]:shadow-sm"
                >
                  {category.label}
                </TabsTrigger>
              ))}
            </TabsList>

            {VARIABLE_CATEGORIES.map((category) => {
              const entries = entriesByCategory[category.value] ?? [];
              const status = saveStatus[category.value];
              return (
                <TabsContent key={category.value} value={category.value} className="min-h-0 flex-1">
                  <div className="flex h-full min-h-0 flex-col space-y-4 rounded-xl border border-slate-300 bg-white/90 p-4 shadow-sm">
                    <p className="text-sm text-slate-600">
                      Add key/value pairs for <span className="font-semibold">{categoryLabel[category.value]}</span>.
                    </p>

                    <div className="min-h-0 flex-1 overflow-y-auto pr-1">
                      <div className="space-y-3">
                      {entries.map((entry, index) => (
                        <div
                          key={`${category.value}-${index}`}
                          className="grid gap-3 rounded-lg border border-slate-200 bg-white p-3 md:grid-cols-[1fr_1.7fr_auto]"
                        >
                          <Input
                            placeholder="Key"
                            value={entry.key}
                            onChange={(event) =>
                              updateEntry(category.value, index, "key", event.target.value)
                            }
                          />
                          <textarea
                            className="min-h-[42px] w-full rounded-md border border-input bg-white px-3 py-2 text-sm shadow-xs focus-visible:border-ring focus-visible:ring-ring/50 focus-visible:ring-[3px]"
                            placeholder="Value"
                            value={entry.value}
                            onChange={(event) =>
                              updateEntry(category.value, index, "value", event.target.value)
                            }
                          />
                          <Button
                            type="button"
                            variant="ghost"
                            size="icon"
                            className="self-start"
                            onClick={() => removeEntry(category.value, index)}
                            aria-label="Remove entry"
                          >
                            <Trash2 className="h-4 w-4" />
                          </Button>
                        </div>
                      ))}
                      </div>
                    </div>

                    <div className="flex flex-wrap gap-2 border-t border-slate-200 pt-3">
                      <Button type="button" variant="outline" onClick={() => addEntry(category.value)}>
                        <Plus className="mr-1 h-4 w-4" /> Add entry
                      </Button>
                      <Button
                        type="button"
                        onClick={() => saveVariables(category.value)}
                        disabled={status?.type === "saving"}
                      >
                        {status?.type === "saving" ? (
                          <>
                            <Loader2 className="mr-1 h-4 w-4 animate-spin" /> Saving...
                          </>
                        ) : (
                          <>
                            <Save className="mr-1 h-4 w-4" /> Save {category.label}
                          </>
                        )}
                      </Button>
                    </div>

                    {status?.message && (
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
                </TabsContent>
              );
            })}
          </Tabs>
        )}
      </DialogContent>
    </Dialog>
  );
}
