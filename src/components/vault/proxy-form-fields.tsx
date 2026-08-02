/**
 * Ô nhập của proxy, dùng chung cho form thêm mới và form sửa.
 *
 * Ô mật khẩu là chỗ duy nhất hai form khác nhau: thêm mới thì bắt buộc, sửa thì để trống
 * nghĩa là giữ nguyên. Mật khẩu không bao giờ được đổ ngược ra màn hình, nên form sửa
 * không có cách nào hiện giá trị cũ — và coi ô trống là "xóa mật khẩu" thì mỗi lần sửa
 * nhãn proxy là một lần mất proxy.
 */
import { Field, SelectField } from "@/components/ui/form-controls";

export interface ProxyDefaults {
  label: string;
  host: string;
  port: number;
  username: string;
  country: string;
  type: string;
  protocol: string;
  notes: string | null;
}

export function ProxyFormFields({ defaults }: { defaults?: ProxyDefaults }) {
  const editing = defaults !== undefined;

  return (
    <>
      <Field label="Nhãn" name="label" required defaultValue={defaults?.label} placeholder="reddit-01-us" />
      <Field label="Host" name="host" required defaultValue={defaults?.host} placeholder="1.2.3.4" />
      <Field
        label="Port"
        name="port"
        type="number"
        required
        defaultValue={defaults?.port}
        placeholder="8080"
      />
      <SelectField
        label="Giao thức"
        name="protocol"
        required
        defaultValue={defaults?.protocol ?? "http"}
        hint="Phải khớp cổng nhà cung cấp cấp cho giao thức đó — SOCKS5 thường ở cổng khác HTTP"
        options={[
          { value: "http", label: "HTTP / HTTPS" },
          { value: "socks5", label: "SOCKS5" },
        ]}
      />
      <Field label="Username" name="username" required defaultValue={defaults?.username} />
      <Field
        label="Mật khẩu"
        name="password"
        type="password"
        required={!editing}
        hint={editing ? "Để trống là giữ nguyên mật khẩu đang dùng" : undefined}
      />
      <Field
        label="Quốc gia"
        name="country"
        required
        defaultValue={defaults?.country}
        placeholder="US"
        hint="Phải khớp quốc gia nick từng hoạt động"
      />
      <SelectField
        label="Loại"
        name="type"
        required
        defaultValue={defaults?.type ?? "STATIC_ISP"}
        options={[
          { value: "STATIC_ISP", label: "Static ISP / Residential tĩnh" },
          { value: "MOBILE", label: "Mobile 4G" },
        ]}
      />
      <Field
        label="Ghi chú"
        name="notes"
        defaultValue={defaults?.notes ?? undefined}
        placeholder="Nhà cung cấp, ngày hết hạn…"
      />
    </>
  );
}
