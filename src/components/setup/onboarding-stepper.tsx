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
  installerRelease,
  installerEvidenceHref,
  enrollCard,
  checklistView,
}: {
  viewer: { userId: string; email: string; isAdmin: boolean };
  checklist: SetupChecklist;
  installerDownloadUrl: string;
  installerRelease: InstallerDisplayMetadata;
  /** Sanitized, authenticated release facts; never a filesystem path or secret-bearing URL. */
  installerEvidenceHref?: string;
  enrollCard?: ReactNode;
  checklistView?: ReactNode;
}) {
  const [activeStep, setActiveStep] = useState<1 | 2 | 3>(1);
  const downloadable = installerRelease.available && installerRelease.metadataComplete;
  const workspaceReady = checklist.handoff.nextStepId === null;
  const versionLabel = installerRelease.version ?? "chưa công bố";

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
            <div className="text-xs font-bold text-white">Bước 2: Kết nối Relay hiện tại</div>
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
            <div className="text-xs font-bold text-white">Bước 3: Kiểm tra điều kiện pilot</div>
            <div className="text-[11px] text-neutral-400">Các kiểm tra kỹ thuật và ràng buộc vận hành</div>
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
                <span>Bộ cài đặt MKT Browser {versionLabel} cho Windows</span>
              </h3>
              <p className="text-xs text-neutral-400 max-w-xl">
                Cài đặt ứng dụng MKT Browser trên máy tính của bạn. Đây là beta nội bộ Windows có
                kiểm soát: dùng một profile mỗi lần, đăng nhập và nhập liệu bằng người thật; trạng
                thái, proxy và cài đặt profile được giữ cục bộ. Tính cô lập danh tính chưa được chứng minh.
              </p>
            </div>

            {downloadable ? (
               <a
                 href={installerDownloadUrl}
                 className="brand-btn px-5 py-2.5 rounded-xl text-xs font-semibold text-white inline-flex items-center gap-2 shadow-lg shadow-purple-500/25"
               >
                 <Download size={14} />
                 <span>
                   Tải MKTBrowser-win-x64.exe
                   {installerRelease.sizeBytes ? ` (${formatBytes(installerRelease.sizeBytes)})` : ""}
                 </span>
               </a>
             ) : (
               <span
                 aria-disabled="true"
                 className="px-5 py-2.5 rounded-xl text-xs font-semibold text-neutral-500 inline-flex items-center gap-2 bg-white/[0.04]"
               >
                 <Download size={14} />
                 <span>Chưa thể tải — thiếu metadata phát hành</span>
               </span>
             )}
           </div>

           {!downloadable ? (
             <div className="rounded-xl bg-amber-500/10 border border-amber-500/20 p-4 text-xs text-amber-200 space-y-1">
               <div className="font-bold">Bộ cài chưa được xác nhận để phát hành</div>
               <p className="text-neutral-300 text-[11px] leading-relaxed">
                 {installerRelease.available
                   ? `Object đã tồn tại nhưng thiếu tuple bắt buộc: ${installerRelease.metadataMissing.join(", ")}. Không tải hoặc chạy bản này.`
                   : "Máy chủ chưa có object và metadata phát hành đầy đủ cho ứng viên hiện tại."}
               </p>
             </div>
           ) : null}

           {downloadable ? (
             <dl className="grid gap-x-8 gap-y-2 text-[11px] text-neutral-300 sm:grid-cols-[auto_1fr]">
               <dt className="text-neutral-500">Installer SHA-256</dt>
               <dd className="font-mono break-all">{installerRelease.checksum}</dd>
                <dt className="text-neutral-500">Bundled Relay</dt>
               <dd>
                 v{installerRelease.bundledRelayVersion} /{" "}
                 <span className="font-mono break-all">{installerRelease.bundledRelaySha256}</span>
                </dd>
                <dt className="text-neutral-500">Candidate</dt>
                <dd className="font-mono break-all">{installerRelease.candidateId}</dd>
                <dt className="text-neutral-500">Payload manifest</dt>
                <dd className="font-mono break-all">
                  {installerRelease.payloadManifestSha256} ({installerRelease.payloadFileCount} files)
                </dd>
               <dt className="text-neutral-500">Browser source</dt>
               <dd className="font-mono break-all">
                 commit {installerRelease.browserSourceSha}; tree {installerRelease.browserSourceTree}
               </dd>
               <dt className="text-neutral-500">Engine pin</dt>
               <dd>
                 {installerRelease.engineKind} / {installerRelease.engineChannel} /{" "}
                 {installerRelease.engineVersion} /{" "}
                 <span className="font-mono break-all">{installerRelease.engineSha256}</span>
               </dd>
                <dt className="text-neutral-500">Signing</dt>
                <dd>{signingLabel(installerRelease.signingStatus)}</dd>
                {installerRelease.signingStatus === "unsigned-internal-exception" ? (
                  <>
                    <dt className="text-neutral-500">Unsigned exception expires</dt>
                    <dd>{installerRelease.signingExceptionExpiresAt}</dd>
                  </>
                ) : null}
                {installerEvidenceHref ? (
                  <>
                    <dt className="text-neutral-500">Evidence</dt>
                    <dd>
                      <a className="underline" href={installerEvidenceHref}>
                        Open sanitized release provenance
                      </a>
                    </dd>
                  </>
                ) : null}
             </dl>
           ) : null}

          {/* SmartScreen guidance is shown only for a complete, explicitly unsigned tuple. */}
          {downloadable && installerRelease.signingStatus === "unsigned-internal-exception" ? (
          <div className="rounded-xl bg-amber-500/10 border border-amber-500/20 p-4 text-xs text-amber-200 space-y-2">
            <div className="font-bold flex items-center gap-1.5 text-amber-300">
              <AlertTriangle size={14} />
              <span>Kiểm soát SmartScreen cho ngoại lệ nội bộ:</span>
            </div>
            <p className="text-neutral-300 text-[11px] leading-relaxed">
              Chỉ tiếp tục sau khi SHA-256 ở trên khớp chính xác và ngoại lệ chưa hết
              hạn. Không tắt Defender hoặc SmartScreen. Nếu bất kỳ metadata nào khác, dừng
              và báo sự cố.
            </p>
            <div className="flex items-center gap-2 font-mono text-[11px] text-amber-300 bg-black/40 p-2.5 rounded-lg">
              <span>1. Bấm vào <strong>&quot;More info&quot;</strong></span>
              <span>➔</span>
              <span>2. Chọn <strong>&quot;Run anyway&quot;</strong> để tiếp tục cài đặt.</span>
            </div>
          </div>
          ) : null}

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
                <h4 className="text-xs font-bold text-white">
                  {workspaceReady ? "Workspace handoff checks recorded" : "Workspace handoff is still pending"}
                </h4>
                <p className="text-[11px] text-neutral-400">
                  {workspaceReady
                    ? "The identity workspace is ready for handoff. Browser installer availability is separate and does not grant Browser rollout or identity-isolation approval."
                    : "Finish the highlighted workspace handoff steps. Browser installer availability is informational and does not block workspace readiness."}
                </p>
              </div>
            </div>

            {workspaceReady ? (
              <Link
                href="/"
                className="brand-btn px-4 py-2 rounded-xl text-xs font-semibold text-white inline-flex items-center gap-2"
              >
                <span>Open Dashboard</span>
                <ChevronRight size={14} />
              </Link>
            ) : null}
          </div>
        </div>
      )}
    </div>
  );
}

export interface InstallerDisplayMetadata {
  available: boolean;
  metadataComplete: boolean;
  metadataMissing: string[];
  sizeBytes: number | null;
  version: string | null;
  checksum: string | null;
  bundledRelayVersion: number | null;
  bundledRelaySha256: string | null;
  payloadManifestSha256: string | null;
  payloadFileCount: number | null;
  candidateId: string | null;
  browserSourceSha: string | null;
  browserSourceTree: string | null;
  engineKind: string | null;
  engineChannel: string | null;
  engineVersion: string | null;
  engineSha256: string | null;
  signingStatus: "authenticode" | "unsigned-internal-exception" | "unknown";
  signingExceptionExpiresAt: string | null;
}

function signingLabel(status: InstallerDisplayMetadata["signingStatus"]): string {
  if (status === "authenticode") return "Authenticode verified";
  if (status === "unsigned-internal-exception") return "Unsigned — internal exception only";
  return "Unknown — do not distribute";
}

function formatBytes(bytes: number): string {
  if (!Number.isFinite(bytes) || bytes <= 0) return "";
  const units = ["B", "KB", "MB", "GB"];
  let value = bytes;
  let unit = 0;
  while (value >= 1024 && unit < units.length - 1) {
    value /= 1024;
    unit += 1;
  }
  return `${value.toFixed(unit === 0 ? 0 : 1)} ${units[unit]}`;
}
