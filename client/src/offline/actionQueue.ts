import { deletePendingAction, listPendingActions, PendingAction, putPendingAction } from "./indexedDb";

export interface QueueActionInput {
  entity: string;
  op: PendingAction["op"];
  data: Record<string, unknown>;
}

function createActionId(): string {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
    return crypto.randomUUID();
  }
  return `action-${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

export async function enqueueAction(input: QueueActionInput): Promise<PendingAction> {
  const action: PendingAction = {
    id: createActionId(),
    entity: input.entity,
    op: input.op,
    data: input.data,
    ts: new Date().toISOString(),
    retries: 0,
  };

  await putPendingAction(action);
  return action;
}

export async function drainActions(
  process: (action: PendingAction) => Promise<void>,
): Promise<{ applied: number; failed: number }> {
  const pending = await listPendingActions();
  let applied = 0;
  let failed = 0;

  for (const action of pending) {
    try {
      await process(action);
      await deletePendingAction(action.id);
      applied += 1;
    } catch {
      failed += 1;
    }
  }

  return { applied, failed };
}
