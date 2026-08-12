"use client";

import { useEffect, useState } from "react";
import { authorizeBootstrap, readBootstrapCompletion } from "@/lib/relay/relay-browser-client";
import { completeBootstrap, mintBootstrapAuthorization } from "@/lib/enrollment/bootstrap-actions";

export function AdminBootstrapButton({ deviceId, onReady }: { deviceId: string; onReady: () => void }) {
  const [message, setMessage] = useState<string | null>(null);

  useEffect(() => {
    const receive = (event: MessageEvent) => {
      if (event.origin !== "http://127.0.0.1:47821") return;
      const data = event.data as Record<string, unknown>;
      if (data.type !== "mkttool-bootstrap-complete") return;
      const form = new FormData();
      form.set("deviceId", deviceId);
      form.set("grantId", String(data.grantId ?? ""));
      form.set("generation", String(data.generation ?? ""));
      form.set("proof", String(data.proof ?? ""));
      void completeBootstrap(null, form).then((result) => {
        setMessage(result.message);
        if (result.ok) onReady();
      });
    };
    window.addEventListener("message", receive);
    return () => window.removeEventListener("message", receive);
  }, [deviceId, onReady]);

  async function start() {
    const relayPage = window.open("http://127.0.0.1:47821", "mkttool-bootstrap");
    const cached = await readBootstrapCompletion();
    if (cached.status === "ok" && cached.data.grantId && cached.data.generation && cached.data.proof) {
      const completion = new FormData();
      completion.set("deviceId", deviceId);
      completion.set("grantId", cached.data.grantId);
      completion.set("generation", String(cached.data.generation));
      completion.set("proof", cached.data.proof);
      const committed = await completeBootstrap(null, completion);
      setMessage(committed.message);
      if (committed.ok) {
        onReady();
        relayPage?.close();
      }
      return;
    }
    const form = new FormData();
    form.set("deviceId", deviceId);
    const minted = await mintBootstrapAuthorization(null, form);
    if (!minted.ok || !("authorization" in minted) || !minted.authorization) {
      setMessage(minted.message);
      relayPage?.close();
      return;
    }
    const local = await authorizeBootstrap(minted.authorization);
    if (local.status !== "ok") {
      setMessage(local.message);
      relayPage?.close();
      return;
    }
    setMessage("Bootstrap authorized. Enter the operator key only in the Relay window.");
    if (relayPage) relayPage.location.href = "http://127.0.0.1:47821";
  }

  return (
    <div className="mt-3">
      <button type="button" onClick={start} className="rounded-md border px-3 py-2 text-sm font-medium">
        Start first-device bootstrap
      </button>
      {message ? <p className="mt-2 text-sm text-neutral-600">{message}</p> : null}
    </div>
  );
}
