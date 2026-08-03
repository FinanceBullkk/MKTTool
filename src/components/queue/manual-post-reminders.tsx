"use client";

/**
 * Nhắc việc đăng tay: mở đúng profile, copy sẵn nội dung, mở thẳng đích đăng.
 * Phần dán và bấm đăng là của người — Reddit chưa có bộ tự đăng (Phase 05), còn Group thì
 * Meta gỡ quyền tự đăng từ 04/2024.
 *
 * Đăng xong nhớ bấm "Đã đăng" ở hàng đợi. Không bấm thì bộ luật không thấy bài này: luật
 * chặn đụng độ thread không có gì để so, và bộ dò shadowban không có bài nào để đối chiếu.
 *
 * Reddit hiện HAI nút copy vì form đăng của nó có hai ô rời (tiêu đề và nội dung); Facebook
 * Group chỉ có một ô nên chỉ cần một nút.
 */
import { useState } from "react";
import Link from "next/link";
import { formatDayMonthTime } from "@/lib/format/vietnamese-date-format";
import type { ManualPostReminder } from "@/lib/queue/manual-post-reminders";

const BUTTON_CLASS =
  "rounded-md border border-neutral-300 px-2 py-1 text-xs transition hover:bg-neutral-100 " +
  "disabled:opacity-50 dark:border-neutral-700 dark:hover:bg-neutral-800";

const PLATFORM_LABEL: Record<string, string> = {
  REDDIT: "Reddit",
  FACEBOOK_GROUP: "FB Group",
};

interface CopyButton {
  label: string;
  text: string;
  doneMessage: string;
}

/** Reddit: hai ô rời. Facebook Group: một khối. */
function copyButtonsFor(reminder: ManualPostReminder): CopyButton[] {
  if (reminder.targetPlatform === "REDDIT") {
    return [
      {
        label: "Copy tiêu đề",
        text: reminder.contentTitle,
        doneMessage: "Đã copy tiêu đề. Dán vào ô Title của Reddit.",
      },
      {
        label: "Copy thân bài",
        text: reminder.bodyToCopy,
        doneMessage: "Đã copy thân bài. Dán vào ô Text của Reddit.",
      },
    ];
  }

  return [
    {
      label: "Copy nội dung",
      text: reminder.messageToCopy,
      doneMessage: "Đã copy nội dung. Dán vào ô đăng bài của group.",
    },
  ];
}

function ReminderRow({ reminder }: { reminder: ManualPostReminder }) {
  const [busy, setBusy] = useState(false);
  const [feedback, setFeedback] = useState<{ ok: boolean; text: string } | null>(null);

  async function copyText(button: CopyButton) {
    try {
      await navigator.clipboard.writeText(button.text);
      setFeedback({ ok: true, text: button.doneMessage });
    } catch {
      setFeedback({ ok: false, text: "Trình duyệt không cho copy. Mở content rồi copy tay." });
    }
  }

  async function launchProfile() {
    setBusy(true);
    setFeedback(null);
    try {
      const response = await fetch(`/api/accounts/${reminder.accountId}/launch`, { method: "POST" });
      const body = (await response.json()) as { ok: boolean; message: string };
      setFeedback({ ok: body.ok, text: body.message });
    } catch {
      setFeedback({ ok: false, text: "Không gọi được API mở profile." });
    } finally {
      setBusy(false);
    }
  }

  return (
    <li className="rounded-md border border-neutral-200 px-3 py-2 dark:border-neutral-800">
      <div className="flex flex-wrap items-baseline gap-x-2 gap-y-1 text-sm">
        <span className="rounded border border-neutral-300 px-1.5 py-0.5 text-xs text-neutral-600 dark:border-neutral-700 dark:text-neutral-400">
          {PLATFORM_LABEL[reminder.targetPlatform] ?? reminder.targetPlatform}
        </span>
        <span className={reminder.overdue ? "font-medium text-amber-700 dark:text-amber-400" : ""}>
          {formatDayMonthTime(reminder.scheduledAt)}
          {reminder.overdue ? " (quá giờ)" : ""}
        </span>
        <span className="font-medium">{reminder.accountUsername}</span>
        <span className="text-neutral-500">đăng vào</span>
        <a href={reminder.targetUrl} target="_blank" rel="noreferrer" className="underline">
          {reminder.targetName}
        </a>
      </div>
      <p className="mt-0.5 text-xs text-neutral-500">{reminder.contentTitle}</p>

      <div className="mt-2 flex flex-wrap gap-1">
        <button type="button" className={BUTTON_CLASS} disabled={busy} onClick={launchProfile}>
          Mở profile
        </button>
        {copyButtonsFor(reminder).map((button) => (
          <button
            key={button.label}
            type="button"
            className={BUTTON_CLASS}
            onClick={() => copyText(button)}
          >
            {button.label}
          </button>
        ))}
        <Link href="/queue?status=PENDING" className={BUTTON_CLASS}>
          Đánh dấu đã đăng
        </Link>
      </div>

      {feedback ? (
        <p
          className={
            feedback.ok
              ? "mt-1 text-xs text-emerald-700 dark:text-emerald-400"
              : "mt-1 text-xs text-red-700 dark:text-red-400"
          }
        >
          {feedback.text}
        </p>
      ) : null}
    </li>
  );
}

export function ManualPostReminders({ reminders }: { reminders: ManualPostReminder[] }) {
  return (
    <ul className="space-y-2">
      {reminders.map((reminder) => (
        <ReminderRow key={reminder.jobId} reminder={reminder} />
      ))}
    </ul>
  );
}
