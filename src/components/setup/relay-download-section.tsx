import { SmartScreenGuidance } from "@/components/setup/smartscreen-guidance";
import { Card, EmptyState } from "@/components/ui/page-section";
import { formatFullDateTime } from "@/lib/format/vietnamese-date-format";
import {
  formatFileSize,
  readRelayRelease,
  relayArchiveChecksum,
  relayDownloadFileName,
} from "@/lib/relay/relay-release-file";
import { RELAY_VERSION } from "@/lib/relay/relay-endpoints";
import { WINDOWS_INSTALLER_FILE_NAME } from "@/lib/setup/windows-installer-file";
import { readWindowsInstallerRelease } from "@/lib/setup/windows-installer-release";

const BUTTON_CLASS =
  "inline-block rounded-md bg-neutral-900 px-4 py-2 text-sm font-medium text-white transition " +
  "hover:bg-neutral-700 dark:bg-neutral-100 dark:text-neutral-900 dark:hover:bg-neutral-300";

/**
 * Phần tải cầu nối, sống **trong** trang chuẩn bị.
 *
 * ## Vì sao nó không còn là một trang riêng
 *
 * Đường onboard một chiếc máy từng trải trên ba bề mặt: `/relay-download` để tải, `/setup` để ghi
 * máy vào sổ, và trang trạng thái của chính cầu nối ở `127.0.0.1`. Ba bề mặt cho một việc là ba
 * chỗ để lạc, và ngày 18/08/2026 nó lạc thật: thẻ hướng dẫn đã chuyển sang `/setup` từ lâu mà
 * `/relay-download` vẫn chỉ người mới sang `/relay-devices` — một trang chỉ ADMIN làm được việc.
 * Không ai phát hiện, vì chiếc máy duy nhất trong sổ là máy của người viết ra nó.
 *
 * Gộp lại thì thứ tự tự nói ra: tải ở đây, ghi máy vào sổ ở thẻ ngay bên dưới, xong.
 *
 * ## Cả team tải được, không chỉ ADMIN
 *
 * Cùng nguyên tắc với sổ đăng ký máy: chia **quyền làm**, không chia **tầm nhìn**. Người phải cài
 * cầu nối chính là operator ngồi máy đó, và bắt họ đi xin ADMIN gửi file qua chat là dựng lại đúng
 * thói quen mà chỗ này sinh ra để dẹp — cài một file `.exe` nhặt được từ tin nhắn.
 *
 * `.exe` không chứa bí mật nào: khóa riêng do chính nó sinh trên từng máy, khóa vùng operator thì
 * nhập trên trang loopback của cầu nối và được bảo vệ bằng DPAPI.
 *
 * ## Trạng thái "chưa có file" là bình thường
 *
 * `.exe` dựng trên máy Windows, còn web app chạy trong ảnh Docker Linux (GĐ5). Nên chỗ này phải
 * nói được câu *"máy chủ chưa có bản nào"* kèm việc phải làm, thay vì vờ như mọi thứ ổn rồi đưa ra
 * một nút bấm vào là 404.
 */
export async function RelayDownloadSection() {
  const installer = await readWindowsInstallerRelease();
  const release = await readRelayRelease(RELAY_VERSION);
  // Truyền lại `release` để khỏi hỏi nguồn hai lần — với nguồn R2 đó là một request qua mạng.
  const checksum = await relayArchiveChecksum(release);

  return (
    // Mốc neo: mọi chỗ từng trỏ tới `/relay-download` nay trỏ `/setup#download`, nên khi người ta
    // tới từ dải "cầu nối bản cũ" hay từ trang nick, họ rơi đúng vào nút tải chứ không phải đầu
    // trang rồi phải tự tìm.
    <section id="download" className="space-y-6 scroll-mt-6">
      <SmartScreenGuidance imagePath="/setup/mkb-03-smartscreen-more-info-run-anyway.png" />

      <Card title={installer.version ? `MKT Browser ${installer.version}` : "MKT Browser cho Windows"}>
        {installer.available ? (
          <div className="space-y-4">
            <p className="text-sm text-neutral-600 dark:text-neutral-400">
              Cài cái này <strong>trước</strong>. Nó mang sẵn một bản cầu nối, và bản đó có thể cũ
              hơn bản dưới — nên tải tiếp gói cầu nối rồi chạy <code className="font-mono">setup.bat</code>{" "}
              là xong. Từ cầu nối bản 15, bộ cài không đè lên một bản mới hơn nữa.
            </p>

            <dl className="grid gap-x-8 gap-y-2 text-sm sm:grid-cols-[auto_1fr]">
              <dt className="text-neutral-500">Dung lượng</dt>
              <dd>{formatFileSize(installer.sizeBytes ?? 0)}</dd>
              {installer.publishedAt ? (
                <>
                  <dt className="text-neutral-500">Phát hành lúc</dt>
                  <dd>{formatFullDateTime(installer.publishedAt)}</dd>
                </>
              ) : null}
            </dl>

            <a href="/api/setup/windows-installer" className={BUTTON_CLASS} download>
              Tải {WINDOWS_INSTALLER_FILE_NAME}
            </a>

            {installer.checksum ? (
              <div className="space-y-1 border-t border-neutral-200 pt-4 dark:border-neutral-800">
                <p className="text-xs font-medium text-neutral-600 dark:text-neutral-400">
                  SHA-256 của gói
                </p>
                <code className="block select-all break-all rounded bg-neutral-100 px-2 py-1 font-mono text-xs dark:bg-neutral-800">
                  {installer.checksum}
                </code>
              </div>
            ) : null}
          </div>
        ) : (
          <EmptyState>
            Máy chủ này chưa có gói cài MKT Browser nào — đã tìm ở{" "}
            <code className="font-mono text-xs">{installer.expectedPath}</code>.
            <br />
            <br />
            Người quản trị dựng trên máy Windows rồi đẩy lên bằng{" "}
            <code className="font-mono">npm run browser:publish -- --file=&lt;đường dẫn .exe&gt;
            --version=&lt;số hiệu&gt;</code>.
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
        <p className="mt-3 text-sm text-neutral-600 dark:text-neutral-400">
          Từ bản 15, bộ cài <strong>không đè lên một cầu nối mới hơn</strong>: gặp bản mới hơn thì
          nó để yên và báo đã bỏ qua. Chốt này có vì trình cài MKT Browser gọi bộ cài ở mọi lần
          chạy, và trước đó nó lặng lẽ kéo cầu nối xuống bản mà máy chủ từ chối.
        </p>
      </Card>
    </section>
  );
}
