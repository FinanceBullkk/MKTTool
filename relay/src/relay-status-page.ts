/**
 * Trang trạng thái — thứ người cài mở ra khi có gì đó không chạy.
 *
 * Nó phải trả lời được đúng bốn câu, theo thứ tự người ta hỏi:
 *
 *   1. Cầu nối có đang chạy không?      → mở được trang này tức là có
 *   2. Bản mấy?                         → đối chiếu với dải cảnh báo trên web
 *   3. Khóa công khai của máy này là gì? → thứ phải chép sang màn hình đăng ký
 *   4. Còn thiếu cấu hình gì?           → danh sách, mỗi mục kèm việc phải làm
 *
 * ## HTML viết tay, không khung giao diện nào
 *
 * Trang này nằm trong `.exe` và chỉ có một người xem mỗi lần. Kéo bất cứ thư viện nào vào đây
 * là cộng dung lượng vào một file 87 MB vốn phải tải tay qua remote desktop, đổi lấy vài cái
 * bo góc. Cũng không có JavaScript: mọi thứ trang này biết đều đã biết lúc dựng chuỗi.
 */
import { CONFIG_FILE, DEVICE_KEY_FILE } from "./relay-home";
import { CONFIG_TEMPLATE, type ConfigProblem } from "./relay-config";
import { RELAY_VERSION } from "./relay-version";

export interface StatusPageInput {
  /** Khóa công khai của máy này, hex. */
  publicKeyHex: string;
  /** Thư mục chứa file khóa và file cấu hình — người cài cần đường dẫn đầy đủ để mở. */
  home: string;
  /** Rỗng nghĩa là cấu hình đã đủ. */
  problems: ConfigProblem[];
  /** Cầu nối nối được MultiZen trên cùng máy không. `null` = chưa kiểm lần nào. */
  antidetectReady: boolean | null;
}

/** Chèn văn bản vào HTML. Khóa và đường dẫn đều là dữ liệu, không phải mã. */
function escapeHtml(text: string): string {
  return text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function describeAntidetect(ready: boolean | null): { tone: string; text: string } {
  if (ready === null) {
    return { tone: "warn", text: "chưa kiểm — bấm tải lại trang để cầu nối hỏi MultiZen" };
  }
  return ready
    ? { tone: "ok", text: "nối được MultiZen trên máy này" }
    : {
        tone: "bad",
        text:
          "KHÔNG nối được MultiZen. Mở ứng dụng MultiZen lên; nếu nó đang mở thì kiểm lại token " +
          "MCP (trong app: MCP → Connect an agent).",
      };
}

const STYLE = `
  :root { color-scheme: light dark; }
  body { font: 15px/1.6 system-ui, sans-serif; max-width: 46rem; margin: 2rem auto; padding: 0 1rem; }
  h1 { font-size: 1.3rem; margin-bottom: .2rem; }
  h2 { font-size: 1rem; margin-top: 2rem; }
  code, pre { font-family: ui-monospace, Consolas, monospace; font-size: .85em; }
  pre { background: #8881; padding: .8rem; border-radius: .4rem; overflow-x: auto; }
  .key { word-break: break-all; background: #8881; padding: .5rem .7rem; border-radius: .4rem; display: block; }
  .row { display: flex; gap: .6rem; align-items: baseline; margin: .3rem 0; }
  .tag { font-size: .75rem; text-transform: uppercase; letter-spacing: .04em; padding: .1rem .45rem;
         border-radius: .3rem; white-space: nowrap; }
  .ok { background: #16a34a22; color: #15803d; }
  .warn { background: #f59e0b22; color: #b45309; }
  .bad { background: #dc262622; color: #b91c1c; }
  ul { padding-left: 1.2rem; }
  li { margin: .4rem 0; }
  .muted { color: #8888; }
`;

export function renderStatusPage(input: StatusPageInput): string {
  const antidetect = describeAntidetect(input.antidetectReady);
  const configured = input.problems.length === 0;

  return `<!doctype html>
<html lang="vi"><head><meta charset="utf-8">
<title>Cầu nối MKTTool — bản ${RELAY_VERSION}</title>
<style>${STYLE}</style></head><body>
<h1>Cầu nối MKTTool</h1>
<p class="muted">Bản ${RELAY_VERSION} · thư mục dữ liệu <code>${escapeHtml(input.home)}</code></p>

<div class="row"><span class="tag ok">đang chạy</span><span>Mở được trang này nghĩa là cầu nối đang nghe.</span></div>
<div class="row"><span class="tag ${antidetect.tone}">MultiZen</span><span>${escapeHtml(antidetect.text)}</span></div>
<div class="row"><span class="tag ${configured ? "ok" : "bad"}">cấu hình</span><span>${
    configured ? "đủ — cầu nối làm việc được" : "CHƯA ĐỦ — mọi nút trên web sẽ bị từ chối"
  }</span></div>

<h2>Khóa công khai của máy này</h2>
<p>Chép nguyên dòng này sang trang <strong>Máy cầu nối</strong> trên web app để đăng ký.
Đây là khóa <strong>công khai</strong> — khóa riêng nằm trong
<code>${escapeHtml(DEVICE_KEY_FILE)}</code> và không bao giờ rời máy này.</p>
<code class="key">${escapeHtml(input.publicKeyHex)}</code>

${configured ? "" : renderProblems(input.problems)}
</body></html>`;
}

function renderProblems(problems: ConfigProblem[]): string {
  const items = problems.map((problem) => `<li>${escapeHtml(problem.message)}</li>`).join("");

  return `<h2>Còn thiếu</h2>
<ul>${items}</ul>
<p>Sửa <code>${escapeHtml(CONFIG_FILE)}</code> trong thư mục dữ liệu rồi khởi động lại cầu nối.
Mẫu đầy đủ:</p>
<pre>${escapeHtml(JSON.stringify(CONFIG_TEMPLATE, null, 2))}</pre>
<p class="muted">Cầu nối vẫn nghe khi thiếu cấu hình, nhưng mọi việc thật đều bị từ chối — nó
không đoán bừa bằng khóa nào.</p>`;
}
