"use client";

/**
 * Form nhập content.
 *
 * Nút "Dán từ clipboard" có mặt vì content được viết ở chỗ khác (Docs, Notion) rồi mang sang —
 * bắt người ta chuyển tab để Ctrl+V từng ô là chỗ dễ nản nhất của cả quy trình.
 */
import { useActionState, useRef, useState } from "react";
import { ClipboardPaste, Save } from "lucide-react";
import type { ActionResult } from "@/lib/actions/action-result";
import { PRIMARY_BUTTON_CLASS, SMALL_BUTTON_CLASS } from "@/components/ui/page-section";
import { CONTENT_TYPES, CONTENT_TYPE_LABELS } from "@/lib/content/content-types";
import { createContentItem } from "@/lib/content/content-item-actions";

const FIELD_CLASS =
  "min-h-11 w-full rounded-xl border border-white/[0.1] bg-black/20 px-3 py-2 text-base text-white outline-none transition-colors placeholder:text-neutral-600 focus:border-amber-400/50 focus:bg-black/30 sm:text-sm";

const LABEL_CLASS = "mb-1.5 block text-xs font-medium text-neutral-400";

export interface ContentItemDefaults {
  id: string;
  title: string;
  body: string;
  type: string;
  authorName: string;
  /** Mỗi dòng một link — đúng dạng ô nhập chờ đợi. */
  linksText: string;
}

/**
 * Form nhập/sửa content.
 *
 * `action` truyền vào chứ không nhúng cứng: thêm mới và sửa dùng chung đúng bộ ô, chỉ khác
 * đích đến. Có `defaults` là đang sửa — kèm luôn ô ẩn `id`.
 */
export function ContentItemForm({
  defaultAuthorName,
  action = createContentItem,
  defaults,
  submitLabel,
}: {
  defaultAuthorName?: string;
  action?: (prev: ActionResult | null, formData: FormData) => Promise<ActionResult>;
  defaults?: ContentItemDefaults;
  submitLabel?: string;
}) {
  const [state, formAction, pending] = useActionState(action, null);
  const bodyRef = useRef<HTMLTextAreaElement>(null);
  const [pasteError, setPasteError] = useState<string | null>(null);

  async function pasteIntoBody() {
    try {
      const text = await navigator.clipboard.readText();
      if (!bodyRef.current) return;
      bodyRef.current.value = text;
      bodyRef.current.focus();
      setPasteError(null);
    } catch {
      setPasteError("The browser blocked clipboard access. Paste manually with Ctrl+V.");
    }
  }

  return (
    <form action={formAction} className="space-y-4">
      {defaults ? <input type="hidden" name="id" value={defaults.id} /> : null}
      <div className="grid gap-4 sm:grid-cols-2">
        <label className="block sm:col-span-2">
          <span className={LABEL_CLASS}>
            Title <span className="text-red-600">*</span>
          </span>
          <input className={FIELD_CLASS} name="title" defaultValue={defaults?.title} required />
        </label>

        <label className="block sm:col-span-2">
          <span className={LABEL_CLASS}>
            Body <span className="text-red-600">*</span>
          </span>
          <textarea
            className={FIELD_CLASS}
            name="body"
            rows={8}
            ref={bodyRef}
            defaultValue={defaults?.body}
            required
          />
          <button
            type="button"
            onClick={pasteIntoBody}
            className={`${SMALL_BUTTON_CLASS} mt-2 gap-2`}
          >
            <ClipboardPaste size={14} aria-hidden="true" />
            Paste from clipboard
          </button>
          {pasteError ? <span className="ml-2 text-xs text-red-600">{pasteError}</span> : null}
        </label>

        <label className="block">
          <span className={LABEL_CLASS}>
            Type <span className="text-red-600">*</span>
          </span>
          <select className={FIELD_CLASS} name="type" defaultValue={defaults?.type ?? "VALUE"} required>
            {CONTENT_TYPES.map((type) => (
              <option key={type} value={type}>
                {CONTENT_TYPE_LABELS[type]}
              </option>
            ))}
          </select>
          <span className="mt-1.5 block text-xs leading-5 text-neutral-500">
            Direct and indirect product mentions are promotional.
          </span>
        </label>

        <label className="block">
          <span className={LABEL_CLASS}>
            Author <span className="text-red-600">*</span>
          </span>
          <input
            className={FIELD_CLASS}
            name="authorName"
            defaultValue={defaults?.authorName ?? defaultAuthorName}
            required
          />
        </label>

        <label className="block sm:col-span-2">
          <span className={LABEL_CLASS}>Links in the post</span>
          <textarea
            className={FIELD_CLASS}
            name="linksText"
            rows={2}
            defaultValue={defaults?.linksText}
            placeholder="One link per line"
          />
          <span className="mt-1.5 block text-xs leading-5 text-neutral-500">
            Body links are detected automatically; add only extra links here.
          </span>
        </label>
      </div>

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
        <Save size={15} aria-hidden="true" />
        {pending ? "Saving…" : (submitLabel ?? "Save content")}
      </button>
    </form>
  );
}
