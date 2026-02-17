import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { apiFetch } from "../../../api/http";
import { enqueueAction } from "../../../offline/actionQueue";
import { deleteEntity, listEntities, upsertEntities } from "../../../offline/indexedDb";
import { createStableUuid } from "../../../offline/uuid";
import type { ApiListResponse, ApiSingleResponse, GrainLot } from "../../../types/api";

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

function toPctOrUndefined(raw: string): number | undefined {
  const v = raw.trim();
  if (!v) return undefined;
  const n = Number(v);
  return Number.isFinite(n) && n > 0 && n <= 100 ? n : undefined;
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

type CreateGrainLotInput = {
  id: string;
  lotCode: string;
  grainType: string;
  quantityTons: number;
  moisturePct?: number;
};

type UpdateGrainLotInput = {
  lotCode?: string;
  grainType?: string;
  quantityTons?: number;
  moisturePct?: number;
};

async function createGrainLot(input: CreateGrainLotInput): Promise<GrainLot> {
  try {
    const response = await apiFetch<ApiSingleResponse<GrainLot>>("/grain-lots", {
      method: "POST",
      body: JSON.stringify(input),
    });
    return response.data;
  } catch (err) {
    if (!isOfflineLikeError(err)) throw err;

    const now = new Date().toISOString();

    const local: GrainLot = {
      id: input.id,
      farmId: getFarmId(),
      lotCode: input.lotCode,
      grainType: input.grainType,
      quantityTons: String(input.quantityTons),
      moisturePct: input.moisturePct !== undefined ? String(input.moisturePct) : null,
      createdAt: now,
      updatedAt: now,
    };

    await upsertEntities("grain_lots", [local as any]);

    const actionData: Record<string, unknown> = {
      id: local.id,
      lotCode: local.lotCode,
      grainType: local.grainType,
      quantityTons: input.quantityTons,
    };

    if (input.moisturePct !== undefined) actionData.moisturePct = input.moisturePct;

    await enqueueAction({
      entity: "grain_lots",
      op: "CREATE",
      data: actionData,
    });

    return local;
  }
}

async function updateGrainLot(args: { grainLotId: string; input: UpdateGrainLotInput }): Promise<GrainLot> {
  try {
    const response = await apiFetch<ApiSingleResponse<GrainLot>>(`/grain-lots/${args.grainLotId}`,
      {
        method: "PATCH",
        body: JSON.stringify(args.input),
      },
    );
    return response.data;
  } catch (err) {
    if (!isOfflineLikeError(err)) throw err;

    const now = new Date().toISOString();
    const cached = await listEntities<GrainLot>("grain_lots");
    const existing = cached.find((l) => l.id === args.grainLotId) ?? null;

    const local: GrainLot = {
      id: args.grainLotId,
      farmId: existing?.farmId ?? getFarmId(),
      lotCode: args.input.lotCode ?? existing?.lotCode ?? "GRAIN",
      grainType: args.input.grainType ?? existing?.grainType ?? "",
      quantityTons:
        args.input.quantityTons !== undefined
          ? String(args.input.quantityTons)
          : (existing?.quantityTons ?? "0"),
      moisturePct:
        args.input.moisturePct !== undefined
          ? String(args.input.moisturePct)
          : (existing?.moisturePct ?? null),
      createdAt: existing?.createdAt ?? now,
      updatedAt: now,
    };

    await upsertEntities("grain_lots", [local as any]);
    await enqueueAction({
      entity: "grain_lots",
      op: "UPDATE",
      data: {
        id: local.id,
        ...args.input,
      },
    });

    return local;
  }
}

async function deleteGrainLot(grainLotId: string): Promise<void> {
  try {
    await apiFetch<void>(`/grain-lots/${grainLotId}`, { method: "DELETE" });
  } catch (err) {
    if (!isOfflineLikeError(err)) throw err;

    await deleteEntity("grain_lots", grainLotId);
    await enqueueAction({
      entity: "grain_lots",
      op: "DELETE",
      data: { id: grainLotId },
    });
  }
}

export function GrainLotsPage() {
  const qc = useQueryClient();

  const grainLotsQuery = useQuery({
    queryKey: ["grain-lots"],
    queryFn: getGrainLots,
    staleTime: 30_000,
  });

  const [editing, setEditing] = useState<GrainLot | null>(null);

  const [lotCode, setLotCode] = useState("");
  const [grainType, setGrainType] = useState("");
  const [quantityTons, setQuantityTons] = useState("");
  const [moisturePct, setMoisturePct] = useState("");

  const createMutation = useMutation({
    mutationFn: createGrainLot,
    onSuccess: async () => {
      setEditing(null);
      setLotCode("");
      setGrainType("");
      setQuantityTons("");
      setMoisturePct("");
      await qc.invalidateQueries({ queryKey: ["grain-lots"] });
    },
  });

  const updateMutation = useMutation({
    mutationFn: updateGrainLot,
    onSuccess: async () => {
      setEditing(null);
      setLotCode("");
      setGrainType("");
      setQuantityTons("");
      setMoisturePct("");
      await qc.invalidateQueries({ queryKey: ["grain-lots"] });
    },
  });

  const deleteMutation = useMutation({
    mutationFn: deleteGrainLot,
    onSuccess: async (_data, grainLotId) => {
      if (editing?.id === grainLotId) {
        setEditing(null);
        setLotCode("");
        setGrainType("");
        setQuantityTons("");
        setMoisturePct("");
      }
      await qc.invalidateQueries({ queryKey: ["grain-lots"] });
    },
  });

  const lotsSorted = useMemo(() => {
    return (grainLotsQuery.data ?? []).slice().sort((a, b) => a.lotCode.localeCompare(b.lotCode));
  }, [grainLotsQuery.data]);

  const busy = createMutation.isPending || updateMutation.isPending || deleteMutation.isPending;
  const isEditing = !!editing;

  const qty = toPositiveNumberOrUndefined(quantityTons);
  const moisture = toPctOrUndefined(moisturePct);
  const moistureOk = moisturePct.trim() === "" || moisture !== undefined;

  return (
    <section>
      <header className="sectionHead">
        <div>
          <h3>Grain Lots</h3>
          <p className="muted">Track grain inventory lots. Works offline via queued sync.</p>
        </div>
        <div className="actions">
          <button className="btn" type="button" onClick={() => void grainLotsQuery.refetch()} disabled={grainLotsQuery.isFetching}>
            Refresh
          </button>
        </div>
      </header>

      {grainLotsQuery.isLoading ? <p className="muted">Loading grain lots...</p> : null}
      {grainLotsQuery.isError ? <div className="alert">Failed to load grain lots: {(grainLotsQuery.error as Error).message}</div> : null}

      <form
        className="form"
        onSubmit={(e) => {
          e.preventDefault();

          const code = lotCode.trim();
          const type = grainType.trim();
          if (!code || !type || !qty || !moistureOk) return;

          if (editing) {
            void updateMutation.mutateAsync({
              grainLotId: editing.id,
              input: {
                lotCode: code,
                grainType: type,
                quantityTons: qty,
                moisturePct: moisture,
              },
            });
            return;
          }

          void createMutation.mutateAsync({
            id: createUuid(),
            lotCode: code,
            grainType: type,
            quantityTons: qty,
            moisturePct: moisture,
          });
        }}
        style={{ marginTop: 10 }}
      >
        <div className="row3">
          <label className="label">
            Lot code
            <input className="input" value={lotCode} onChange={(e) => setLotCode(e.target.value)} placeholder="e.g. GRAIN-2026-01" required />
          </label>

          <label className="label">
            Grain type
            <input className="input" value={grainType} onChange={(e) => setGrainType(e.target.value)} placeholder="e.g. barley" required />
          </label>

          <label className="label">
            Quantity (tons)
            <input className="input" value={quantityTons} onChange={(e) => setQuantityTons(e.target.value)} inputMode="decimal" type="number" min={0.01} step={0.01} required />
          </label>
        </div>

        <div className="row3" style={{ marginTop: 10 }}>
          <label className="label">
            Moisture %
            <input className="input" value={moisturePct} onChange={(e) => setMoisturePct(e.target.value)} inputMode="decimal" type="number" min={0.01} max={100} step={0.01} placeholder="Optional" />
          </label>
          <div />
          <div />
        </div>

        {!moistureOk ? <div className="alert">Moisture must be between 0 and 100.</div> : null}

        <div className="actions">
          <button className="btn btnPrimary" type="submit" disabled={busy || !lotCode.trim() || !grainType.trim() || !qty || !moistureOk}>
            {isEditing
              ? updateMutation.isPending
                ? "Saving..."
                : "Save Changes"
              : createMutation.isPending
                ? "Creating..."
                : "Create Grain Lot"}
          </button>

          {isEditing ? (
            <button
              className="btn"
              type="button"
              onClick={() => {
                setEditing(null);
                setLotCode("");
                setGrainType("");
                setQuantityTons("");
                setMoisturePct("");
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
              <th>Type</th>
              <th>Qty tons</th>
              <th>Moisture</th>
              <th>Updated</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {lotsSorted.map((l) => (
              <tr key={l.id}>
                <td className="mono">{l.lotCode}</td>
                <td className="muted">{l.grainType}</td>
                <td className="muted">{l.quantityTons}</td>
                <td className="muted">{l.moisturePct ?? ""}</td>
                <td className="muted">{new Date(l.updatedAt).toLocaleString()}</td>
                <td style={{ textAlign: "right", whiteSpace: "nowrap" }}>
                  <div className="actions" style={{ justifyContent: "flex-end" }}>
                    <button
                      className="btn"
                      type="button"
                      onClick={() => {
                        setEditing(l);
                        setLotCode(l.lotCode);
                        setGrainType(l.grainType);
                        setQuantityTons(l.quantityTons);
                        setMoisturePct(l.moisturePct ?? "");
                      }}
                      disabled={busy}
                    >
                      Edit
                    </button>
                    <button
                      className="btn"
                      type="button"
                      onClick={() => {
                        if (!confirm(`Delete grain lot "${l.lotCode}"?`)) return;
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

            {lotsSorted.length === 0 && !grainLotsQuery.isLoading ? (
              <tr>
                <td className="muted" colSpan={6}>
                  No grain lots yet.
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
