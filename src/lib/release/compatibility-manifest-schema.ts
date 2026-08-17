import { z } from "zod";

const SHA256 = /^[0-9a-f]{64}$/;
const KEY_ID = SHA256;

const immutableArtifactSchema = z
  .object({
    version: z.string().trim().min(1).max(80),
    sha256: z.string().regex(SHA256),
    sizeBytes: z.number().int().positive().safe(),
    url: z
      .url()
      .refine((value) => {
        const url = new URL(value);
        return (
          url.protocol === "https:" &&
          url.username === "" &&
          url.password === "" &&
          url.search === "" &&
          url.hash === ""
        );
      }, "Artifact URLs must be immutable HTTPS URLs without credentials, query, or fragment."),
  })
  .strict();

export const compatibilityManifestSchema = z
  .object({
    schemaVersion: z.literal(1),
    type: z.literal("mkttool.windows.compatibility-manifest"),
    sequence: z.number().int().positive().safe(),
    channel: z.enum(["pilot", "team"]),
    platform: z.literal("windows-x64"),
    issuedAt: z.iso.datetime({ offset: true }),
    expiresAt: z.iso.datetime({ offset: true }),
    delegatedKeyId: z.string().regex(KEY_ID),
    transition: z
      .object({
        fromSequences: z.array(z.number().int().nonnegative().safe()).min(1).max(16),
        retainedSequence: z.number().int().positive().safe().nullable(),
      })
      .strict(),
    artifacts: z
      .object({
        installer: immutableArtifactSchema.extend({ kind: z.literal("installer") }).strict(),
        relay: immutableArtifactSchema
          .extend({
            kind: z.literal("relay"),
            supportedBrowserContract: z
              .object({ min: z.number().int().positive(), max: z.number().int().positive() })
              .strict(),
            secureStoreSchemaVersion: z.number().int().positive(),
          })
          .strict(),
        browser: immutableArtifactSchema
          .extend({
            kind: z.literal("browser"),
            contractVersion: z.number().int().positive(),
            profileSchemaVersion: z.number().int().positive(),
            engineKind: z.string().trim().min(1).max(80),
          })
          .strict(),
        controlContract: immutableArtifactSchema
          .extend({ kind: z.literal("control-contract"), contractVersion: z.number().int().positive() })
          .strict(),
        engine: immutableArtifactSchema
          .extend({ kind: z.literal("engine"), engineKind: z.string().trim().min(1).max(80) })
          .strict(),
      })
      .strict(),
  })
  .strict();

export const signedDelegationSchema = z
  .object({
    schemaVersion: z.literal(1),
    type: z.literal("mkttool.release-delegation"),
    rootKeyId: z.string().regex(KEY_ID),
    signedAt: z.iso.datetime({ offset: true }),
    delegation: z
      .object({
        schemaVersion: z.literal(1),
        type: z.literal("mkttool.release-delegation-request"),
        scope: z.literal("mkttool.windows.compatibility-manifest"),
        label: z.string().trim().min(1).max(120),
        delegatedKeyId: z.string().regex(KEY_ID),
        delegatedPublicKeyHex: z.string().regex(/^[0-9a-f]{64}$/),
        createdAt: z.iso.datetime({ offset: true }),
        notBefore: z.iso.datetime({ offset: true }),
        expiresAt: z.iso.datetime({ offset: true }),
        nonce: z.string().trim().min(16).max(120),
      })
      .strict(),
    signature: z.string().trim().min(80).max(120),
  })
  .strict();

export const signedCompatibilityManifestSchema = z
  .object({
    schemaVersion: z.literal(1),
    type: z.literal("mkttool.signed-windows-compatibility-manifest"),
    signedAt: z.iso.datetime({ offset: true }),
    delegation: signedDelegationSchema,
    manifest: compatibilityManifestSchema,
    signature: z.string().trim().min(80).max(120),
  })
  .strict();

export const signedDelegationRevocationSchema = z
  .object({
    schemaVersion: z.literal(1),
    type: z.literal("mkttool.release-delegation-revocation"),
    rootKeyId: z.string().regex(KEY_ID),
    delegatedKeyId: z.string().regex(KEY_ID),
    revokedAt: z.iso.datetime({ offset: true }),
    reason: z.string().trim().min(1).max(240),
    signature: z.string().trim().min(80).max(120),
  })
  .strict();

export type CompatibilityManifest = z.infer<typeof compatibilityManifestSchema>;
export type SignedCompatibilityManifest = z.infer<typeof signedCompatibilityManifestSchema>;
export type SignedDelegation = z.infer<typeof signedDelegationSchema>;
export type SignedDelegationRevocation = z.infer<typeof signedDelegationRevocationSchema>;
