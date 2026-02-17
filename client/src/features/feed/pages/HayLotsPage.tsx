import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { apiFetch } from "../../../api/http";
import { enqueueAction } from "../../../offline/actionQueue";
import { deleteEntity, listEntities, upsertEntities } from "../../../offline/indexedDb";
import { createStableUuid } from "../../../offline/uuid";
import type { ApiListResponse, ApiSingleResponse, HayLot } from "../../../types/api";

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

function toPositiveNumberOrUndefined(raw: string): number | undefined {
  const v = raw.trim();
  if (!v) return undefined;
  const n = Number(v);
  return Number.isFinite(n) && n > 0 ? n : undefined;
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

type CreateHayLotInput = {
  id: string;
  lotCode: string;
  quantityTons: number;
  qualityGrade?: string;
  location?: string;
};

type UpdateHayLotInput = {
  lotCode?: string;
  quantityTons?: number;
  qualityGrade?: string;
  location?: string;
};

async function createHayLot(input: CreateHayLotInput): Promise<HayLot> {
  try {
    const response = await apiFetch<ApiSingleResponse<HayLot>>("/hay-lots", {
      method: "POST",
      body: JSON.stringify(input),
    });
    return response.data;
  } catch (err) {
    if (!isOfflineLikeError(err)) throw err;

    const now = new Date().toISOString();

    const local: HayLot = {
      id: input.id,
      farmId: getFarmId(),
      lotCode: input.lotCode,
      quantityTons: String(input.quantityTons),
      qualityGrade: input.qualityGrade ?? null,
      location: input.location ?? null,
      createdAt: now,
      updatedAt: now,
    };

    await upsertEntities("hay_lots", [local as any]);

    const actionData: Record<string, unknown> = {
      id: local.id,
      lotCode: local.lotCode,
      quantityTons: input.quantityTons,
    };

    if (input.qualityGrade) actionData.qualityGrade = input.qualityGrade;
    if (input.location) actionData.location = input.location;

    await enqueueAction({
      entity: "hay_lots",
      op: "CREATE",
      data: actionData,
    });

    return local;
  }
}

async function updateHayLot(args: { hayLotId: string; input: UpdateHayLotInput }): Promise<HayLot> {
  try {
    const response = await apiFetch<ApiSingleResponse<HayLot>>(`/hay-lots/${args.hayLotId}`,
      {
        method: "PATCH",
        body: JSON.stringify(args.input),
      },
    );
    return response.data;
  } catch (err) {
    if (!isOfflineLikeError(err)) throw err;

    const now = new Date().toISOString();
    const cached = await listEntities<HayLot>("hay_lots");
    const existing = cached.find((l) => l.id === args.hayLotId) ?? null;

    const local: HayLot = {
      id: args.hayLotId,
      farmId: existing?.farmId ?? getFarmId(),
      lotCode: args.input.lotCode ?? existing?.lotCode ?? "HAY",
      quantityTons:
        args.input.quantityTons !== undefined
          ? String(args.input.quantityTons)
          : (existing?.quantityTons ?? "0"),
      qualityGrade: args.input.qualityGrade ?? existing?.qualityGrade ?? null,
      location: args.input.location ?? existing?.location ?? null,
      createdAt: existing?.createdAt ?? now,
      updatedAt: now,
    };

    await upsertEntities("hay_lots", [local as any]);
    await enqueueAction({
      entity: "hay_lots",
      op: "UPDATE",
      data: {
        id: local.id,
        ...args.input,
      },
    });

    return local;
  }
}

async function deleteHayLot(hayLotId: string): Promise<void> {
  try {
    await apiFetch<void>(`/hay-lots/${hayLotId}`, { method: "DELETE" });
  } catch (err) {
    if (!isOfflineLikeError(err)) throw err;

    await deleteEntity("hay_lots", hayLotId);
    await enqueueAction({
      entity: "hay_lots",
      op: "DELETE",
      data: { id: hayLotId },
    });
  }
}

export function HayLotsPage() {
  const qc = useQueryClient();

  const hayLotsQuery = useQuery({
    queryKey: ["hay-lots"],
    queryFn: getHayLots,
    staleTime: 30_000,
  });

  const [editing, setEditing] = useState<HayLot | null>(null);

  const [lotCode, setLotCode] = useState("");
  const [quantityTons, setQuantityTons] = useState("");
  const [qualityGrade, setQualityGrade] = useState("");
  const [location, setLocation] = useState("");

  const createMutation = useMutation({
    mutationFn: createHayLot,
    onSuccess: async () => {
      setEditing(null);
      setLotCode("");
      setQuantityTons("");
      setQualityGrade("");
      setLocation("");
      await qc.invalidateQueries({ queryKey: ["hay-lots"] });
    },
  });

  const updateMutation = useMutation({
    mutationFn: updateHayLot,
    onSuccess: async () => {
      setEditing(null);
      setLotCode("");
      setQuantityTons("");
      setQualityGrade("");
      setLocation("");
      await qc.invalidateQueries({ queryKey: ["hay-lots"] });
    },
  });

  const deleteMutation = useMutation({
    mutationFn: deleteHayLot,
    onSuccess: async (_data, hayLotId) => {
      if (editing?.id === hayLotId) {
        setEditing(null);
        setLotCode("");
        setQuantityTons("");
        setQualityGrade("");
        setLocation("");
      }
      await qc.invalidateQueries({ queryKey: ["hay-lots"] });
    },
  });

  const lotsSorted = useMemo(() => {
    return (hayLotsQuery.data ?? []).slice().sort((a, b) => a.lotCode.localeCompare(b.lotCode));
  }, [hayLotsQuery.data]);

  const busy = createMutation.isPending || updateMutation.isPending || deleteMutation.isPending;
  const isEditing = !!editing;

  const qty = toPositiveNumberOrUndefined(quantityTons);

  return (
    <section>
      <header className="sectionHead">
        <div>
          <h3>Hay Lots</h3>
          <p className="muted">Track hay inventory lots. Works offline via queued sync.</p>
        </div>
        <div className="actions">
          <button className="btn" type="button" onClick={() => void hayLotsQuery.refetch()} disabled={hayLotsQuery.isFetching}>
            Refresh
          </button>
        </div>
      </header>

      {hayLotsQuery.isLoading ? <p className="muted">Loading hay lots...</p> : null}
      {hayLotsQuery.isError ? <div className="alert">Failed to load hay lots: {(hayLotsQuery.error as Error).message}</div> : null}

      <form
        className="form"
        onSubmit={(e) => {
          e.preventDefault();

          const code = lotCode.trim();
          if (!code || !qty) return;

          const grade = qualityGrade.trim();
          const loc = location.trim();

          if (editing) {
            void updateMutation.mutateAsync({
              hayLotId: editing.id,
              input: {
                lotCode: code,
                quantityTons: qty,
                qualityGrade: grade || undefined,
                location: loc || undefined,
              },
            });
            return;
          }

          void createMutation.mutateAsync({
            id: createUuid(),
            lotCode: code,
            quantityTons: qty,
            qualityGrade: grade || undefined,
            location: loc || undefined,
          });
        }}
        style={{ marginTop: 10 }}
      >
        <div className="row3">
          <label className="label">
            Lot code
            <input className="input" value={lotCode} onChange={(e) => setLotCode(e.target.value)} placeholder="e.g. HAY-2026-01" required />
          </label>

          <label className="label">
            Quantity (tons)
            <input className="input" value={quantityTons} onChange={(e) => setQuantityTons(e.target.value)} inputMode="decimal" type="number" min={0.01} step={0.01} required />
          </label>

          <label className="label">
            Quality grade
            <input className="input" value={qualityGrade} onChange={(e) => setQualityGrade(e.target.value)} placeholder="Optional" />
          </label>
        </div>

        <div className="row3" style={{ marginTop: 10 }}>
          <label className="label">
            Location
            <input className="input" value={location} onChange={(e) => setLocation(e.target.value)} placeholder="Optional" />
          </label>
          <div />
          <div />
        </div>

        <div className="actions">
          <button className="btn btnPrimary" type="submit" disabled={busy || !lotCode.trim() || !qty}>
            {isEditing
              ? updateMutation.isPending
                ? "Saving..."
                : "Save Changes"
              : createMutation.isPending
                ? "Creating..."
                : "Create Hay Lot"}
          </button>

          {isEditing ? (
            <button
              className="btn"
              type="button"
              onClick={() => {
                setEditing(null);
                setLotCode("");
                setQuantityTons("");
                setQualityGrade("");
                setLocation("");
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
              <th>Lot code</th>
              <th>Qty tons</th>
              <th>Grade</th>
              <th>Location</th>
              <th>Updated</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {lotsSorted.map((l) => (
              <tr key={l.id}>
                <td className="mono">{l.lotCode}</td>
                <td className="muted">{l.quantityTons}</td>
                <td className="muted">{l.qualityGrade ?? ""}</td>
                <td className="muted">{l.location ?? ""}</td>
                <td className="muted">{new Date(l.updatedAt).toLocaleString()}</td>
                <td style={{ textAlign: "right", whiteSpace: "nowrap" }}>
                  <div className="actions" style={{ justifyContent: "flex-end" }}>
                    <button
                      className="btn"
                      type="button"
                      onClick={() => {
                        setEditing(l);
                        setLotCode(l.lotCode);
                        setQuantityTons(l.quantityTons);
                        setQualityGrade(l.qualityGrade ?? "");
                        setLocation(l.location ?? "");
                      }}
                      disabled={busy}
                    >
                      Edit
                    </button>
                    <button
                      className="btn"
                      type="button"
                      onClick={() => {
                        if (!confirm(`Delete hay lot "${l.lotCode}"?`)) return;
                        void deleteMutation.mutateAsync(l.id);
                      }}
                      disabled={busy}
                    >
                      Delete
                    </button>
                  </div>
                </td>
              </tr>
            ))}

            {lotsSorted.length === 0 && !hayLotsQuery.isLoading ? (
              <tr>
                <td className="muted" colSpan={6}>
                  No hay lots yet.
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
