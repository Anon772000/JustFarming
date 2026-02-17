import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useMemo, useState } from "react";
import { apiFetch } from "../../../api/http";
import { enqueueAction } from "../../../offline/actionQueue";
import { deleteEntity, listEntities, upsertEntities } from "../../../offline/indexedDb";
import { createStableUuid } from "../../../offline/uuid";
import { seeOnMap } from "../../../ui/navigation";
import type { ApiListResponse, ApiSingleResponse, CropSeason, Paddock } from "../../../types/api";

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

function toLocalDateTimeInput(iso: string | null | undefined): string {
  if (!iso) return "";
  const d = new Date(iso);
  if (!Number.isFinite(d.getTime())) return "";
  return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}T${pad2(d.getHours())}:${pad2(d.getMinutes())}`;
}

function localDateTimeToIso(value: string): string {
  const v = value.trim();
  if (!v) throw new Error("Missing datetime");
  const d = new Date(v);
  if (!Number.isFinite(d.getTime())) throw new Error("Invalid datetime");
  return d.toISOString();
}

function toNumberOrNull(raw: string): number | null {
  const v = raw.trim();
  if (!v) return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
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

async function getCropSeasons(): Promise<CropSeason[]> {
  try {
    const response = await apiFetch<ApiListResponse<CropSeason>>("/crop-seasons");
    await upsertEntities("crop_seasons", response.data as any);
    return response.data;
  } catch (err) {
    const cached = await listEntities<CropSeason>("crop_seasons");
    if (cached.length) return cached;
    throw err;
  }
}

type CreateCropSeasonInput = {
  id: string;
  paddockId: string;
  seasonName: string;
  cropType: string;
  startDate: string;
  endDate?: string | null;
  targetYieldTons?: number | null;
  actualYieldTons?: number | null;
  notes?: string;
};

type UpdateCropSeasonInput = {
  paddockId?: string;
  seasonName?: string;
  cropType?: string;
  startDate?: string;
  endDate?: string | null;
  targetYieldTons?: number | null;
  actualYieldTons?: number | null;
  notes?: string;
};

async function createCropSeason(input: CreateCropSeasonInput): Promise<CropSeason> {
  try {
    const response = await apiFetch<ApiSingleResponse<CropSeason>>("/crop-seasons", {
      method: "POST",
      body: JSON.stringify(input),
    });
    return response.data;
  } catch (err) {
    if (!isOfflineLikeError(err)) throw err;

    const now = new Date().toISOString();

    const local: CropSeason = {
      id: input.id,
      farmId: getFarmId(),
      paddockId: input.paddockId,
      seasonName: input.seasonName,
      cropType: input.cropType,
      startDate: input.startDate,
      endDate: input.endDate ?? null,
      targetYieldTons: input.targetYieldTons === null || input.targetYieldTons === undefined ? null : String(input.targetYieldTons),
      actualYieldTons: input.actualYieldTons === null || input.actualYieldTons === undefined ? null : String(input.actualYieldTons),
      notes: input.notes ?? null,
      createdAt: now,
      updatedAt: now,
    };

    await upsertEntities("crop_seasons", [local as any]);

    await enqueueAction({
      entity: "crop_seasons",
      op: "CREATE",
      data: {
        id: local.id,
        paddockId: local.paddockId,
        seasonName: local.seasonName,
        cropType: local.cropType,
        startDate: local.startDate,
        ...(local.endDate ? { endDate: local.endDate } : {}),
        ...(input.targetYieldTons !== undefined ? { targetYieldTons: input.targetYieldTons } : {}),
        ...(input.actualYieldTons !== undefined ? { actualYieldTons: input.actualYieldTons } : {}),
        ...(input.notes ? { notes: input.notes } : {}),
      },
    });

    return local;
  }
}

async function updateCropSeason(args: { cropSeasonId: string; input: UpdateCropSeasonInput }): Promise<CropSeason> {
  try {
    const response = await apiFetch<ApiSingleResponse<CropSeason>>(`/crop-seasons/${args.cropSeasonId}`, {
      method: "PATCH",
      body: JSON.stringify(args.input),
    });
    return response.data;
  } catch (err) {
    if (!isOfflineLikeError(err)) throw err;

    const now = new Date().toISOString();

    const cached = await listEntities<CropSeason>("crop_seasons");
    const existing = cached.find((c) => c.id === args.cropSeasonId) ?? null;

    const local: CropSeason = {
      id: args.cropSeasonId,
      farmId: existing?.farmId ?? getFarmId(),
      paddockId: args.input.paddockId ?? existing?.paddockId ?? "00000000-0000-0000-0000-000000000000",
      seasonName: args.input.seasonName ?? existing?.seasonName ?? "Season",
      cropType: args.input.cropType ?? existing?.cropType ?? "Crop",
      startDate: args.input.startDate ?? existing?.startDate ?? now,
      endDate:
        args.input.endDate !== undefined
          ? (args.input.endDate ?? null)
          : (existing?.endDate ?? null),
      targetYieldTons:
        args.input.targetYieldTons !== undefined
          ? (args.input.targetYieldTons === null ? null : String(args.input.targetYieldTons))
          : (existing?.targetYieldTons ?? null),
      actualYieldTons:
        args.input.actualYieldTons !== undefined
          ? (args.input.actualYieldTons === null ? null : String(args.input.actualYieldTons))
          : (existing?.actualYieldTons ?? null),
      notes:
        args.input.notes !== undefined
          ? (args.input.notes ?? null)
          : (existing?.notes ?? null),
      createdAt: existing?.createdAt ?? now,
      updatedAt: now,
    };

    await upsertEntities("crop_seasons", [local as any]);

    await enqueueAction({
      entity: "crop_seasons",
      op: "UPDATE",
      data: {
        id: local.id,
        ...args.input,
      },
    });

    return local;
  }
}

async function deleteCropSeason(cropSeasonId: string): Promise<void> {
  try {
    await apiFetch<void>(`/crop-seasons/${cropSeasonId}`, {
      method: "DELETE",
    });
  } catch (err) {
    if (!isOfflineLikeError(err)) throw err;

    await deleteEntity("crop_seasons", cropSeasonId);

    await enqueueAction({
      entity: "crop_seasons",
      op: "DELETE",
      data: { id: cropSeasonId },
    });
  }
}

export function CropSeasonsPage() {
  const qc = useQueryClient();

  const paddocksQuery = useQuery({
    queryKey: ["paddocks"],
    queryFn: getPaddocks,
    staleTime: 30_000,
  });

  const seasonsQuery = useQuery({
    queryKey: ["crop-seasons"],
    queryFn: getCropSeasons,
    staleTime: 30_000,
  });

  const paddockById = useMemo(() => {
    const m = new Map<string, Paddock>();
    for (const p of paddocksQuery.data ?? []) m.set(p.id, p);
    return m;
  }, [paddocksQuery.data]);

  const [editing, setEditing] = useState<CropSeason | null>(null);

  const [paddockId, setPaddockId] = useState("");
  const [seasonName, setSeasonName] = useState("");
  const [cropType, setCropType] = useState("");
  const [startLocal, setStartLocal] = useState("");
  const [endLocal, setEndLocal] = useState("");
  const [targetYield, setTargetYield] = useState("");
  const [actualYield, setActualYield] = useState("");
  const [notes, setNotes] = useState("");

  const createMutation = useMutation({
    mutationFn: createCropSeason,
    onSuccess: async () => {
      setEditing(null);
      setPaddockId("");
      setSeasonName("");
      setCropType("");
      setStartLocal("");
      setEndLocal("");
      setTargetYield("");
      setActualYield("");
      setNotes("");
      await qc.invalidateQueries({ queryKey: ["crop-seasons"] });
    },
  });

  const updateMutation = useMutation({
    mutationFn: updateCropSeason,
    onSuccess: async () => {
      setEditing(null);
      setPaddockId("");
      setSeasonName("");
      setCropType("");
      setStartLocal("");
      setEndLocal("");
      setTargetYield("");
      setActualYield("");
      setNotes("");
      await qc.invalidateQueries({ queryKey: ["crop-seasons"] });
    },
  });

  const deleteMutation = useMutation({
    mutationFn: deleteCropSeason,
    onSuccess: async (_data, cropSeasonIdArg) => {
      if (editing?.id === cropSeasonIdArg) {
        setEditing(null);
        setPaddockId("");
        setSeasonName("");
        setCropType("");
        setStartLocal("");
        setEndLocal("");
        setTargetYield("");
        setActualYield("");
        setNotes("");
      }
      await qc.invalidateQueries({ queryKey: ["crop-seasons"] });
    },
  });

  const sorted = useMemo(() => {
    return (seasonsQuery.data ?? []).slice().sort((a, b) => b.startDate.localeCompare(a.startDate));
  }, [seasonsQuery.data]);

  const busy = createMutation.isPending || updateMutation.isPending || deleteMutation.isPending;

  return (
    <div>
      <header className="sectionHead">
        <div>
          <h3>Crop Seasons</h3>
          <p className="muted">Track what each paddock is doing this season (planned and actual yields).</p>
        </div>

        <div className="actions">
          <button className="btn" type="button" onClick={() => void seasonsQuery.refetch()} disabled={seasonsQuery.isLoading}>
            Refresh
          </button>
        </div>
      </header>

      {seasonsQuery.isLoading ? <p className="muted">Loading crop seasons...</p> : null}
      {seasonsQuery.isError ? <div className="alert">Failed to load crop seasons: {(seasonsQuery.error as Error).message}</div> : null}

      <form
        className="form"
        onSubmit={(e) => {
          e.preventDefault();

          const trimmedSeason = seasonName.trim();
          const trimmedCrop = cropType.trim();
          if (!trimmedSeason || !trimmedCrop || !paddockId) return;

          let startDate: string;
          try {
            startDate = localDateTimeToIso(startLocal);
          } catch {
            return;
          }

          let endDate: string | null | undefined;
          if (endLocal.trim()) {
            try {
              endDate = localDateTimeToIso(endLocal);
            } catch {
              return;
            }
          } else {
            endDate = null;
          }

          const targetYieldTons = toNumberOrNull(targetYield);
          const actualYieldTons = toNumberOrNull(actualYield);

          const payload = {
            paddockId,
            seasonName: trimmedSeason,
            cropType: trimmedCrop,
            startDate,
            endDate,
            targetYieldTons,
            actualYieldTons,
            notes: notes.trim() || undefined,
          } satisfies UpdateCropSeasonInput;

          if (editing) {
            void updateMutation.mutateAsync({ cropSeasonId: editing.id, input: payload });
          } else {
            void createMutation.mutateAsync({ id: createStableUuid(), ...payload });
          }
        }}
        style={{ marginTop: 10 }}
      >
        <div className="row3">
          <label className="label">
            Paddock
            <select className="select" value={paddockId} onChange={(e) => setPaddockId(e.target.value)} required>
              <option value="">Select paddock...</option>
              {(paddocksQuery.data ?? [])
                .slice()
                .sort((a, b) => a.name.localeCompare(b.name))
                .map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.name}
                  </option>
                ))}
            </select>
          </label>

          <label className="label">
            Season name
            <input className="input" value={seasonName} onChange={(e) => setSeasonName(e.target.value)} required />
          </label>

          <label className="label">
            Crop type
            <input className="input" value={cropType} onChange={(e) => setCropType(e.target.value)} required />
          </label>
        </div>

        <div className="row3">
          <label className="label">
            Start
            <input
              className="input"
              type="datetime-local"
              value={startLocal}
              onChange={(e) => setStartLocal(e.target.value)}
              required
            />
          </label>

          <label className="label">
            End
            <input
              className="input"
              type="datetime-local"
              value={endLocal}
              onChange={(e) => setEndLocal(e.target.value)}
            />
          </label>

          <label className="label">
            Target yield (tons)
            <input className="input" value={targetYield} onChange={(e) => setTargetYield(e.target.value)} inputMode="decimal" placeholder="e.g. 12.5" />
          </label>
        </div>

        <div className="row3">
          <label className="label">
            Actual yield (tons)
            <input className="input" value={actualYield} onChange={(e) => setActualYield(e.target.value)} inputMode="decimal" placeholder="e.g. 11.8" />
          </label>

          <label className="label" style={{ gridColumn: "span 2" }}>
            Notes
            <textarea
              className="input"
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="Any notes for this season"
              style={{ minHeight: 44, resize: "vertical" }}
            />
          </label>
        </div>

        <div className="actions">
          <button className="btn btnPrimary" type="submit" disabled={busy || !paddockId || !seasonName.trim() || !cropType.trim()}>
            {editing
              ? updateMutation.isPending
                ? "Saving..."
                : "Save Changes"
              : createMutation.isPending
                ? "Creating..."
                : "Create Season"}
          </button>
          {editing ? (
            <button
              className="btn"
              type="button"
              onClick={() => {
                setEditing(null);
                setPaddockId("");
                setSeasonName("");
                setCropType("");
                setStartLocal("");
                setEndLocal("");
                setTargetYield("");
                setActualYield("");
                setNotes("");
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
              <th>Season</th>
              <th>Crop</th>
              <th>Paddock</th>
              <th>Start</th>
              <th>End</th>
              <th>Target</th>
              <th>Actual</th>
              <th>Updated</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {sorted.map((c) => (
              <tr key={c.id}>
                <td style={{ minWidth: 160 }}>
                  <div style={{ fontWeight: 700 }}>{c.seasonName}</div>
                  {c.notes ? <div className="muted" style={{ marginTop: 4 }}>{c.notes}</div> : null}
                </td>
                <td>{c.cropType}</td>
                <td>{paddockById.get(c.paddockId)?.name ?? c.paddockId}</td>
                <td className="mono">{new Date(c.startDate).toLocaleString()}</td>
                <td className="mono">{c.endDate ? new Date(c.endDate).toLocaleString() : ""}</td>
                <td className="mono">{c.targetYieldTons ?? ""}</td>
                <td className="mono">{c.actualYieldTons ?? ""}</td>
                <td className="mono">{new Date(c.updatedAt).toLocaleString()}</td>
                <td>
                  <div className="actions" style={{ marginTop: 0 }}>
                    <button
                      className="btn"
                      type="button"
                      disabled={busy}
                      onClick={() => seeOnMap({ kind: "PADDOCK", paddockId: c.paddockId })}
                    >
                      See on map
                    </button>
                    <button
                      className="btn"
                      type="button"
                      disabled={busy}
                      onClick={() => {
                        setEditing(c);
                        setPaddockId(c.paddockId);
                        setSeasonName(c.seasonName);
                        setCropType(c.cropType);
                        setStartLocal(toLocalDateTimeInput(c.startDate));
                        setEndLocal(toLocalDateTimeInput(c.endDate ?? null));
                        setTargetYield(c.targetYieldTons ?? "");
                        setActualYield(c.actualYieldTons ?? "");
                        setNotes(c.notes ?? "");
                      }}
                    >
                      Edit
                    </button>
                    <button
                      className="btn"
                      type="button"
                      disabled={busy}
                      onClick={() => {
                        if (!confirm(`Delete crop season "${c.seasonName}"?`)) return;
                        void deleteMutation.mutateAsync(c.id);
                      }}
                    >
                      Delete
                    </button>
                  </div>
                </td>
              </tr>
            ))}
            {sorted.length === 0 ? (
              <tr>
                <td colSpan={9} className="muted">
                  No crop seasons yet.
                </td>
              </tr>
            ) : null}
          </tbody>
        </table>
      </div>
    </div>
  );
}
