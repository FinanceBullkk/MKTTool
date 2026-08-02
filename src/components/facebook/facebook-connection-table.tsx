/**
 * Bảng nick cá nhân đã kết nối — nguồn sinh ra Page token.
 *
 * Hạn hiện ở đây là hạn của user token: hết hạn thì MỌI Page dưới nick này ngừng đăng
 * được cùng lúc, nên phải nhìn thấy trước khi nó xảy ra.
 */
import { DataTable, StatusBadge } from "@/components/ui/page-section";
import {
  TOKEN_HEALTH_CLASS,
  TOKEN_HEALTH_LABEL,
  evaluateTokenHealth,
} from "@/lib/facebook/facebook-token-health";
import { DisconnectConnectionButton } from "./facebook-connection-actions";

export interface FacebookConnectionRow {
  id: string;
  name: string;
  expiresAt: Date | null;
  _count: { pages: number };
}

export function FacebookConnectionTable({ connections }: { connections: FacebookConnectionRow[] }) {
  return (
    <DataTable headers={["Nick Facebook", "Số Page", "Hạn token", "Thao tác"]}>
      {connections.map((connection) => {
        // `tokenValid` luôn true ở đây: cờ hỏng được ghi trên từng Page, vì chính lời gọi
        // đăng bài mới là chỗ Facebook từ chối và nói cho mình biết.
        const health = evaluateTokenHealth({ expiresAt: connection.expiresAt, tokenValid: true });

        return (
          <tr key={connection.id}>
            <td className="py-2 pr-4 font-medium">{connection.name}</td>
            <td className="py-2 pr-4">{connection._count.pages}</td>
            <td className="py-2 pr-4">
              <StatusBadge
                label={TOKEN_HEALTH_LABEL[health.level]}
                className={TOKEN_HEALTH_CLASS[health.level]}
              />
              <p className="mt-1 text-xs text-neutral-500">{health.message}</p>
            </td>
            <td className="py-2 pr-4">
              <DisconnectConnectionButton
                connectionId={connection.id}
                name={connection.name}
                pageCount={connection._count.pages}
              />
            </td>
          </tr>
        );
      })}
    </DataTable>
  );
}
