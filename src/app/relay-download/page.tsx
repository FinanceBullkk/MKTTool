import Link from "next/link";
import { SmartScreenGuidance } from "@/components/setup/smartscreen-guidance";
import { Card, EmptyState, PageHeading } from "@/components/ui/page-section";
import { formatFullDateTime } from "@/lib/format/vietnamese-date-format";
import {
  formatFileSize,
  readRelayRelease,
  relayArchiveChecksum,
  relayDownloadFileName,
} from "@/lib/relay/relay-release-file";
import { RELAY_VERSION } from "@/lib/relay/relay-endpoints";
import { readWindowsInstallerFile } from "@/lib/setup/windows-installer-file";

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
 * thì nhập trên loopback page của Relay và được bảo vệ bằng DPAPI. Xem thêm ở route tải.
 *
 * ## Trạng thái "chưa có file" là bình thường
 *
 * `.exe` dựng trên máy Windows, còn web app chạy trong ảnh Docker Linux (GĐ5). Nên trang này
 * phải nói được câu *"máy chủ chưa có bản nào"* kèm việc phải làm, thay vì vờ như mọi thứ ổn
 * rồi đưa ra một nút bấm vào là 404.
 */
export default async function RelayDownloadPage() {
  const installer = readWindowsInstallerFile();
  const release = await readRelayRelease(RELAY_VERSION);
  // Truyền lại `release` để khỏi hỏi nguồn hai lần — với nguồn R2 đó là một request qua mạng.
  const checksum = await relayArchiveChecksum(release);

  return (
    <>
      <PageHeading
        title="Tải cầu nối"
        description="Cầu nối là chương trình chạy trên chính máy bạn. Nó giữ khóa mở bí mật nick — thứ mà máy chủ cố ý không có — nên không lấy được mật khẩu, mã OTP hay mở được profile nếu máy bạn chưa cài nó."
      />

      <SmartScreenGuidance imagePath="/setup/mkb-03-smartscreen-more-info-run-anyway.png" />

      <Card title="MKTTool for Windows">
        {installer.available ? (
          <a href="/api/setup/windows-installer" className={BUTTON_CLASS} download>
            Download the Windows installer
          </a>
        ) : (
          <EmptyState>
            The combined Windows installer has not been published to this server yet. An administrator
            must configure the release artifact before operator handoff.
          </EmptyState>
        )}
      </Card>

      <Card title={release.available ? `Bản ${release.version}` : "Bản hiện tại"}>
        {release.available ? (
          <div className="space-y-4">
            <dl className="grid gap-x-8 gap-y-2 text-sm sm:grid-cols-[auto_1fr]">
              <dt className="text-neutral-500">Dung lượng</dt>
              <dd>{formatFileSize(release.sizeBytes)}</dd>
              <dt className="text-neutral-500">Đóng gói lúc</dt>
              <dd>{formatFullDateTime(release.builtAt)}</dd>
            </dl>

            <a href={`/api/relay/download/v${release.version}`} className={BUTTON_CLASS} download>
              Tải {relayDownloadFileName(release.version)}
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
                    Get-FileHash {relayDownloadFileName(release.version)} -Algorithm SHA256
                  </code>{" "}
                  — hai chuỗi phải khớp. Lệch nghĩa là file tải dở dang hoặc không phải bản này;
                  tải lại, đừng chạy.
                </p>
              </div>
            ) : null}
          </div>
        ) : (
          <EmptyState>
            Máy chủ này chưa có gói cài nào — đã tìm ở{" "}
            <code className="font-mono text-xs">{release.expectedPath}</code>.
            <br />
            <br />
            Người quản trị dựng bằng <code className="font-mono">npm run relay:build</code> trên một
            máy Windows, rồi <code className="font-mono">npm run relay:publish</code> để đẩy lên
            ngăn phát hành. Máy chủ chưa khai ngăn đó thì nó tìm trên đĩa — đổi chỗ tìm bằng biến{" "}
            <code className="font-mono">RELAY_RELEASE_DIR</code>.
          </EmptyState>
        )}
      </Card>

      <Card title="Cài lần đầu — ba bước">
        <ol className="ml-5 list-decimal space-y-3 text-sm text-neutral-600 dark:text-neutral-400">
          <li>
            Giải nén rồi bấm đúp <code className="font-mono">setup.bat</code>. Nó chép chương trình
            vào thư mục người dùng, tạo shortcut để cầu nối tự bật cùng Windows, rồi mở trang trạng
            thái của chính nó.
          </li>
          <li>
            Vẫn trên máy đó, mở{" "}
            <Link href="/relay-devices" className="underline">
              /relay-devices
            </Link>{" "}
            và bấm <strong>Tìm cầu nối trên máy này</strong> → <strong>Đăng ký &amp; cấu hình</strong>
            . Web app tự đọc khóa công khai của cầu nối, ghi máy vào sổ, rồi gửi mã máy cùng khóa
            máy chủ ngược xuống — không phải chép tay giá trị nào.
          </li>
          <li>
            <strong>Đợi quản trị viên bấm &quot;Cấp khóa&quot;</strong> — không phải làm gì thêm.
            Thẻ ở <Link href="/relay-devices" className="underline">/relay-devices</Link> tự chuyển
            xanh khi khóa về tới máy, thường trong vài giây. Bạn <strong>không</strong> cần xin ai
            một chuỗi nào để dán.
          </li>
        </ol>
        <p className="mt-4 text-xs text-neutral-500">
          Mọi bước cấu hình có hiệu lực ngay, không phải tắt bật lại cầu nối.
        </p>
        <p className="mt-2 text-xs text-neutral-500">
          {/* Đường bootstrap. Nói ra ở đây vì người cài chiếc máy đầu tiên sẽ đợi mãi một cú bấm
              không bao giờ tới — lúc đó chưa có cầu nối nào khác để bọc khóa từ đó. */}
          <strong className="text-neutral-700 dark:text-neutral-300">
            Trường hợp phải điền tay:
          </strong>{" "}
          chiếc máy <strong>đầu tiên</strong> của cả team, và lúc cần dùng ngay mà quản trị viên
          không online. Khi đó dán <strong>khóa vùng operator</strong> vào ô cuối trang trạng thái
          của cầu nối. Máy chủ không có khóa này để gửi xuống — nó chỉ chuyển hộ một cái hộp đã
          khóa mà cầu nối của quản trị viên bọc cho riêng máy bạn.
        </p>
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
          <code className="font-mono">relay-config.json</code> và protected store — máy không phải đăng ký lại,
          cũng không phải xin lại khóa vùng operator. Không có bộ tự cập nhật, và đó là chủ ý: một
          chương trình giữ khóa của cả kho thì không nên có đường tự tải mã mới về chạy.
        </p>
      </Card>
    </>
  );
}
