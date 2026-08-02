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
          label="Nền tảng"
          name="platform"
          required
          options={[
            { value: "REDDIT", label: "Reddit (subreddit)" },
            { value: "FACEBOOK_PAGE", label: "Facebook Page" },
            { value: "FACEBOOK_GROUP", label: "Facebook Group (đăng tay)" },
          ]}
        />
      )}
      <Field label="Tên" name="name" required defaultValue={defaults?.name} placeholder="r/selfhosted" />
      <Field
        label="URL"
        name="url"
        required
        defaultValue={defaults?.url}
        placeholder="https://www.reddit.com/r/selfhosted/"
      />
      <Field
        label="Karma tối thiểu"
        name="minKarma"
        type="number"
        defaultValue={defaults?.minKarma ?? 0}
        hint="Nhiều sub ngách giờ đòi 100-500"
      />
      <Field
        label="Tuổi nick tối thiểu (ngày)"
        name="minAccountAgeDays"
        type="number"
        defaultValue={defaults?.minAccountAgeDays ?? 0}
      />
      <Field
        label="Tỷ lệ promo"
        name="promoRatio"
        type="number"
        defaultValue={defaults?.promoRatio ?? 9}
        hint="9 nghĩa là 9 bài hữu ích mới được 1 bài quảng cáo"
      />
      <CheckboxField
        label="Sub cho phép đăng link"
        name="allowsLinks"
        defaultChecked={defaults?.allowsLinks ?? true}
      />
      {defaults ? (
        <CheckboxField
          label="Đang dùng (bỏ tick là ẩn khỏi ô chọn lúc xếp lịch)"
          name="active"
          defaultChecked={defaults.active}
        />
      ) : null}
      <Field
        label="Ghi chú"
        name="notes"
        defaultValue={defaults?.notes ?? undefined}
        placeholder="Mod hoạt động mạnh, luật riêng…"
      />
    </>
  );
}
