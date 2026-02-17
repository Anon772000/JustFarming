import { Router } from "express";
import { asyncHandler } from "../../shared/http/async-handler";
import { ContractorController } from "./contractor.controller";

export const contractorRouter = Router();

contractorRouter.get("/", asyncHandler(ContractorController.list));
contractorRouter.get("/:contractorId", asyncHandler(ContractorController.get));
contractorRouter.post("/", asyncHandler(ContractorController.create));
contractorRouter.patch("/:contractorId", asyncHandler(ContractorController.update));
contractorRouter.delete("/:contractorId", asyncHandler(ContractorController.remove));
