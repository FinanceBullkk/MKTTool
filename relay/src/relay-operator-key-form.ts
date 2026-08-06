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
export function renderOperatorKeyForm(path: string, hasKey: boolean): string {
  return `<h2>${hasKey ? "Đổi khóa vùng operator" : "Dán khóa vùng operator"}</h2>
<p>${
    hasKey
      ? "Máy này đã có khóa. Chỉ dán lại khi quản trị viên vừa xoay khóa của cả team."
      : "Đây là thứ duy nhất phải điền bằng tay — <strong>máy chủ không có khóa này để gửi xuống</strong>, đó là cả điểm của thiết kế. Xin quản trị viên qua trình quản lý mật khẩu dùng chung, đừng qua chat."
  }</p>
<form id="opform">
  <label>Khóa vùng operator (64 ký tự hex)<br>
    <input id="opkey" type="password" autocomplete="off" spellcheck="false" size="70"
           placeholder="${"0".repeat(64)}"></label>
  <p><label>Token MCP của MultiZen — chỉ cần nếu máy này mở profile<br>
    <input id="mztoken" type="password" autocomplete="off" spellcheck="false" size="70"
           placeholder="để trống nếu giữ nguyên"></label></p>
  <p><button type="submit">Lưu vào máy này</button>
  <span id="opmsg" class="muted"></span></p>
</form>
<script>
(function () {
  var form = document.getElementById("opform");
  var msg = document.getElementById("opmsg");

  form.addEventListener("submit", function (event) {
    event.preventDefault();
    msg.textContent = "Đang lưu…";

    fetch(${JSON.stringify(path)}, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        vaultKeyOperator: document.getElementById("opkey").value,
        multizenToken: document.getElementById("mztoken").value
      })
    })
      .then(function (r) { return r.json(); })
      .then(function (body) {
        msg.textContent = body.message;
        // Nạp lại trang khi đã lưu được: mọi huy hiệu ở trên vừa đổi nghĩa, và để nguyên màn
        // hình cũ bên dưới một dòng "đã lưu" là mời người ta tin vào thứ không còn đúng.
        if (body.ok) setTimeout(function () { location.reload(); }, 1200);
      })
      .catch(function (error) { msg.textContent = "Không gửi được: " + error.message; });
  });
})();
</script>`;
}
