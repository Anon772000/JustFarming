import { z } from "zod";

export const createContractorSchema = z.object({
  id: z.string().uuid().optional(),
  farmId: z.string().uuid(),
  name: z.string().min(1).max(120),
  specialty: z.string().max(120).optional(),
  phone: z.string().max(60).optional(),
  email: z.string().max(160).optional(),
  notes: z.string().max(2000).optional(),
});

export const updateContractorSchema = z.object({
  name: z.string().min(1).max(120).optional(),
  specialty: z.string().max(120).nullable().optional(),
  phone: z.string().max(60).nullable().optional(),
  email: z.string().max(160).nullable().optional(),
  notes: z.string().max(2000).nullable().optional(),
});

export type CreateContractorInput = z.infer<typeof createContractorSchema>;
export type UpdateContractorInput = z.infer<typeof updateContractorSchema>;
