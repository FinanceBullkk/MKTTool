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
import { GoogleSignInButton } from "@/components/auth/google-sign-in-button";
import { AlertBanner } from "@/components/ui/alert-banner";
import { readAdminContactEmail } from "@/lib/auth/allowed-emails";
import { readActor } from "@/lib/auth/require-actor";
import {
  signInErrorDiagnostic,
  signInErrorMessage,
} from "@/lib/auth/sign-in-error-messages";

export const metadata: Metadata = {
  title: "Đăng nhập — MKTTool",
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
    <div className="mx-auto flex min-h-screen max-w-md flex-col justify-center px-6 py-10">
      <h1 className="mb-2 text-2xl font-semibold">Đăng nhập</h1>
      <p className="mb-6 text-sm text-neutral-400">
        Công cụ dùng tài khoản Google. Hãy chọn đúng email đã được quản trị viên mời.
      </p>

      {error ? (
        <AlertBanner tone="red">
          <p className="mb-1 font-medium">Lần đăng nhập trước không thành công</p>
          <p>{signInErrorMessage(error, { adminContactEmail, description })}</p>
        </AlertBanner>
      ) : null}

      <GoogleSignInButton callbackURL={callbackURL === "/setup" ? "/setup" : "/"} />

      <p className="mt-6 text-xs text-neutral-400">
        Cần được cấp quyền hoặc hỗ trợ đăng nhập? Liên hệ quản trị viên tại{" "}
        <a href={`mailto:${adminContactEmail}`} className="underline">
          {adminContactEmail}
        </a>
        .
      </p>
    </div>
  );
}
