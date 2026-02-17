import { z } from "zod";

export const userRoleSchema = z.enum(["manager", "worker"]);

export const createUserSchema = z.object({
  id: z.string().uuid().optional(),
  farmId: z.string().uuid(),
  email: z.string().email().max(254),
  password: z.string().min(8).max(200),
  displayName: z.string().min(1).max(120),
  role: userRoleSchema.optional(),
});

export const updateUserSchema = z
  .object({
    password: z.string().min(8).max(200).optional(),
    displayName: z.string().min(1).max(120).optional(),
    role: userRoleSchema.optional(),
    disabled: z.boolean().optional(),
  })
  .strict();

export type CreateUserInput = z.infer<typeof createUserSchema>;
export type UpdateUserInput = z.infer<typeof updateUserSchema>;
