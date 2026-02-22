export type UUID = string;

export type PlanStatus = "DRAFT" | "PLANNED" | "IN_PROGRESS" | "COMPLETED" | "CANCELLED";

export interface Mob {
  id: UUID;
  farmId: UUID;
  name: string;
  species: "SHEEP" | "CATTLE" | "GOAT" | "MIXED";
  headCount: number;
  avgWeightKg?: string | null;
  currentPaddockId?: UUID | null;
  createdAt: string;
  updatedAt: string;
}

export interface MobPaddockAllocation {
  id: UUID;
  farmId: UUID;
  mobId: UUID;
  paddockId: UUID;
  headCount?: number | null;
  startedAt: string;
  endedAt?: string | null;
  notes?: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface MobMovementPlan {
  id: UUID;
  farmId: UUID;
  mobId: UUID;
  mob?: { id: UUID; name: string } | null;
  fromPaddockId?: UUID | null;
  toPaddockId: UUID;
  status: PlanStatus;
  plannedAt: string;
  actualAt?: string | null;
  reason?: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface Paddock {
  id: UUID;
  farmId: UUID;
  name: string;
  areaHa?: string | null;
  boundaryGeoJson?: unknown | null;
  currentStatus?: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface CropSeason {
  id: UUID;
  farmId: UUID;
  paddockId: UUID;
  seasonName: string;
  cropType: string;
  startDate: string;
  endDate?: string | null;
  targetYieldTons?: string | null;
  actualYieldTons?: string | null;
  notes?: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface PaddockPlan {
  id: UUID;
  farmId: UUID;
  paddockId: UUID;
  name: string;
  status: PlanStatus;
  plannedStart: string;
  plannedEnd?: string | null;
  actualStart?: string | null;
  actualEnd?: string | null;
  notes?: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface ProductionPlan {
  id: UUID;
  farmId: UUID;
  paddockId?: UUID | null;
  mobId?: UUID | null;
  planName: string;
  status: PlanStatus;
  targetMetric?: string | null;
  targetValue?: string | null;
  actualValue?: string | null;
  startDate: string;
  endDate?: string | null;
  notes?: string | null;
  createdAt: string;
  updatedAt: string;
}

export type WaterAssetType = "DAM" | "BORE" | "TROUGH" | "PIPE" | "VALVE" | "JUNCTION";

export interface WaterAsset {
  id: UUID;
  farmId: UUID;
  type: WaterAssetType;
  name: string;
  locationGeoJson?: unknown | null;
  capacityLitres?: string | null;
  metadataJson?: unknown | null;
  createdAt: string;
  updatedAt: string;
}

export interface WaterLink {
  id: UUID;
  farmId: UUID;
  fromAssetId: UUID;
  toAssetId: UUID;
  connectionType: string;
  diameterMm?: string | null;
  createdAt: string;
  updatedAt: string;
}


export interface Feeder {
  id: UUID;
  farmId: UUID;
  name: string;
  feederType: string;
  locationGeoJson?: unknown | null;
  capacityKg?: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface HayLot {
  id: UUID;
  farmId: UUID;
  lotCode: string;
  quantityTons: string;
  qualityGrade?: string | null;
  location?: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface GrainLot {
  id: UUID;
  farmId: UUID;
  lotCode: string;
  grainType: string;
  quantityTons: string;
  moisturePct?: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface FeedEvent {
  id: UUID;
  farmId: UUID;
  occurredAt: string;
  quantityKg: string;
  mobId?: UUID | null;
  paddockId?: UUID | null;
  feederId?: UUID | null;
  hayLotId?: UUID | null;
  grainLotId?: UUID | null;
  notes?: string | null;
  createdAt: string;
  updatedAt: string;
}


export interface Contractor {
  id: UUID;
  farmId: UUID;
  name: string;
  specialty?: string | null;
  phone?: string | null;
  email?: string | null;
  notes?: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface PestSpotting {
  id: UUID;
  farmId: UUID;
  paddockId?: UUID | null;
  pestType: string;
  severity?: string | null;
  locationGeoJson?: unknown | null;
  spottedAt: string;
  notes?: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface User {
  id: UUID;
  farmId: UUID;
  email: string;
  displayName: string;
  role: string;
  disabledAt?: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface LoraNode {
  id: UUID;
  farmId: UUID;
  name: string;
  devEui: string;
  locationGeoJson?: unknown | null;
  installedAt?: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface Sensor {
  id: UUID;
  nodeId: UUID;
  key: string;
  type: string;
  unit?: string | null;
  metadataJson?: unknown | null;
  createdAt: string;
  updatedAt: string;
}

export interface SensorReading {
  id: UUID;
  farmId: UUID;
  nodeId: UUID;
  sensorId: UUID;
  observedAt: string;
  numericValue: string;
  textValue?: string | null;
  rawPayloadJson?: unknown | null;
  createdAt: string;
}

export type IssueCategory = "GENERAL" | "DEAD_STOCK" | "LOW_WATER" | "LOW_FEED" | "FENCE" | "OTHER";

export type IssueStatus = "OPEN" | "TRIAGED" | "IN_PROGRESS" | "RESOLVED" | "CLOSED";

export interface Issue {
  id: UUID;
  farmId: UUID;
  category: IssueCategory;
  title: string;
  description?: string | null;
  status: IssueStatus;
  severity?: string | null;
  locationGeoJson?: unknown | null;
  paddockId?: UUID | null;
  mobId?: UUID | null;
  feederId?: UUID | null;
  waterAssetId?: UUID | null;
  createdById: UUID;
  createdAt: string;
  updatedAt: string;
  resolvedAt?: string | null;
}

export type TaskStatus = "OPEN" | "IN_PROGRESS" | "BLOCKED" | "DONE" | "CANCELLED";

export interface Task {
  id: UUID;
  farmId: UUID;
  title: string;
  description?: string | null;
  status: TaskStatus;
  dueAt?: string | null;
  paddockId?: UUID | null;
  mobId?: UUID | null;
  createdById: UUID;
  assignedToId?: UUID | null;
  completedAt?: string | null;
  createdAt: string;
  updatedAt: string;
}


export interface ActivityEvent {
  id: UUID;
  farmId: UUID;
  entityType: string;
  entityId: UUID;
  eventType: string;
  plannedAt?: string | null;
  actualAt?: string | null;
  payloadJson?: unknown | null;
  createdAt: string;
  updatedAt: string;
}

export type AttachmentEntityType =
  | "MOB"
  | "PADDOCK"
  | "CROP_SEASON"
  | "PADDOCK_PLAN"
  | "MOB_MOVEMENT_PLAN"
  | "PRODUCTION_PLAN"
  | "WATER_ASSET"
  | "LORA_NODE"
  | "SENSOR_READING"
  | "FEEDER"
  | "HAY_LOT"
  | "GRAIN_LOT"
  | "ISSUE"
  | "TASK"
  | "CONTRACTOR"
  | "PEST_SPOTTING"
  | "ACTIVITY_EVENT";

export interface Attachment {
  id: UUID;
  farmId: UUID;
  entityType: AttachmentEntityType;
  entityId: UUID;
  mediaType: string;
  mimeType: string;
  url: string;
  thumbnailUrl?: string | null;
  capturedAt?: string | null;
  createdById?: UUID | null;
  createdAt: string;
}


export interface ApiListResponse<T> {
  data: T[];
}

export interface ApiSingleResponse<T> {
  data: T;
}
