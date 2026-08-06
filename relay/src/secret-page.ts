/**
 * Tab nhỏ hiện mật khẩu / mã OTP. Trang **duy nhất** trong hệ có bí mật dạng trần trên màn hình.
 *
 * ## Vì sao trang này phải có JavaScript, trong khi trang trạng thái thì không
 *
 * Vé nằm ở **fragment** của địa chỉ (`/secret#<vé>`), và fragment không được gửi lên máy chủ
 * nào — kể cả máy chủ này. Đó chính là điểm mạnh của nó: vé không nằm trong dòng log nào,
 * không vào `Referer`. Cái giá là chỉ trình duyệt đọc được nó, nên trang phải tự đọc rồi POST
 * vé về `/secret/reveal` (cùng nguồn).
 *
 * ## Ba việc trang này làm ngay khi mở, theo thứ tự
 *
 * 1. **Đọc fragment rồi xóa nó khỏi thanh địa chỉ** (`replaceState`). Vé chỉ sống 30 giây và
 *    dùng một lần, nhưng một chuỗi bí mật nằm nguyên trên thanh địa chỉ là thứ lọt vào ảnh
 *    chụp màn hình, vào buổi share màn hình, và vào lịch sử trình duyệt.
 * 2. POST vé xuống cầu nối.
 * 3. Hiện kết quả, và **tự đóng** sau một khoảng.
 *
 * ## Tự đóng, và vì sao vẫn phải đếm ngược cho người xem
 *
 * Tab đóng đột ngột lúc người ta đang chép dở là một cách hỏng khó chịu hơn cả không tự đóng.
 * Đồng hồ đếm ngược biến việc đó thành thứ đoán trước được, và nút "Giữ mở" là đường thoát cho
 * người cần lâu hơn — họ vẫn phải tự đóng tab, nhưng đó là lựa chọn của họ.
 */

/** Bao lâu thì tab tự đóng. Đủ để chép và dán, không đủ để quên mất là nó đang mở. */
const AUTO_CLOSE_SECONDS = 60;

/**
 * Đường mà trang này POST vé về.
 *
 * **Không** nằm trong `relay-endpoints.ts`: file đó là hợp đồng giữa **web app** và cầu nối,
 * còn đường này chỉ đi từ trang của cầu nối về chính cầu nối — cùng nguồn, không ai khác gọi.
 * Khai nó vào hợp đồng chung là mời web app gọi thẳng, đúng thứ QĐ 3 dựng ra để chặn.
 */
export const SECRET_REVEAL_PATH = "/secret/reveal";

/**
 * Trang tĩnh, không nhận tham số nào.
 *
 * Vé không đi qua đây: nó nằm ở fragment, và fragment không tới máy chủ. Nên chuỗi HTML này
 * giống hệt nhau ở mọi lượt gọi — không có gì để chèn, cũng không có gì để thoát.
 */
export function renderSecretPage(): string {
  return `<!doctype html>
<html lang="vi"><head><meta charset="utf-8">
<meta name="robots" content="noindex,nofollow">
<meta name="referrer" content="no-referrer">
<title>Bí mật nick — cầu nối MKTTool</title>
<style>${STYLE}</style></head><body>
<main id="man-hinh"><p class="cho">Đang mở…</p></main>
<script>${SCRIPT}</script>
</body></html>`;
}

const STYLE = `
  :root { color-scheme: light dark; }
  body { font: 15px/1.6 system-ui, sans-serif; max-width: 30rem; margin: 3rem auto; padding: 0 1.2rem; }
  .nhan { font-size: .8rem; text-transform: uppercase; letter-spacing: .05em; color: #8888; }
  .bi-mat { font-family: ui-monospace, Consolas, monospace; font-size: 1.5rem; word-break: break-all;
            background: #8881; padding: .8rem 1rem; border-radius: .4rem; margin: .4rem 0 1rem; }
  button { font: inherit; padding: .45rem 1rem; border-radius: .4rem; border: 1px solid #8886;
           background: transparent; cursor: pointer; }
  button:hover { background: #8881; }
  .hang { display: flex; gap: .6rem; align-items: center; flex-wrap: wrap; }
  .phu { color: #8888; font-size: .9rem; margin-top: 1.2rem; }
  .loi { color: #b91c1c; }
  .cho { color: #8888; }
`;

/**
 * Script của trang. Viết dạng chuỗi vì file này được đóng gói vào `.exe` — không có bước build
 * nào cho tài sản tĩnh, và một file `.js` rời sẽ phải nhúng vào binary bằng đường khác.
 *
 * Không `fetch` ra ngoài, không thư viện, không `eval`. Mọi thứ nó chạm tới đều cùng nguồn.
 */
const SCRIPT = `
(function () {
  var manHinh = document.getElementById("man-hinh");

  function ve() {
    var hash = location.hash;
    // Xóa vé khỏi thanh địa chỉ NGAY, trước cả khi gửi đi — xem chú thích đầu file.
    if (hash) history.replaceState(null, "", location.pathname);
    return hash ? hash.slice(1) : "";
  }

  function chu(the, lop, noiDung) {
    var el = document.createElement(the);
    if (lop) el.className = lop;
    el.textContent = noiDung;
    return el;
  }

  function hienLoi(cau) {
    manHinh.replaceChildren(chu("p", "loi", cau));
  }

  function hien(dulieu) {
    var khung = document.createDocumentFragment();
    khung.appendChild(chu("div", "nhan", dulieu.label || "Bí mật"));

    var oBiMat = chu("div", "bi-mat", dulieu.secret);
    khung.appendChild(oBiMat);

    var hang = document.createElement("div");
    hang.className = "hang";

    var nutChep = chu("button", null, "Chép");
    nutChep.addEventListener("click", function () {
      navigator.clipboard.writeText(dulieu.secret).then(
        function () { nutChep.textContent = "Đã chép"; },
        function () { nutChep.textContent = "Không chép được — bôi đen rồi Ctrl+C"; }
      );
    });
    hang.appendChild(nutChep);

    var nutGiu = chu("button", null, "Giữ mở");
    hang.appendChild(nutGiu);

    var demNguoc = chu("span", "cho", "");
    hang.appendChild(demNguoc);
    khung.appendChild(hang);

    var phu = chu("p", "phu", dulieu.message || "");
    khung.appendChild(phu);
    manHinh.replaceChildren(khung);

    var conLai = ${AUTO_CLOSE_SECONDS};
    var dongHo = setInterval(function () {
      conLai -= 1;
      if (conLai <= 0) {
        clearInterval(dongHo);
        window.close();
        // Tab không do script mở thì close() không ăn — nói ra thay vì im lặng không làm gì.
        manHinh.replaceChildren(chu("p", "cho", "Hết giờ. Đóng tab này lại."));
        return;
      }
      demNguoc.textContent = "tự đóng sau " + conLai + "s";
    }, 1000);
    demNguoc.textContent = "tự đóng sau " + conLai + "s";

    nutGiu.addEventListener("click", function () {
      clearInterval(dongHo);
      demNguoc.textContent = "sẽ không tự đóng — nhớ đóng tab khi xong";
      nutGiu.disabled = true;
    });

    // OTP: mã đổi mỗi 30 giây, nên nói rõ mã đang cầm còn sống bao lâu.
    if (typeof dulieu.secondsRemaining === "number") {
      var conSong = dulieu.secondsRemaining;
      phu.textContent = "Mã này còn dùng được " + conSong + " giây. " + (dulieu.message || "");
      setInterval(function () {
        conSong -= 1;
        if (conSong <= 0) {
          oBiMat.style.opacity = "0.45";
          phu.textContent = "Mã đã hết hạn — quay lại web app bấm lấy mã mới.";
          return;
        }
        phu.textContent = "Mã này còn dùng được " + conSong + " giây. " + (dulieu.message || "");
      }, 1000);
    }
  }

  var tam = ve();
  if (!tam) {
    hienLoi("Không có vé trong địa chỉ. Quay lại web app và bấm lại nút vừa bấm — mỗi tấm vé chỉ dùng được một lần, và tải lại trang này thì vé đã mất.");
    return;
  }

  fetch("${SECRET_REVEAL_PATH}", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ ticket: tam })
  })
    .then(function (r) { return r.json(); })
    .then(function (dulieu) {
      if (dulieu && dulieu.ok) hien(dulieu);
      else hienLoi((dulieu && dulieu.message) || "Cầu nối từ chối vé này.");
    })
    .catch(function () {
      hienLoi("Không hỏi được cầu nối, dù trang này do chính nó phục vụ. Thử tắt bật lại cầu nối.");
    });
})();
`;
