"use client";

/**
 * Form ghi nhanh "vừa comment/upvote ở thread X".
 *
 * Việc nhàm nhất trong ngày nhưng bỏ là hỏng luật 8: công cụ không biết nick nào đã ở thread nào
 * thì không chặn được đụng độ. Phase 05 sẽ tự ghi khi bot tương tác.
 */
import { ActionForm, Field, SelectField } from "@/components/ui/form-controls";
import { INTERACTION_KINDS, INTERACTION_KIND_LABELS } from "@/lib/content/content-types";
import { recordInteraction } from "@/lib/queue/interaction-actions";

export function InteractionForm({
  accounts,
  targets,
}: {
  accounts: { id: string; username: string; platform: string }[];
  targets: { id: string; name: string }[];
}) {
  return (
    <ActionForm action={recordInteraction} submitLabel="Record interaction">
      <SelectField
        label="Nick"
        name="accountId"
        required
        options={accounts.map((account) => ({
          value: account.id,
          label: `${account.username} (${account.platform})`,
        }))}
      />
      <SelectField
        label="Target"
        name="targetId"
        required
        options={targets.map((target) => ({ value: target.id, label: target.name }))}
      />
      <Field
        label="Link thread"
        name="threadUrl"
        required
        placeholder="https://www.reddit.com/r/selfhosted/comments/…"
        hint="Paste the full URL; the tool extracts the post ID for comparison. Reddit /s/ share links cannot be resolved, so open the share link and paste its full /comments/ URL."
      />
      <SelectField
        label="Type"
        name="kind"
        required
        defaultValue="COMMENT"
        options={INTERACTION_KINDS.map((kind) => ({
          value: kind,
          label: INTERACTION_KIND_LABELS[kind],
        }))}
      />
      <Field label="Notes" name="note" placeholder="Optional" />
    </ActionForm>
  );
}
