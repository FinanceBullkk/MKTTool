import { readActor } from "@/lib/auth/require-actor";
import { loadSetupChecklist } from "@/lib/setup/setup-checklist";
import { OnboardingStepper } from "@/components/setup/onboarding-stepper";
import { BrowserDownloadSection } from "@/components/setup/browser-download-section";
import { RelayDownloadSection } from "@/components/setup/relay-download-section";

export const dynamic = "force-dynamic";

export default async function SetupPage() {
  const [viewer, checklist] = await Promise.all([readActor(), loadSetupChecklist()]);

  if (!viewer) return null;

  return (
    <OnboardingStepper
      viewer={{ userId: viewer.userId, email: viewer.email, isAdmin: viewer.role === "ADMIN" }}
      checklist={checklist}
      browserDownloadSection={<BrowserDownloadSection />}
      relayDownloadSection={<RelayDownloadSection />}
    />
  );
}
