import Link from "next/link";
import { Card, EmptyState, PageHeading } from "@/components/ui/page-section";
import { formatFullDateTime } from "@/lib/format/vietnamese-date-format";
import { RELAY_VERSION } from "@/lib/relay/relay-endpoints";
import {
  formatFileSize,
  readRelayRelease,
  relayArchiveChecksum,
  relayDownloadFileName,
} from "@/lib/relay/relay-release-file";

export const dynamic = "force-dynamic";

const BUTTON_CLASS =
  "inline-block rounded-md bg-neutral-900 px-4 py-2 text-sm font-medium text-white transition " +
  "hover:bg-neutral-700 dark:bg-neutral-100 dark:text-neutral-900 dark:hover:bg-neutral-300";

/**
 * Trang tải cầu nối.
 *
 * ## Vì sao cả team tải được, không chỉ ADMIN
 *
 * Cùng nguyên tắc với sổ đăng ký máy: chia **quyền làm**, không chia **tầm nhìn**. Người phải
 * cài cầu nối chính là operator ngồi máy đó, và bắt họ đi xin ADMIN gửi file qua chat là dựng
 * lại đúng thói quen mà trang này sinh ra để dẹp — cài một file `.exe` nhặt được từ tin nhắn.
 *
 * `.exe` không chứa bí mật nào: khóa riêng do chính nó sinh trên từng máy, khóa vùng operator
 * thì dán tay vào cấu hình. Xem thêm ở route tải.
 *
 * ## Trạng thái "chưa có file" là bình thường
 *
 * `.exe` dựng trên máy Windows, còn web app chạy trong ảnh Docker Linux (GĐ5). Nên trang này
 * phải nói được câu *"máy chủ chưa có bản nào"* kèm việc phải làm, thay vì vờ như mọi thứ ổn
 * rồi đưa ra một nút bấm vào là 404.
 */
export default async function RelayDownloadPage() {
  const release = readRelayRelease();
  const checksum = await relayArchiveChecksum();

  return (
    <>
      <PageHeading
        title="Tải cầu nối"
        description="Cầu nối là chương trình chạy trên chính máy bạn. Nó giữ khóa mở bí mật nick — thứ mà máy chủ cố ý không có — nên không lấy được mật khẩu, mã OTP hay mở được profile nếu máy bạn chưa cài nó."
      />

      <Card title={`Bản ${RELAY_VERSION}`}>
        {release.available ? (
          <div className="space-y-4">
            <dl className="grid gap-x-8 gap-y-2 text-sm sm:grid-cols-[auto_1fr]">
              <dt className="text-neutral-500">Dung lượng</dt>
              <dd>{formatFileSize(release.sizeBytes)}</dd>
              <dt className="text-neutral-500">Đóng gói lúc</dt>
              <dd>{formatFullDateTime(release.builtAt)}</dd>
            </dl>

            <a href="/api/relay/download" className={BUTTON_CLASS} download>
              Tải {relayDownloadFileName()}
            </a>

            <p className="text-xs text-neutral-500">
              Trong gói có ba file: <code className="font-mono">MKTTool-Relay.exe</code>,{" "}
              <code className="font-mono">setup.bat</code> và{" "}
              <code className="font-mono">install-relay.ps1</code>. <strong>Giải nén cả ba vào
              cùng một thư mục</strong> rồi mới chạy — bộ cài tìm hai file kia cạnh chính nó, nên
              chạy thẳng từ trong file nén thường là hỏng.
            </p>

            {checksum ? (
              <div className="space-y-1 border-t border-neutral-200 pt-4 dark:border-neutral-800">
                <p className="text-xs font-medium text-neutral-600 dark:text-neutral-400">
                  SHA-256 của gói
                </p>
                {/* `select-all` + `break-all`: chuỗi 64 ký tự này để chép đi so, không để đọc. */}
                <code className="block select-all break-all rounded bg-neutral-100 px-2 py-1 font-mono text-xs dark:bg-neutral-800">
                  {checksum}
                </code>
                <p className="pt-1 text-xs text-neutral-500">
                  Tải xong, mở PowerShell ở thư mục chứa file rồi chạy{" "}
                  <code className="font-mono">
                    Get-FileHash {relayDownloadFileName()} -Algorithm SHA256
                  </code>{" "}
                  — hai chuỗi phải khớp. Lệch nghĩa là file tải dở dang hoặc không phải bản này;
                  tải lại, đừng chạy.
                </p>
              </div>
            ) : null}
          </div>
        ) : (
          <EmptyState>
            Máy chủ này chưa có gói cài nào.
            <br />
            <br />
            Người quản trị chạy <code className="font-mono">npm run relay:build</code> trên một máy
            Windows rồi đặt file vào{" "}
            <code className="font-mono text-xs">{release.expectedPath}</code>, hoặc trỏ biến môi
            trường <code className="font-mono">RELAY_RELEASE_DIR</code> sang nơi đang chứa nó.
          </EmptyState>
        )}
      </Card>

      <Card title="Cài lần đầu — bốn bước">
        <ol className="ml-5 list-decimal space-y-3 text-sm text-neutral-600 dark:text-neutral-400">
          <li>
            Giải nén rồi bấm đúp <code className="font-mono">setup.bat</code>. Nó chép chương trình
            vào thư mục người dùng, tạo shortcut để cầu nối tự bật cùng Windows, rồi mở trang trạng
            thái của chính nó.
          </li>
          <li>
            Trên trang trạng thái vừa mở, chép <strong>khóa công khai</strong> của máy và gửi cho
            quản trị viên. Đây là khóa <em>công khai</em> — gửi qua chat cũng không mất gì.
          </li>
          <li>
            Quản trị viên ghi máy vào sổ tại{" "}
            <Link href="/relay-devices" className="underline">
              /relay-devices
            </Link>{" "}
            rồi gửi lại <strong>mã máy</strong>. Mở{" "}
            <code className="font-mono">relay-config.json</code> cạnh chương trình, điền mã máy và
            ba giá trị còn lại (khóa công khai máy chủ, khóa vùng operator, địa chỉ web app).
          </li>
          <li>
            Tắt bật lại cầu nối bằng shortcut ngoài desktop — cấu hình chỉ được đọc lúc khởi động.
            Trang trạng thái sẽ chuyển sang &quot;sẵn sàng&quot;.
          </li>
        </ol>
      </Card>

      <Card title="Hai điều sẽ gặp, và đều bình thường">
        <ul className="space-y-3 text-sm text-neutral-600 dark:text-neutral-400">
          <li>
            <strong className="text-neutral-900 dark:text-neutral-100">
              Windows hỏi lại ở lần chạy đầu.
            </strong>{" "}
            File này không mua chữ ký số, nên SmartScreen cảnh báo — đúng hành vi của Windows với
            một chương trình lạ tải từ mạng. Bấm <em>More info</em> → <em>Run anyway</em>. Chứng
            chỉ ký mã là thứ mất tiền hằng năm để đổi lấy việc bỏ đúng một màn hình mà mỗi người
            chỉ gặp một lần, nên đổi lại là mã SHA-256 ở trên: nó không dẹp được cảnh báo, nhưng
            trả lời được câu &quot;file tôi đang cầm có đúng bản của team không&quot;.
          </li>
          <li>
            <strong className="text-neutral-900 dark:text-neutral-100">
              Trình duyệt hỏi quyền truy cập mạng nội bộ.
            </strong>{" "}
            Lần đầu bấm <em>Mở profile</em> trên mỗi máy, Chrome hỏi trang web này có được gọi
            xuống máy bạn không. Chọn <em>Cho phép</em>; chặn thì nút đó im lặng cho tới khi bật
            lại quyền ở biểu tượng ổ khóa trên thanh địa chỉ.
          </li>
        </ul>
      </Card>

      <Card title="Nâng cấp khi có bản mới">
        <p className="text-sm text-neutral-600 dark:text-neutral-400">
          Tải lại rồi chạy <code className="font-mono">setup.bat</code> lần nữa. Nó tắt bản đang
          chạy, chép bản mới đè lên, và <strong>giữ nguyên</strong>{" "}
          <code className="font-mono">relay-config.json</code> — máy không phải đăng ký lại, cũng
          không phải xin lại khóa vùng operator. Không có bộ tự cập nhật, và đó là chủ ý: một
          chương trình giữ khóa của cả kho thì không nên có đường tự tải mã mới về chạy.
        </p>
      </Card>
    </>
  );
}
