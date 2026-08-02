"use client";

/**
 * Nhắc việc đăng Facebook Group: mở đúng profile, copy sẵn nội dung, mở group.
 * Phần dán và bấm đăng là của người — Meta gỡ quyền tự đăng group từ 04/2024.
 *
 * Đăng xong nhớ bấm "Đã đăng" ở hàng đợi. Không bấm thì bộ luật không thấy bài này,
 * và nick khác có thể được cho phép nhảy vào đúng thread đó.
 */
import { useState } from "react";
import Link from "next/link";
import type { GroupReminder } from "@/lib/facebook/facebook-group-reminder";
import { formatDayMonthTime } from "@/lib/format/vietnamese-date-format";

const BUTTON_CLASS =
  "rounded-md border border-neutral-300 px-2 py-1 text-xs transition hover:bg-neutral-100 " +
  "disabled:opacity-50 dark:border-neutral-700 dark:hover:bg-neutral-800";

function ReminderRow({ reminder }: { reminder: GroupReminder }) {
  const [busy, setBusy] = useState(false);
  const [feedback, setFeedback] = useState<{ ok: boolean; text: string } | null>(null);

  async function copyContent() {
    try {
      await navigator.clipboard.writeText(reminder.messageToCopy);
      setFeedback({ ok: true, text: "Đã copy nội dung. Dán vào ô đăng bài của group." });
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
        <span className={reminder.overdue ? "font-medium text-amber-700 dark:text-amber-400" : ""}>
          {formatDayMonthTime(reminder.scheduledAt)}
          {reminder.overdue ? " (quá giờ)" : ""}
        </span>
        <span className="font-medium">{reminder.accountUsername}</span>
        <span className="text-neutral-500">đăng vào</span>
        <a href={reminder.groupUrl} target="_blank" rel="noreferrer" className="underline">
          {reminder.groupName}
        </a>
      </div>
      <p className="mt-0.5 text-xs text-neutral-500">{reminder.contentTitle}</p>

      <div className="mt-2 flex flex-wrap gap-1">
        <button type="button" className={BUTTON_CLASS} disabled={busy} onClick={launchProfile}>
          Mở profile
        </button>
        <button type="button" className={BUTTON_CLASS} onClick={copyContent}>
          Copy nội dung
        </button>
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

export function GroupPostReminders({ reminders }: { reminders: GroupReminder[] }) {
  return (
    <ul className="space-y-2">
      {reminders.map((reminder) => (
        <ReminderRow key={reminder.jobId} reminder={reminder} />
      ))}
    </ul>
  );
}
