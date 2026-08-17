/**
 * Ô dán khóa vùng operator, nằm trên trang trạng thái của chính cầu nối.
 *
 * ## Vì sao ô này KHÔNG nằm trên web app
 *
 * Máy chủ không có `VAULT_KEY_OPERATOR`, và ngày nó có thì cả GĐ3 mất nghĩa. Một ô nhập trên
 * trang web là một chuyến đi qua máy chủ — kể cả khi trang đó hứa sẽ không gửi đi đâu.
 *
 * Trang này do chính cầu nối phục vụ, nên chuỗi khóa không rời khỏi `127.0.0.1` một bước nào.
 * Đây là chỗ duy nhất trong cả hệ mà việc dán tay là **đúng chỗ** chứ không phải ma sát thừa.
 *
 * ## Vì sao trang này có JavaScript, dù phần còn lại thì không
 *
 * Phần còn lại của trang trạng thái là thứ đã biết lúc dựng chuỗi. Ô này thì không: nó phải gửi
 * đi rồi nói lại kết quả. Dùng form HTML thuần thì trình duyệt điều hướng sang phản hồi JSON và
 * người dùng nhìn thấy một trang trắng đầy dấu ngoặc — nên chỗ này đổi lấy ~20 dòng script.
 * `connect-src 'self'` trong CSP đã cho phép đúng một đích: chính cầu nối.
 */

/** Đường mà form gửi tới. Khai ở đây để script nội tuyến và bảng route không lệch nhau. */
export function renderOperatorKeyForm(path: string, hasKey: boolean, bootstrapAuthorized: boolean, webOrigin: string): string {
  if (!hasKey && !bootstrapAuthorized) {
    return `<h2>Operator key bootstrap</h2>
<p class="muted">An authenticated administrator must start the five-minute bootstrap from the MKTTool setup page before this form is enabled.</p>`;
  }
  return `<h2>${hasKey ? "Replace the operator key" : "Paste the operator key"}</h2>
<p>${
    hasKey
      ? "This PC already has a key. Paste again only when an administrator has just rotated the key for the whole team."
      : "This is the only value that must be entered by hand — <strong>the server does not hold this key to send down</strong>, which is the entire point of the design. Ask an administrator for it through the shared password manager, not through chat."
  }</p>
<form id="opform">
  <label>Operator key (64 hex characters)<br>
    <input id="opkey" type="password" autocomplete="off" spellcheck="false" size="70"
           placeholder="64 hex characters (0-9, a-f)"></label>
  <p><button type="submit">Save on this PC</button>
  <span id="opmsg" class="muted"></span></p>
</form>
<script>
(function () {
  var form = document.getElementById("opform");
  var msg = document.getElementById("opmsg");

  form.addEventListener("submit", function (event) {
    event.preventDefault();
    msg.textContent = "Saving…";

    fetch(${JSON.stringify(path)}, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        vaultKeyOperator: document.getElementById("opkey").value
      })
    })
      .then(function (r) { return r.json(); })
      .then(function (body) {
        msg.textContent = body.message;
        // Nạp lại trang khi đã lưu được: mọi huy hiệu ở trên vừa đổi nghĩa, và để nguyên màn
        // hình cũ bên dưới một dòng "đã lưu" là mời người ta tin vào thứ không còn đúng.
        if (body.ok && body.proof && window.opener) {
          window.opener.postMessage({ type: "mkttool-bootstrap-complete", grantId: body.grantId,
            generation: body.generation, proof: body.proof }, ${JSON.stringify(webOrigin)});
        }
        if (body.ok) setTimeout(function () { location.reload(); }, 1200);
      })
      .catch(function (error) { msg.textContent = "Could not send: " + error.message; });
  });
})();
</script>`;
}
