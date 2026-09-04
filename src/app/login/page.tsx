/**
 * Màn hình đăng nhập — một nút, không có ô nhập nào.
 *
 * Không có form email/mật khẩu vì công cụ **không tự quản lý mật khẩu người dùng**: Google lo
 * phần chứng minh danh tính, còn `ALLOWED_EMAILS` lo phần "người này có thuộc team không".
 * Cũng không có "Đăng ký" — tự đăng ký nghĩa là bất kỳ ai có Gmail cũng tạo được tài khoản,
 * và kho danh tính không phải chỗ để mở cửa như vậy.
 *
 * Đã đăng nhập rồi mà vào đây thì đẩy thẳng về trang Hôm nay: để nguyên thì màn hình mời đăng
 * nhập lại trong khi đang đăng nhập sẵn, đọc như là phiên vừa hỏng.
 */
import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { KeyRound, MonitorCog, ShieldCheck, UsersRound } from "lucide-react";
import { GoogleSignInButton } from "@/components/auth/google-sign-in-button";
import { AlertBanner } from "@/components/ui/alert-banner";
import { readAdminContactEmail } from "@/lib/auth/allowed-emails";
import { readActor } from "@/lib/auth/require-actor";
import {
  signInErrorDiagnostic,
  signInErrorMessage,
} from "@/lib/auth/sign-in-error-messages";

export const metadata: Metadata = {
  title: "Sign in - MKTTool",
};

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string; error_description?: string; callbackURL?: string }>;
}) {
  const { error, error_description: description, callbackURL } = await searchParams;
  const adminContactEmail = readAdminContactEmail();

  if (await readActor()) redirect("/");

  if (error) console.error(`[auth] ${signInErrorDiagnostic(error)}`);

  return (
    <div className="auth-page min-h-[100dvh]">
      <main className="app-frame grid min-h-[100dvh] items-center gap-10 px-5 py-10 lg:grid-cols-[minmax(0,1fr)_25rem] lg:px-10">
        <section className="hidden max-w-xl lg:block">
          <div className="mb-8 flex items-center gap-3">
            <span className="flex h-11 w-11 items-center justify-center rounded-xl bg-amber-300 text-lg font-bold text-[#1c160d]">M</span>
            <div>
              <p className="text-lg font-semibold text-white">MKTTool</p>
              <p className="font-mono text-[10px] uppercase tracking-[0.18em] text-neutral-500">Team operations console</p>
            </div>
          </div>
          <h1 className="max-w-lg text-balance text-4xl font-semibold leading-[1.08] tracking-[-0.04em] text-white">
            The shared handoff point for every nick and Relay PC.
          </h1>
          <div className="mt-8 grid gap-3 sm:grid-cols-3">
            <LoginSignal icon={UsersRound} label="Nick vault" />
            <LoginSignal icon={MonitorCog} label="Relay PCs" />
            <LoginSignal icon={ShieldCheck} label="Role-aware access" />
          </div>
        </section>

        <section className="app-surface w-full rounded-2xl p-5 sm:p-7">
          <span className="mb-5 flex h-11 w-11 items-center justify-center rounded-xl border border-amber-300/20 bg-amber-300/[0.08] text-amber-200">
            <KeyRound size={20} aria-hidden="true" />
          </span>
          <p className="font-mono text-[10px] font-semibold uppercase tracking-[0.18em] text-amber-300/75">Authorized team only</p>
          <h2 className="mt-2 text-2xl font-semibold tracking-tight text-white">Sign in to the console</h2>
          <p className="mb-6 mt-2 text-sm leading-6 text-neutral-400">
            Choose the Google account invited by your administrator.
          </p>

          {error ? (
            <AlertBanner tone="red">
              <p className="mb-1 font-medium">The previous sign-in attempt failed</p>
              <p>{signInErrorMessage(error, { adminContactEmail, description })}</p>
            </AlertBanner>
          ) : null}

          <GoogleSignInButton callbackURL={callbackURL === "/setup" ? "/setup" : "/"} />

          <p className="mt-6 border-t border-white/[0.07] pt-4 text-xs leading-5 text-neutral-500">
            Need access?{" "}
            <a href={`mailto:${adminContactEmail}`} className="inline-flex min-h-11 items-center font-medium text-neutral-300 underline underline-offset-2 hover:text-white">
              Contact {adminContactEmail}
            </a>
          </p>
        </section>
      </main>
    </div>
  );
}

function LoginSignal({ icon: Icon, label }: { icon: typeof ShieldCheck; label: string }) {
  return (
    <div className="rounded-xl border border-white/[0.08] bg-black/10 p-4">
      <Icon size={17} className="text-amber-300" aria-hidden="true" />
      <p className="mt-3 text-sm font-medium text-neutral-200">{label}</p>
      <span className="mt-2 block h-px w-8 bg-amber-300/40" aria-hidden="true" />
    </div>
  );
}
