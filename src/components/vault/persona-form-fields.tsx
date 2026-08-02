/**
 * Ô nhập của nhân vật, dùng chung cho form thêm mới và form sửa.
 *
 * Khai một lần rồi dùng hai chỗ: hai form khai riêng là sớm muộn cũng có ô bị siết ở đường
 * này mà lỏng ở đường kia — đúng kiểu lệch mà vault-form-schemas.ts đã tránh ở tầng schema.
 */
import { Field } from "@/components/ui/form-controls";

export interface PersonaDefaults {
  name: string;
  voice: string;
  contentAngle: string;
  notes: string | null;
}

export function PersonaFormFields({ defaults }: { defaults?: PersonaDefaults }) {
  return (
    <>
      <Field
        label="Tên"
        name="name"
        required
        defaultValue={defaults?.name}
        placeholder="Minh — dev backend"
      />
      <Field
        label="Giọng điệu"
        name="voice"
        required
        defaultValue={defaults?.voice}
        placeholder="Thẳng thắn, kỹ thuật, hay dẫn số liệu"
      />
      <Field
        label="Mảng nội dung"
        name="contentAngle"
        required
        defaultValue={defaults?.contentAngle}
        placeholder="Tự host, DevOps, tối ưu chi phí hạ tầng"
      />
      <Field
        label="Ghi chú"
        name="notes"
        defaultValue={defaults?.notes ?? undefined}
        placeholder="Tùy chọn"
      />
    </>
  );
}
