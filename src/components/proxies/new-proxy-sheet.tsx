"use client";

import { useState } from "react";
import { ListPlus, LoaderCircle, Plug, Plus, X } from "lucide-react";
import { createProxy } from "@/lib/accounts/vault-create-actions";
import { createBulkProxies } from "@/lib/proxies/proxy-bulk-actions";

const FIELD_CLASS =
  "min-h-11 w-full rounded-xl border border-white/[0.1] bg-black/20 px-3 py-2 text-base text-white outline-none transition-colors placeholder:text-neutral-600 focus:border-amber-400/50 sm:text-sm";
const MONO_FIELD_CLASS = `${FIELD_CLASS} font-mono`;
const LABEL_CLASS = "mb-1.5 block text-xs font-medium text-neutral-400";

export function NewProxySheet({
  isOpen,
  onClose,
}: {
  isOpen: boolean;
  onClose: () => void;
}) {
  const [tab, setTab] = useState<"single" | "bulk">("single");
  const [busy, setBusy] = useState(false);
  const [bulkText, setBulkText] = useState("");
  const [error, setError] = useState<string | null>(null);
  /**
   * Ba thứ không suy ra được từ `host:port`, nên phải hỏi — nhất là **quốc gia**: nó quyết định
   * ngôn ngữ và múi giờ trong cấu hình profile. Bản trước đặt cứng `VN` cho mọi dòng, tức mọi
   * proxy nhập theo lô đều nhận locale Việt Nam bất kể IP thật ở đâu; đây là lỗi cấu hình,
   * không phải bằng chứng identity isolation.
   */
  const [bulkDefaults, setBulkDefaults] = useState({
    country: "",
    type: "STATIC_ISP",
    protocol: "http",
  });

  if (!isOpen) return null;

  async function handleSingleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setBusy(true);
    setError(null);

    const formData = new FormData(e.currentTarget);
    try {
      const res = await createProxy(null, formData);
      if (res.ok) {
        onClose();
        window.location.reload();
      } else {
        setError(res.message || "The proxy could not be created. Check the fields and try again.");
      }
    } catch {
      setError("The proxy could not be created. Reload the page and try again.");
    } finally {
      setBusy(false);
    }
  }

  async function handleBulkSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!bulkText.trim()) return;

    setBusy(true);
    setError(null);

    try {
      const res = await createBulkProxies(bulkText, bulkDefaults);
      if (res.ok) {
        onClose();
        window.location.reload();
      } else {
        setError(res.message || "The proxy list could not be imported. Check the rows and try again.");
      }
    } catch {
      setError("The proxy list could not be imported. Reload the page and try again.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex justify-end" role="dialog" aria-modal="true" aria-labelledby="add-proxy-title">
      {/* Backdrop */}
      <div
        className="fixed inset-0 bg-black/60 backdrop-blur-sm transition-opacity"
        onClick={onClose}
      />

      {/* Drawer Panel */}
      <div className="relative z-10 flex h-full w-full max-w-lg flex-col overflow-y-auto border-l border-white/[0.08] bg-[#0d0f12] p-5 shadow-2xl sm:p-6">
        {/* Header */}
        <div className="flex items-center justify-between pb-4 border-b border-white/[0.06]">
          <div className="flex items-center gap-2.5">
            <div className="flex h-9 w-9 items-center justify-center rounded-xl border border-amber-400/20 bg-amber-400/10 text-amber-300">
              <Plug size={17} aria-hidden="true" />
            </div>
            <div>
              <h2 id="add-proxy-title" className="text-sm font-bold tracking-tight text-white">Add proxies</h2>
              <p className="text-[11px] text-neutral-500">
                One dedicated endpoint per browser-backed nick
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="flex h-11 w-11 items-center justify-center rounded-xl text-neutral-400 transition-colors hover:bg-white/[0.06] hover:text-white"
            aria-label="Close proxy form"
          >
            <X size={15} />
          </button>
        </div>

        {/* Tab switch */}
        <div className="flex p-1 rounded-xl bg-white/[0.03] border border-white/[0.06] mt-4 mb-4">
          <button
            type="button"
            onClick={() => setTab("single")}
            className={`min-h-11 flex-1 rounded-lg text-xs font-medium transition-colors ${
              tab === "single" ? "bg-amber-400/10 text-amber-200" : "text-neutral-400 hover:text-neutral-200"
            }`}
          >
            Add one proxy
          </button>
          <button
            type="button"
            onClick={() => setTab("bulk")}
            className={`min-h-11 flex-1 rounded-lg text-xs font-medium transition-colors ${
              tab === "bulk" ? "bg-amber-400/10 text-amber-200" : "text-neutral-400 hover:text-neutral-200"
            }`}
          >
            Paste a list
          </button>
        </div>

        {error ? (
          <div role="alert" className="mb-4 rounded-xl border border-red-400/25 bg-red-400/[0.07] p-3 text-xs text-red-200">
            {error}
          </div>
        ) : null}

        {tab === "single" ? (
          <form onSubmit={handleSingleSubmit} className="space-y-4 flex-1">
            <div>
              <label className={LABEL_CLASS}>Label *</label>
              <input
                name="label"
                required
                placeholder="Example: viettel-4g-01, static-us-02"
                className={MONO_FIELD_CLASS}
              />
            </div>

            <div className="grid grid-cols-3 gap-2">
              <div className="col-span-2">
                <label className={LABEL_CLASS}>IP address / Host *</label>
                <input
                  name="host"
                  required
                  placeholder="14.225.12.89"
                  className={MONO_FIELD_CLASS}
                />
              </div>
              <div>
                <label className={LABEL_CLASS}>Port *</label>
                <input
                  name="port"
                  type="number"
                  required
                  placeholder="8080"
                  className={MONO_FIELD_CLASS}
                />
              </div>
            </div>

            <div className="grid grid-cols-2 gap-2">
              <div>
                <label className={LABEL_CLASS}>Proxy username</label>
                <input
                  name="username"
                  placeholder="Username (optional)"
                  className={MONO_FIELD_CLASS}
                />
              </div>
              <div>
                <label className={LABEL_CLASS}>Proxy password</label>
                <input
                  name="password"
                  type="password"
                  placeholder="Password (optional)"
                  className={MONO_FIELD_CLASS}
                />
              </div>
            </div>

            <div className="grid grid-cols-3 gap-2">
              <div>
                <label className={LABEL_CLASS}>Protocol</label>
                <select
                  name="protocol"
                  defaultValue="http"
                  className={FIELD_CLASS}
                >
                  <option value="http">HTTP</option>
                  <option value="socks5">SOCKS5</option>
                </select>
              </div>
              <div>
                <label className={LABEL_CLASS}>IP type</label>
                {/* Đúng HAI giá trị mà `proxyCreateSchema` nhận — xem `vault-form-schemas.ts`.
                    Bản trước liệt kê bốn (MOBILE_4G / HOTSPOT / STATIC_ISP / DATACENTER) và đặt
                    mặc định vào MOBILE_4G, tức lựa chọn mặc định luôn bị từ chối. Thêm loại mới
                ở đây thôi thì không đủ — kho, luật cụm và cấu hình profile đều đọc cột này. */}
                <select
                  name="type"
                  defaultValue="STATIC_ISP"
                  className={FIELD_CLASS}
                >
                  <option value="STATIC_ISP">Static ISP</option>
                  <option value="MOBILE">4G / Mobile</option>
                </select>
              </div>
              <div>
                <label className={LABEL_CLASS}>Country</label>
                <input
                  name="country"
                  defaultValue="VN"
                  placeholder="VN"
                  maxLength={2}
                  className={`${MONO_FIELD_CLASS} text-center uppercase`}
                />
              </div>
            </div>

            <div>
              <label className={LABEL_CLASS}>Notes</label>
              <textarea
                name="notes"
                rows={2}
                placeholder="Example: Webshare 50-IP plan for the pilot nick group"
                className={FIELD_CLASS}
              />
            </div>

            <div className="pt-4">
              <button
                type="submit"
                disabled={busy}
                className="brand-btn flex min-h-11 w-full items-center justify-center gap-2 rounded-xl px-4 text-sm font-semibold disabled:opacity-40"
              >
                {busy ? <LoaderCircle size={15} className="animate-spin" /> : <Plus size={15} />}
                <span>Save proxy to vault</span>
              </button>
            </div>
          </form>
        ) : (
          <form onSubmit={handleBulkSubmit} className="space-y-4 flex-1 flex flex-col">
            <div className="flex-1 flex flex-col">
              <label className={LABEL_CLASS}>
                Paste proxy list (one proxy per line)
              </label>
              {/* `host:port` trần đã bị bỏ khỏi danh sách: kho bắt buộc có username và mật khẩu
                  (xem `proxyCreateSchema`), nên quảng cáo định dạng đó là hứa một thứ luôn bị
                  từ chối ở dòng đầu tiên. */}
              <p className="mb-2 font-mono text-[11px] leading-5 text-neutral-500">
                Supported formats: <br />
                - <code className="text-neutral-300">host:port:user:pass</code> <br />
                - <code className="text-neutral-300">label|host:port:user:pass</code>
              </p>
              <textarea
                value={bulkText}
                onChange={(e) => setBulkText(e.target.value)}
                rows={10}
                required
                placeholder="14.225.12.89:8080:user1:pass1&#10;14.225.12.90:8080:user2:pass2"
                className={`${MONO_FIELD_CLASS} min-h-52 flex-1`}
              />
            </div>

            {/* Ba ô áp cho CẢ lô. Quốc gia không có mặc định — bỏ trống là bị chặn, đúng ý:
                đoán hộ quốc gia là đoán hộ locale/timezone profile. */}
            <div className="grid grid-cols-3 gap-2">
              <div>
                <label htmlFor="bulk-country" className={LABEL_CLASS}>
                  Country <span className="text-amber-300">*</span>
                </label>
                <input
                  id="bulk-country"
                  type="text"
                  required
                  value={bulkDefaults.country}
                  onChange={(e) => setBulkDefaults({ ...bulkDefaults, country: e.target.value.toUpperCase() })}
                  placeholder="VN"
                  maxLength={2}
                  className={`${FIELD_CLASS} uppercase`}
                />
              </div>
              <div>
                <label htmlFor="bulk-type" className={LABEL_CLASS}>
                  IP type
                </label>
                <select
                  id="bulk-type"
                  value={bulkDefaults.type}
                  onChange={(e) => setBulkDefaults({ ...bulkDefaults, type: e.target.value })}
                  className={FIELD_CLASS}
                >
                  <option value="STATIC_ISP">Static ISP</option>
                  <option value="MOBILE">4G / Mobile</option>
                </select>
              </div>
              <div>
                <label htmlFor="bulk-protocol" className={LABEL_CLASS}>
                  Protocol
                </label>
                <select
                  id="bulk-protocol"
                  value={bulkDefaults.protocol}
                  onChange={(e) => setBulkDefaults({ ...bulkDefaults, protocol: e.target.value })}
                  className={FIELD_CLASS}
                >
                  <option value="http">HTTP</option>
                  <option value="socks5">SOCKS5</option>
                </select>
              </div>
            </div>

            <div className="pt-2">
              <button
                type="submit"
                disabled={busy}
                className="brand-btn flex min-h-11 w-full items-center justify-center gap-2 rounded-xl px-4 text-sm font-semibold disabled:opacity-40"
              >
                {busy ? <LoaderCircle size={15} className="animate-spin" /> : <ListPlus size={15} />}
                <span>Import proxy list</span>
              </button>
            </div>
          </form>
        )}
      </div>
    </div>
  );
}
