"use client";

/**
 * Chọn content cho job: gõ mới ngay tại đây, hoặc lấy bài có sẵn trong kho.
 *
 * Có tab "Viết mới" vì đường cũ bắt mỗi bài đi vòng qua trang /content rồi quay lại — một hop
 * thừa cho đúng việc làm nhiều nhất trong ngày.
 *
 * Nháp chỉ sống trong form. Lúc bấm xếp lịch, createPostJob cất nó thành ContentItem thật rồi
 * mới tạo job trỏ vào — kho content không vì tiện tay mà thủng, và luật 7 (trùng nội dung
 * trong 30 ngày) vẫn có đủ bài để so.
 */
import {
  CONTENT_TYPES,
  CONTENT_TYPE_LABELS,
  type ContentType,
} from "@/lib/content/content-types";
import { type ComposerContent, ContentSelect, FIELD_CLASS } from "./post-job-fields";

export type ContentMode = "draft" | "library";

export interface DraftContent {
  title: string;
  body: string;
  type: ContentType;
  authorName: string;
  /** Mỗi dòng một link — đúng dạng ô nhập của kho content. */
  linksText: string;
}

export function emptyDraft(authorName = ""): DraftContent {
  return { title: "", body: "", type: "VALUE", authorName, linksText: "" };
}

/** Nháp đủ để chấm luật và đủ để lưu vào kho. */
export function isDraftUsable(draft: DraftContent): boolean {
  return (
    draft.title.trim() !== "" && draft.body.trim() !== "" && draft.authorName.trim() !== ""
  );
}

const LABEL_CLASS = "mb-1 block text-xs font-medium text-neutral-600 dark:text-neutral-400";

const TAB_CLASS =
  "rounded-md px-3 py-1.5 text-sm transition focus-visible:outline-none focus-visible:ring-2 " +
  "focus-visible:ring-neutral-500 disabled:opacity-40";

function Tab({
  active,
  disabled,
  title,
  onClick,
  children,
}: {
  active: boolean;
  disabled?: boolean;
  title?: string;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      aria-pressed={active}
      disabled={disabled}
      title={title}
      onClick={onClick}
      className={`${TAB_CLASS} ${
        active
          ? "bg-neutral-900 text-white dark:bg-neutral-100 dark:text-neutral-900"
          : "text-neutral-600 hover:bg-neutral-200 dark:text-neutral-400 dark:hover:bg-neutral-800"
      }`}
    >
      {children}
    </button>
  );
}

export function ContentSourcePicker({
  mode,
  onModeChange,
  contents,
  contentItemId,
  onContentItemIdChange,
  draft,
  onDraftChange,
}: {
  mode: ContentMode;
  onModeChange: (mode: ContentMode) => void;
  contents: ComposerContent[];
  contentItemId: string;
  onContentItemIdChange: (value: string) => void;
  draft: DraftContent;
  onDraftChange: (draft: DraftContent) => void;
}) {
  const update = (patch: Partial<DraftContent>) => onDraftChange({ ...draft, ...patch });

  return (
    <div className="space-y-4">
      {/* Ô ẩn này quyết định createPostJob đọc nhánh nào — để cạnh chỗ chọn tab cho khỏi lệch. */}
      <input type="hidden" name="contentMode" value={mode} />

      <div className="flex flex-wrap gap-1">
        <Tab active={mode === "draft"} onClick={() => onModeChange("draft")}>
          Viết mới
        </Tab>
        <Tab
          active={mode === "library"}
          disabled={contents.length === 0}
          title={contents.length === 0 ? "Kho chưa có bài nào" : undefined}
          onClick={() => onModeChange("library")}
        >
          Chọn từ kho
        </Tab>
      </div>

      {mode === "library" ? (
        <div className="grid gap-4">
          <ContentSelect contents={contents} value={contentItemId} onChange={onContentItemIdChange} />
        </div>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2">
          <label className="block sm:col-span-2">
            <span className={LABEL_CLASS}>
              Tiêu đề <span className="text-red-600">*</span>
            </span>
            <input
              className={FIELD_CLASS}
              id="field-draft-title"
              name="title"
              required
              value={draft.title}
              onChange={(event) => update({ title: event.target.value })}
            />
          </label>

          <label className="block sm:col-span-2">
            <span className={LABEL_CLASS}>
              Thân bài <span className="text-red-600">*</span>
            </span>
            <textarea
              className={FIELD_CLASS}
              name="body"
              rows={6}
              required
              value={draft.body}
              onChange={(event) => update({ body: event.target.value })}
            />
          </label>

          <label className="block">
            <span className={LABEL_CLASS}>
              Loại <span className="text-red-600">*</span>
            </span>
            <select
              className={FIELD_CLASS}
              name="type"
              value={draft.type}
              onChange={(event) => update({ type: event.target.value as ContentType })}
            >
              {CONTENT_TYPES.map((type) => (
                <option key={type} value={type}>
                  {CONTENT_TYPE_LABELS[type]}
                </option>
              ))}
            </select>
            <span className="mt-1 block text-xs text-neutral-500">
              Có nhắc tên sản phẩm/dịch vụ của mình thì là quảng cáo, kể cả nhắc khéo.
            </span>
          </label>

          <label className="block">
            <span className={LABEL_CLASS}>
              Người viết <span className="text-red-600">*</span>
            </span>
            <input
              className={FIELD_CLASS}
              name="authorName"
              required
              value={draft.authorName}
              onChange={(event) => update({ authorName: event.target.value })}
            />
          </label>

          <label className="block sm:col-span-2">
            <span className={LABEL_CLASS}>Link trong bài</span>
            <textarea
              className={FIELD_CLASS}
              name="linksText"
              rows={2}
              value={draft.linksText}
              onChange={(event) => update({ linksText: event.target.value })}
              placeholder="Mỗi dòng một link"
            />
            <span className="mt-1 block text-xs text-neutral-500">
              Bài này sẽ được lưu vào kho content khi bấm xếp lịch.
            </span>
          </label>
        </div>
      )}
    </div>
  );
}
