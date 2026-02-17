import type { UUID } from "../types/api";

export interface PendingAction {
  id: UUID;
  entity: string;
  op: "CREATE" | "UPDATE" | "DELETE";
  data: Record<string, unknown>;
  ts: string;
  retries: number;
}

export type EntityStoreName =
  | "mobs"
  | "mob_paddock_allocations"
  | "paddocks"
  | "crop_seasons"
  | "paddock_plans"
  | "production_plans"
  | "feeders"
  | "hay_lots"
  | "grain_lots"
  | "feed_events"
  | "contractors"
  | "pest_spottings"
  | "activity_events"
  | "issues"
  | "tasks"
  | "mob_movement_plans"
  | "water_assets"
  | "water_links"
  | "lora_nodes"
  | "attachments"
  | "sensors";

type StorableEntity = { id: UUID } & Record<string, unknown>;

const DB_NAME = "croxton-east";
const DB_VERSION = 11;

const QUEUE_STORE = "pending_actions";
const META_STORE = "meta";

const ENTITY_STORES: EntityStoreName[] = [
  "mobs",
  "mob_paddock_allocations",
  "paddocks",
  "crop_seasons",
  "paddock_plans",
  "production_plans",
  "feeders",
  "hay_lots",
  "grain_lots",
  "feed_events",
  "contractors",
  "pest_spottings",
  "activity_events",
  "issues",
  "tasks",
  "mob_movement_plans",
  "water_assets",
  "water_links",
  "lora_nodes",
  "attachments",
  "sensors",
];

function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);

    req.onupgradeneeded = () => {
      const db = req.result;

      if (!db.objectStoreNames.contains(QUEUE_STORE)) {
        db.createObjectStore(QUEUE_STORE, { keyPath: "id" });
      }

      if (!db.objectStoreNames.contains(META_STORE)) {
        db.createObjectStore(META_STORE, { keyPath: "key" });
      }

      for (const store of ENTITY_STORES) {
        if (!db.objectStoreNames.contains(store)) {
          db.createObjectStore(store, { keyPath: "id" });
        }
      }
    };

    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error ?? new Error("Failed to open IndexedDB"));
  });
}

export async function putPendingAction(action: PendingAction): Promise<void> {
  const db = await openDb();
  await new Promise<void>((resolve, reject) => {
    const tx = db.transaction([QUEUE_STORE], "readwrite");
    tx.objectStore(QUEUE_STORE).put(action);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error ?? new Error("Failed to store pending action"));
  });
}

export async function listPendingActions(): Promise<PendingAction[]> {
  const db = await openDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction([QUEUE_STORE], "readonly");
    const req = tx.objectStore(QUEUE_STORE).getAll();
    req.onsuccess = () => resolve((req.result as PendingAction[]).sort((a, b) => a.ts.localeCompare(b.ts)));
    req.onerror = () => reject(req.error ?? new Error("Failed to read pending actions"));
  });
}

export async function deletePendingAction(id: UUID): Promise<void> {
  const db = await openDb();
  await new Promise<void>((resolve, reject) => {
    const tx = db.transaction([QUEUE_STORE], "readwrite");
    tx.objectStore(QUEUE_STORE).delete(id);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error ?? new Error("Failed to delete pending action"));
  });
}

export async function getLastSync(): Promise<string | null> {
  const db = await openDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction([META_STORE], "readonly");
    const req = tx.objectStore(META_STORE).get("lastSync");
    req.onsuccess = () => resolve((req.result?.value as string | undefined) ?? null);
    req.onerror = () => reject(req.error ?? new Error("Failed to read last sync"));
  });
}

export async function setLastSync(ts: string): Promise<void> {
  const db = await openDb();
  await new Promise<void>((resolve, reject) => {
    const tx = db.transaction([META_STORE], "readwrite");
    tx.objectStore(META_STORE).put({ key: "lastSync", value: ts });
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error ?? new Error("Failed to store last sync"));
  });
}

export async function upsertEntities(store: EntityStoreName, entities: StorableEntity[]): Promise<void> {
  if (entities.length === 0) return;

  const db = await openDb();
  await new Promise<void>((resolve, reject) => {
    const tx = db.transaction([store], "readwrite");
    const os = tx.objectStore(store);

    for (const entity of entities) {
      os.put(entity);
    }

    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error ?? new Error(`Failed to upsert entities in ${store}`));
  });
}

export async function deleteEntity(store: EntityStoreName, id: UUID): Promise<void> {
  const db = await openDb();
  await new Promise<void>((resolve, reject) => {
    const tx = db.transaction([store], "readwrite");
    tx.objectStore(store).delete(id);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error ?? new Error(`Failed to delete entity from ${store}`));
  });
}

export async function listEntities<T>(store: EntityStoreName): Promise<T[]> {
  const db = await openDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction([store], "readonly");
    const req = tx.objectStore(store).getAll();
    req.onsuccess = () => resolve(req.result as T[]);
    req.onerror = () => reject(req.error ?? new Error(`Failed to list entities from ${store}`));
  });
}
