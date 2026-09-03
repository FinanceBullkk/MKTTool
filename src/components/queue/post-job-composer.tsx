"use client";

/**
 * Tạo job đăng bài: content → nick → đích → giờ, bộ luật chạy ngay sau mỗi lần đổi.
 *
 * Content lấy từ kho hoặc gõ thẳng tại đây (xem content-source-picker.tsx) — cả hai đường đều
 * chạy qua đúng một bộ luật, nên đèn nói cùng một thứ dù đi đường nào.
 *
 * Thấy trước khi bấm mới là điểm mấu chốt. Bảng verdict hiện lý do bằng tiếng Việt, nút "Xếp lịch"
 * khóa khi đèn đỏ; muốn qua thì phải gõ lý do ghi đè — trừ luật đụng độ thread, không có đường vòng.
 */
import { useActionState, useEffect, useState } from "react";
import { RuleVerdictPanel } from "@/components/queue/rule-verdict-badge";
import { parseLinksInput } from "@/lib/content/content-types";
import { formatDayMonthTime } from "@/lib/format/vietnamese-date-format";
import { isPlatformCompatible } from "@/lib/platforms/platform-family";
import { createPostJob } from "@/lib/queue/post-job-actions";
import { buildComposeSteps } from "./compose-pipeline-steps";
import { PipelineStrip } from "./pipeline-strip";
import {
  type ContentMode,
  ContentSourcePicker,
  type DraftContent,
  emptyDraft,
  isDraftUsable,
} from "./content-source-picker";
import {
  AccountSelect,
  type ComposerAccount,
  type ComposerContent,
  type ComposerTarget,
  FIELD_CLASS,
  nextHourInputValue,
  ScheduledAtField,
  TargetSelect,
} from "./post-job-fields";
import { type PreviewContent, useRulePreview } from "./use-rule-preview";

const MIN_OVERRIDE_REASON_LENGTH = 10;

export function PostJobComposer({
  contents,
  accounts,
  targets,
  defaultAuthorName,
}: {
  contents: ComposerContent[];
  accounts: ComposerAccount[];
  targets: ComposerTarget[];
  defaultAuthorName?: string;
}) {
  const [state, formAction, pending] = useActionState(createPostJob, null);
  // Kho trống thì "Chọn từ kho" là ngõ cụt; còn khi kho có bài, giữ nguyên đường cũ làm mặc định
  // để thói quen đang có không đổi dưới chân người dùng.
  const [contentMode, setContentMode] = useState<ContentMode>(
    contents.length === 0 ? "draft" : "library",
  );
  const [contentItemId, setContentItemId] = useState("");
  const [draft, setDraft] = useState<DraftContent>(() => emptyDraft(defaultAuthorName));
  const [accountId, setAccountId] = useState("");
  const [targetId, setTargetId] = useState("");
  const [scheduledAt, setScheduledAt] = useState("");
  const [overrideReason, setOverrideReason] = useState("");

  // Đặt giờ mặc định sau khi mount, không đặt lúc render — server và client lệch giờ là vỡ hydrate.
  //
  // Đây là ngoại lệ có chủ ý của luật set-state-in-effect: giá trị này CHỈ tính được ở client
  // (nó phụ thuộc múi giờ máy người dùng), nên không có cách nào suy ra lúc render mà vẫn
  // hydrate sạch. Đổi một lượt render thừa lúc mount để lấy giờ đúng là đánh đổi đáng.
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setScheduledAt(nextHourInputValue());
  }, []);

  /**
   * Lưu xong thì dọn form về trạng thái xếp bài tiếp theo.
   *
   * BẮT BUỘC, không phải cho gọn: React 19 tự reset form sau khi action chạy xong, nhưng nó chỉ
   * giữ lại được ô text và datetime — mọi `<select>` bị xóa về mục đầu tiên trong khi state React
   * vẫn ôm id cũ. Không dọn thì băng chuyền và đèn luật kể chuyện của lựa chọn đã biến mất khỏi
   * màn hình, và bấm "Xếp lịch" lần nữa sẽ gửi lên id rỗng trong lúc mọi thứ vẫn hiện xanh.
   */
  useEffect(() => {
    if (!state?.ok) return;
    /* eslint-disable react-hooks/set-state-in-effect */
    setContentItemId("");
    setAccountId("");
    setTargetId("");
    setOverrideReason("");
    setDraft(emptyDraft(defaultAuthorName));
    setScheduledAt(nextHourInputValue());
    /* eslint-enable react-hooks/set-state-in-effect */
  }, [state, defaultAuthorName]);

  const selectedAccount = accounts.find((account) => account.id === accountId);
  const eligibleTargets = selectedAccount
    ? targets.filter((target) => isPlatformCompatible(selectedAccount.platform, target.platform))
    : targets;

  // Đổi nick sang nền tảng khác thì đích đã chọn không còn hợp lệ. Suy ra thay vì xóa state
  // trong effect: xóa bằng effect để lại đúng một lượt render mang đích lệch nền tảng, đủ để
  // bộ luật chạy thử trên một cặp nick/đích không bao giờ tồn tại.
  const targetStillValid = !targetId || eligibleTargets.some((target) => target.id === targetId);
  const effectiveTargetId = targetStillValid ? targetId : "";

  const contentReady = contentMode === "library" ? Boolean(contentItemId) : isDraftUsable(draft);
  const previewContent: PreviewContent | null = !contentReady
    ? null
    : contentMode === "library"
      ? { contentItemId }
      : {
          draft: {
            type: draft.type,
            title: draft.title,
            body: draft.body,
            links: parseLinksInput(draft.linksText),
          },
        };

  const preview = useRulePreview({
    content: previewContent,
    accountId,
    targetId: effectiveTargetId,
    scheduledAt,
  });
  const evaluation = preview.status === "ready" ? preview.evaluation : null;
  const blocked = evaluation?.level === "BLOCK";
  const canOverride = blocked && evaluation.overridable;

  // Nhãn chỉ hiện khi phần đó đã đủ để lưu — băng chuyền nói "xong" trong khi nút còn khóa là
  // dạy người dùng tin nhầm chỗ.
  const selectedContent = contents.find((content) => content.id === contentItemId);
  const steps = buildComposeSteps({
    contentMode,
    contentLabel: !contentReady
      ? null
      : contentMode === "draft"
        ? draft.title.trim()
        : (selectedContent?.title ?? null),
    accountLabel: selectedAccount?.username ?? null,
    targetLabel: eligibleTargets.find((target) => target.id === effectiveTargetId)?.name ?? null,
    scheduledLabel: scheduledAt ? formatDayMonthTime(new Date(scheduledAt)) : null,
    preview,
  });

  const submitDisabled =
    pending ||
    !contentReady ||
    !accountId ||
    !effectiveTargetId ||
    !scheduledAt ||
    (blocked &&
      (!evaluation.overridable || overrideReason.trim().length < MIN_OVERRIDE_REASON_LENGTH));

  return (
    <form action={formAction} className="space-y-5">
      <PipelineStrip steps={steps} />

      <ContentSourcePicker
        mode={contentMode}
        onModeChange={setContentMode}
        contents={contents}
        contentItemId={contentItemId}
        onContentItemIdChange={setContentItemId}
        draft={draft}
        onDraftChange={setDraft}
      />

      <div className="grid gap-4 sm:grid-cols-2">
        <AccountSelect accounts={accounts} value={accountId} onChange={setAccountId} />
        <TargetSelect
          targets={eligibleTargets}
          value={effectiveTargetId}
          onChange={setTargetId}
          filtered={Boolean(selectedAccount)}
        />
        <ScheduledAtField value={scheduledAt} onChange={setScheduledAt} />
      </div>

      <div className="rounded-md border border-neutral-200 p-4 dark:border-neutral-800">
        {preview.status === "idle" ? (
          <p className="text-sm text-neutral-500">
            Select content, a nick, a target, and a posting time to run the rules.
          </p>
        ) : null}
        {preview.status === "loading" ? (
          <p className="text-sm text-neutral-500">Evaluating posting rules...</p>
        ) : null}
        {preview.status === "error" ? (
          <p className="text-sm text-red-700 dark:text-red-400">{preview.message}</p>
        ) : null}
        {evaluation ? <RuleVerdictPanel evaluation={evaluation} /> : null}
      </div>

      {canOverride ? (
        <label className="block">
          <span className="mb-1 block text-xs font-medium text-red-700 dark:text-red-400">
            Override reason (required; recorded in the audit log)
          </span>
          <textarea
            className={FIELD_CLASS}
            name="overrideReason"
            rows={2}
            value={overrideReason}
            onChange={(event) => setOverrideReason(event.target.value)}
            placeholder="Example: This subreddit does not enforce the 9:1 rule; confirmed with a moderator."
          />
        </label>
      ) : null}

      {blocked && !evaluation.overridable ? (
        <p className="text-sm font-medium text-red-700 dark:text-red-400">
          The thread-collision rule cannot be overridden. Choose another nick or thread.
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
        {pending ? "Saving..." : blocked ? "Override and schedule" : "Schedule"}
      </button>
    </form>
  );
}
