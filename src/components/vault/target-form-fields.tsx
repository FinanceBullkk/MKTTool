/**
 * Ô nhập của đích đăng, dùng chung cho form thêm mới và form sửa.
 *
 * `platform` chỉ hiện lúc thêm mới. Đổi nền tảng của một đích đã có job là biến mọi job đó
 * thành nick-nền-tảng-này đăng vào đích-nền-tảng-kia — thứ isPlatformCompatible chặn ngay
 * từ lúc tạo. Ô "Đang dùng" thì ngược lại, chỉ có ở form sửa: đó là cách nghỉ hưu một đích
 * mà vẫn giữ lịch sử cho bộ luật đếm.
 */
import { CheckboxField, Field, SelectField } from "@/components/ui/form-controls";

export interface TargetDefaults {
  name: string;
  url: string;
  minKarma: number;
  minAccountAgeDays: number;
  promoRatio: number;
  allowsLinks: boolean;
  active: boolean;
  notes: string | null;
}

export function TargetFormFields({ defaults }: { defaults?: TargetDefaults }) {
  return (
    <>
      {defaults ? null : (
        <SelectField
          label="Platform"
          name="platform"
          required
          options={[
            { value: "REDDIT", label: "Reddit (subreddit)" },
            { value: "FACEBOOK_PAGE", label: "Facebook Page" },
            { value: "FACEBOOK_GROUP", label: "Facebook Group (manual posting)" },
          ]}
        />
      )}
      <Field label="Name" name="name" required defaultValue={defaults?.name} placeholder="r/selfhosted" />
      <Field
        label="URL"
        name="url"
        required
        defaultValue={defaults?.url}
        placeholder="https://www.reddit.com/r/selfhosted/"
      />
      <Field
        label="Minimum karma"
        name="minKarma"
        type="number"
        defaultValue={defaults?.minKarma ?? 0}
        hint="Many niche subreddits now require 100-500 karma"
      />
      <Field
        label="Minimum nick age (days)"
        name="minAccountAgeDays"
        type="number"
        defaultValue={defaults?.minAccountAgeDays ?? 0}
      />
      <Field
        label="Promotional ratio"
        name="promoRatio"
        type="number"
        defaultValue={defaults?.promoRatio ?? 9}
        hint="9 means nine useful posts are required for each promotional post"
      />
      <CheckboxField
        label="Subreddit allows link posts"
        name="allowsLinks"
        defaultChecked={defaults?.allowsLinks ?? true}
      />
      {defaults ? (
        <CheckboxField
          label="Active (clear to hide from scheduling)"
          name="active"
          defaultChecked={defaults.active}
        />
      ) : null}
      <Field
        label="Notes"
        name="notes"
        defaultValue={defaults?.notes ?? undefined}
        placeholder="Active moderators, special rules..."
      />
    </>
  );
}
