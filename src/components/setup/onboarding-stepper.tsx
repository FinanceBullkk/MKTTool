"use client";

import { useState, type ReactNode } from "react";
import Link from "next/link";
import { Download, ChevronRight, AlertTriangle } from "lucide-react";
import { RelayEnrollCard } from "@/components/relay/relay-enroll-card";
import { WorkspaceSetupChecklist } from "@/components/setup/workspace-setup-checklist";
import type { SetupChecklist } from "@/lib/setup/setup-checklist";

export function OnboardingStepper({
  viewer,
  checklist,
  installerDownloadUrl,
  installerSize,
  enrollCard,
  checklistView,
}: {
  viewer: { userId: string; email: string; isAdmin: boolean };
  checklist: SetupChecklist;
  installerDownloadUrl: string;
  /** Null when the installer's real size could not be read — the label then
   *  omits it rather than showing a figure with no source. */
  installerSize: string | null;
  enrollCard?: ReactNode;
  checklistView?: ReactNode;
}) {
  const [activeStep, setActiveStep] = useState<1 | 2 | 3>(1);

  return (
    <div className="flex-1 flex flex-col min-w-0 min-h-0 p-6 overflow-y-auto max-w-5xl mx-auto space-y-6">
      {/* 1. Page Title */}
      <div>
        <h1 className="text-xl font-bold text-white tracking-tight flex items-center gap-2">
          <span>⚙️</span>
          <span>Thiết lập Máy Vận Hành (MKT Setup)</span>
        </h1>
        <p className="text-xs text-neutral-400 mt-1">
          Quy trình chuẩn bị máy 3 bước: Tải trình duyệt MKT Browser, kết nối cầu nối Relay và kích hoạt bảo mật.
        </p>
      </div>

      {/* 2. Stepper Header Tabs */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
        {/* Step 1 */}
        <button
          type="button"
          onClick={() => setActiveStep(1)}
          className={`p-3.5 rounded-2xl border text-left transition flex items-center gap-3 cursor-pointer ${
            activeStep === 1
              ? "bg-purple-950/30 border-purple-500/40 shadow-lg shadow-purple-500/10"
              : "bg-white/[0.02] border-white/[0.06] hover:bg-white/[0.04]"
          }`}
        >
          <div
            className={`w-9 h-9 rounded-xl flex items-center justify-center font-bold text-xs ${
              activeStep === 1
                ? "bg-purple-500 text-white shadow-md shadow-purple-500/40"
                : "bg-white/[0.06] text-neutral-400"
            }`}
          >
            1
          </div>
          <div>
            <div className="text-xs font-bold text-white">Bước 1: Tải MKT Browser</div>
            <div className="text-[11px] text-neutral-400">Bộ cài đặt Chromium + Relay</div>
          </div>
        </button>

        {/* Step 2 */}
        <button
          type="button"
          onClick={() => setActiveStep(2)}
          className={`p-3.5 rounded-2xl border text-left transition flex items-center gap-3 cursor-pointer ${
            activeStep === 2
              ? "bg-purple-950/30 border-purple-500/40 shadow-lg shadow-purple-500/10"
              : "bg-white/[0.02] border-white/[0.06] hover:bg-white/[0.04]"
          }`}
        >
          <div
            className={`w-9 h-9 rounded-xl flex items-center justify-center font-bold text-xs ${
              activeStep === 2
                ? "bg-purple-500 text-white shadow-md shadow-purple-500/40"
                : "bg-white/[0.06] text-neutral-400"
            }`}
          >
            2
          </div>
          <div>
            <div className="text-xs font-bold text-white">Bước 2: Kết nối Relay v15</div>
            <div className="text-[11px] text-neutral-400">Ghi danh & Gán khóa máy</div>
          </div>
        </button>

        {/* Step 3 */}
        <button
          type="button"
          onClick={() => setActiveStep(3)}
          className={`p-3.5 rounded-2xl border text-left transition flex items-center gap-3 cursor-pointer ${
            activeStep === 3
              ? "bg-purple-950/30 border-purple-500/40 shadow-lg shadow-purple-500/10"
              : "bg-white/[0.02] border-white/[0.06] hover:bg-white/[0.04]"
          }`}
        >
          <div
            className={`w-9 h-9 rounded-xl flex items-center justify-center font-bold text-xs ${
              activeStep === 3
                ? "bg-purple-500 text-white shadow-md shadow-purple-500/40"
                : "bg-white/[0.06] text-neutral-400"
            }`}
          >
            3
          </div>
          <div>
            <div className="text-xs font-bold text-white">Bước 3: Sẵn sàng vận hành</div>
            <div className="text-[11px] text-neutral-400">Kiểm tra checklist đàn nick</div>
          </div>
        </button>
      </div>

      {/* 3. Step Content Panes */}
      {activeStep === 1 && (
        <div className="rounded-2xl border border-white/[0.06] bg-white/[0.02] backdrop-blur-xl p-6 space-y-6">
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div className="space-y-1">
              <h3 className="text-sm font-bold text-white flex items-center gap-2">
                <span>⬇️</span>
                <span>Bộ cài đặt MKT Browser 0.3.2 cho Windows</span>
              </h3>
              <p className="text-xs text-neutral-400 max-w-xl">
                Cài đặt ứng dụng MKT Browser trên máy tính của bạn. Ứng dụng tích hợp sẵn nhân Chromium cô lập vân tay và cầu nối Relay cục bộ.
              </p>
            </div>

            <a
              href={installerDownloadUrl}
              className="brand-btn px-5 py-2.5 rounded-xl text-xs font-semibold text-white inline-flex items-center gap-2 shadow-lg shadow-purple-500/25"
            >
              <Download size={14} />
              <span>Tải MKTBrowser-win-x64.exe{installerSize ? ` (${installerSize})` : ""}</span>
            </a>
          </div>

          {/* SmartScreen Guidance Box */}
          <div className="rounded-xl bg-amber-500/10 border border-amber-500/20 p-4 text-xs text-amber-200 space-y-2">
            <div className="font-bold flex items-center gap-1.5 text-amber-300">
              <AlertTriangle size={14} />
              <span>Hướng dẫn vượt cảnh báo Windows SmartScreen:</span>
            </div>
            <p className="text-neutral-300 text-[11px] leading-relaxed">
              Vì bộ cài đặt nội bộ chưa ký chứng chỉ trả phí của Microsoft, Windows sẽ hiển thị màn hình xanh cảnh báo:
            </p>
            <div className="flex items-center gap-2 font-mono text-[11px] text-amber-300 bg-black/40 p-2.5 rounded-lg">
              <span>1. Bấm vào <strong>&quot;More info&quot;</strong></span>
              <span>➔</span>
              <span>2. Chọn <strong>&quot;Run anyway&quot;</strong> để tiếp tục cài đặt.</span>
            </div>
          </div>

          <div className="pt-2 flex justify-end">
            <button
              type="button"
              onClick={() => setActiveStep(2)}
              className="px-4 py-2 rounded-xl bg-white/[0.05] hover:bg-white/[0.1] text-xs font-medium text-white transition inline-flex items-center gap-1.5 cursor-pointer"
            >
              <span>Tiếp tục: Bước 2</span>
              <ChevronRight size={14} />
            </button>
          </div>
        </div>
      )}

      {activeStep === 2 && (
        <div className="space-y-4">
          {enrollCard || <RelayEnrollCard viewer={viewer} />}
          <div className="flex justify-between items-center pt-2">
            <button
              type="button"
              onClick={() => setActiveStep(1)}
              className="px-4 py-2 rounded-xl bg-white/[0.05] hover:bg-white/[0.1] text-xs font-medium text-neutral-400 hover:text-white transition cursor-pointer"
            >
              ← Quay lại Bước 1
            </button>
            <button
              type="button"
              onClick={() => setActiveStep(3)}
              className="px-4 py-2 rounded-xl bg-white/[0.05] hover:bg-white/[0.1] text-xs font-medium text-white transition inline-flex items-center gap-1.5 cursor-pointer"
            >
              <span>Tiếp tục: Bước 3</span>
              <ChevronRight size={14} />
            </button>
          </div>
        </div>
      )}

      {activeStep === 3 && (
        <div className="space-y-4">
          {checklistView || <WorkspaceSetupChecklist checklist={checklist} isAdmin={viewer.isAdmin} />}
          
          <div className="rounded-2xl border border-white/[0.06] bg-white/[0.02] p-5 flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-emerald-500/10 border border-emerald-500/20 flex items-center justify-center text-emerald-400 text-lg">
                🚀
              </div>
              <div>
                <h4 className="text-xs font-bold text-white">Mọi thứ đã sẵn sàng!</h4>
                <p className="text-[11px] text-neutral-400">Bạn có thể quay lại Bảng điều khiển để mở và vận hành các profile TikTok.</p>
              </div>
            </div>

            <Link
              href="/"
              className="brand-btn px-4 py-2 rounded-xl text-xs font-semibold text-white inline-flex items-center gap-2"
            >
              <span>Vào Bảng Điều Khiển</span>
              <ChevronRight size={14} />
            </Link>
          </div>
        </div>
      )}
    </div>
  );
}
