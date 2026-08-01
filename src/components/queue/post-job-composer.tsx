"use client";

/**
 * Tạo job đăng bài: chọn content → nick → đích → giờ, bộ luật chạy ngay sau mỗi lần đổi.
 *
 * Thấy trước khi bấm mới là điểm mấu chốt. Bảng verdict hiện lý do bằng tiếng Việt, nút "Xếp lịch"
 * khóa khi đèn đỏ; muốn qua thì phải gõ lý do ghi đè — trừ luật đụng độ thread, không có đường vòng.
 */
import { useActionState, useEffect, useState } from "react";
import { RuleVerdictPanel } from "@/components/queue/rule-verdict-badge";
import { isPlatformCompatible } from "@/lib/platforms/platform-family";
import { createPostJob } from "@/lib/queue/post-job-actions";
import {
  AccountSelect,
  type ComposerAccount,
  type ComposerContent,
  type ComposerTarget,
  ContentSelect,
  FIELD_CLASS,
  ScheduledAtField,
  TargetSelect,
} from "./post-job-fields";
import { useRulePreview } from "./use-rule-preview";

/** Giá trị cho <input type="datetime-local"> theo giờ máy. */
function toLocalInputValue(date: Date): string {
  const pad = (value: number) => String(value).padStart(2, "0");
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

const MIN_OVERRIDE_REASON_LENGTH = 10;

export function PostJobComposer({
  contents,
  accounts,
  targets,
}: {
  contents: ComposerContent[];
  accounts: ComposerAccount[];
  targets: ComposerTarget[];
}) {
  const [state, formAction, pending] = useActionState(createPostJob, null);
  const [contentItemId, setContentItemId] = useState("");
  const [accountId, setAccountId] = useState("");
  const [targetId, setTargetId] = useState("");
  const [scheduledAt, setScheduledAt] = useState("");
  const [overrideReason, setOverrideReason] = useState("");

  // Đặt giờ mặc định sau khi mount, không đặt lúc render — server và client lệch giờ là vỡ hydrate.
  useEffect(() => {
    const nextHour = new Date();
    nextHour.setHours(nextHour.getHours() + 1, 0, 0, 0);
    setScheduledAt(toLocalInputValue(nextHour));
  }, []);

  const selectedAccount = accounts.find((account) => account.id === accountId);
  const eligibleTargets = selectedAccount
    ? targets.filter((target) => isPlatformCompatible(selectedAccount.platform, target.platform))
    : targets;

  // Đổi nick sang nền tảng khác thì đích đã chọn không còn hợp lệ.
  const targetStillValid = !targetId || eligibleTargets.some((target) => target.id === targetId);
  useEffect(() => {
    if (!targetStillValid) setTargetId("");
  }, [targetStillValid]);

  const preview = useRulePreview({ contentItemId, accountId, targetId, scheduledAt });
  const evaluation = preview.status === "ready" ? preview.evaluation : null;
  const blocked = evaluation?.level === "BLOCK";
  const canOverride = blocked && evaluation.overridable;

  const submitDisabled =
    pending ||
    !contentItemId ||
    !accountId ||
    !targetId ||
    !scheduledAt ||
    (blocked &&
      (!evaluation.overridable || overrideReason.trim().length < MIN_OVERRIDE_REASON_LENGTH));

  return (
    <form action={formAction} className="space-y-5">
      <div className="grid gap-4 sm:grid-cols-2">
        <ContentSelect contents={contents} value={contentItemId} onChange={setContentItemId} />
        <AccountSelect accounts={accounts} value={accountId} onChange={setAccountId} />
        <TargetSelect
          targets={eligibleTargets}
          value={targetId}
          onChange={setTargetId}
          filtered={Boolean(selectedAccount)}
        />
        <ScheduledAtField value={scheduledAt} onChange={setScheduledAt} />
      </div>

      <div className="rounded-md border border-neutral-200 p-4 dark:border-neutral-800">
        {preview.status === "idle" ? (
          <p className="text-sm text-neutral-500">
            Chọn đủ content, nick, đích và giờ để bộ luật chạy.
          </p>
        ) : null}
        {preview.status === "loading" ? (
          <p className="text-sm text-neutral-500">Đang chạy bộ luật…</p>
        ) : null}
        {preview.status === "error" ? (
          <p className="text-sm text-red-700 dark:text-red-400">{preview.message}</p>
        ) : null}
        {evaluation ? <RuleVerdictPanel evaluation={evaluation} /> : null}
      </div>

      {canOverride ? (
        <label className="block">
          <span className="mb-1 block text-xs font-medium text-red-700 dark:text-red-400">
            Lý do ghi đè (bắt buộc, ghi vào nhật ký)
          </span>
          <textarea
            className={FIELD_CLASS}
            name="overrideReason"
            rows={2}
            value={overrideReason}
            onChange={(event) => setOverrideReason(event.target.value)}
            placeholder="Ví dụ: sub này thực tế không áp luật 9:1, đã hỏi mod."
          />
        </label>
      ) : null}

      {blocked && !evaluation.overridable ? (
        <p className="text-sm font-medium text-red-700 dark:text-red-400">
          Luật đụng độ thread không cho ghi đè. Đổi nick khác hoặc chọn thread khác.
        </p>
      ) : null}

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
        disabled={submitDisabled}
        className="rounded-md bg-neutral-900 px-4 py-2 text-sm font-medium text-white transition hover:bg-neutral-700 disabled:opacity-50 dark:bg-neutral-100 dark:text-neutral-900 dark:hover:bg-neutral-300"
      >
        {pending ? "Đang lưu…" : blocked ? "Ghi đè và xếp lịch" : "Xếp lịch"}
      </button>
    </form>
  );
}
