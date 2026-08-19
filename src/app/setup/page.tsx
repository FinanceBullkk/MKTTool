import { readActor } from "@/lib/auth/require-actor";
import { loadSetupChecklist } from "@/lib/setup/setup-checklist";
import { readWindowsInstallerRelease } from "@/lib/setup/windows-installer-release";
import { formatFileSize } from "@/lib/relay/relay-release-file";
import { RelayEnrollCard } from "@/components/relay/relay-enroll-card";
import { WorkspaceSetupChecklist } from "@/components/setup/workspace-setup-checklist";
import { OnboardingStepper } from "@/components/setup/onboarding-stepper";

export const dynamic = "force-dynamic";

export default async function SetupPage() {
  const [viewer, checklist, installer] = await Promise.all([
    readActor(),
    loadSetupChecklist(),
    readWindowsInstallerRelease(),
  ]);

  if (!viewer) return null;

  const size = installer.available && installer.sizeBytes ? formatFileSize(installer.sizeBytes) : "139.4 MB";
  const downloadUrl = "/api/setup/windows-installer";

  return (
    <OnboardingStepper
      viewer={{ userId: viewer.userId, email: viewer.email, isAdmin: viewer.role === "ADMIN" }}
      checklist={checklist}
      installerDownloadUrl={downloadUrl}
      installerSize={size}
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
