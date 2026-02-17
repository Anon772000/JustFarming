import { apiFetch } from "../api/http";
import { drainActions } from "./actionQueue";
import { deleteEntity, getLastSync, setLastSync, upsertEntities, type EntityStoreName } from "./indexedDb";

interface SyncBatchResponse {
  applied: Array<{ clientId: string; status: string }>;
  conflicts: Array<{ clientId: string; reason: string }>;
}

type SyncChangeRow = {
  id: string;
  entityType: string;
  entityId: string;
  operation: string;
  changedAt: string;
  payloadJson?: unknown;
};

type SyncTombstoneRow = {
  id: string;
  entityType: string;
  entityId: string;
  deletedAt: string;
};

interface SyncChangesResponse {
  serverTime: string;
  changes: SyncChangeRow[];
  tombstones: SyncTombstoneRow[];
}

function toStoreName(entityType: string): EntityStoreName | null {
  switch (entityType) {
    case "mobs":
      return "mobs";
    case "mob_paddock_allocations":
      return "mob_paddock_allocations";
    case "paddocks":
      return "paddocks";
    case "crop_seasons":
      return "crop_seasons";
    case "paddock_plans":
      return "paddock_plans";
    case "production_plans":
      return "production_plans";
    case "feeders":
      return "feeders";
    case "hay_lots":
      return "hay_lots";
    case "grain_lots":
      return "grain_lots";
    case "feed_events":
      return "feed_events";
    case "contractors":
      return "contractors";
    case "pest_spottings":
      return "pest_spottings";
    case "activity_events":
      return "activity_events";
    case "issues":
      return "issues";
    case "tasks":
      return "tasks";
    case "mob_movement_plans":
      return "mob_movement_plans";
    case "water_assets":
      return "water_assets";
    case "water_links":
      return "water_links";
    case "lora_nodes":
      return "lora_nodes";
    case "sensors":
      return "sensors";
    case "attachments":
      return "attachments";
    default:
      return null;
  }
}

export async function runSyncCycle(): Promise<void> {
  if (!navigator.onLine) return;

  await drainActions(async (action) => {
    const result = await apiFetch<SyncBatchResponse>("/sync/batch", {
      method: "POST",
      body: JSON.stringify({ actions: [{ ...action, clientId: action.id }] }),
    });

    if (result.conflicts.length > 0) {
      throw new Error(`Conflict while syncing action ${action.id}`);
    }
  });

  const lastSync = (await getLastSync()) ?? "1970-01-01T00:00:00.000Z";
  const changes = await apiFetch<SyncChangesResponse>(`/sync/changes?since=${encodeURIComponent(lastSync)}`);

  const grouped = new Map<EntityStoreName, Array<Record<string, unknown>>>();

  for (const row of changes.changes) {
    const store = toStoreName(row.entityType);
    if (!store) continue;
    if (!row.payloadJson || typeof row.payloadJson !== "object") continue;

    const payload = row.payloadJson as Record<string, unknown>;
    const id = payload.id;
    if (typeof id !== "string") continue;

    const list = grouped.get(store) ?? [];
    list.push(payload);
    grouped.set(store, list);
  }

  for (const [store, entities] of grouped) {
    await upsertEntities(store, entities as any);
  }

  for (const tomb of changes.tombstones) {
    const store = toStoreName(tomb.entityType);
    if (!store) continue;
    await deleteEntity(store, tomb.entityId);
  }

  await setLastSync(changes.serverTime);
}
