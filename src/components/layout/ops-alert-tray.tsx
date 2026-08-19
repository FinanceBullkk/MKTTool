import { readActor } from "@/lib/auth/require-actor";
import { collectOpsAlerts } from "@/lib/ops-alerts/collect-ops-alerts";
import { OpsAlertTrayClient } from "./ops-alert-tray-client";

export async function OpsAlertTray() {
  const actor = await readActor();
  if (!actor) return null;

  const alerts = collectOpsAlerts(actor.role);
  if (alerts.length === 0) return null;

  return <OpsAlertTrayClient alerts={alerts} />;
}
