import Link from "next/link";
import { RelayEnrollCard } from "@/components/relay/relay-enroll-card";
import { WorkspaceSetupChecklist } from "@/components/setup/workspace-setup-checklist";
import { Card, PageHeading } from "@/components/ui/page-section";
import { readActor } from "@/lib/auth/require-actor";
import { loadSetupChecklist } from "@/lib/setup/setup-checklist";

export const dynamic = "force-dynamic";

export default async function SetupPage() {
  const [viewer, checklist] = await Promise.all([readActor(), loadSetupChecklist()]);
  if (!viewer) return null;

  return (
    <>
      <PageHeading
        title="Set up MKTTool on this PC"
        description="One resumable setup state, one next action. This page never shows or asks you to copy a token, key, device ID, port, or file path."
      />
      <RelayEnrollCard
        viewer={{ userId: viewer.userId, email: viewer.email, isAdmin: viewer.role === "ADMIN" }}
      />
      <WorkspaceSetupChecklist checklist={checklist} isAdmin={viewer.role === "ADMIN"} />
      <Card title="Technical support">
        <p className="text-sm text-neutral-600 dark:text-neutral-400">
          The existing support pages remain available during the transition.
        </p>
        <div className="mt-3 flex flex-wrap gap-4 text-sm">
          <Link href="/relay-download" className="underline">Windows download support</Link>
          <Link href="/relay-devices" className="underline">Device registry support</Link>
        </div>
      </Card>
    </>
  );
}
