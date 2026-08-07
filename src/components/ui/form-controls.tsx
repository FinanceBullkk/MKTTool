"use client";

import { useActionState } from "react";
import type { ActionResult } from "@/lib/actions/action-result";

const FIELD_CLASS =
  "w-full rounded-md border border-neutral-300 bg-white px-3 py-2 text-sm " +
  "focus:border-neutral-500 focus:outline-none dark:border-neutral-700 dark:bg-neutral-900";

export function Field({
  label,
  name,
  type = "text",
  required,
  defaultValue,
  placeholder,
  hint,
  disabled,
}: {
  label: string;
  name: string;
  type?: string;
  required?: boolean;
  defaultValue?: string | number;
  placeholder?: string;
  hint?: string;
  /** Ô bị khóa **không được gửi lên** cùng form — xem `VaultSecretField`. */
  disabled?: boolean;
}) {
  return (
    <label className="block">
      <span className="mb-1 block text-xs font-medium text-neutral-600 dark:text-neutral-400">
        {label}
        {required ? <span className="text-red-600"> *</span> : null}
      </span>
      <input
        className={FIELD_CLASS}
        type={type}
        name={name}
        required={required}
        defaultValue={defaultValue}
        placeholder={placeholder}
        disabled={disabled}
      />
      {hint ? <span className="mt-1 block text-xs text-neutral-500">{hint}</span> : null}
    </label>
  );
}

export function SelectField({
  label,
  name,
  options,
  required,
  defaultValue,
  hint,
  disabled,
  onChange,
}: {
  label: string;
  name: string;
  options: { value: string; label: string }[];
  required?: boolean;
  defaultValue?: string;
  hint?: string;
  /** Ô bị khóa **không được gửi lên** cùng form — xem `Field`. */
  disabled?: boolean;
  /**
   * Báo giá trị vừa đổi. Ô vẫn **không được điều khiển** (`defaultValue`, không `value`) — đây chỉ
   * là cái tai cho những form phải vẽ lại phần khác theo lựa chọn này, ví dụ form nick ẩn ô mật
   * khẩu khi chọn nền tảng Reddit. Chuyển sang controlled thì mọi chỗ gọi khác phải giữ state hộ.
   */
  onChange?: (value: string) => void;
}) {
  return (
    <label className="block">
      <span className="mb-1 block text-xs font-medium text-neutral-600 dark:text-neutral-400">
        {label}
        {required ? <span className="text-red-600"> *</span> : null}
      </span>
      <select
        className={FIELD_CLASS}
        name={name}
        required={required}
        defaultValue={defaultValue}
        disabled={disabled}
        onChange={(event) => onChange?.(event.target.value)}
      >
        <option value="">— chọn —</option>
        {options.map((option) => (
          <option key={option.value} value={option.value}>
            {option.label}
          </option>
        ))}
      </select>
      {hint ? <span className="mt-1 block text-xs text-neutral-500">{hint}</span> : null}
    </label>
  );
}

/** Ô nhập nhiều dòng — chiếm cả hàng trong lưới 2 cột của ActionForm. */
export function TextareaField({
  label,
  name,
  rows = 6,
  required,
  defaultValue,
  placeholder,
  hint,
}: {
  label: string;
  name: string;
  rows?: number;
  required?: boolean;
  defaultValue?: string;
  placeholder?: string;
  hint?: string;
}) {
  return (
    <label className="block sm:col-span-2">
      <span className="mb-1 block text-xs font-medium text-neutral-600 dark:text-neutral-400">
        {label}
        {required ? <span className="text-red-600"> *</span> : null}
      </span>
      <textarea
        className={FIELD_CLASS}
        name={name}
        rows={rows}
        required={required}
        defaultValue={defaultValue}
        placeholder={placeholder}
      />
      {hint ? <span className="mt-1 block text-xs text-neutral-500">{hint}</span> : null}
    </label>
  );
}

export function CheckboxField({
  label,
  name,
  defaultChecked,
}: {
  label: string;
  name: string;
  defaultChecked?: boolean;
}) {
  return (
    <label className="flex items-center gap-2 text-sm">
      <input type="checkbox" name={name} defaultChecked={defaultChecked} className="size-4" />
      <span>{label}</span>
    </label>
  );
}

/**
 * Form bọc sẵn useActionState: hiện thông báo thành công/lỗi và khóa nút khi đang gửi.
 * Dùng chung cho mọi form tạo mới trong kho danh tính.
 */
export function ActionForm({
  action,
  submitLabel,
  children,
}: {
  action: (prev: ActionResult | null, formData: FormData) => Promise<ActionResult>;
  submitLabel: string;
  children: React.ReactNode;
}) {
  const [state, formAction, pending] = useActionState(action, null);

  return (
    <form action={formAction} className="space-y-4">
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
