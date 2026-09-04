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
import { useRouter } from "next/navigation";
import { useRef, useState } from "react";
import { Save } from "lucide-react";
import { PRIMARY_BUTTON_CLASS } from "@/components/ui/page-section";
import type { ActionResult } from "@/lib/actions/action-result";
import { RelayOutdatedNotice } from "@/components/relay/relay-outdated-notice";
import { describeSelectionChange, type LabeledSelection, type SelectionChange } from "@/lib/forms/selection-change";
import {
  describeRelayFailure,
  encryptForVault,
  outdatedRelayVersion,
} from "@/lib/relay/relay-browser-client";
import type { EncryptForVaultReply } from "@/lib/relay/relay-endpoints";
import { AccountProxyChangeConfirmation } from "./account-proxy-change-confirmation";

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
  proxyChange,
  revision,
}: {
  action: (prev: ActionResult | null, formData: FormData) => Promise<ActionResult>;
  submitLabel: string;
  children: React.ReactNode;
  proxyChange?: {
    initial: LabeledSelection | null;
    options: LabeledSelection[];
  };
  revision?: string;
}) {
  const router = useRouter();
  const formRef = useRef<HTMLFormElement>(null);
  const [state, setState] = useState<ActionResult | null>(null);
  const [pending, setPending] = useState(false);
  const [proxyConfirmation, setProxyConfirmation] = useState<SelectionChange | null>(null);
  // Chỉ bật lên, không tắt — xem `noteRelayVersion` ở panel thao tác kho.
  const [outdatedVersion, setOutdatedVersion] = useState<number | null>(null);

  function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (pending) return;

    const formData = new FormData(event.currentTarget);
    requestSubmit(formData);
  }

  function requestSubmit(formData: FormData) {
    const change = proxyChange
      ? describeSelectionChange({
          initial: proxyChange.initial,
          nextValue: String(formData.get("proxyId") ?? ""),
          options: proxyChange.options,
          emptyLabel: "No proxy assigned",
        })
      : null;
    if (change && change.afterValue !== proxyConfirmation?.afterValue) {
      setState(null);
      setProxyConfirmation(change);
      return;
    }

    void prepareAndSubmit(formData);
  }

  async function prepareAndSubmit(formData: FormData) {
    setProxyConfirmation(null);

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

      const result = await action(null, formData);
      setState(result);
      if (result.ok && revision) router.refresh();
    } catch {
      setState({ ok: false, message: "The nick could not be saved. Reload the page and try again." });
    } finally {
      setPending(false);
    }
  }

  async function submit(formData: FormData) {
    setPending(true);
    setState(null);
    try {
      const result = await action(null, formData);
      setState(result);
      if (result.ok && revision) router.refresh();
    } catch {
      setState({ ok: false, message: "The nick could not be saved. Reload the page and try again." });
    } finally {
      setPending(false);
    }
  }

  return (
    // `method="post"` chứ không để mặc định: nếu vì lý do nào đó trình duyệt vẫn gửi form theo
    // đường của nó, dữ liệu phải nằm trong thân request chứ không nằm trong URL — thanh địa chỉ
    // và lịch sử duyệt web là hai nơi không bao giờ được có mật khẩu.
    <form ref={formRef} method="post" onSubmit={handleSubmit} className="space-y-4">
      {revision ? <input type="hidden" name="revision" value={revision} /> : null}
      {outdatedVersion !== null ? <RelayOutdatedNotice relayVersion={outdatedVersion} /> : null}

      <div className="grid gap-4 sm:grid-cols-2">{children}</div>

      {state ? (
        <p
          role={state.ok ? "status" : "alert"}
          className={
            state.ok
              ? "text-sm text-emerald-300"
              : "text-sm text-red-300"
          }
        >
          {state.message}
        </p>
      ) : null}

      {proxyConfirmation ? (
        <AccountProxyChangeConfirmation
          change={proxyConfirmation}
          pending={pending}
          onConfirm={() => {
            const form = formRef.current;
            if (form) requestSubmit(new FormData(form));
          }}
          onCancel={() => setProxyConfirmation(null)}
        />
      ) : (
        <button
          type="submit"
          disabled={pending}
          className={PRIMARY_BUTTON_CLASS}
        >
          <Save size={16} aria-hidden="true" />
          {pending ? "Saving..." : submitLabel}
        </button>
      )}
    </form>
  );
}
