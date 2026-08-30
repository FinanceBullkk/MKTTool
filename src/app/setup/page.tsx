import { readActor } from "@/lib/auth/require-actor";
import { loadSetupChecklist } from "@/lib/setup/setup-checklist";
import { readWindowsInstallerRelease } from "@/lib/setup/windows-installer-release";
import { RelayEnrollCard } from "@/components/relay/relay-enroll-card";
import { WorkspaceSetupChecklist } from "@/components/setup/workspace-setup-checklist";
import { OnboardingStepper, type InstallerDisplayMetadata } from "@/components/setup/onboarding-stepper";

export const dynamic = "force-dynamic";

export default async function SetupPage() {
  const [viewer, checklist, installer] = await Promise.all([
    readActor(),
    loadSetupChecklist(),
    readWindowsInstallerRelease(),
  ]);

  if (!viewer) return null;

  const downloadUrl = "/api/setup/windows-installer";
  const installerRelease: InstallerDisplayMetadata = {
    available: installer.available,
    metadataComplete: installer.metadataComplete,
    metadataMissing: installer.metadataMissing,
    sizeBytes: installer.sizeBytes ?? null,
    version: installer.version,
    checksum: installer.checksum,
    bundledRelayVersion: installer.bundledRelayVersion,
    bundledRelaySha256: installer.bundledRelaySha256,
    payloadManifestSha256: installer.payloadManifestSha256,
    payloadFileCount: installer.payloadFileCount,
    candidateId: installer.candidateId,
    browserSourceSha: installer.browserSourceSha,
    browserSourceTree: installer.browserSourceTree,
    engineKind: installer.engineKind,
    engineChannel: installer.engineChannel,
    engineVersion: installer.engineVersion,
    engineSha256: installer.engineSha256,
    signingStatus: installer.signingStatus,
    signingExceptionExpiresAt: installer.signingExceptionExpiresAt,
  };

  return (
    <OnboardingStepper
      viewer={{ userId: viewer.userId, email: viewer.email, isAdmin: viewer.role === "ADMIN" }}
      checklist={checklist}
      installerDownloadUrl={downloadUrl}
      installerRelease={installerRelease}
      installerEvidenceHref="/api/release/provenance"
      enrollCard={
        <RelayEnrollCard
          viewer={{ userId: viewer.userId, email: viewer.email, isAdmin: viewer.role === "ADMIN" }}
        />
      }
      checklistView={
        <WorkspaceSetupChecklist checklist={checklist} isAdmin={viewer.role === "ADMIN"} />
      }
    />
  );
}
