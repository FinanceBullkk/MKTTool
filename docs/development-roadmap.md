# Lộ trình phát triển

**Cập nhật:** 10/08/2026

Đây là **nguồn duy nhất về trạng thái** của dự án. Chi tiết thi công nằm ở
[plan công cụ gốc](../plans/260801-2030-multi-account-posting-console/plan.md),
[plan Web chung](../plans/260804-1752-web-chung-cho-team-phan-tan/plan.md) và
[plan MKT Browser](../plans/260810-0244-mkt-browser-noi-bo/plan.md); vì sao làm ở
[project-overview-pdr.md](project-overview-pdr.md).

Dự án đang chạy **ba luồng song song**:

| Luồng | Là gì | Trạng thái |
|---|---|---|
| **A — Công cụ** | 5 giai đoạn gốc: kho danh tính → hàng đợi → sức khỏe → Facebook → tự đăng Reddit | GĐ1-4 xong, GĐ0 kẹt ở tiền + cold-start, GĐ5 chưa bắt đầu |
| **B — Web chung** | Biến app một máy thành web chung cho 5-6 người ở 5-6 nơi | **GĐ0-4 xong 06/08**, GĐ5 web **đã chạy thật trên Railway** cùng ngày |
| **C — MKT Browser** | Fork the MultiZen desktop layer; macOS is primary while Web, Relay, and upstream UX/UI remain intact in v1 | **MKB-00 remains open; MKB-W01 Windows isolation and MKB-W02 internal clean break verified**; Apple Silicon gate open; [plan](../plans/260810-0244-mkt-browser-noi-bo/plan.md) |

Luồng B sinh ra sau khi chốt bàn giao cho team — xem
[plan web chung](../plans/260804-1752-web-chung-cho-team-phan-tan/plan.md). Nó **không thay thế**
luồng A: tự đăng Reddit vẫn nằm ở luồng A và vẫn chờ nick thật.

Stream C replaces MultiZen at the **desktop execution layer**; it does not replace Web, the database,
the rule engine, or Relay. W01 proved compatible behavior, then W02 deliberately moved the active
first-party package/preload/MCP/consumer identities to an owned contract before operational use.
**macOS Apple Silicon is primary**;
Windows x64 remains a regression platform, and Intel Mac support is added only if device inventory
shows a real need. V1 does not redesign MultiZen or develop a Chromium engine.

> **Language rule — 10 August 2026:** all new or materially revised project artifacts and product
> copy must be in English. Direct conversation with the project owner may remain in Vietnamese.
> Translate the active MKT Browser specification before MKB-00; historical records remain intact.

---

## Luồng A — Trạng thái các giai đoạn

| # | Giai đoạn | Trạng thái | Ngày | Còn thiếu gì |
|---|---|---|---|---|
| 0 | [Chuẩn bị & kiểm chứng khả thi](../plans/260801-2030-multi-account-posting-console/phase-00-preparation-and-feasibility-check.md) | 🟡 Đang chạy | Kiểm chứng xong 02/08 | Mua proxy + nick, chạy 14 ngày cold-start |
| 1 | [Kho danh tính](../plans/260801-2030-multi-account-posting-console/phase-01-identity-vault.md) | ✅ Xong | 01/08 | – |
| 2 | [Hàng đợi content + Bộ luật an toàn](../plans/260801-2030-multi-account-posting-console/phase-02-content-queue-and-safety-rules.md) | ✅ Xong | 02/08 | – |
| 3 | [Theo dõi sức khỏe tài khoản](../plans/260801-2030-multi-account-posting-console/phase-03-account-health-monitor.md) | ✅ Xong | 03/08 | Proxy quan sát viên đã sẵn sàng; chưa chạy với nick Reddit thật |
| 4 | [Facebook Pages publisher](../plans/260801-2030-multi-account-posting-console/phase-04-facebook-pages-publisher.md) | ✅ Xong | 03/08 | – (đã đăng thật lên Fanpage) |
| 5 | [Bán tự động đăng Reddit](../plans/260801-2030-multi-account-posting-console/phase-05-reddit-posting-automation.md) | ⬜ Chưa bắt đầu | – | Chờ Phase 00-03 chạy ổn 2 tuần với thao tác tay |

**Code đi trước phần mua sắm.** Bốn giai đoạn code đã xong trong khi Phase 00 còn chờ tiền và chờ
đồng hồ. Đó là rủi ro đã biết, không phải nhầm lẫn: phần code không có đường rút ngắn 14 ngày
cold-start, nên làm trước là đúng.

## Luồng B — Web chung cho team phân tán

Chi tiết ở [plan.md](../plans/260804-1752-web-chung-cho-team-phan-tan/plan.md). Tổng ~3-3.5 tuần.

| # | Giai đoạn | Trạng thái | Ngày | Còn thiếu gì |
|---|---|---|---|---|
| 0 | Spike: trình duyệt gọi xuống cầu nối | ✅ Xong | 04/08 | – (chốt 3 ràng buộc bắt buộc cho GĐ2/3/4) |
| 1 | [Postgres + múi giờ team](../plans/260804-1752-web-chung-cho-team-phan-tan/phase-01-postgres-va-mui-gio-team.md) | ✅ Xong hẳn | 05/08 | – (chốt bắt đầu từ kho rỗng, không nhập lại dữ liệu thử) |
| 2 | [Đăng nhập, vai trò, chủ sở hữu nick](../plans/260804-1752-web-chung-cho-team-phan-tan/phase-02-dang-nhap-vai-tro-chu-so-huu.md) | ✅ Xong | 05/08 | – (hoãn có chủ ý: bộ lọc "nick của tôi", chỉ là tiện nghi hiển thị) |
| 3 | [Tách hai vùng khóa + vé ký](../plans/260804-1752-web-chung-cho-team-phan-tan/phase-03-tach-hai-vung-khoa-va-ve-ky.md) | ✅ Xong | 06/08 | – |
| 4 | [Cầu nối trên máy operator](../plans/260804-1752-web-chung-cho-team-phan-tan/phase-04-cau-noi-tren-may-operator.md) | ✅ Xong | 06/08 | Đã nghiệm thu thành công trên máy Windows thứ hai không cài Node. |
| 5 | [Lên Railway + cron + sao lưu](../plans/260804-1752-web-chung-cho-team-phan-tan/phase-05-len-railway-cron-sao-luu.md) | 🟢 **Web chạy thật, deploy tự động, sao lưu tự rời máy chủ** | 06/08 | Chạy ở `mkttool-web-production.up.railway.app`, đăng nhập Google được, 10 proxy sang đủ, bộ lịch tự bắn đúng 09:00 giờ team, **đẩy commit lên `master` là web tự cập nhật**, và **app tự đẩy bản sao lưu lên Cloudflare R2 mỗi đêm** — đã nghiệm thu trọn vòng (tải object về, khôi phục vào database rỗng, đúng 22 hàng/6 bảng). **Proxy quan sát viên đã có và kiểm sống** (`Observer1`, US, 15:31), và **Facebook đã nối Fanpage thật trên máy chủ** (16:08 — Meta chấp nhận domain `*.up.railway.app`, không phải mua tên miền). Còn lại đúng một việc, và nó **không tự đóng được trong GĐ5**: một lượt dò thật — chờ **nick Reddit trong kho máy chủ**, tức chờ bước nhập liệu của GĐ6 |
| 6 | Bàn giao team | 🟡 Đang chuẩn bị | 07/08 | Hết chặn kỹ thuật: web đã có địa chỉ (GĐ5) và **gói cầu nối đã có đường phát** (`npm run relay:publish` → R2 → `/relay-download`). **07/08 siết xong phân quyền cho nhiều người dùng chung** — nick ghim vào một máy, vé bay về máy giữ nick, kho proxy về tay ADMIN (làm trước bước nhập liệu vì kho nick còn rỗng nên không phải gán tay cụm nào). Còn lại là việc quy trình: nhập dữ liệu, cài 1-2 máy Reddit, đào tạo |

## Stream C — Internal MKT Browser

Architecture, flows, license gates, acceptance, and rollback are defined in the
[MKT Browser plan](../plans/260810-0244-mkt-browser-noi-bo/plan.md). The fork belongs in a separate
repository. MKTTool retains only the consuming contract, Relay, and release page.

| # | Phase | Status | Exit gate |
|---|---|---|---|
| MKB-00 | Platform, source, license, and engine | 🟡 In progress | Upstream and engine run natively on Mac arm64; Windows x64 retains its baseline |
| MKB-W01 | Windows-only product isolation (authorized exception) | ✅ Verified 10 August | Independent Windows identity/data root; upstream updater/heartbeat/publishing absent; current MCP adapter remains green |
| MKB-W02 | Windows internal clean break | ✅ Verified 10 August | Dedicated port `47822`, MKT Browser-only internal contract, no legacy fallback, packaged lifecycle through updated MKTTool consumer |
| MKB-01 | Cross-platform compatibility and product identity | 🟡 Windows subset only | Independent data path/updater; stable MKT Browser MCP and upstream-derived UX/UI behavior; Mac + Windows CI |
| MKB-02 | Managed mode | ⬜ Not started | Idempotent create, atomic launch, and dangerous actions locked with upstream components |
| MKB-03 | Relay, installer, and updates | ⬜ Not started | Signed/notarized Mac DMG plus Keychain/LaunchAgent helper; signed Windows installer; snapshot/rollback |
| MKB-04 | Technical pilot and one canary account | ⬜ Not started | Two Macs plus one Windows regression device remain green for seven days; one Mac account completes a 14-day cold start |
| MKB-05 | Team rollout | ⬜ Not started | Canary completes cold start; MKT Browser becomes default; rollback uses only the frozen W01 checkpoint and never restores a MultiZen adapter fallback |
| MKB-06 | Custom UX/UI | ⏸ Deferred beyond v1 | Begin only from observed usage feedback; does not block MKB-00 through MKB-05 |

**MKB-00 evidence, 10 August 2026:** Official MultiZen `v0.3.1` is pinned at
`83c6898b2de3de1122b5fea88008fbbaa4677bff` in the separate `E:\MKTBrowser` checkout. The
unmodified Windows x64 build, the 22-tool MCP contract, and MKTTool's current adapter passed with
disposable profiles; focused fail-closed tests passed 27/27. The CloakBrowser binary is approved
only conditionally for unmodified internal use through official downloads and must not be bundled or
redistributed. MKB-00 remains in progress because Apple Silicon, a real disposable proxy, and the
exact Mac engine/license decision are unverified. Evidence and the Mac runbook live in
`E:\MKTBrowser\docs`.

**MKB-W01 evidence, 10 August 2026:** The project owner authorized a bounded Windows-first
exception while MKB-00 remains open. The fork now builds as `MKTBrowser.exe` with application ID
`com.mkttool.browser` and fixed Windows data root
`%LOCALAPPDATA%\MKTTool\MKTBrowser\`. It does not discover or migrate the legacy MultiZen store.
The upstream updater, manual update IPC, heartbeat, publish scripts/provider, and tag-triggered
release workflow were removed or quarantined. Product identity tests passed 4/4, full typecheck and
build passed, a packaged launch without `--user-data-dir` wrote only to the temporary canonical
product root, and the current MKTTool adapter again passed the 22-tool disposable
list/fingerprint/create/fail-closed proxy/apply/launch/close/delete sequence. This completes only
the Windows technical slice: the inherited icon, independent runtime/version contract, Electron
upgrade, copy-only importer, signing, installer, approved updates, and all Apple Silicon evidence
remain open.

**MKB-W02 evidence, 10 August 2026:** The clean break is verified across both sibling repositories.
Active first-party identities now use `@mktbrowser/*`, `window.mktBrowser`, `mkt-browser`, and
`MktBrowser*`; the desktop default is configurable port `47822`; MKTTool and Relay use the new
client/config names with no MultiZen fallback. Browser contract tests passed 8/8, focused
MKTTool/Relay tests passed 98/98, the full MKTTool suite passed 1,120/1,120, and both typechecks and
Windows builds passed. With a disposable listener occupying `7777`, the packaged app completed
initialize/tools-list/list/fingerprint/create/fail-closed proxy/update/launch/close/delete through
the updated MKTTool consumer and ended with zero profiles. The real MKT Browser root stayed absent
and all 3,497 legacy-tree metadata records stayed unchanged. See
[MKB-W02 Windows evidence](../../MKTBrowser/docs/mkb-w02-windows-internal-clean-break.md).

**W02 coverage gap, closed the same day:** that run never exercised the MKTTool Relay packaging
pipeline, and one regression was hiding there. The slice had saved `relay/install-relay.ps1` without
its UTF-8 byte order mark while the file still held Vietnamese text, which makes Windows PowerShell
5.1 read the installer in the machine ANSI code page and show an operator mojibake on the one screen
they read. It survived the full green suite because only the packaging script guarded it. The mark
is restored, the same check now lives in the installer encoding tests, and the repackaged Relay
executable passed its 24-check acceptance carrying the W02 contract and port `47822`. Treat a green
test suite as evidence about the code paths it runs, not about release packaging.

The current technical estimate is **five to eight weeks** because the Relay is currently tied to a
Windows `.exe`, PowerShell, and Startup, while macOS requires a native helper, Keychain, LaunchAgent,
Developer ID, and notarization. Retaining the MultiZen UX/UI keeps a separate design project off this
critical path.

**There is no database migration in the compatibility phase.** `antidetectProfileId`, `deviceId`,
and `proxyId` are sufficient to replace the provider. Add provider or version data to Postgres only
if the pilot demonstrates that ADMIN users genuinely need to track devices while they are offline.

**GĐ1 đã đổi nền dữ liệu sang Postgres và đóng hẳn** (05/08/2026): 482/482 test, 4 smoke test và
`npm run db:backup` đều xanh trên Postgres. Ràng buộc 1 nick = 1 proxy vẫn do database ép.
Cố ý **không nhập lại nick**: chưa có nick thật nào, 3 nick cũ đều là nick thử — nhập lại chỉ
mang rác sang kho mới.

> **Proxy thì đã nhập** (05/08/2026, tối). 10 IP Webshare trong `dev.db` là dữ liệu thật đã trả
> tiền và đã kiểm 10/10 ngày 04/08, và **mật khẩu của chúng không nằm ở đâu khác ngoài file đó** —
> tức một ổ cứng hỏng là mất tiền thật. Nay đã sang Postgres bằng
> `npm run proxies:import-sqlite`, đối chiếu **10/10 mật khẩu giải mã ra đúng nguyên văn**.
>
> Vẫn **giữ nguyên `dev.db`** cho tới khi có người mở thử một proxy trong app và thấy nó chạy
> thật. Đối chiếu ciphertext chứng minh dữ liệu sang đúng, không chứng minh proxy còn sống.

**GĐ2 đã đổi hàng rào và đóng** (05/08/2026): từ "app chỉ nghe ở `127.0.0.1`" sang "phải đăng
nhập Google và có tên trong `ALLOWED_EMAILS`". Cờ `-H` đã bỏ — đúng thứ tự đã hẹn, chỉ sau khi
danh sách lối vào chưa gác về rỗng. Nghiệm thu tay đã chạy thật, và chính nó bắt ra lỗ mà không
phép kiểm tĩnh nào thấy: **trang** không đi qua wrapper gác nào cả, phải thêm `src/proxy.ts`.

> Còn một lỗ **đã biết và cố ý chưa đóng**: một phiên đăng nhập bị trộm vẫn đọc được mật khẩu
> nick, vì khóa vẫn nằm cùng một chỗ với máy chủ. Đó là việc của GĐ3, và là lý do **chưa bàn
> giao cho ai** trước khi GĐ3 xong.

**GĐ3 đã xong — 11/11 việc** (06/08/2026). Kho đã chia hai vùng khóa thật: `VAULT_KEY_SERVER`
(mật khẩu proxy, token Facebook) và `VAULT_KEY_OPERATOR` (mật khẩu, email, TOTP của nick). Vùng
của từng cột khai ngay trong `schema.prisma` bằng dấu `vault:server` / `vault:operator`, và test
đọc thẳng schema nên khai thiếu hoặc khai lệch là đỏ. `vault:rekey` nay xoay theo từng vùng;
`vault:smoke` đã xanh trên DB thật, gồm phép thử **khóa vùng server KHÔNG mở được mật khẩu nick**.

> **Lỗ ở trên đã đóng 06/08.** Bốn chỗ từng cần khóa vùng operator trên máy chủ nay là không chỗ
> nào, và phép thử nghiệm thu — *gỡ hẳn `VAULT_KEY_OPERATOR` khỏi máy chủ mà app vẫn chạy* — đã
> thành hai bài test chạy mỗi lượt `npm test`. Lượt grep nghiệm thu cũng thành một bài test
> thường trực: grep chứng minh được hôm nay, còn thứ phải giữ là một điều kiện sống lâu hơn ngày
> nghiệm thu.

Từ đó tới nay thêm **cặp khóa ký vé Ed25519 của máy chủ**. Máy chủ không còn tự đưa mật khẩu cho
ai được nữa; thứ nó còn làm được là bảo chứng *"vé này do máy chủ phát sau khi đã kiểm phiên và
kiểm chủ nick"* — chữ ký là lời bảo chứng đó. Chỉ một biến môi trường (`TICKET_SIGNING_KEY`, hạt
giống khóa riêng), khóa công khai suy ra từ nó chứ không khai riêng, nên không có đường sinh ra
một cặp lệch. Hai lệnh: `keys:server-keygen` sinh cặp mới, `keys:server-pubkey` in lại khóa công
khai đang dùng — thứ cần tới mỗi lần cài cầu nối lên một máy mới.

Và **sổ đăng ký máy chạy cầu nối** (`/relay-devices`). Mỗi máy khai một khóa công khai X25519;
máy chủ bọc nội dung vé bằng khóa của đúng máy nhận, nên trình duyệt chuyển vé qua tay mà không
đọc được gì bên trong — kể cả mật khẩu proxy. ADMIN đăng ký và thu hồi, cả team đọc được sổ
(khóa công khai lộ cũng không mất gì, còn giấu đi thì không ai tự trả lời được *"máy tôi vào sổ
chưa?"*). Thu hồi là một chiều: khóa của máy đã mất coi như đã lộ.

> **Thu hồi không phải là xong.** Nó chặn **vé mới**, nhưng không với tới ciphertext chiếc máy đó
> đã lấy về từ trước — thứ đang nằm trên ổ cứng của chính chiếc laptop đã mất. Mất máy thì thu hồi
> xong vẫn phải xoay `VAULT_KEY_OPERATOR`. Câu thông báo sau khi bấm nút nói đúng ranh giới này,
> và có test canh nó.

Và **bộ phát/xác minh vé** — mảnh cuối của phần nền. Máy chủ bọc ruột vé cho riêng máy nhận (cặp
khóa dùng một lần cho mỗi tấm vé, X25519 → HKDF → AES-256-GCM), rồi ký Ed25519 phủ lên cả bao
ngoài lẫn ruột đã bọc. Cầu nối xác minh chữ ký **trước khi** giải mã bất cứ thứ gì. Vé sống 30
giây và tiêu được đúng một lần; sổ chống dùng lại nằm ở cầu nối, vì theo QĐ 5 nó không nối mạng
để hỏi máy chủ, và máy chủ cũng không biết — nó phát vé rồi thôi.

Vé mang **hai số phiên bản** ngay từ tấm đầu tiên (QĐ 11), và `verifyTicket` kiểm chúng ngay sau
chữ ký: cầu nối bản cũ phải nói được *"bản quá cũ, tải lại"* thay vì chết mơ hồ ở bước giải mã.

**Ba lối vào đã nối vào vé** (06/08/2026), và đó là lúc GĐ3 thật sự có tác dụng. Hai server
action lấy bí mật nay **phát vé** thay vì giải mã (đổi tên thành `requestCredentialTicket` /
`requestOtpTicket` — tên cũ nói dối về việc hàm làm); route mở profile dựng cấu hình proxy rồi bỏ
vào vé; form tạo/sửa nick nhờ cầu nối bọc ba ô bí mật **trước khi** gửi lên, nên máy chủ nhận
ciphertext chứ không nhận mật khẩu. Kèm hai chốt nhỏ: `guardedAction` nay bọc cả thân hàm nên câu
*"nick này do người khác phụ trách"* tới được người bấm nút thay vì thành một promise reject câm,
và đường phát vé có **hạn nhịp 10 vé mỗi phút** để một phiên bị trộm không rút sạch kho trong vài
giây.

> ⚠️ **Từ 06/08 tới khi GĐ4 xong, ba việc cần cầu nối mới làm được**: lấy mật khẩu/OTP, mở
> profile, và tạo/sửa nick *có nhập bí mật mới*. Đây là trạng thái đã hẹn trước của QĐ 8 — làm
> hết rồi bàn giao một lần, không có giai đoạn quá độ — và chưa ai ngoài tác giả dùng công cụ.
> Sửa karma, trạng thái hay proxy của nick thì **không** cần cầu nối: ba ô bí mật để trống nghĩa
> là giữ nguyên, và form không gọi xuống `127.0.0.1` khi không có gì để bọc.

Ngoài 11 việc gốc, hai chốt nữa đóng trong ngày. **Ghi đè bí mật nick nay phải là chủ nick** —
đối xứng với đường lấy bí mật; trước đó một OPERATOR không đọc được mật khẩu nick của đồng
nghiệp nhưng ghi đè được nó. Chỉ gác khi form thật sự mang bí mật lên, nên sửa karma / trạng thái
/ proxy cho nhau vẫn là việc chung. Việc `status` bị kéo từ `SHADOWBANNED` về `HEALTHY` **không**
giải bằng phân quyền (chủ nick cũng ép được) mà bằng dấu vết: nhật ký nay ghi cả chiều đổi.

Và **khay cảnh báo vận hành** dưới thanh đầu trang, có mặt ở mọi trang. Nó trả lời một câu mà
trước nay không màn hình nào trả lời: *kho có thật sự đang tách hai vùng khóa không?* Hai mục —
*hai vùng chung một khóa* (đỏ: GĐ3 đang không có tác dụng gì) và *máy chủ vẫn giữ
`VAULT_KEY_OPERATOR`* (vàng: đã tách thật nhưng bản sao khóa còn nằm sai chỗ) — mỗi mục một dòng
với việc phải làm riêng, lọc theo vai trò vì chỉ ADMIN đổi được biến môi trường. Trước đó câu duy
nhất nói ra chuyện này là một dòng `console.warn` lúc khởi động: dưới máy mình thì thấy, trên
Railway thì trôi. Cảnh báo *"cầu nối bản cũ"* của GĐ4 và cảnh báo môi trường của GĐ5 nay chỉ là
thêm một mục vào khay này.

**GĐ5 — web đã có một địa chỉ để trỏ tới** (06/08/2026). Ba mảnh đóng trong ngày, cả ba cùng một
lẽ: *thứ cần một người nhớ thì sớm muộn cũng có ngày không ai nhớ.* Web chạy thật trên Railway;
nối GitHub xong nên đẩy commit lên `master` là web tự cập nhật (trước đó mỗi lần deploy là một
lượt `railway up` gõ tay, mà lệnh đó thiếu `--service` thì deploy web **đè lên dịch vụ Postgres**);
và máy chủ tự `pg_dump` rồi tải lên Cloudflare R2 mỗi đêm.

> **Sao lưu nay có hai lớp, cất hai nơi.** Nửa tự động của R2 là **đổi hướng so với chốt hôm
> trước** — chốt cũ nói app không nên tự sao lưu vì `data/backups/` trong container là ổ tạm. Chẩn
> đoán đúng, kết luận sai: vấn đề không phải *"app không nên sao lưu"* mà là *"bản sao không được
> nằm cùng nhà với bản gốc"*. Ghi thẳng lên R2 thì chỗ chứa hết là ổ tạm, và không cần ai nhớ chạy
> lệnh gì. `npm run db:backup:remote` vẫn còn, làm lớp do người quản trị chủ động kéo về.
>
> **Lớp thứ ba — sao lưu ổ đĩa của Railway — đã quyết bỏ** (06/08/2026): nó đòi gói Pro $20/tháng,
> mà thứ nó thêm vào chỉ là ca *lỡ tay xóa / migration hỏng giữa hai lượt sao lưu đêm*. Bản sao của
> Railway nằm **cùng tài khoản với bản gốc** nên không chống được ca tệ nhất — đúng ca mà R2 đã
> phủ. Bù bằng một nếp tay thay vì tiền: **chạy `db:backup:remote` ngay trước mỗi lần deploy có đổi
> cấu trúc database**, vì `prisma migrate deploy` không tự sao lưu.

## Đường găng: cái gì đang chặn

| Chặn | Bản chất | Ai gỡ được |
|---|---|---|
| **MKB-00: engine Mac arm64 + build baseline** | Cổng mới do quyết định Mac-first; chưa được dùng nick thật để debug | Người phát triển + người duyệt điều khoản/chi phí |
| **Apple Developer ID + notarization** | Không có thì nhân viên Mac gặp Gatekeeper hoặc phải mở Terminal, trái flow đã chốt | Người quyết tài khoản/ngân sách |
| **Chứng thư ký Windows** | Vẫn cần cho các máy Windows kiểm hồi quy/team | Người quyết ngân sách |
| **Mua proxy tĩnh + nick** | Tiền (3-8 triệu một lần) | Người quyết ngân sách |
| **14 ngày cold-start** | Đồng hồ thật, không rút ngắn | Không ai — chỉ chờ |

Mua nick/proxy, chọn subreddit và chuẩn bị content có thể chạy song song với fork. Sau MKB-04 chỉ
đăng nhập một nick thăm dò; cả cụm đợi nick đó đi hết cold-start để không đem một lỗi desktop nhân
ra nhiều nick. Phase 05 vẫn không bắt đầu trước M3 — tự động hóa lên nick chưa qua cold-start là
cách giết nick nhanh nhất.

## Đã kiểm chứng bằng thực tế

Danh sách này là ranh giới giữa "code có chạy" và "đã chạy thật". Bảng đầy đủ kèm bằng chứng ở
[README](../README.md#đã-kiểm-chứng-bằng-thực-tế).

| Việc | Ngày |
|---|---|
| Web chạy thật trên Railway: đăng nhập Google, kho sang đủ, lịch dò tự bắn đúng giờ team | 06/08/2026 |
| Sao lưu tự động lên R2 đi trọn vòng: app đẩy lên → tải về → khôi phục vào database rỗng, đúng 22 hàng/6 bảng | 06/08/2026 |
| Mở profile antidetect qua MCP | 02/08/2026 |
| Đẩy proxy vào profile, IP trong profile khớp proxy | 02/08/2026 |
| Bộ dò shadowban đọc HTML Reddit thật (bắt được 2 lỗi parser) | 03/08/2026 |
| Đăng thật lên Fanpage qua Graph API | 03/08/2026 |

**Chưa kiểm chứng:** đăng bằng nick Reddit thật, và lượt `npm run health` đầy đủ với nick thật +
proxy quan sát viên.

## Mốc tiếp theo

| Mốc | Điều kiện đạt |
|---|---|
| **M0B — Fork tương thích** | Mac arm64 build native từ nguồn ghim và mở profile đúng proxy; Windows x64 giữ baseline |
| **M0C — Desktop pilot** | DMG notarized + managed mode + rollback xanh trên hai Mac và một Windows kiểm hồi quy trong 7 ngày |
| **M0D — Nick thăm dò** | Một nick ít quan trọng đi hết 14 ngày cold-start trên Mac, không sai IP/profile |
| **M1 — Kho danh tính có nick thật** | 8 nick Reddit + 3 nick FB đã nhập, mỗi nick một proxy tĩnh, cold-start đang chạy |
| **M2 — Bài đầu tiên lên Reddit** | Hết cold-start, xếp lịch qua hàng đợi, bộ luật cho qua, đăng tay thành công |
| **M3 — Vận hành đều 2 tuần** | 15-20 bài/ngày, không nick nào bị ẩn, `npm run health` chạy hằng ngày |
| **M4 — Bắt đầu Phase 05** | M3 đạt, có đủ dữ liệu tương tác để bộ luật đụng độ thread có nghĩa |

## Tiêu chí thành công tổng thể

- 6/8 nick Reddit sống và không shadowban sau 8 tuần
- Bạn MKT đăng được 15-20 bài/ngày trong ~1 tiếng
- 0 lần đăng trùng nội dung giữa 2 nick cùng nền tảng
- Có số liệu lead thật quy về được từng nick

## Rủi ro còn mở

| Rủi ro | Vì sao đáng lo | Đang xử lý bằng |
|---|---|---|
| **Nguồn nick kém** | Nick mua về chết trong 2 tuần đầu | Phase 00 tồn tại để phát hiện sớm, trước khi đổ content vào |
| **Content không đủ** | 3 người viết không nuôi nổi nhiều nick | Đã hạ quy mô xuống 5-8 nick |
| **Reddit mod là người thật** | Không có giải pháp kỹ thuật | Phụ thuộc chất lượng nội dung, không phụ thuộc công cụ |
| **Cold-start chưa chạy** | Đường găng thật, code đã đi trước khá xa | Không có cách nào ngoài mua nick sớm |
| **Fork trôi xa upstream** | Tự gánh bản vá Electron/MCP/profile migration | Repo riêng, module `mkt-*`, upstream SHA và contract test mỗi lần nhập bản vá |
| **Engine và app khác license** | MIT của MultiZen không tự cấp quyền phân phối binary engine | Gate license riêng, không bundle engine theo quán tính, SBOM/NOTICE mỗi release |
| **Mac chỉ “mở được” nhưng không đủ dùng** | Rosetta, Gatekeeper, helper, Keychain hoặc WebRTC có thể lệch hành vi thật | arm64 native + notarization + hai máy Mac pilot; không cho nhân viên chạy `xattr` |
| **Hai OS trôi khác nhau** | Cầu nối hiện chỉ đóng gói Windows | Lõi chung, adapter OS mỏng, CI contract/mật mã trên Mac và Windows |
| **Redesign làm chậm fork** | UI riêng không giải quyết rủi ro profile/proxy | Giữ UX/UI MultiZen trong v1; MKB-06 để sau dữ liệu sử dụng thật |
| **Reddit đổi giao diện** | Bộ dò đọc HTML `old.reddit.com` sẽ hỏng | Hỏng thì báo "Không dò được", không bao giờ báo "khỏe"; `npm run health:smoke` đối chiếu Reddit thật |

The original MultiZen feasibility risk closed on 02/08/2026. W01 and W02 now verify the Windows
technical fork, owned contract, port independence, and disposable consumer lifecycle, but they do
not prove pilot readiness. Runtime fallback has been removed; rollback is the frozen W01 checkpoint
and independently installed upstream application, not a dual-name adapter path.

## Ngân sách

| Khoản | Một lần | Hàng tháng |
|---|---|---|
| Nick Reddit cổ (8 cái) | 2-5 triệu | – |
| Nick FB (3 cái) | 1-3 triệu | – |
| Proxy tĩnh (11 IP) | – | ~700k |
| MKT Browser + engine ngoài | **Chưa chốt** — Apple Developer + chứng thư ký Windows | **Chưa chốt** — engine mới nhất có thể cần subscription |
| Máy chạy | dùng máy sẵn có | 0đ |
| Thay nick hao hụt | – | ~500k-1tr |
| **Tổng** | **3-8 triệu + chi phí fork/ký chưa chốt** | **~1,2-1,7 triệu + engine nếu có** |
