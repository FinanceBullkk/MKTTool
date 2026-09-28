"use client";

import { useCallback, useEffect, useState } from "react";
import {
  completeBootstrap,
  mintBootstrapAuthorization,
} from "@/lib/enrollment/bootstrap-actions";
import {
  authorizeBootstrap,
  readBootstrapCompletion,
} from "@/lib/relay/relay-browser-client";
import type { BootstrapCompletionReply } from "@/lib/relay/relay-endpoints";

type BootstrapCompletionData = Pick<
  BootstrapCompletionReply,
  "grantId" | "generation" | "proof" | "keyFingerprint"
>;

interface SelfEnrollmentOptions {
  deviceId: string | null;
  onMessage: (message: string | null) => void;
  onReady: () => void;
}

export function useOperatorKeySelfEnrollment({
  deviceId,
  onMessage,
  onReady,
}: SelfEnrollmentOptions) {
  const [busy, setBusy] = useState(false);

  const commit = useCallback(async (completion: BootstrapCompletionData) => {
    if (
      !deviceId ||
      !completion.grantId ||
      !completion.generation ||
      !completion.proof ||
      !completion.keyFingerprint
    ) {
      onMessage("Relay returned incomplete operator-key verification data. Authorize key entry again.");
      return false;
    }
    const form = new FormData();
    form.set("deviceId", deviceId);
    form.set("grantId", completion.grantId);
    form.set("generation", String(completion.generation));
    form.set("proof", completion.proof);
    form.set("keyFingerprint", completion.keyFingerprint);
    const result = await completeBootstrap(null, form);
    onMessage(result.message);
    if (result.ok) onReady();
    return result.ok;
  }, [deviceId, onMessage, onReady]);

  useEffect(() => {
    const receive = (event: MessageEvent) => {
      if (event.origin !== "http://127.0.0.1:47821") return;
      const data = event.data as Record<string, unknown>;
      if (data.type !== "mkttool-bootstrap-complete") return;
      setBusy(true);
      void commit({
        grantId: String(data.grantId ?? ""),
        generation: Number(data.generation),
        proof: String(data.proof ?? ""),
        keyFingerprint: String(data.keyFingerprint ?? ""),
      }).finally(() => setBusy(false));
    };
    window.addEventListener("message", receive);
    return () => window.removeEventListener("message", receive);
  }, [commit]);

  const start = useCallback(async () => {
    if (!deviceId || busy) return;
    setBusy(true);
    onMessage(null);
    const relayPage = window.open("http://127.0.0.1:47821", "mkttool-operator-key");
    try {
      const cached = await readBootstrapCompletion();
      if (cached.status === "ok" && await commit(cached.data)) {
        relayPage?.close();
        return;
      }

      const form = new FormData();
      form.set("deviceId", deviceId);
      const minted = await mintBootstrapAuthorization(null, form);
      if (!minted.ok || !("authorization" in minted) || !minted.authorization) {
        onMessage(minted.message);
        relayPage?.close();
        return;
      }
      const local = await authorizeBootstrap(minted.authorization);
      if (local.status !== "ok") {
        onMessage(local.message);
        relayPage?.close();
        return;
      }
      onMessage("Open the team Vaultwarden item, then paste the operator key only into Relay.");
      if (relayPage) relayPage.location.href = "http://127.0.0.1:47821";
    } finally {
      setBusy(false);
    }
  }, [busy, commit, deviceId, onMessage]);

  return { busy, start };
}
