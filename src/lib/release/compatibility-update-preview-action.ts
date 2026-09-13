"use server";

import { z } from "zod";
import { firstError, formToObject } from "@/lib/accounts/vault-form-schemas";
import type { ActionResult } from "@/lib/actions/action-result";
import { adminAction } from "@/lib/auth/guarded-action";
import { prisma } from "@/lib/db/prisma-client";
import {
  compatibilitySequenceForFrom,
  readRelayCompatibilityRelease,
} from "@/lib/relay/relay-compatibility-manifest-file";
import { RELAY_VERSION } from "@/lib/relay/relay-endpoints";

const requestSchema = z.object({
  deviceId: z.string().min(1, "Device is required."),
  currentSequence: z.coerce.number().int().nonnegative().default(0),
});

export interface CompatibilityUpdatePreviewResult extends ActionResult {
  targetSequence?: number;
  targetRelayVersion?: string;
  targetBrowserVersion?: string;
}

export const previewCompatibilityUpdate = adminAction(
  async function previewCompatibilityUpdate(
    _actor,
    _previous: CompatibilityUpdatePreviewResult | null,
    formData: FormData,
  ): Promise<CompatibilityUpdatePreviewResult> {
    const parsed = requestSchema.safeParse(formToObject(formData));
    if (!parsed.success) return { ok: false, message: firstError(parsed.error) };

    try {
      const [device, release] = await Promise.all([
        prisma.relayDevice.findUnique({
          where: { id: parsed.data.deviceId },
          select: { revokedAt: true },
        }),
        readRelayCompatibilityRelease(
          RELAY_VERSION,
          compatibilitySequenceForFrom(parsed.data.currentSequence),
        ),
      ]);
      if (!device) return { ok: false, message: "This PC is not registered." };
      if (device.revokedAt) {
        return { ok: false, message: "A revoked PC cannot receive a compatibility update." };
      }

      const target = release.manifest.manifest;
      return {
        ok: true,
        message: `Compatibility sequence ${target.sequence} is available.`,
        targetSequence: target.sequence,
        targetRelayVersion: target.artifacts.relay.version,
        targetBrowserVersion: target.artifacts.browser.version,
      };
    } catch (error) {
      return {
        ok: false,
        message: `Compatibility update preview failed: ${(error as Error).message}`,
      };
    }
  },
);
