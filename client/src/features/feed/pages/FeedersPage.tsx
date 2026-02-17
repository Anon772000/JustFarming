import { useEffect, useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { apiFetch } from "../../../api/http";
import { enqueueAction } from "../../../offline/actionQueue";
import { deleteEntity, listEntities, upsertEntities } from "../../../offline/indexedDb";
import { createStableUuid } from "../../../offline/uuid";
import type { ApiListResponse, ApiSingleResponse, Feeder } from "../../../types/api";
import { PREFILL_SELECTED_FEEDER_ID_KEY, seeOnMap } from "../../../ui/navigation";

function createUuid(): string {
  return createStableUuid();
}

function getFarmId(): string {
  try {
    const raw = localStorage.getItem("user");
    if (!raw) return "00000000-0000-0000-0000-000000000000";
    const u = JSON.parse(raw) as { farmId?: string };
    return typeof u.farmId === "string" ? u.farmId : "00000000-0000-0000-0000-000000000000";
  } catch {
    return "00000000-0000-0000-0000-000000000000";
  }
}

function isOfflineLikeError(err: unknown): boolean {
  if (typeof navigator !== "undefined" && navigator.onLine === false) return true;
  if (err instanceof TypeError) return true;

  if (err instanceof Error) {
    const msg = err.message.toLowerCase();
    return msg.includes("failed to fetch") || msg.includes("networkerror") || msg.includes("load failed");
  }

  return false;
}

function toNumberOrUndefined(raw: string): number | undefined {
  const v = raw.trim();
  if (!v) return undefined;
  const n = Number(v);
  return Number.isFinite(n) ? n : undefined;
}

async function getFeeders(): Promise<Feeder[]> {
  try {
    const response = await apiFetch<ApiListResponse<Feeder>>("/feeders");
    await upsertEntities("feeders", response.data as any);
    return response.data;
  } catch (err) {
    const cached = await listEntities<Feeder>("feeders");
    if (cached.length) return cached;
    throw err;
  }
}

type CreateFeederInput = {
  id: string;
  name: string;
  feederType: string;
  capacityKg?: number;
};

type UpdateFeederInput = {
  name?: string;
  feederType?: string;
  capacityKg?: number;
};

async function createFeeder(input: CreateFeederInput): Promise<Feeder> {
  try {
    const response = await apiFetch<ApiSingleResponse<Feeder>>("/feeders", {
      method: "POST",
      body: JSON.stringify(input),
    });
    return response.data;
  } catch (err) {
    if (!isOfflineLikeError(err)) throw err;

    const now = new Date().toISOString();

    const local: Feeder = {
      id: input.id,
      farmId: getFarmId(),
      name: input.name,
      feederType: input.feederType,
      locationGeoJson: null,
      capacityKg: input.capacityKg !== undefined ? String(input.capacityKg) : null,
      createdAt: now,
      updatedAt: now,
    };

    await upsertEntities("feeders", [local as any]);

    const actionData: Record<string, unknown> = {
      id: local.id,
      name: local.name,
      feederType: local.feederType,
    };

    if (input.capacityKg !== undefined) actionData.capacityKg = input.capacityKg;

    await enqueueAction({
      entity: "feeders",
      op: "CREATE",
      data: actionData,
    });

    return local;
  }
}

async function updateFeeder(args: { feederId: string; input: UpdateFeederInput }): Promise<Feeder> {
  try {
    const response = await apiFetch<ApiSingleResponse<Feeder>>(`/feeders/${args.feederId}`,
      {
        method: "PATCH",
        body: JSON.stringify(args.input),
      },
    );
    return response.data;
  } catch (err) {
    if (!isOfflineLikeError(err)) throw err;

    const now = new Date().toISOString();
    const cached = await listEntities<Feeder>("feeders");
    const existing = cached.find((f) => f.id === args.feederId) ?? null;

    const local: Feeder = {
      id: args.feederId,
      farmId: existing?.farmId ?? getFarmId(),
      name: args.input.name ?? existing?.name ?? "Feeder",
      feederType: args.input.feederType ?? existing?.feederType ?? "",
      locationGeoJson: existing?.locationGeoJson ?? null,
      capacityKg:
        args.input.capacityKg !== undefined
          ? String(args.input.capacityKg)
          : (existing?.capacityKg ?? null),
      createdAt: existing?.createdAt ?? now,
      updatedAt: now,
    };

    await upsertEntities("feeders", [local as any]);
    await enqueueAction({
      entity: "feeders",
      op: "UPDATE",
      data: {
        id: local.id,
        ...args.input,
      },
    });

    return local;
  }
}

async function deleteFeeder(feederId: string): Promise<void> {
  try {
    await apiFetch<void>(`/feeders/${feederId}`, { method: "DELETE" });
  } catch (err) {
    if (!isOfflineLikeError(err)) throw err;

    await deleteEntity("feeders", feederId);
    await enqueueAction({
      entity: "feeders",
      op: "DELETE",
      data: { id: feederId },
    });
  }
}

export function FeedersPage() {
  const qc = useQueryClient();

  const feedersQuery = useQuery({
    queryKey: ["feeders"],
    queryFn: getFeeders,
    staleTime: 30_000,
  });

  const [prefillFeederId, setPrefillFeederId] = useState<string>(() => {
    try {
      const stored = localStorage.getItem(PREFILL_SELECTED_FEEDER_ID_KEY) ?? "";
      if (stored) localStorage.removeItem(PREFILL_SELECTED_FEEDER_ID_KEY);
      return stored;
    } catch {
      return "";
    }
  });

  const [editing, setEditing] = useState<Feeder | null>(null);

  const [name, setName] = useState("");
  const [feederType, setFeederType] = useState("");
  const [capacityKg, setCapacityKg] = useState("");

  useEffect(() => {
    if (!prefillFeederId) return;

    const feeder = (feedersQuery.data ?? []).find((f) => f.id === prefillFeederId) ?? null;

    // Wait for initial load before giving up, otherwise we'd drop the deep link while data is still loading.
    if (!feeder) {
      if (feedersQuery.isLoading) return;
      setPrefillFeederId("");
      return;
    }

    setEditing(feeder);
    setName(feeder.name);
    setFeederType(feeder.feederType);
    setCapacityKg(feeder.capacityKg ?? "");
    setPrefillFeederId("");
  }, [prefillFeederId, feedersQuery.data, feedersQuery.isLoading]);

  const createMutation = useMutation({
    mutationFn: createFeeder,
    onSuccess: async () => {
      setEditing(null);
      setName("");
      setFeederType("");
      setCapacityKg("");
      await qc.invalidateQueries({ queryKey: ["feeders"] });
    },
  });

  const updateMutation = useMutation({
    mutationFn: updateFeeder,
    onSuccess: async () => {
      setEditing(null);
      setName("");
      setFeederType("");
      setCapacityKg("");
      await qc.invalidateQueries({ queryKey: ["feeders"] });
    },
  });

  const deleteMutation = useMutation({
    mutationFn: deleteFeeder,
    onSuccess: async (_data, feederId) => {
      if (editing?.id === feederId) {
        setEditing(null);
        setName("");
        setFeederType("");
        setCapacityKg("");
      }
      await qc.invalidateQueries({ queryKey: ["feeders"] });
    },
  });

  const feedersSorted = useMemo(() => {
    return (feedersQuery.data ?? []).slice().sort((a, b) => a.name.localeCompare(b.name));
  }, [feedersQuery.data]);

  const busy = createMutation.isPending || updateMutation.isPending || deleteMutation.isPending;
  const isEditing = !!editing;

  return (
    <section>
      <header className="sectionHead">
        <div>
          <h3>Feeders</h3>
          <p className="muted">Track feeder assets (rings, troughs, self-feeders). Works offline via queued sync.</p>
        </div>

        <div className="actions">
          <button className="btn" type="button" onClick={() => void feedersQuery.refetch()} disabled={feedersQuery.isFetching}>
            Refresh
          </button>
        </div>
      </header>

      {feedersQuery.isLoading ? <p className="muted">Loading feeders...</p> : null}
      {feedersQuery.isError ? <div className="alert">Failed to load feeders: {(feedersQuery.error as Error).message}</div> : null}

      <form
        className="form"
        onSubmit={(e) => {
          e.preventDefault();

          const trimmedName = name.trim();
          const trimmedType = feederType.trim();
          if (!trimmedName || !trimmedType) return;

          const cap = toNumberOrUndefined(capacityKg);

          if (editing) {
            void updateMutation.mutateAsync({
              feederId: editing.id,
              input: {
                name: trimmedName,
                feederType: trimmedType,
                capacityKg: cap,
              },
            });
            return;
          }

          void createMutation.mutateAsync({
            id: createUuid(),
            name: trimmedName,
            feederType: trimmedType,
            capacityKg: cap,
          });
        }}
        style={{ marginTop: 10 }}
      >
        <div className="row3">
          <label className="label">
            Name
            <input className="input" value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Self feeder #1" required />
          </label>

          <label className="label">
            Type
            <input className="input" value={feederType} onChange={(e) => setFeederType(e.target.value)} placeholder="e.g. hay ring" required />
          </label>

          <label className="label">
            Capacity (kg)
            <input className="input" value={capacityKg} onChange={(e) => setCapacityKg(e.target.value)} inputMode="decimal" type="number" min={0} step={1} placeholder="Optional" />
          </label>
        </div>

        <div className="actions">
          <button className="btn btnPrimary" type="submit" disabled={busy || !name.trim() || !feederType.trim()}>
            {isEditing
              ? updateMutation.isPending
                ? "Saving..."
                : "Save Changes"
              : createMutation.isPending
                ? "Creating..."
                : "Create Feeder"}
          </button>

          {isEditing ? (
            <button
              className="btn"
              type="button"
              onClick={() => {
                setEditing(null);
                setName("");
                setFeederType("");
                setCapacityKg("");
              }}
              disabled={busy}
            >
              Cancel
            </button>
          ) : null}
          {isEditing && editing?.locationGeoJson ? (
            <button
              className="btn"
              type="button"
              disabled={busy}
              onClick={() => seeOnMap({ kind: "FEEDER", feederId: editing.id })}
            >
              See on map
            </button>
          ) : null}
        </div>

        {createMutation.isError ? <div className="alert">{(createMutation.error as Error).message}</div> : null}
        {updateMutation.isError ? <div className="alert">{(updateMutation.error as Error).message}</div> : null}
      </form>

      <div className="hr" />

      <div className="tableWrap">
        <table className="table">
          <thead>
            <tr>
              <th>Name</th>
              <th>Type</th>
              <th>Capacity kg</th>
              <th>Updated</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {feedersSorted.map((f) => (
              <tr key={f.id}>
                <td className="mono">{f.name}</td>
                <td className="muted">{f.feederType}</td>
                <td className="muted">{f.capacityKg ?? ""}</td>
                <td className="muted">{new Date(f.updatedAt).toLocaleString()}</td>
                <td style={{ textAlign: "right", whiteSpace: "nowrap" }}>
                  <div className="actions" style={{ justifyContent: "flex-end" }}>
                    {f.locationGeoJson ? (
                      <button
                        className="btn"
                        type="button"
                        onClick={() => seeOnMap({ kind: "FEEDER", feederId: f.id })}
                        disabled={busy}
                      >
                        See on map
                      </button>
                    ) : null}
                    <button
                      className="btn"
                      type="button"
                      onClick={() => {
                        setEditing(f);
                        setName(f.name);
                        setFeederType(f.feederType);
                        setCapacityKg(f.capacityKg ?? "");
                      }}
                      disabled={busy}
                    >
                      Edit
                    </button>
                    <button
                      className="btn"
                      type="button"
                      onClick={() => {
                        if (!confirm(`Delete feeder "${f.name}"?`)) return;
                        void deleteMutation.mutateAsync(f.id);
                      }}
                      disabled={busy}
                    >
                      Delete
                    </button>
                  </div>
                </td>
              </tr>
            ))}

            {feedersSorted.length === 0 && !feedersQuery.isLoading ? (
              <tr>
                <td className="muted" colSpan={5}>
                  No feeders yet.
                </td>
              </tr>
            ) : null}
          </tbody>
        </table>
      </div>

      {deleteMutation.isError ? (
        <div className="alert" style={{ marginTop: 10 }}>
          {(deleteMutation.error as Error).message}
        </div>
      ) : null}
    </section>
  );
}
