import { z } from "zod";

export const sensorReadingListQuerySchema = z.object({
  nodeId: z.string().uuid().optional(),
  sensorId: z.string().uuid().optional(),
  from: z.string().datetime().optional(),
  to: z.string().datetime().optional(),
  limit: z.coerce.number().int().positive().max(1000).optional(),
  order: z.enum(["asc", "desc"]).optional(),
});

export type SensorReadingListQuery = z.infer<typeof sensorReadingListQuerySchema>;
