/**
 * Khối "proxy quan sát viên" trên trang /proxies.
 *
 * Đặt cùng trang với proxy thường vì cùng là việc mua và nhập IP, nhưng tách hẳn thành một
 * khối riêng có lời cảnh báo riêng: đây là IP DUY NHẤT trong hệ thống không được phép chạm
 * vào bất kỳ nick nào. Nhầm một lần là bộ dò tự nối mình vào đàn nick — đúng thứ nó sinh ra
 * để phát hiện ở người khác.
 */
import { ActionForm, Field } from "@/components/ui/form-controls";
import { Card, DataTable, EmptyState, StatusBadge } from "@/components/ui/page-section";
import { prisma } from "@/lib/db/prisma-client";
import { createObserverProxy } from "@/lib/health/observer-proxy-actions";
import { ObserverProxyRowActions } from "./observer-proxy-row-actions";

export async function ObserverProxySection() {
  const proxies = await prisma.observerProxy.findMany({ orderBy: { label: "asc" } });
  const activeCount = proxies.filter((proxy) => proxy.active).length;

  return (
    <Card title={`Proxy quan sát viên — ${proxies.length} IP, ${activeCount} đang bật`}>
      <p className="mb-4 text-sm text-neutral-600 dark:text-neutral-400">
        Dùng để dò shadowban từ góc nhìn người ngoài. <strong>Tuyệt đối không đăng nhập nick nào
        bằng IP này</strong>, kể cả một lần — dò bằng chính proxy của nick là tự nhìn mình trong
        gương rồi kết luận người ngoài cũng thấy vậy. Nên mua loại residential, khác nhà cung cấp
        với proxy dùng cho nick.
      </p>

      {proxies.length === 0 ? (
        <EmptyState>
          Chưa có proxy quan sát viên. Thiếu nó thì <code>npm run health</code> dừng ngay từ đầu —
          cố ý như vậy, vì dò bằng IP nhà còn tệ hơn không dò.
        </EmptyState>
      ) : (
        <DataTable headers={["Nhãn", "Địa chỉ", "Quốc gia", "Trạng thái", "Ghi chú", ""]}>
          {proxies.map((proxy) => (
            <tr key={proxy.id}>
              <td className="py-2 pr-4 font-medium">{proxy.label}</td>
              <td className="py-2 pr-4 font-mono text-xs text-neutral-600 dark:text-neutral-400">
                {proxy.host}:{proxy.port}
              </td>
              <td className="py-2 pr-4">{proxy.country}</td>
              <td className="py-2 pr-4">
                <StatusBadge
                  label={proxy.active ? "đang bật" : "đã tắt"}
                  className={
                    proxy.active
                      ? "bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300"
                      : "bg-neutral-200 text-neutral-600 dark:bg-neutral-800 dark:text-neutral-400"
                  }
                />
              </td>
              <td className="py-2 pr-4 text-neutral-600 dark:text-neutral-400">
                {proxy.notes ?? "—"}
              </td>
              <td className="py-2 pr-4">
                <ObserverProxyRowActions id={proxy.id} active={proxy.active} />
              </td>
            </tr>
          ))}
        </DataTable>
      )}

      <details className="mt-4">
        <summary className="cursor-pointer text-sm font-medium">Thêm proxy quan sát viên</summary>
        <div className="mt-3">
          <ActionForm action={createObserverProxy} submitLabel="Thêm proxy quan sát viên">
            <Field label="Nhãn" name="label" required placeholder="observer-01-de" />
            <Field label="Host" name="host" required placeholder="1.2.3.4" />
            <Field label="Port" name="port" type="number" required placeholder="8080" />
            <Field label="Username" name="username" required />
            <Field label="Mật khẩu" name="password" type="password" required />
            <Field
              label="Quốc gia"
              name="country"
              required
              placeholder="DE"
              hint="Không cần khớp quốc gia nick — đây là góc nhìn người lạ, càng khác càng đúng vai"
            />
            <Field
              label="Ghi chú"
              name="notes"
              placeholder="Nhà cung cấp, ngày hết hạn…"
            />
            <p className="text-xs text-neutral-500">
              Chỉ nhận giao thức HTTP: Chromium không xác thực được với SOCKS5, nó bỏ qua user và
              mật khẩu rồi đi tiếp — hoặc hỏng, hoặc tệ hơn là chạy bằng IP nhà mà không ai biết.
            </p>
          </ActionForm>
        </div>
      </details>
    </Card>
  );
}
