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
 * bo góc.
 *
 * JavaScript chỉ có đúng ở **một** chỗ — ô dán khóa vùng operator, xem
 * `relay-operator-key-form.ts`. Mọi thứ còn lại đã biết lúc dựng chuỗi.
 */
import { RELAY_PATHS, RELAY_VERSION } from "../../src/lib/relay/relay-endpoints";
import { renderOperatorKeyForm } from "./relay-operator-key-form";
import { CONFIG_FILE } from "./relay-home";
import { STORE_DIRECTORY } from "./windows-secure-store";
import { CONFIG_TEMPLATE, type ConfigProblem } from "./relay-config";
import type { MktBrowserTokenSource } from "./mkt-browser-token-discovery";

export interface StatusPageInput {
  /** Khóa công khai của máy này, hex. */
  publicKeyHex: string;
  /** Thư mục chứa file khóa và file cấu hình — người cài cần đường dẫn đầy đủ để mở. */
  home: string;
  /** Rỗng nghĩa là cấu hình đã đủ. */
  problems: ConfigProblem[];
  /**
   * Phần cấu hình **được phép hiện lên màn hình**, hoặc `null` khi chưa đủ.
   *
   * Khai một hình dạng riêng thay vì nhận thẳng `RelayConfig`: kiểu này **không có chỗ** cho
   * khóa vùng operator hay token. Đưa nguyên `RelayConfig` vào rồi tự nhớ đừng in ra là dựa
   * vào trí nhớ của người sửa file này sáu tháng sau.
   */
  config: {
    deviceId: string;
    webOrigin: string;
    hasMktBrowserToken: boolean;
    mktBrowserTokenSource: MktBrowserTokenSource | null;
  } | null;
  /** Whether Relay can reach MKT Browser locally. `null` means no token is configured to probe it. */
  antidetectReady: boolean | null;
  /** Nguồn web được tin — in ra kể cả khi cấu hình chưa đủ, vì sai nó là hỏng theo kiểu CORS. */
  webOrigin: string;
  bootstrapAuthorized?: boolean;
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
    return {
      tone: "warn",
      text: "not checked — open MKT Browser and enable MCP so Relay can discover its local token",
    };
  }
  return ready
    ? { tone: "ok", text: "connected to MKT Browser on this machine" }
    : {
        tone: "bad",
        text:
          "Cannot connect to MKT Browser. Open MKT Browser and make sure its MCP HTTP service is enabled.",
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
<div class="row"><span class="tag ${antidetect.tone}">MKT Browser</span><span>${escapeHtml(antidetect.text)}</span></div>
<div class="row"><span class="tag ${configured ? "ok" : "bad"}">cấu hình</span><span>${
    configured ? "đủ — cầu nối làm việc được" : "CHƯA ĐỦ — mọi nút trên web sẽ bị từ chối"
  }</span></div>

<h2>Khóa công khai của máy này</h2>
<p>Chép nguyên dòng này sang trang <strong>Máy cầu nối</strong> trên web app để đăng ký.
Đây là khóa <strong>công khai</strong>. Khóa riêng nằm trong kho bảo vệ của Windows
(<code>${escapeHtml(STORE_DIRECTORY)}\\</code>) và không bao giờ rời máy này.</p>
<p class="muted">Kho đó gắn với <strong>tài khoản Windows đang đăng nhập</strong>. Chép mấy file
trong đó sang máy khác hay tài khoản khác thì không mở ra được — nên chúng <strong>không phải
một bản sao lưu</strong>. Mất tài khoản này là mất khóa riêng, và đường chữa là đăng ký lại máy
trên web app rồi thu hồi khóa cũ, không phải khôi phục từ bản chép.</p>
<code class="key">${escapeHtml(input.publicKeyHex)}</code>

${configured ? renderActiveConfig(input.config) : renderProblems(input.problems, input.webOrigin)}

${renderOperatorKeyForm(RELAY_PATHS.setOperatorKey, configured, input.bootstrapAuthorized ?? false, input.webOrigin)}
</body></html>`;
}

/**
 * Cấu hình đang thật sự dùng — hai giá trị mà sai thì hỏng theo kiểu khó đoán nhất.
 *
 * **Mã máy** sai → mọi vé báo *"vé này phát cho máy khác"*. **Nguồn web** sai → mọi lời gọi
 * chết theo kiểu CORS, không câu lỗi nào chỉ vào đây. Cả hai đọc bằng mắt là ra ngay, nên in
 * chúng lên đây rẻ hơn nhiều so với việc dò.
 *
 * **Do not print the operator vault key or MKT Browser token.** They are real secrets, and this
 * page is often open during support screen sharing. Show only whether each value exists, which is
 * enough to answer "is it configured?" without disclosing it.
 */
function renderActiveConfig(config: StatusPageInput["config"]): string {
  if (!config) return "";

  return `<h2>Cấu hình đang dùng</h2>
<ul>
  <li>Mã máy: <code>${escapeHtml(config.deviceId)}</code> — sai mã thì mọi vé báo "phát cho máy khác"</li>
  <li>Nhận lời gọi từ: <code>${escapeHtml(config.webOrigin)}</code> — chỉ đúng một nguồn này</li>
  <li>MKT Browser access: ${describeMktBrowserToken(config)}</li>
</ul>
<p class="muted">Khóa vùng operator và token không in ra đây. Còn khóa công khai của máy chủ thì
đúng hay sai chỉ biết được khi có tấm vé đầu tiên: sai khóa thì vé nào cũng báo chữ ký không hợp lệ.</p>`;
}

function describeMktBrowserToken(config: NonNullable<StatusPageInput["config"]>): string {
  if (!config.hasMktBrowserToken) {
    return "<strong>not found</strong> — open MKT Browser and enable MCP";
  }
  return config.mktBrowserTokenSource === "config-override"
    ? "development override configured"
    : "discovered automatically from MKT Browser";
}

function renderProblems(problems: ConfigProblem[], webOrigin: string): string {
  const items = problems.map((problem) => `<li>${escapeHtml(problem.message)}</li>`).join("");

  return `<h2>Setup is incomplete</h2>
<ul>${items}</ul>

<h2>Primary setup path</h2>
<ol>
  <li>Open <code>${escapeHtml(webOrigin)}/setup</code> and sign in. The setup page detects this
      Relay, verifies the signed-in owner, registers this PC, and sends configuration back without
      requiring manual key or JSON copying.</li>
</ol>
<p><strong>The server never has the operator secret.</strong> An administrator authorizes a sealed
   grant for this PC; the local Relay receives and stores it without exposing the secret to the
   server.</p>
<p class="muted">Configuration takes effect immediately; restarting the Relay is not required.</p>

<details><summary class="muted">Recovery or legacy: enter an operator key manually</summary>
<p class="muted">Use the manual form only for recovery or a legacy first-device bootstrap when the
   guided setup page cannot complete the sealed-grant flow.</p>
</details>

<details><summary class="muted">Legacy recovery: edit <code>${escapeHtml(CONFIG_FILE)}</code></summary>
<pre>${escapeHtml(JSON.stringify(CONFIG_TEMPLATE, null, 2))}</pre>
<p class="muted">Manual edits require a Relay restart. Use this only when the web app is unavailable.</p>
</details>

<p class="muted">The Relay remains reachable while setup is incomplete, but all real work is
rejected. It never guesses or substitutes a missing key.</p>`;
}
