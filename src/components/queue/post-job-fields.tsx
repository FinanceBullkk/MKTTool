"use client";

/** Phần chọn lựa của form tạo job. Tách khỏi post-job-composer.tsx để mỗi file gọn một việc. */
import { CONTENT_TYPE_LABELS, type ContentType } from "@/lib/content/content-types";

export interface ComposerContent {
  id: string;
  title: string;
  type: string;
  authorName: string;
}

export interface ComposerAccount {
  id: string;
  username: string;
  platform: string;
}

export interface ComposerTarget {
  id: string;
  name: string;
  platform: string;
}

export const FIELD_CLASS =
  "w-full rounded-md border border-neutral-300 bg-white px-3 py-2 text-sm " +
  "focus:border-neutral-500 focus:outline-none dark:border-neutral-700 dark:bg-neutral-900";

function FieldLabel({ label }: { label: string }) {
  return (
    <span className="mb-1 block text-xs font-medium text-neutral-600 dark:text-neutral-400">
      {label} <span className="text-red-600">*</span>
    </span>
  );
}

export function ContentSelect({
  contents,
  value,
  onChange,
}: {
  contents: ComposerContent[];
  value: string;
  onChange: (value: string) => void;
}) {
  return (
    <label className="block sm:col-span-2">
      <FieldLabel label="Content" />
      <select
        className={FIELD_CLASS}
        name="contentItemId"
        value={value}
        onChange={(event) => onChange(event.target.value)}
        required
      >
        <option value="">— chọn —</option>
        {contents.map((content) => (
          <option key={content.id} value={content.id}>
            [{CONTENT_TYPE_LABELS[content.type as ContentType] ?? content.type}] {content.title} —{" "}
            {content.authorName}
          </option>
        ))}
      </select>
    </label>
  );
}

export function AccountSelect({
  accounts,
  value,
  onChange,
}: {
  accounts: ComposerAccount[];
  value: string;
  onChange: (value: string) => void;
}) {
  return (
    <label className="block">
      <FieldLabel label="Nick" />
      <select
        className={FIELD_CLASS}
        name="accountId"
        value={value}
        onChange={(event) => onChange(event.target.value)}
        required
      >
        <option value="">— chọn —</option>
        {accounts.map((account) => (
          <option key={account.id} value={account.id}>
            {account.username} ({account.platform})
          </option>
        ))}
      </select>
    </label>
  );
}

export function TargetSelect({
  targets,
  value,
  onChange,
  filtered,
}: {
  targets: ComposerTarget[];
  value: string;
  onChange: (value: string) => void;
  filtered: boolean;
}) {
  return (
    <label className="block">
      <FieldLabel label="Đích đăng" />
      <select
        className={FIELD_CLASS}
        name="targetId"
        value={value}
        onChange={(event) => onChange(event.target.value)}
        required
      >
        <option value="">— chọn —</option>
        {targets.map((target) => (
          <option key={target.id} value={target.id}>
            {target.name}
          </option>
        ))}
      </select>
      {filtered ? (
        <span className="mt-1 block text-xs text-neutral-500">
          Chỉ hiện đích cùng nền tảng với nick.
        </span>
      ) : null}
    </label>
  );
}

export function ScheduledAtField({
  value,
  onChange,
}: {
  value: string;
  onChange: (value: string) => void;
}) {
  return (
    <label className="block">
      <FieldLabel label="Giờ đăng" />
      <input
        className={FIELD_CLASS}
        type="datetime-local"
        name="scheduledAt"
        value={value}
        onChange={(event) => onChange(event.target.value)}
        required
      />
      <span className="mt-1 block text-xs text-neutral-500">
        Luật chạy theo giờ này, không phải giờ hiện tại.
      </span>
    </label>
  );
}
