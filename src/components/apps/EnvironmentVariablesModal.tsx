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

type CategoryKey = (typeof VARIABLE_CATEGORIES)[number]["value"];

function createInitialEntries() {
  return VARIABLE_CATEGORIES.reduce<Record<CategoryKey, VariableEntry[]>>((acc, category) => {
    acc[category.value] = [{ ...EMPTY_ENTRY }];
    return acc;
  }, {} as Record<CategoryKey, VariableEntry[]>);
}

function createInitialStatus() {
  return VARIABLE_CATEGORIES.reduce<Record<CategoryKey, SaveStatus>>((acc, category) => {
    acc[category.value] = { type: "idle" };
    return acc;
  }, {} as Record<CategoryKey, SaveStatus>);
}

function sanitizeEntries(entries: VariableEntry[]) {
  return entries
    .map((entry) => ({ key: entry.key.trim(), value: entry.value.trim() }))
    .filter((entry) => entry.key && entry.value);
}

function normalizeEntries(data: unknown): Record<CategoryKey, VariableEntry[]> {
  const initial = createInitialEntries();
  if (!data || typeof data !== "object") return initial;

  const source = data as Record<string, unknown>;
  const payload = (source.data && typeof source.data === "object" ? source.data : source) as Record<string, unknown>;

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
  const [activeCategory, setActiveCategory] = useState<CategoryKey>(VARIABLE_CATEGORIES[0].value);
  const [entriesByCategory, setEntriesByCategory] = useState<Record<CategoryKey, VariableEntry[]>>(createInitialEntries);
  const [saveStatus, setSaveStatus] = useState<Record<CategoryKey, SaveStatus>>(createInitialStatus);
  const [isLoading, setIsLoading] = useState(false);

  const categoryLabel = useMemo(
    () =>
      VARIABLE_CATEGORIES.reduce<Record<CategoryKey, string>>((acc, category) => {
        acc[category.value] = category.label;
        return acc;
      }, {} as Record<CategoryKey, string>),
    [],
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

  const updateEntry = (category: CategoryKey, index: number, field: keyof VariableEntry, value: string) => {
    setEntriesByCategory((prev) => {
      const next = { ...prev };
      const entries = [...next[category]];
      entries[index] = { ...entries[index], [field]: value };
      next[category] = entries;
      return next;
    });
  };

  const addEntry = (category: CategoryKey) => {
    setEntriesByCategory((prev) => ({
      ...prev,
      [category]: [...prev[category], { ...EMPTY_ENTRY }],
    }));
  };

  const removeEntry = (category: CategoryKey, index: number) => {
    setEntriesByCategory((prev) => {
      const nextEntries = [...prev[category]];
      nextEntries.splice(index, 1);
      return {
        ...prev,
        [category]: nextEntries.length ? nextEntries : [{ ...EMPTY_ENTRY }],
      };
    });
  };

  const saveVariables = async (category: CategoryKey) => {
    if (!appId) {
      setSaveStatus((prev) => ({
        ...prev,
        [category]: { type: "error", message: "Missing app id in URL." },
      }));
      return;
    }

    const payloadByCategory = VARIABLE_CATEGORIES.reduce<Record<CategoryKey, VariableEntry[]>>((acc, item) => {
      const sanitized = sanitizeEntries(entriesByCategory[item.value]);
      acc[item.value] = sanitized;
      return acc;
    }, {} as Record<CategoryKey, VariableEntry[]>);

    if (!payloadByCategory[category].length) {
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

      await api.post(`/environments/apps/${appId}`, {
        ...payloadByCategory,
        category,
        entries: payloadByCategory[category],
      });

      setEntriesByCategory((prev) => ({
        ...prev,
        [category]: payloadByCategory[category].length ? [...payloadByCategory[category], { ...EMPTY_ENTRY }] : [{ ...EMPTY_ENTRY }],
      }));
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
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-4xl">
        <DialogHeader>
          <DialogTitle>Environment Variables</DialogTitle>
          <DialogDescription>Configure reusable values grouped by category for this app.</DialogDescription>
        </DialogHeader>

        {isLoading ? (
          <div className="flex min-h-52 items-center justify-center rounded-lg border border-dashed">
            <Loader2 className="mr-2 h-5 w-5 animate-spin" /> Loading values...
          </div>
        ) : (
          <Tabs value={activeCategory} onValueChange={(value) => setActiveCategory(value as CategoryKey)} className="space-y-4">
            <TabsList className="grid w-full grid-cols-2 md:grid-cols-4">
              {VARIABLE_CATEGORIES.map((category) => (
                <TabsTrigger key={category.value} value={category.value}>
                  {category.label}
                </TabsTrigger>
              ))}
            </TabsList>

            {VARIABLE_CATEGORIES.map((category) => {
              const entries = entriesByCategory[category.value];
              const status = saveStatus[category.value];
              return (
                <TabsContent key={category.value} value={category.value}>
                  <div className="space-y-4 rounded-xl border bg-slate-50/60 p-4">
                    <p className="text-sm text-slate-600">
                      Add key/value pairs for <span className="font-semibold">{categoryLabel[category.value]}</span>.
                    </p>
                    <div className="space-y-3">
                      {entries.map((entry, index) => (
                        <div key={`${category.value}-${index}`} className="grid gap-3 rounded-lg border bg-white p-3 md:grid-cols-[1fr_1.7fr_auto]">
                          <Input
                            placeholder="Key"
                            value={entry.key}
                            onChange={(event) => updateEntry(category.value, index, "key", event.target.value)}
                          />
                          <textarea
                            className="min-h-[42px] w-full rounded-md border border-input bg-white px-3 py-2 text-sm shadow-xs focus-visible:border-ring focus-visible:ring-ring/50 focus-visible:ring-[3px]"
                            placeholder="Value"
                            value={entry.value}
                            onChange={(event) => updateEntry(category.value, index, "value", event.target.value)}
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

                    <div className="flex flex-wrap gap-2">
                      <Button type="button" variant="outline" onClick={() => addEntry(category.value)}>
                        <Plus className="mr-1 h-4 w-4" /> Add entry
                      </Button>
                      <Button type="button" onClick={() => saveVariables(category.value)} disabled={status?.type === "saving"}>
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
                          status.type === "error" ? "text-red-600" : status.type === "success" ? "text-emerald-600" : "text-slate-500"
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
