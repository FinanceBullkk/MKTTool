"use client";

import { useEffect } from "react";
import { CircleAlert, Plus, ShieldCheck, X } from "lucide-react";
import { Field, SelectField, TextareaField } from "@/components/ui/form-controls";
import { Disclosure } from "@/components/ui/page-section";
import { AccountVaultForm } from "@/components/vault/account-vault-form";
import { VaultSecretField } from "@/components/vault/vault-secret-field";
import { createAccount } from "@/lib/accounts/vault-create-actions";
import { defaultColdStartDayKey } from "@/lib/accounts/account-status";

export interface FreeProxyOption {
  id: string;
  label: string;
  host: string;
  port: number;
  country: string;
  type: string;
}

export interface DeviceOption {
  id: string;
  name: string;
}

export function NewTikTokProfileSheet({
  isOpen,
  onClose,
  freeProxies,
  devices,
}: {
  isOpen: boolean;
  onClose: () => void;
  freeProxies: FreeProxyOption[];
  devices: DeviceOption[];
}) {
  const defaultColdDate = defaultColdStartDayKey();

  useEffect(() => {
    function handleKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape" && isOpen) onClose();
    }
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [isOpen, onClose]);

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-end bg-black/70 backdrop-blur-sm transition-opacity">
      <button
        type="button"
        className="absolute inset-0 cursor-default"
        onClick={onClose}
        aria-label="Close create TikTok nick dialog"
      />

      {/* Slide-in Sheet */}
      <div
        role="dialog"
        aria-modal="true"
        aria-label="Create TikTok nick"
        className="relative z-10 flex h-full w-full max-w-xl flex-col overflow-y-auto border-l border-white/[0.08] bg-[#0d0f12] p-5 shadow-2xl sm:p-6">
        <div>
          <div className="mb-6 flex items-start justify-between gap-4 border-b border-white/[0.07] pb-4">
            <div className="flex items-start gap-3">
              <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border border-amber-300/20 bg-amber-300/[0.08] text-amber-200">
                <Plus size={18} aria-hidden="true" />
              </div>
              <div>
                <h2 className="text-lg font-semibold tracking-tight text-white">Create TikTok nick</h2>
                <p className="mt-1 max-w-md text-xs leading-5 text-neutral-400">
                  Add the identity record first. Browser setup remains a separate local step.
                </p>
              </div>
            </div>
            <button
              type="button"
              onClick={onClose}
              className="flex min-h-11 min-w-11 items-center justify-center rounded-xl border border-white/[0.08] text-neutral-400 transition-colors hover:bg-white/[0.06] hover:text-white"
              aria-label="Close dialog"
            >
              <X size={18} aria-hidden="true" />
            </button>
          </div>

          <AccountVaultForm action={createAccount} submitLabel="Create TikTok nick">
            <input type="hidden" name="platform" value="TIKTOK" />
            <input type="hidden" name="status" value="COLD_START" />

            <div className="space-y-5 sm:col-span-2">
              <div className="grid gap-4 sm:grid-cols-2">
                <Field label="Nick username" name="username" required placeholder="@review_channel" />
                {freeProxies.length > 0 ? (
                  <SelectField
                    label="Static proxy / 4G IP"
                    name="proxyId"
                    required
                    options={freeProxies.map((proxy) => ({
                      value: proxy.id,
                      label: `${proxy.label} - ${proxy.country}`,
                    }))}
                  />
                ) : (
                  <div className="flex min-h-11 items-start gap-3 rounded-xl border border-amber-400/20 bg-amber-400/[0.06] p-3 text-xs leading-5 text-amber-200 sm:col-span-2">
                    <CircleAlert size={16} className="mt-0.5 shrink-0" aria-hidden="true" />
                    No free proxy is available. Add one in Proxy vault before creating this nick.
                  </div>
                )}
                {devices.length > 0 ? (
                  <SelectField
                    label="Relay PC"
                    name="deviceId"
                    hint="Optional until the local browser profile is created."
                    options={devices.map((device) => ({ value: device.id, label: device.name }))}
                  />
                ) : null}
                <Field label="Writing voice" name="voice" placeholder="Honest, practical reviewer" />
                <Field label="Content focus" name="contentAngle" placeholder="Home goods" />
                <Field
                  label="Cold-start until"
                  name="coldStartUntil"
                  type="date"
                  defaultValue={defaultColdDate}
                  hint="Keep sign-in and early activity human-controlled."
                />
                <TextareaField
                  label="Initial notes"
                  name="purchaseNote"
                  rows={2}
                  placeholder="Source, device, and operating context"
                />
              </div>

              <Disclosure summary="Add secure sign-in details" icon={ShieldCheck}>
                <div className="grid gap-4 sm:grid-cols-2">
                  <p className="text-xs leading-5 text-amber-200 sm:col-span-2">
                    Authorized operators only. Sign-in, OTP, and CAPTCHA remain manual inside the
                    browser profile.
                  </p>
                  <Field label="Original email" name="emailAddress" type="email" />
                  <VaultSecretField label="Nick password" name="password" type="password" />
                  <VaultSecretField label="Email password" name="emailPassword" type="password" />
                  <VaultSecretField label="2FA secret" name="totpSecret" />
                </div>
              </Disclosure>
            </div>
          </AccountVaultForm>
        </div>
      </div>
    </div>
  );
}
