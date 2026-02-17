export type MapFocus =
  | { kind: "PADDOCK"; paddockId: string }
  | { kind: "MOB"; mobId: string }
  | { kind: "WATER_ASSET"; waterAssetId: string }
  | { kind: "FEEDER"; feederId: string }
  | { kind: "ISSUE"; issueId: string }
  | { kind: "GEOJSON_POINT"; geoJson: unknown; label?: string }
  | { kind: "POINT"; point: { lat: number; lon: number }; label?: string };

export type AppNavigateDetail = {
  view: string;
  mapFocus?: MapFocus;
};

export const APP_NAVIGATE_EVENT = "croxton:navigate";

export function navigate(detail: AppNavigateDetail): void {
  if (typeof window === "undefined") return;
  window.dispatchEvent(new CustomEvent(APP_NAVIGATE_EVENT, { detail }));
}

export function seeOnMap(mapFocus: MapFocus): void {
  navigate({ view: "map", mapFocus });
}

export const PREFILL_SELECTED_MOB_ID_KEY = "prefill.selected.mobId";
export const PREFILL_SELECTED_PADDOCK_ID_KEY = "prefill.selected.paddockId";
export const PREFILL_SELECTED_ISSUE_ID_KEY = "prefill.selected.issueId";
export const PREFILL_SELECTED_WATER_ASSET_ID_KEY = "prefill.selected.waterAssetId";
export const PREFILL_SELECTED_FEEDER_ID_KEY = "prefill.selected.feederId";
export const PREFILL_FEED_TAB_KEY = "prefill.feed.tab";
export const PREFILL_SELECTED_TASK_ID_KEY = "prefill.selected.taskId";
export const PREFILL_SELECTED_PEST_ID_KEY = "prefill.selected.pestId";

function setPrefillOnce(key: string, value: string): void {
  try {
    localStorage.setItem(key, value);
  } catch {
    // ignore
  }
}

export function openMobDetails(mobId: string): void {
  setPrefillOnce(PREFILL_SELECTED_MOB_ID_KEY, mobId);
  navigate({ view: "mobs" });
}

export function openPaddockDetails(paddockId: string): void {
  setPrefillOnce(PREFILL_SELECTED_PADDOCK_ID_KEY, paddockId);
  navigate({ view: "paddocks" });
}

export function openIssueDetails(issueId: string): void {
  setPrefillOnce(PREFILL_SELECTED_ISSUE_ID_KEY, issueId);
  navigate({ view: "issues" });
}

export function openWaterAssetDetails(waterAssetId: string): void {
  setPrefillOnce(PREFILL_SELECTED_WATER_ASSET_ID_KEY, waterAssetId);
  navigate({ view: "water" });
}

export function openFeederDetails(feederId: string): void {
  setPrefillOnce(PREFILL_FEED_TAB_KEY, "feeders");
  setPrefillOnce(PREFILL_SELECTED_FEEDER_ID_KEY, feederId);
  navigate({ view: "feed" });
}

export function openTaskDetails(taskId: string): void {
  setPrefillOnce(PREFILL_SELECTED_TASK_ID_KEY, taskId);
  navigate({ view: "tasks" });
}

export function openPestSpottingDetails(pestSpottingId: string): void {
  setPrefillOnce(PREFILL_SELECTED_PEST_ID_KEY, pestSpottingId);
  navigate({ view: "pests" });
}
