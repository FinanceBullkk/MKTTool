"use client";

/**
 * Nhắc việc đăng tay: mở đúng profile, copy sẵn nội dung, mở thẳng đích đăng.
 * Phần dán và bấm đăng là của người — Reddit chưa có bộ tự đăng (Phase 05), còn Group thì
 * Meta gỡ quyền tự đăng từ 04/2024.
 *
 * Đăng xong bấm "Đã đăng" ngay tại thẻ này, không phải sang hàng đợi. Không bấm thì bộ luật
 * không thấy bài này: luật chặn đụng độ thread không có gì để so, và bộ dò shadowban không có
 * bài nào để đối chiếu — nên bước đó phải nằm đúng chỗ vừa đăng xong, không thêm một hop nào.
 *
 * Reddit hiện HAI nút copy vì form đăng của nó có hai ô rời (tiêu đề và nội dung); Facebook
 * Group chỉ có một ô nên chỉ cần một nút.
 */
import { useState } from "react";
import { SMALL_BUTTON_CLASS as BUTTON_CLASS } from "@/components/ui/page-section";
import { formatDayMonthTime } from "@/lib/format/vietnamese-date-format";
import type { ManualPostReminder } from "@/lib/queue/manual-post-reminders";
import { MarkPostedControl } from "./mark-posted-control";

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
        label: "Copy title",
        text: reminder.contentTitle,
        doneMessage: "Title copied. Paste into Reddit's Title field.",
      },
      {
        label: "Copy post content",
        text: reminder.bodyToCopy,
        doneMessage: "Post content copied. Paste into Reddit's Text field.",
      },
    ];
  }

  return [
    {
      label: "Copy content",
      text: reminder.messageToCopy,
      doneMessage: "Content copied. Paste it into the group's post field.",
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
      setFeedback({ ok: false, text: "The browser blocked copying. Open the content item and copy it manually." });
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
      setFeedback({ ok: false, text: "Could not request the browser profile launch. Try again or open it from the nick vault." });
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
          {reminder.overdue ? " (overdue)" : ""}
        </span>
        <span className="font-medium">{reminder.accountUsername}</span>
        <span className="text-neutral-500">post to</span>
        <a href={reminder.targetUrl} target="_blank" rel="noreferrer" className="underline">
          {reminder.targetName}
        </a>
      </div>
      <p className="mt-0.5 text-xs text-neutral-500">{reminder.contentTitle}</p>

      {/* items-start: ô dán link mở ra thì rơi xuống dưới, mấy nút copy đứng nguyên chỗ cũ. */}
      <div className="mt-2 flex flex-wrap items-start gap-1">
        <button type="button" className={BUTTON_CLASS} disabled={busy} onClick={launchProfile}>
          Open profile
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
        <MarkPostedControl jobId={reminder.jobId} />
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
