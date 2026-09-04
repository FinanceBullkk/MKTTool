"use client";

import { useActionState } from "react";
import type { ActionResult } from "@/lib/actions/action-result";
import { PRIMARY_BUTTON_CLASS } from "@/components/ui/page-section";

const FIELD_CLASS =
  "min-h-11 w-full rounded-xl border border-white/[0.1] bg-black/20 px-3 py-2 text-base text-white outline-none transition-colors " +
  "placeholder:text-neutral-600 focus:border-amber-400/50 focus:bg-black/30 disabled:cursor-not-allowed disabled:opacity-45 sm:text-sm";

const LABEL_CLASS = "mb-1.5 block text-xs font-medium text-neutral-400";

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
      <span className={LABEL_CLASS}>
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
      {hint ? <span className="mt-1.5 block text-xs leading-5 text-neutral-500">{hint}</span> : null}
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
      <span className={LABEL_CLASS}>
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
        <option value="">— select —</option>
        {options.map((option) => (
          <option key={option.value} value={option.value}>
            {option.label}
          </option>
        ))}
      </select>
      {hint ? <span className="mt-1.5 block text-xs leading-5 text-neutral-500">{hint}</span> : null}
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
      <span className={LABEL_CLASS}>
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
      {hint ? <span className="mt-1.5 block text-xs leading-5 text-neutral-500">{hint}</span> : null}
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
    <label className="flex min-h-11 items-center gap-3 rounded-xl border border-white/[0.08] bg-black/10 px-3 text-sm text-neutral-300">
      <input type="checkbox" name={name} defaultChecked={defaultChecked} className="size-4 accent-amber-400" />
      <span className="leading-5">{label}</span>
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
    <form action={formAction} className="space-y-5">
      <div className="grid gap-4 sm:grid-cols-2">{children}</div>

      {state ? (
        <p
          role="status"
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
        className={PRIMARY_BUTTON_CLASS}
      >
        {pending ? "Saving…" : submitLabel}
      </button>
    </form>
  );
}
