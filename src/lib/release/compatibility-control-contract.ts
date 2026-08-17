import { z } from "zod";
import type { CompatibilityManifest } from "./compatibility-manifest-schema";

const controlContractSchema = z
  .object({
    schemaVersion: z.literal(1),
    type: z.literal("mktbrowser.windows-control-contract"),
    appVersion: z.string().min(1),
    contractVersion: z.number().int().positive(),
    profileSchemaVersion: z.number().int().positive(),
  })
  .strict();

export function validateCompatibilityControlContract(
  raw: string,
  manifest: CompatibilityManifest,
): void {
  let contract: z.infer<typeof controlContractSchema>;
  try {
    contract = controlContractSchema.parse(JSON.parse(raw));
  } catch {
    throw new Error("The control-contract artifact is not valid JSON.");
  }
  if (
    contract.appVersion !== manifest.artifacts.browser.version ||
    contract.contractVersion !== manifest.artifacts.controlContract.contractVersion ||
    contract.profileSchemaVersion !== manifest.artifacts.browser.profileSchemaVersion
  ) {
    throw new Error("The control-contract artifact does not match the compatibility tuple.");
  }
}
