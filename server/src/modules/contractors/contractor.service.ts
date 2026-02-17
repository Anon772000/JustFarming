import { Prisma } from "@prisma/client";
import { prisma } from "../../shared/db/prisma";
import { ApiError } from "../../shared/http/api-error";
import { syncWriter } from "../../shared/sync/sync-writer";
import { CreateContractorInput, UpdateContractorInput } from "./contractor.dto";

const ENTITY_TYPE = "contractors";

export class ContractorService {
  static async list(farmId: string) {
    return prisma.contractor.findMany({
      where: { farmId },
      orderBy: { name: "asc" },
    });
  }

  static async get(farmId: string, contractorId: string) {
    const contractor = await prisma.contractor.findFirst({
      where: { id: contractorId, farmId },
    });

    if (!contractor) {
      throw new ApiError(404, "Contractor not found");
    }

    return contractor;
  }

  static async create(input: CreateContractorInput) {
    return prisma.$transaction(async (tx) => {
      const data: Prisma.ContractorCreateInput = {
        id: input.id,
        farm: { connect: { id: input.farmId } },
        name: input.name,
        specialty: input.specialty,
        phone: input.phone,
        email: input.email,
        notes: input.notes,
      };

      const contractor = await tx.contractor.create({ data });

      await syncWriter.recordChange(tx, {
        farmId: input.farmId,
        entityType: ENTITY_TYPE,
        entityId: contractor.id,
        operation: "CREATE",
        payload: contractor,
      });

      return contractor;
    });
  }

  static async update(farmId: string, contractorId: string, input: UpdateContractorInput) {
    await this.get(farmId, contractorId);

    return prisma.$transaction(async (tx) => {
      const contractor = await tx.contractor.update({
        where: { id: contractorId },
        data: {
          name: input.name,
          specialty: input.specialty,
          phone: input.phone,
          email: input.email,
          notes: input.notes,
        },
      });

      await syncWriter.recordChange(tx, {
        farmId,
        entityType: ENTITY_TYPE,
        entityId: contractor.id,
        operation: "UPDATE",
        payload: contractor,
      });

      return contractor;
    });
  }

  static async remove(farmId: string, contractorId: string) {
    await this.get(farmId, contractorId);

    await prisma.$transaction(async (tx) => {
      await tx.contractor.delete({ where: { id: contractorId } });

      await syncWriter.recordTombstone(tx, {
        farmId,
        entityType: ENTITY_TYPE,
        entityId: contractorId,
      });
    });
  }
}
