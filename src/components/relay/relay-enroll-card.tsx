"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { SetupPrimaryStateCard } from "@/components/setup/setup-primary-state-card";
import { SetupSupportDetails } from "@/components/setup/setup-support-details";
import { configureRelay, receiveOperatorKey } from "@/lib/relay/relay-browser-client";
import type { RelayHealth } from "@/lib/relay/relay-endpoints";
import { probeSetupRelay } from "@/lib/setup/setup-relay-probe";
import { reconcileSavedSetupDevice } from "@/lib/setup/reconcile-saved-setup-device";
import {
  setupStateMachine,
  type SetupDeviceRegistry,
  type SetupRelayHealth,
} from "@/lib/setup/setup-state-machine";
import { currentSetupUpdateState } from "@/lib/setup/setup-update-state";
import { AdminBootstrapButton } from "@/components/setup/admin-bootstrap-button";
import { enrollThisMachine } from "@/lib/tickets/relay-enrollment-actions";
import {
  completeOperatorKeyDelivery,
  readOperatorKeyDelivery,
} from "@/lib/enrollment/operator-key-delivery-actions";

const POLL_MS = 10_000;
const STARTING_RETRY_MS = 5_000;

export function RelayEnrollCard({
  viewer,
}: {
  viewer: { userId: string; email: string; isAdmin: boolean };
}) {
  const [relay, setRelay] = useState<SetupRelayHealth>({ status: "unchecked" });
  const [device, setDevice] = useState<SetupDeviceRegistry>({ status: "unknown" });
  const [health, setHealth] = useState<RelayHealth | null>(null);
  const [busy, setBusy] = useState(false);
  const [detail, setDetail] = useState<string | null>(null);
  const delivering = useRef(false);
  const verdict = setupStateMachine({ session: { status: "signed-in", ...viewer }, device, relay,
    update: currentSetupUpdateState(relay) });
  const markReady = useCallback(() => {
    setDevice((current) => ({ ...current, operatorKeyReady: true }));
    setHealth((current) => (current ? { ...current, configured: true } : current));
    setRelay((current) => current.status === "responded"
      ? { status: "responded", health: { ...current.health, configured: true } } : current);
  }, []);

  const deliverGrant = useCallback(async (deviceId: string) => {
    if (delivering.current) return;
    delivering.current = true;
    try {
      const form = new FormData();
      form.set("deviceId", deviceId);
      const waiting = await readOperatorKeyDelivery(null, form);
      if (!waiting.ok) {
        setDetail(waiting.message);
        return;
      }
      if (!("delivery" in waiting) || !waiting.delivery) return;
      const stored = await receiveOperatorKey(waiting.delivery);
      if (stored.status !== "ok") {
        setDetail(stored.message);
        return;
      }
      if (!stored.data.grantId || !stored.data.generation || !stored.data.proof) {
        setDetail("Relay stored the grant but returned incomplete completion data. Check this PC again.");
        return;
      }
      const completion = new FormData();
      completion.set("deviceId", deviceId);
      completion.set("grantId", stored.data.grantId);
      completion.set("generation", String(stored.data.generation));
      completion.set("proof", stored.data.proof);
      const committed = await completeOperatorKeyDelivery(null, completion);
      if (!committed.ok) {
        setDetail(committed.message);
        return;
      }
      setDetail(null);
      markReady();
    } finally {
      delivering.current = false;
    }
  }, [markReady]);

  useEffect(() => {
    let cancelled = false;
    const savedDeviceId = window.localStorage.getItem("mkttool.setup.device-id");
    if (!savedDeviceId) return;

    void probeSetupRelay()
      .then((probed) => {
        if (cancelled) return;
        setRelay(probed.relay);
        setHealth(probed.health);
        if (probed.detail) setDetail(probed.detail);
        if (!probed.device) return;

        setDevice(probed.device);
        const liveDeviceId = probed.health?.deviceId ?? null;
        const reconciliation = reconcileSavedSetupDevice({
          savedDeviceId,
          liveDeviceId,
          device: probed.device,
          viewerUserId: viewer.userId,
        });
        if (reconciliation.storage === "clear") {
          window.localStorage.removeItem("mkttool.setup.device-id");
        } else if (reconciliation.storage === "replace") {
          window.localStorage.setItem("mkttool.setup.device-id", reconciliation.deviceId);
        }

        const safeToResume =
          probed.device.status === "enrolled" &&
          probed.device.ownerUserId === viewer.userId &&
          !probed.device.revoked &&
          !probed.device.conflict;
        if (safeToResume && liveDeviceId) void deliverGrant(liveDeviceId);
      })
      .catch(() => {
        if (cancelled) return;
        setRelay({ status: "unreachable" });
        setHealth(null);
        setDevice({ status: "inspection-failed" });
        setDetail("MKTTool could not verify this PC safely.");
      });

    return () => {
      cancelled = true;
    };
  }, [deliverGrant, viewer.userId]);

  async function saveEnrollmentToRelay(currentHealth: RelayHealth) {
    const enrollmentForm = new FormData();
    enrollmentForm.set("name", currentHealth.machineName || "This Windows PC");
    enrollmentForm.set("publicKey", currentHealth.publicKey);
    const enrolled = await enrollThisMachine(null, enrollmentForm);
    const enrollment = "enrollment" in enrolled ? enrolled.enrollment : undefined;
    if (!enrolled.ok || !enrollment) {
      setDevice({ status: "inspection-failed" });
      setRelay({ status: "responded", health: currentHealth });
      setDetail("MKTTool could not register this PC safely. An administrator must inspect the device record.");
      return;
    }

    const configured = await configureRelay(enrollment);
    if (configured.status !== "ok") {
      setDevice({ status: "enrolled", ownerUserId: viewer.userId, operatorKeyReady: false });
      setRelay({ status: "responded", health: currentHealth });
      setDetail("Registration was saved, but local configuration did not finish. Confirm this PC again.");
      return;
    }

    const nextDevice = { status: "enrolled", ownerUserId: viewer.userId, operatorKeyReady: false } as const;
    const nextHealth = { ...currentHealth, deviceId: enrollment.deviceId };
    window.localStorage.setItem("mkttool.setup.device-id", enrollment.deviceId);
    setDevice(nextDevice);
    setHealth(nextHealth);
    setRelay({ status: "responded", health: nextHealth });
    void deliverGrant(enrollment.deviceId);
  }

  async function confirmThisPc() {
    setBusy(true);
    setDetail(null);
    setRelay({ status: "checking" });
    const probed = await probeSetupRelay();
    setRelay(probed.relay);
    setHealth(probed.health);
    const registry = probed.device;
    if (!registry) {
      setDetail(probed.detail ?? "This PC could not be checked.");
      setBusy(false);
      return;
    }

    if (registry.status === "not-enrolled") {
      setDevice(registry);
      setBusy(false);
      return;
    }

    setDevice(registry);
    if (!registry.conflict && probed.health && !probed.health.deviceId) {
      await saveEnrollmentToRelay(probed.health);
      setBusy(false);
      return;
    }
    setBusy(false);
    if (
      probed.health?.deviceId &&
      registry.status === "enrolled" &&
      registry.ownerUserId === viewer.userId &&
      !registry.revoked &&
      !registry.conflict
    ) {
      window.localStorage.setItem("mkttool.setup.device-id", probed.health.deviceId);
      void deliverGrant(probed.health.deviceId);
    }
  }

  async function bindThisPc() {
    if (!health) return;
    setBusy(true);
    setDetail(null);
    try {
      const registry = device;
      if (registry.status !== "not-enrolled") return;
      await saveEnrollmentToRelay(health);
    } catch {
      setDevice({ status: "inspection-failed" });
      setRelay({ status: "responded", health });
      setDetail("MKTTool could not register this PC safely. An administrator must inspect the device record.");
    } finally {
      setBusy(false);
    }
  }

  useEffect(() => {
    const deviceId = health?.deviceId;
    if (verdict.state !== "Waiting for administrator approval" || !deviceId) return;
    const timer = setInterval(() => void deliverGrant(deviceId), POLL_MS);
    return () => clearInterval(timer);
  }, [deliverGrant, health?.deviceId, verdict.state]);

  useEffect(() => {
    if (verdict.state !== "Starting" || relay.status !== "responded") return;
    const timer = setTimeout(() => {
      void probeSetupRelay().then((probed) => {
        setRelay(probed.relay);
        setHealth(probed.health);
        if (probed.device) setDevice(probed.device);
        if (probed.detail) setDetail(probed.detail);
      });
    }, STARTING_RETRY_MS);
    return () => clearTimeout(timer);
  }, [relay.status, verdict.state]);

  return (
    <div className="space-y-5">
      <SetupPrimaryStateCard
        verdict={verdict}
        health={health}
        email={viewer.email}
        busy={busy}
        detail={detail}
        onAction={verdict.action.kind === "CONFIRM" && health ? bindThisPc : confirmThisPc}
      />
      <SetupSupportDetails health={health} />
      {viewer.isAdmin && verdict.state === "Waiting for administrator approval" && health?.deviceId ? (
        <AdminBootstrapButton deviceId={health.deviceId} onReady={markReady} />
      ) : null}
    </div>
  );
}
