"use client";

import { useEffect, useState } from "react";
import { AccountVaultForm } from "@/components/vault/account-vault-form";
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
  const [showAdvanced, setShowAdvanced] = useState(false);
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
    <div className="fixed inset-0 z-50 flex items-center justify-end bg-black/60 backdrop-blur-sm transition-opacity">
      {/* Backdrop click */}
      <div className="absolute inset-0" onClick={onClose} />

      {/* Slide-in Sheet */}
      <div
        role="dialog"
        aria-modal="true"
        aria-label="Create TikTok nick"
        className="relative z-10 h-full w-full max-w-lg overflow-y-auto bg-[#0d0e12] border-l border-white/[0.08] p-6 shadow-2xl flex flex-col justify-between animate-in slide-in-from-right duration-200">
        <div>
          {/* Header */}
          <div className="flex items-center justify-between pb-4 border-b border-white/[0.06] mb-6">
            <div className="flex items-center gap-2.5">
              <div className="w-8 h-8 rounded-lg bg-purple-500/10 border border-purple-500/20 flex items-center justify-center text-base text-purple-300">
                ➕
              </div>
              <div>
                <h2 className="text-base font-semibold text-white tracking-tight">Create TikTok nick</h2>
                <p className="text-xs text-neutral-400">
                  Save an identity-vault record. Its browser profile is separate local data on a
                  Relay PC and is not proof of identity isolation or posting approval.
                </p>
              </div>
            </div>
            <button
              type="button"
              onClick={onClose}
              className="p-1.5 rounded-lg text-neutral-400 hover:text-white hover:bg-white/[0.06] transition"
            >
              ✕
            </button>
          </div>

          <AccountVaultForm action={createAccount} submitLabel="Create TikTok nick">
            <input type="hidden" name="platform" value="TIKTOK" />
            <input type="hidden" name="status" value="COLD_START" />

            <div className="space-y-4 text-xs">
              {/* Nick username */}
              <div>
                <label className="block font-medium text-neutral-300 mb-1.5" htmlFor="username">
                  Nick username <span className="text-purple-400">*</span>
                </label>
                <input
                  type="text"
                  name="username"
                  id="username"
                  required
                  placeholder="Example: TikTok_Shop_01 or @review_channel"
                  className="w-full rounded-xl bg-white/[0.03] border border-white/[0.08] px-3.5 py-2 text-sm text-white placeholder:text-neutral-600 focus:border-purple-500/50 focus:bg-white/[0.05] focus:outline-none transition"
                />
              </div>

              {/* Gán Proxy */}
              <div>
                <label className="block font-medium text-neutral-300 mb-1.5" htmlFor="proxyId">
                  Assign proxy / 4G IP <span className="text-purple-400">*</span>
                </label>
                {freeProxies.length > 0 ? (
                  <select
                    name="proxyId"
                    id="proxyId"
                    required
                    className="w-full rounded-xl bg-[#14151b] border border-white/[0.08] px-3.5 py-2 text-sm text-white focus:border-purple-500/50 focus:outline-none transition"
                  >
                    <option value="">-- Select an available proxy --</option>
                    {freeProxies.map((proxy) => (
                      <option key={proxy.id} value={proxy.id}>
                        {proxy.label} ({proxy.host}:{proxy.port} - {proxy.country})
                      </option>
                    ))}
                  </select>
                ) : (
                  <div className="p-3 rounded-xl bg-amber-950/30 border border-amber-500/20 text-amber-300 text-xs">
                    ⚠️ No available proxies in the vault. Open <strong>Proxy</strong> and add one first.
                  </div>
                )}
              </div>

              {/* Relay PC */}
              {devices.length > 0 ? (
                <div>
                  <label className="block font-medium text-neutral-300 mb-1.5" htmlFor="deviceId">Relay PC</label>
                  <select
                    name="deviceId"
                    id="deviceId"
                    className="w-full rounded-xl bg-[#14151b] border border-white/[0.08] px-3.5 py-2 text-sm text-white focus:border-purple-500/50 focus:outline-none transition"
                  >
                    <option value="">-- Leave unassigned or choose a Relay PC --</option>
                    {devices.map((device) => (
                      <option key={device.id} value={device.id}>
                        💻 {device.name}
                      </option>
                    ))}
                  </select>
                </div>
              ) : null}

              {/* Ngách & Tag */}
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block font-medium text-neutral-300 mb-1.5" htmlFor="voice">Writing voice</label>
                  <input
                    type="text"
                    name="voice"
                    id="voice"
                    placeholder="Example: Honest, practical reviewer"
                    className="w-full rounded-xl bg-white/[0.03] border border-white/[0.08] px-3 py-2 text-sm text-white placeholder:text-neutral-600 focus:border-purple-500/50 focus:outline-none transition"
                  />
                </div>
                <div>
                  <label className="block font-medium text-neutral-300 mb-1.5" htmlFor="contentAngle">Content focus</label>
                  <input
                    type="text"
                    name="contentAngle"
                    id="contentAngle"
                    placeholder="Example: Home goods"
                    className="w-full rounded-xl bg-white/[0.03] border border-white/[0.08] px-3 py-2 text-sm text-white placeholder:text-neutral-600 focus:border-purple-500/50 focus:outline-none transition"
                  />
                </div>
              </div>

              {/* Giai đoạn Làm ấm */}
              <div>
                <label className="block font-medium text-neutral-300 mb-1.5" htmlFor="coldStartUntil">Cold-start until</label>
                <input
                  type="date"
                  name="coldStartUntil"
                  id="coldStartUntil"
                  defaultValue={defaultColdDate}
                  className="w-full rounded-xl bg-[#14151b] border border-white/[0.08] px-3.5 py-2 text-sm text-white focus:border-purple-500/50 focus:outline-none transition font-mono"
                />
                <p className="mt-1 text-[11px] text-neutral-500">
                  During the first seven days, observe and follow the human-controlled operating
                  guidance. Do not automate posting; browser identity isolation remains unproven.
                </p>
              </div>

              {/* Ghi chú */}
              <div>
                <label className="block font-medium text-neutral-300 mb-1.5" htmlFor="purchaseNote">Initial notes</label>
                <textarea
                  name="purchaseNote"
                  id="purchaseNote"
                  rows={2}
                  placeholder="Example: 15 minutes/day on an MSI PC using an iPhone 4G hotspot"
                  className="w-full rounded-xl bg-white/[0.03] border border-white/[0.08] px-3.5 py-2 text-sm text-white placeholder:text-neutral-600 focus:border-purple-500/50 focus:outline-none transition"
                />
              </div>

              {/* Nút mở rộng thông tin đăng nhập */}
              <div className="pt-2">
                <button
                  type="button"
                  onClick={() => setShowAdvanced(!showAdvanced)}
                  className="text-xs text-neutral-400 hover:text-purple-300 flex items-center gap-1 transition"
                >
                  <span>{showAdvanced ? "▼ Hide secure sign-in details" : "▶ Add email / password / 2FA (optional)"}</span>
                </button>
              </div>

              {showAdvanced ? (
                <div className="space-y-3 p-3.5 rounded-xl bg-white/[0.02] border border-white/[0.06] animate-in fade-in duration-150">
                  <p className="text-[11px] text-amber-300">
                    Authorized operators only. Sign-in and OTP/CAPTCHA stay human-controlled inside
                    the browser profile; these fields do not automate sign-in.
                  </p>
                  <div>
                    <label className="block font-medium text-neutral-400 mb-1" htmlFor="emailAddress">Original email</label>
                    <input
                      type="text"
                      name="emailAddress"
                      id="emailAddress"
                      placeholder="user@gmail.com"
                      className="w-full rounded-lg bg-white/[0.03] border border-white/[0.08] px-3 py-1.5 text-xs text-white focus:border-purple-500/50 focus:outline-none transition font-mono"
                    />
                  </div>
                  <div className="grid grid-cols-2 gap-2">
                    <div>
                      <label className="block font-medium text-neutral-400 mb-1" htmlFor="password">Nick password</label>
                      <input
                        type="password"
                        name="password"
                        id="password"
                        placeholder="••••••••"
                        className="w-full rounded-lg bg-white/[0.03] border border-white/[0.08] px-3 py-1.5 text-xs text-white focus:border-purple-500/50 focus:outline-none transition"
                      />
                    </div>
                    <div>
                      <label className="block font-medium text-neutral-400 mb-1" htmlFor="emailPassword">Email password</label>
                      <input
                        type="password"
                        name="emailPassword"
                        id="emailPassword"
                        placeholder="••••••••"
                        className="w-full rounded-lg bg-white/[0.03] border border-white/[0.08] px-3 py-1.5 text-xs text-white focus:border-purple-500/50 focus:outline-none transition"
                      />
                    </div>
                  </div>
                  <div>
                    <label className="block font-medium text-neutral-400 mb-1" htmlFor="totpSecret">2FA secret</label>
                    <input
                      type="text"
                      name="totpSecret"
                      id="totpSecret"
                      placeholder="JBSWY3DPEHPK3PXP"
                      className="w-full rounded-lg bg-white/[0.03] border border-white/[0.08] px-3 py-1.5 text-xs text-white focus:border-purple-500/50 focus:outline-none transition font-mono"
                    />
                  </div>
                </div>
              ) : null}
            </div>
          </AccountVaultForm>
        </div>
      </div>
    </div>
  );
}
