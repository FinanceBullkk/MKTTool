"use client";

/**
 * Form nhập content.
 *
 * Nút "Dán từ clipboard" có mặt vì content được viết ở chỗ khác (Docs, Notion) rồi mang sang —
 * bắt người ta chuyển tab để Ctrl+V từng ô là chỗ dễ nản nhất của cả quy trình.
 */
import { useActionState, useRef, useState } from "react";
import type { ActionResult } from "@/lib/actions/action-result";
import { CONTENT_TYPES, CONTENT_TYPE_LABELS } from "@/lib/content/content-types";
import { createContentItem } from "@/lib/content/content-item-actions";

const FIELD_CLASS =
  "w-full rounded-md border border-neutral-300 bg-white px-3 py-2 text-sm " +
  "focus:border-neutral-500 focus:outline-none dark:border-neutral-700 dark:bg-neutral-900";

const LABEL_CLASS = "mb-1 block text-xs font-medium text-neutral-600 dark:text-neutral-400";

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
            className="mt-2 rounded-md border border-neutral-300 px-3 py-1.5 text-xs transition hover:bg-neutral-100 dark:border-neutral-700 dark:hover:bg-neutral-800"
          >
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
          <span className="mt-1 block text-xs text-neutral-500">
            Any mention of your product or service is promotional, including indirect mentions.
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
          <span className="mt-1 block text-xs text-neutral-500">
            Links written directly in the body are detected automatically. Use this field only for
            additional links.
          </span>
        </label>
      </div>

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
        {pending ? "Saving…" : (submitLabel ?? "Save content")}
      </button>
    </form>
  );
}
