import { useEffect, useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { apiFetch } from "../../../api/http";
import { enqueueAction } from "../../../offline/actionQueue";
import { deleteEntity, listEntities, upsertEntities } from "../../../offline/indexedDb";
import { createStableUuid } from "../../../offline/uuid";
import { seeOnMap } from "../../../ui/navigation";
import type {
  ApiListResponse,
  ApiSingleResponse,
  FeedEvent,
  Feeder,
  GrainLot,
  HayLot,
  Mob,
  Paddock,
} from "../../../types/api";

const PREFILL_FEED_MOB_ID_KEY = "prefill.feed.mobId";

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

function pad2(n: number): string {
  return String(n).padStart(2, "0");
}

function toLocalDateTimeInput(iso: string): string {
  const d = new Date(iso);
  if (!Number.isFinite(d.getTime())) return "";
  return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}T${pad2(d.getHours())}:${pad2(d.getMinutes())}`;
}

function localDateTimeToIso(value: string): string {
  const d = new Date(value);
  if (!Number.isFinite(d.getTime())) {
    throw new Error("Invalid datetime");
  }
  return d.toISOString();
}

function toPositiveNumberOrUndefined(raw: string): number | undefined {
  const v = raw.trim();
  if (!v) return undefined;
  const n = Number(v);
  return Number.isFinite(n) && n > 0 ? n : undefined;
}

async function getFeedEvents(): Promise<FeedEvent[]> {
  try {
    const response = await apiFetch<ApiListResponse<FeedEvent>>("/feed-events");
    await upsertEntities("feed_events", response.data as any);
    return response.data;
  } catch (err) {
    const cached = await listEntities<FeedEvent>("feed_events");
    if (cached.length) return cached;
    throw err;
  }
}

async function getMobs(): Promise<Mob[]> {
  try {
    const response = await apiFetch<ApiListResponse<Mob>>("/mobs");
    await upsertEntities("mobs", response.data as any);
    return response.data;
  } catch (err) {
    const cached = await listEntities<Mob>("mobs");
    if (cached.length) return cached;
    throw err;
  }
}

async function getPaddocks(): Promise<Paddock[]> {
  try {
    const response = await apiFetch<ApiListResponse<Paddock>>("/paddocks");
    await upsertEntities("paddocks", response.data as any);
    return response.data;
  } catch (err) {
    const cached = await listEntities<Paddock>("paddocks");
    if (cached.length) return cached;
    throw err;
  }
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

async function getHayLots(): Promise<HayLot[]> {
  try {
    const response = await apiFetch<ApiListResponse<HayLot>>("/hay-lots");
    await upsertEntities("hay_lots", response.data as any);
    return response.data;
  } catch (err) {
    const cached = await listEntities<HayLot>("hay_lots");
    if (cached.length) return cached;
    throw err;
  }
}

async function getGrainLots(): Promise<GrainLot[]> {
  try {
    const response = await apiFetch<ApiListResponse<GrainLot>>("/grain-lots");
    await upsertEntities("grain_lots", response.data as any);
    return response.data;
  } catch (err) {
    const cached = await listEntities<GrainLot>("grain_lots");
    if (cached.length) return cached;
    throw err;
  }
}

type CreateFeedEventInput = {
  id: string;
  occurredAt: string;
  quantityKg: number;
  mobId?: string | null;
  paddockId?: string | null;
  feederId?: string | null;
  hayLotId?: string | null;
  grainLotId?: string | null;
  notes?: string;
};

type UpdateFeedEventInput = {
  occurredAt?: string;
  quantityKg?: number;
  mobId?: string | null;
  paddockId?: string | null;
  feederId?: string | null;
  hayLotId?: string | null;
  grainLotId?: string | null;
  notes?: string;
};

async function createFeedEvent(input: CreateFeedEventInput): Promise<FeedEvent> {
  try {
    const response = await apiFetch<ApiSingleResponse<FeedEvent>>("/feed-events", {
      method: "POST",
      body: JSON.stringify(input),
    });
    return response.data;
  } catch (err) {
    if (!isOfflineLikeError(err)) throw err;

    const now = new Date().toISOString();

    const local: FeedEvent = {
      id: input.id,
      farmId: getFarmId(),
      occurredAt: input.occurredAt,
      quantityKg: String(input.quantityKg),
      mobId: input.mobId ?? null,
      paddockId: input.paddockId ?? null,
      feederId: input.feederId ?? null,
      hayLotId: input.hayLotId ?? null,
      grainLotId: input.grainLotId ?? null,
      notes: input.notes ?? null,
      createdAt: now,
      updatedAt: now,
    };

    await upsertEntities("feed_events", [local as any]);

    const actionData: Record<string, unknown> = {
      id: local.id,
      occurredAt: local.occurredAt,
      quantityKg: input.quantityKg,
    };

    if (input.mobId) actionData.mobId = input.mobId;
    if (input.paddockId) actionData.paddockId = input.paddockId;
    if (input.feederId) actionData.feederId = input.feederId;
    if (input.hayLotId) actionData.hayLotId = input.hayLotId;
    if (input.grainLotId) actionData.grainLotId = input.grainLotId;
    if (input.notes) actionData.notes = input.notes;

    await enqueueAction({
      entity: "feed_events",
      op: "CREATE",
      data: actionData,
    });

    return local;
  }
}

async function updateFeedEvent(args: { feedEventId: string; input: UpdateFeedEventInput }): Promise<FeedEvent> {
  try {
    const response = await apiFetch<ApiSingleResponse<FeedEvent>>(`/feed-events/${args.feedEventId}`,
      {
        method: "PATCH",
        body: JSON.stringify(args.input),
      },
    );
    return response.data;
  } catch (err) {
    if (!isOfflineLikeError(err)) throw err;

    const now = new Date().toISOString();
    const cached = await listEntities<FeedEvent>("feed_events");
    const existing = cached.find((e) => e.id === args.feedEventId) ?? null;

    const local: FeedEvent = {
      id: args.feedEventId,
      farmId: existing?.farmId ?? getFarmId(),
      occurredAt: args.input.occurredAt ?? existing?.occurredAt ?? now,
      quantityKg:
        args.input.quantityKg !== undefined
          ? String(args.input.quantityKg)
          : (existing?.quantityKg ?? "0"),
      mobId: args.input.mobId !== undefined ? args.input.mobId : existing?.mobId ?? null,
      paddockId: args.input.paddockId !== undefined ? args.input.paddockId : existing?.paddockId ?? null,
      feederId: args.input.feederId !== undefined ? args.input.feederId : existing?.feederId ?? null,
      hayLotId: args.input.hayLotId !== undefined ? args.input.hayLotId : existing?.hayLotId ?? null,
      grainLotId: args.input.grainLotId !== undefined ? args.input.grainLotId : existing?.grainLotId ?? null,
      notes: args.input.notes ?? existing?.notes ?? null,
      createdAt: existing?.createdAt ?? now,
      updatedAt: now,
    };

    await upsertEntities("feed_events", [local as any]);

    await enqueueAction({
      entity: "feed_events",
      op: "UPDATE",
      data: {
        id: local.id,
        ...args.input,
      },
    });

    return local;
  }
}

async function deleteFeedEvent(feedEventId: string): Promise<void> {
  try {
    await apiFetch<void>(`/feed-events/${feedEventId}`, { method: "DELETE" });
  } catch (err) {
    if (!isOfflineLikeError(err)) throw err;

    await deleteEntity("feed_events", feedEventId);
    await enqueueAction({
      entity: "feed_events",
      op: "DELETE",
      data: { id: feedEventId },
    });
  }
}


function focusBestOnMap(opts: { feederId?: string | null; paddockId?: string | null; mobId?: string | null }): void {
  if (opts.feederId) {
    seeOnMap({ kind: "FEEDER", feederId: opts.feederId });
    return;
  }

  if (opts.paddockId) {
    seeOnMap({ kind: "PADDOCK", paddockId: opts.paddockId });
    return;
  }

  if (opts.mobId) {
    seeOnMap({ kind: "MOB", mobId: opts.mobId });
  }
}

export function FeedEventsPage() {
  const qc = useQueryClient();

  const feedEventsQuery = useQuery({
    queryKey: ["feed-events"],
    queryFn: getFeedEvents,
    staleTime: 20_000,
  });

  const mobsQuery = useQuery({
    queryKey: ["mobs"],
    queryFn: getMobs,
    staleTime: 30_000,
  });

  const paddocksQuery = useQuery({
    queryKey: ["paddocks"],
    queryFn: getPaddocks,
    staleTime: 30_000,
  });

  const feedersQuery = useQuery({
    queryKey: ["feeders"],
    queryFn: getFeeders,
    staleTime: 30_000,
  });

  const hayLotsQuery = useQuery({
    queryKey: ["hay-lots"],
    queryFn: getHayLots,
    staleTime: 30_000,
  });

  const grainLotsQuery = useQuery({
    queryKey: ["grain-lots"],
    queryFn: getGrainLots,
    staleTime: 30_000,
  });

  const mobs = useMemo(() => (mobsQuery.data ?? []).slice().sort((a, b) => a.name.localeCompare(b.name)), [mobsQuery.data]);
  const paddocks = useMemo(
    () => (paddocksQuery.data ?? []).slice().sort((a, b) => a.name.localeCompare(b.name)),
    [paddocksQuery.data],
  );
  const feeders = useMemo(
    () => (feedersQuery.data ?? []).slice().sort((a, b) => a.name.localeCompare(b.name)),
    [feedersQuery.data],
  );
  const hayLots = useMemo(
    () => (hayLotsQuery.data ?? []).slice().sort((a, b) => a.lotCode.localeCompare(b.lotCode)),
    [hayLotsQuery.data],
  );
  const grainLots = useMemo(
    () => (grainLotsQuery.data ?? []).slice().sort((a, b) => a.lotCode.localeCompare(b.lotCode)),
    [grainLotsQuery.data],
  );

  const mobById = useMemo(() => new Map(mobs.map((m) => [m.id, m])), [mobs]);
  const paddockById = useMemo(() => new Map(paddocks.map((p) => [p.id, p])), [paddocks]);
  const feederById = useMemo(() => new Map(feeders.map((f) => [f.id, f])), [feeders]);
  const hayLotById = useMemo(() => new Map(hayLots.map((l) => [l.id, l])), [hayLots]);
  const grainLotById = useMemo(() => new Map(grainLots.map((l) => [l.id, l])), [grainLots]);

  const events = useMemo(() => {
    const list = (feedEventsQuery.data ?? []).slice();
    list.sort((a, b) => (b.occurredAt ?? "").localeCompare(a.occurredAt ?? ""));
    return list;
  }, [feedEventsQuery.data]);

  const [editing, setEditing] = useState<FeedEvent | null>(null);

  const [mobId, setMobId] = useState(() => {
    try {
      const stored = localStorage.getItem(PREFILL_FEED_MOB_ID_KEY) ?? "";
      if (stored) localStorage.removeItem(PREFILL_FEED_MOB_ID_KEY);
      return stored;
    } catch {
      return "";
    }
  });

  const [paddockId, setPaddockId] = useState("");
  const [feederId, setFeederId] = useState("");
  const [sourceType, setSourceType] = useState<"NONE" | "HAY" | "GRAIN">("NONE");
  const [hayLotId, setHayLotId] = useState("");
  const [grainLotId, setGrainLotId] = useState("");
  const [quantityKg, setQuantityKg] = useState("25");
  const [occurredAtLocal, setOccurredAtLocal] = useState(() => toLocalDateTimeInput(new Date().toISOString()));
  const [notes, setNotes] = useState("");

  useEffect(() => {
    if (mobs.length === 0) return;
    if (mobId && mobById.has(mobId)) return;
    setMobId(mobs[0].id);
  }, [mobId, mobById, mobs]);

  useEffect(() => {
    if (editing) return;
    if (!mobId) return;
    if (paddockId) return;
    const mob = mobById.get(mobId);
    const current = mob?.currentPaddockId ?? null;
    if (current) setPaddockId(current);
  }, [editing, mobById, mobId, paddockId]);

  useEffect(() => {
    if (sourceType !== "HAY") return;
    setGrainLotId("");
    if (hayLotId) return;
    if (hayLots.length === 0) return;
    setHayLotId(hayLots[0].id);
  }, [hayLotId, hayLots, sourceType]);

  useEffect(() => {
    if (sourceType !== "GRAIN") return;
    setHayLotId("");
    if (grainLotId) return;
    if (grainLots.length === 0) return;
    setGrainLotId(grainLots[0].id);
  }, [grainLotId, grainLots, sourceType]);

  useEffect(() => {
    if (sourceType === "NONE") {
      setHayLotId("");
      setGrainLotId("");
    }
  }, [sourceType]);

  const createMutation = useMutation({
    mutationFn: createFeedEvent,
    onSuccess: async () => {
      setEditing(null);
      setQuantityKg("25");
      setNotes("");
      setOccurredAtLocal(toLocalDateTimeInput(new Date().toISOString()));
      await qc.invalidateQueries({ queryKey: ["feed-events"] });
    },
  });

  const updateMutation = useMutation({
    mutationFn: updateFeedEvent,
    onSuccess: async () => {
      setEditing(null);
      setQuantityKg("25");
      setNotes("");
      setOccurredAtLocal(toLocalDateTimeInput(new Date().toISOString()));
      await qc.invalidateQueries({ queryKey: ["feed-events"] });
    },
  });

  const deleteMutation = useMutation({
    mutationFn: deleteFeedEvent,
    onSuccess: async (_data, id) => {
      if (editing?.id === id) setEditing(null);
      await qc.invalidateQueries({ queryKey: ["feed-events"] });
    },
  });

  const busy = createMutation.isPending || updateMutation.isPending || deleteMutation.isPending;

  const qty = toPositiveNumberOrUndefined(quantityKg);

  const canSeeOnMap = Boolean(feederId || paddockId || mobId);

  return (
    <section>
      <header className="sectionHead">
        <div>
          <h3>Feed Events</h3>
          <p className="muted">Record feeding events and link them to mobs, paddocks, feeders, and lots.</p>
        </div>

        <div className="actions">
          <button
            className="btn"
            type="button"
            onClick={() => {
              void feedEventsQuery.refetch();
              void mobsQuery.refetch();
              void paddocksQuery.refetch();
              void feedersQuery.refetch();
              void hayLotsQuery.refetch();
              void grainLotsQuery.refetch();
            }}
            disabled={feedEventsQuery.isFetching}
          >
            Refresh
          </button>
        </div>
      </header>

      {feedEventsQuery.isLoading ? <p className="muted">Loading feed events...</p> : null}
      {feedEventsQuery.isError ? <div className="alert">Failed to load feed events: {(feedEventsQuery.error as Error).message}</div> : null}

      <form
        className="form"
        onSubmit={(e) => {
          e.preventDefault();

          if (!qty) return;

          let occurredAt: string;
          try {
            occurredAt = localDateTimeToIso(occurredAtLocal);
          } catch {
            return;
          }

          const mobPayload = mobId ? mobId : null;
          const paddockPayload = paddockId ? paddockId : null;
          const feederPayload = feederId ? feederId : null;

          const hayPayload = sourceType === "HAY" && hayLotId ? hayLotId : null;
          const grainPayload = sourceType === "GRAIN" && grainLotId ? grainLotId : null;

          const payloadBase = {
            occurredAt,
            quantityKg: qty,
            mobId: mobPayload,
            paddockId: paddockPayload,
            feederId: feederPayload,
            hayLotId: hayPayload,
            grainLotId: grainPayload,
            notes: notes.trim() || undefined,
          };

          if (editing) {
            void updateMutation.mutateAsync({
              feedEventId: editing.id,
              input: payloadBase,
            });
            return;
          }

          void createMutation.mutateAsync({
            id: createUuid(),
            ...payloadBase,
          });
        }}
        style={{ marginTop: 10 }}
      >
        <div className="row3">
          <label className="label">
            Mob
            <select className="input" value={mobId} onChange={(e) => setMobId(e.target.value)}>
              <option value="">(none)</option>
              {mobs.map((m) => (
                <option key={m.id} value={m.id}>
                  {m.name}
                </option>
              ))}
            </select>
          </label>

          <label className="label">
            Paddock
            <select className="input" value={paddockId} onChange={(e) => setPaddockId(e.target.value)}>
              <option value="">(none)</option>
              {paddocks.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name}
                </option>
              ))}
            </select>
          </label>

          <label className="label">
            Feeder
            <select className="input" value={feederId} onChange={(e) => setFeederId(e.target.value)}>
              <option value="">(none)</option>
              {feeders.map((f) => (
                <option key={f.id} value={f.id}>
                  {f.name}
                </option>
              ))}
            </select>
          </label>
        </div>

        <div className="row3" style={{ marginTop: 10 }}>
          <label className="label">
            Source
            <select
              className="input"
              value={sourceType}
              onChange={(e) => setSourceType(e.target.value as "NONE" | "HAY" | "GRAIN")}
            >
              <option value="NONE">(none)</option>
              <option value="HAY">Hay lot</option>
              <option value="GRAIN">Grain lot</option>
            </select>
          </label>

          <label className="label">
            Lot
            <select
              className="input"
              value={sourceType === "HAY" ? hayLotId : sourceType === "GRAIN" ? grainLotId : ""}
              onChange={(e) => {
                const v = e.target.value;
                if (sourceType === "HAY") setHayLotId(v);
                if (sourceType === "GRAIN") setGrainLotId(v);
              }}
              disabled={sourceType === "NONE"}
            >
              <option value="">(none)</option>
              {sourceType === "HAY"
                ? hayLots.map((l) => (
                    <option key={l.id} value={l.id}>
                      {l.lotCode}
                    </option>
                  ))
                : null}
              {sourceType === "GRAIN"
                ? grainLots.map((l) => (
                    <option key={l.id} value={l.id}>
                      {l.lotCode} ({l.grainType})
                    </option>
                  ))
                : null}
            </select>
          </label>

          <label className="label">
            Quantity (kg)
            <input
              className="input"
              value={quantityKg}
              onChange={(e) => setQuantityKg(e.target.value)}
              inputMode="decimal"
              type="number"
              min={0.01}
              step={0.1}
              required
            />
          </label>
        </div>

        <div className="row3" style={{ marginTop: 10 }}>
          <label className="label">
            Occurred at
            <input className="input" value={occurredAtLocal} onChange={(e) => setOccurredAtLocal(e.target.value)} type="datetime-local" required />
          </label>
          <label className="label">
            Notes
            <input className="input" value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Optional" />
          </label>
          <div />
        </div>

        <div className="actions">
          <button className="btn btnPrimary" type="submit" disabled={busy || !qty}>
            {editing
              ? updateMutation.isPending
                ? "Saving..."
                : "Save Changes"
              : createMutation.isPending
                ? "Creating..."
                : "Create Feed Event"}
          </button>

          <button
            className="btn"
            type="button"
            onClick={() => focusBestOnMap({ feederId: feederId || null, paddockId: paddockId || null, mobId: mobId || null })}
            disabled={busy || !canSeeOnMap}
            title="Jump to the best available location (feeder, paddock, or mob)."
          >
            See on map
          </button>

          {editing ? (
            <button
              className="btn"
              type="button"
              onClick={() => {
                setEditing(null);
                setNotes("");
                setQuantityKg("25");
                setOccurredAtLocal(toLocalDateTimeInput(new Date().toISOString()));
              }}
              disabled={busy}
            >
              Cancel
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
              <th>When</th>
              <th>Mob</th>
              <th>Paddock</th>
              <th>Feeder</th>
              <th>Source</th>
              <th>Kg</th>
              <th>Notes</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {events.map((e) => {
              const mobName = e.mobId ? mobById.get(e.mobId)?.name ?? "" : "";
              const paddockName = e.paddockId ? paddockById.get(e.paddockId)?.name ?? "" : "";
              const feederName = e.feederId ? feederById.get(e.feederId)?.name ?? "" : "";
              const source =
                e.hayLotId ? `Hay: ${hayLotById.get(e.hayLotId)?.lotCode ?? ""}` :
                e.grainLotId ? `Grain: ${grainLotById.get(e.grainLotId)?.lotCode ?? ""}` :
                "";

              return (
                <tr key={e.id}>
                  <td className="muted">{new Date(e.occurredAt).toLocaleString()}</td>
                  <td className="mono">{mobName}</td>
                  <td className="muted">{paddockName}</td>
                  <td className="muted">{feederName}</td>
                  <td className="muted">{source}</td>
                  <td>{e.quantityKg}</td>
                  <td className="muted">{e.notes ?? ""}</td>
                  <td style={{ textAlign: "right", whiteSpace: "nowrap" }}>
                    <div className="actions" style={{ justifyContent: "flex-end" }}>
                      <button
                        className="btn"
                        type="button"
                        onClick={() => focusBestOnMap({ feederId: e.feederId, paddockId: e.paddockId, mobId: e.mobId })}
                        disabled={busy || !(e.feederId || e.paddockId || e.mobId)}
                      >
                        See on map
                      </button>
                      <button
                        className="btn"
                        type="button"
                        onClick={() => {
                          setEditing(e);
                          setMobId(e.mobId ?? "");
                          setPaddockId(e.paddockId ?? "");
                          setFeederId(e.feederId ?? "");
                          if (e.hayLotId) {
                            setSourceType("HAY");
                            setHayLotId(e.hayLotId);
                            setGrainLotId("");
                          } else if (e.grainLotId) {
                            setSourceType("GRAIN");
                            setGrainLotId(e.grainLotId);
                            setHayLotId("");
                          } else {
                            setSourceType("NONE");
                            setHayLotId("");
                            setGrainLotId("");
                          }
                          setQuantityKg(e.quantityKg);
                          setOccurredAtLocal(toLocalDateTimeInput(e.occurredAt));
                          setNotes(e.notes ?? "");
                        }}
                        disabled={busy}
                      >
                        Edit
                      </button>
                      <button
                        className="btn"
                        type="button"
                        onClick={() => {
                          if (!confirm("Delete this feed event?")) return;
                          void deleteMutation.mutateAsync(e.id);
                        }}
                        disabled={busy}
                      >
                        Delete
                      </button>
                    </div>
                  </td>
                </tr>
              );
            })}

            {events.length === 0 && !feedEventsQuery.isLoading ? (
              <tr>
                <td className="muted" colSpan={8}>
                  No feed events yet.
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
