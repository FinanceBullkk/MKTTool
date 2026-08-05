"use client";

/**
 * Form nick — nơi bí mật được **mã hóa trước khi rời máy này**.
 *
 * ## Vì sao không dùng `ActionForm` như mọi form khác
 *
 * `ActionForm` gửi thẳng `FormData` lên server action. Với nick thì không được: ba cột bí mật
 * thuộc vùng khóa operator, và máy chủ **không giữ khóa đó nữa** — gửi mật khẩu dạng trần lên
 * chỉ để máy chủ không mã hóa nổi là đi ngược toàn bộ GĐ3.
 *
 * Nên form này chèn một bước ở giữa: lấy ba ô bí mật ra khỏi `FormData`, nhờ cầu nối trên chính
 * máy này bọc chúng, rồi gửi lên **ciphertext**. Mật khẩu đi từ ô nhập tới `127.0.0.1` và dừng
 * ở đó.
 *
 * ## Ràng buộc 1 của spike GĐ0 nằm ở đâu
 *
 * `encryptForVault()` là **lời gọi mạng đầu tiên trong trình xử lý submit, không có `await` nào
 * trước nó**. Đọc `FormData` là việc đồng bộ, nên kích hoạt người dùng còn nguyên khi request
 * rời đi — điều kiện để hộp xin quyền mạng nội bộ hiện ra trên chiếc máy chưa cấp quyền. Nhét
 * bất cứ `await` nào lên trên là hộp đó không bao giờ hiện, và nút im lặng mãi mãi.
 *
 * ## Không có bí mật thì không gọi cầu nối
 *
 * Sửa karma, đổi trạng thái, gắn proxy — ba ô bí mật để trống nghĩa là "giữ nguyên", nên form đi
 * thẳng lên máy chủ. Nhờ vậy **việc chung hằng ngày vẫn chạy khi cầu nối tắt**, và cầu nối chỉ
 * cần thiết đúng lúc thật sự có bí mật mới.
 */
import { useState } from "react";
import type { ActionResult } from "@/lib/actions/action-result";
import { RelayOutdatedNotice } from "@/components/relay/relay-outdated-notice";
import {
  describeRelayFailure,
  encryptForVault,
  outdatedRelayVersion,
} from "@/lib/relay/relay-browser-client";
import type { EncryptForVaultReply } from "@/lib/relay/relay-endpoints";

/**
 * Ô nhập → cột trong `Account`.
 *
 * Tên cột đi thẳng từ cầu nối về form rồi lên máy chủ mà không qua bước ánh xạ nào khác — mỗi
 * chỗ đổi tên giữa hai chương trình viết rời là một chỗ lệch được.
 */
const SECRET_FIELDS = [
  ["password", "passwordEnc"],
  ["emailPassword", "emailPasswordEnc"],
  ["totpSecret", "totpSecretEnc"],
] as const;

export function AccountVaultForm({
  action,
  submitLabel,
  children,
}: {
  action: (prev: ActionResult | null, formData: FormData) => Promise<ActionResult>;
  submitLabel: string;
  children: React.ReactNode;
}) {
  const [state, setState] = useState<ActionResult | null>(null);
  const [pending, setPending] = useState(false);
  // Chỉ bật lên, không tắt — xem `noteRelayVersion` ở panel thao tác kho.
  const [outdatedVersion, setOutdatedVersion] = useState<number | null>(null);

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (pending) return;

    const formData = new FormData(event.currentTarget);

    // Lấy bí mật RA KHỎI FormData ngay, kể cả khi lát nữa có lỗi: từ dòng này trở đi không có
    // đường nào gửi chúng lên máy chủ nữa, dù nhánh nào chạy.
    const secrets: Record<string, string> = {};
    for (const [field] of SECRET_FIELDS) {
      const value = String(formData.get(field) ?? "").trim();
      formData.delete(field);
      if (value) secrets[field] = value;
    }

    if (Object.keys(secrets).length === 0) {
      await submit(formData);
      return;
    }

    // ⚠️ Lời gọi mạng đầu tiên, KHÔNG có await nào phía trên — xem chú thích đầu file.
    const sealed = encryptForVault<EncryptForVaultReply>(secrets);

    setPending(true);
    setState(null);
    try {
      const outcome = await sealed;
      const oldRelay = outdatedRelayVersion(outcome);
      if (oldRelay !== null) setOutdatedVersion(oldRelay);

      if (outcome.status !== "ok") {
        setState({ ok: false, message: describeRelayFailure(outcome) });
        return;
      }

      for (const [field, column] of SECRET_FIELDS) {
        const ciphertext = outcome.data[column];
        if (secrets[field] && ciphertext) formData.set(column, ciphertext);
      }

      setState(await action(null, formData));
    } catch {
      setState({ ok: false, message: "Không lưu được. Tải lại trang rồi thử lại." });
    } finally {
      setPending(false);
    }
  }

  async function submit(formData: FormData) {
    setPending(true);
    setState(null);
    try {
      setState(await action(null, formData));
    } catch {
      setState({ ok: false, message: "Không lưu được. Tải lại trang rồi thử lại." });
    } finally {
      setPending(false);
    }
  }

  return (
    // `method="post"` chứ không để mặc định: nếu vì lý do nào đó trình duyệt vẫn gửi form theo
    // đường của nó, dữ liệu phải nằm trong thân request chứ không nằm trong URL — thanh địa chỉ
    // và lịch sử duyệt web là hai nơi không bao giờ được có mật khẩu.
    <form method="post" onSubmit={handleSubmit} className="space-y-4">
      {outdatedVersion !== null ? <RelayOutdatedNotice relayVersion={outdatedVersion} /> : null}

      <div className="grid gap-4 sm:grid-cols-2">{children}</div>

      {state ? (
        <p
          className={
            state.ok
              ? "text-sm text-emerald-700 dark:text-emerald-400"
              : "text-sm text-red-700 dark:text-red-400"
          }
        >
          {state.message}
        </p>
      ) : null}

      <button
        type="submit"
        disabled={pending}
        className="rounded-md bg-neutral-900 px-4 py-2 text-sm font-medium text-white transition hover:bg-neutral-700 disabled:opacity-50 dark:bg-neutral-100 dark:text-neutral-900 dark:hover:bg-neutral-300"
      >
        {pending ? "Đang lưu…" : submitLabel}
      </button>
    </form>
  );
}
