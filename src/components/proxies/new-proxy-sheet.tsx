"use client";

import { useState } from "react";
import { X, Plus, Sparkles, Loader2 } from "lucide-react";
import { createProxy } from "@/lib/accounts/vault-create-actions";
import { createBulkProxies } from "@/lib/proxies/proxy-bulk-actions";

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
   * ngôn ngữ và múi giờ của vân tay profile. Bản trước đặt cứng `VN` cho mọi dòng, tức mọi
   * proxy nhập theo lô đều đội vân tay Việt Nam bất kể IP thật ở đâu.
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
        setError(res.message || "Không thể tạo proxy.");
      }
    } catch {
      setError("Đã xảy ra lỗi khi tạo proxy.");
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
        setError(res.message || "Không thể thêm proxy hàng loạt.");
      }
    } catch {
      setError("Đã xảy ra lỗi khi thêm proxy hàng loạt.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex justify-end">
      {/* Backdrop */}
      <div
        className="fixed inset-0 bg-black/60 backdrop-blur-sm transition-opacity"
        onClick={onClose}
      />

      {/* Drawer Panel */}
      <div
        className="relative w-full max-w-md h-full bg-[#0d0e14] border-l border-white/[0.08] shadow-2xl p-6 flex flex-col z-10 overflow-y-auto"
        style={{
          backdropFilter: "blur(24px)",
        }}
      >
        {/* Header */}
        <div className="flex items-center justify-between pb-4 border-b border-white/[0.06]">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-xl bg-purple-500/10 border border-purple-500/20 flex items-center justify-center text-purple-300 text-sm">
              🔌
            </div>
            <div>
              <h2 className="text-sm font-bold text-white tracking-tight">Thêm Proxy Mới</h2>
              <p className="text-[11px] text-neutral-400">Gán IP sạch và cách ly cho từng Profile</p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="w-7 h-7 rounded-lg flex items-center justify-center text-neutral-400 hover:text-white hover:bg-white/[0.06] transition"
          >
            <X size={15} />
          </button>
        </div>

        {/* Tab switch */}
        <div className="flex p-1 rounded-xl bg-white/[0.03] border border-white/[0.06] mt-4 mb-4">
          <button
            type="button"
            onClick={() => setTab("single")}
            className={`flex-1 py-1.5 rounded-lg text-xs font-medium transition ${
              tab === "single" ? "bg-white/[0.08] text-white shadow" : "text-neutral-400 hover:text-neutral-200"
            }`}
          >
            Thêm từng IP
          </button>
          <button
            type="button"
            onClick={() => setTab("bulk")}
            className={`flex-1 py-1.5 rounded-lg text-xs font-medium transition ${
              tab === "bulk" ? "bg-white/[0.08] text-white shadow" : "text-neutral-400 hover:text-neutral-200"
            }`}
          >
            Dán hàng loạt (Bulk)
          </button>
        </div>

        {error ? (
          <div className="mb-4 p-2.5 rounded-xl bg-rose-950/60 border border-rose-500/30 text-rose-300 text-xs">
            {error}
          </div>
        ) : null}

        {tab === "single" ? (
          <form onSubmit={handleSingleSubmit} className="space-y-4 flex-1">
            <div>
              <label className="block text-xs font-medium text-neutral-300 mb-1">Nhãn gợi nhớ *</label>
              <input
                name="label"
                required
                placeholder="VD: viettel-4g-01, static-us-02"
                className="w-full rounded-xl bg-white/[0.03] border border-white/[0.08] px-3.5 py-2 text-xs text-white placeholder:text-neutral-600 focus:border-purple-500/50 focus:outline-none transition font-mono"
              />
            </div>

            <div className="grid grid-cols-3 gap-2">
              <div className="col-span-2">
                <label className="block text-xs font-medium text-neutral-300 mb-1">Địa chỉ IP / Host *</label>
                <input
                  name="host"
                  required
                  placeholder="14.225.12.89"
                  className="w-full rounded-xl bg-white/[0.03] border border-white/[0.08] px-3.5 py-2 text-xs text-white placeholder:text-neutral-600 focus:border-purple-500/50 focus:outline-none transition font-mono"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-neutral-300 mb-1">Cổng (Port) *</label>
                <input
                  name="port"
                  type="number"
                  required
                  placeholder="8080"
                  className="w-full rounded-xl bg-white/[0.03] border border-white/[0.08] px-3.5 py-2 text-xs text-white placeholder:text-neutral-600 focus:border-purple-500/50 focus:outline-none transition font-mono"
                />
              </div>
            </div>

            <div className="grid grid-cols-2 gap-2">
              <div>
                <label className="block text-xs font-medium text-neutral-300 mb-1">Tài khoản Proxy</label>
                <input
                  name="username"
                  placeholder="user (nếu có)"
                  className="w-full rounded-xl bg-white/[0.03] border border-white/[0.08] px-3.5 py-2 text-xs text-white placeholder:text-neutral-600 focus:border-purple-500/50 focus:outline-none transition font-mono"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-neutral-300 mb-1">Mật khẩu Proxy</label>
                <input
                  name="password"
                  type="password"
                  placeholder="pass (nếu có)"
                  className="w-full rounded-xl bg-white/[0.03] border border-white/[0.08] px-3.5 py-2 text-xs text-white placeholder:text-neutral-600 focus:border-purple-500/50 focus:outline-none transition font-mono"
                />
              </div>
            </div>

            <div className="grid grid-cols-3 gap-2">
              <div>
                <label className="block text-xs font-medium text-neutral-300 mb-1">Giao thức</label>
                <select
                  name="protocol"
                  defaultValue="http"
                  className="w-full rounded-xl bg-black/60 border border-white/[0.08] px-2.5 py-2 text-xs text-white focus:border-purple-500/50 focus:outline-none transition"
                >
                  <option value="http">HTTP</option>
                  <option value="socks5">SOCKS5</option>
                </select>
              </div>
              <div>
                <label className="block text-xs font-medium text-neutral-300 mb-1">Loại IP</label>
                {/* Đúng HAI giá trị mà `proxyCreateSchema` nhận — xem `vault-form-schemas.ts`.
                    Bản trước liệt kê bốn (MOBILE_4G / HOTSPOT / STATIC_ISP / DATACENTER) và đặt
                    mặc định vào MOBILE_4G, tức lựa chọn mặc định luôn bị từ chối. Thêm loại mới
                    ở đây thôi thì không đủ — kho, luật cụm và vân tay đều đọc cột này. */}
                <select
                  name="type"
                  defaultValue="STATIC_ISP"
                  className="w-full rounded-xl bg-black/60 border border-white/[0.08] px-2.5 py-2 text-xs text-white focus:border-purple-500/50 focus:outline-none transition"
                >
                  <option value="STATIC_ISP">Dân cư tĩnh (ISP)</option>
                  <option value="MOBILE">4G / Mobile</option>
                </select>
              </div>
              <div>
                <label className="block text-xs font-medium text-neutral-300 mb-1">Quốc gia</label>
                <input
                  name="country"
                  defaultValue="VN"
                  placeholder="VN"
                  maxLength={2}
                  className="w-full rounded-xl bg-white/[0.03] border border-white/[0.08] px-3 py-2 text-xs text-white placeholder:text-neutral-600 focus:border-purple-500/50 focus:outline-none transition font-mono uppercase text-center"
                />
              </div>
            </div>

            <div>
              <label className="block text-xs font-medium text-neutral-300 mb-1">Ghi chú</label>
              <textarea
                name="notes"
                rows={2}
                placeholder="VD: Proxy mua từ Webshare gói 50 IP, dùng cho đàn TikTok Shop"
                className="w-full rounded-xl bg-white/[0.03] border border-white/[0.08] px-3.5 py-2 text-xs text-white placeholder:text-neutral-600 focus:border-purple-500/50 focus:outline-none transition"
              />
            </div>

            <div className="pt-4">
              <button
                type="submit"
                disabled={busy}
                className="brand-btn w-full py-2.5 rounded-xl text-xs font-semibold text-white flex items-center justify-center gap-2 cursor-pointer shadow-lg shadow-purple-500/25"
              >
                {busy ? <Loader2 size={14} className="animate-spin" /> : <Plus size={14} />}
                <span>Lưu Proxy vào kho</span>
              </button>
            </div>
          </form>
        ) : (
          <form onSubmit={handleBulkSubmit} className="space-y-4 flex-1 flex flex-col">
            <div className="flex-1 flex flex-col">
              <label className="block text-xs font-medium text-neutral-300 mb-1.5">
                Dán danh sách Proxy (Mỗi dòng một IP)
              </label>
              {/* `host:port` trần đã bị bỏ khỏi danh sách: kho bắt buộc có username và mật khẩu
                  (xem `proxyCreateSchema`), nên quảng cáo định dạng đó là hứa một thứ luôn bị
                  từ chối ở dòng đầu tiên. */}
              <p className="text-[11px] text-neutral-500 mb-2 font-mono">
                Định dạng hỗ trợ: <br />
                - <code className="text-neutral-300">host:port:user:pass</code> <br />
                - <code className="text-neutral-300">label|host:port:user:pass</code>
              </p>
              <textarea
                value={bulkText}
                onChange={(e) => setBulkText(e.target.value)}
                rows={10}
                required
                placeholder="14.225.12.89:8080:user1:pass1&#10;14.225.12.90:8080:user2:pass2"
                className="flex-1 w-full rounded-xl bg-white/[0.03] border border-white/[0.08] p-3 text-xs text-white font-mono placeholder:text-neutral-600 focus:border-purple-500/50 focus:outline-none transition"
              />
            </div>

            {/* Ba ô áp cho CẢ lô. Quốc gia không có mặc định — bỏ trống là bị chặn, đúng ý:
                đoán hộ quốc gia là đoán hộ vân tay. */}
            <div className="grid grid-cols-3 gap-2">
              <div>
                <label htmlFor="bulk-country" className="block text-xs font-medium text-neutral-300 mb-1">
                  Quốc gia <span className="text-purple-400">*</span>
                </label>
                <input
                  id="bulk-country"
                  type="text"
                  required
                  value={bulkDefaults.country}
                  onChange={(e) => setBulkDefaults({ ...bulkDefaults, country: e.target.value.toUpperCase() })}
                  placeholder="VN"
                  maxLength={2}
                  className="w-full rounded-xl bg-black/60 border border-white/[0.08] px-2.5 py-2 text-xs text-white uppercase placeholder:text-neutral-600 focus:border-purple-500/50 focus:outline-none transition"
                />
              </div>
              <div>
                <label htmlFor="bulk-type" className="block text-xs font-medium text-neutral-300 mb-1">
                  Loại IP
                </label>
                <select
                  id="bulk-type"
                  value={bulkDefaults.type}
                  onChange={(e) => setBulkDefaults({ ...bulkDefaults, type: e.target.value })}
                  className="w-full rounded-xl bg-black/60 border border-white/[0.08] px-2.5 py-2 text-xs text-white focus:border-purple-500/50 focus:outline-none transition"
                >
                  <option value="STATIC_ISP">Dân cư tĩnh (ISP)</option>
                  <option value="MOBILE">4G / Mobile</option>
                </select>
              </div>
              <div>
                <label htmlFor="bulk-protocol" className="block text-xs font-medium text-neutral-300 mb-1">
                  Giao thức
                </label>
                <select
                  id="bulk-protocol"
                  value={bulkDefaults.protocol}
                  onChange={(e) => setBulkDefaults({ ...bulkDefaults, protocol: e.target.value })}
                  className="w-full rounded-xl bg-black/60 border border-white/[0.08] px-2.5 py-2 text-xs text-white focus:border-purple-500/50 focus:outline-none transition"
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
                className="brand-btn w-full py-2.5 rounded-xl text-xs font-semibold text-white flex items-center justify-center gap-2 cursor-pointer shadow-lg shadow-purple-500/25"
              >
                {busy ? <Loader2 size={14} className="animate-spin" /> : <Sparkles size={14} />}
                <span>Import toàn bộ danh sách</span>
              </button>
            </div>
          </form>
        )}
      </div>
    </div>
  );
}
