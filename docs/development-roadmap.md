# Lộ trình phát triển

**Updated:** 15 August 2026

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
| **C — MKT Browser** | Fork the MultiZen desktop layer; Windows-only in v1 while Web, Relay, and upstream UX/UI remain intact | **MKB-00 through MKB-02 verified; MKB-03 Phases 01-04 plus the Phase 06 engineering subset pushed; Phase 05 and human gates open**; MKB-04 remains NO-GO; macOS deferred to MKB-07; [plan](../plans/260810-0244-mkt-browser-noi-bo/plan.md) |

Luồng B sinh ra sau khi chốt bàn giao cho team — xem
[plan web chung](../plans/260804-1752-web-chung-cho-team-phan-tan/plan.md). Nó **không thay thế**
luồng A: tự đăng Reddit vẫn nằm ở luồng A và vẫn chờ nick thật.

Stream C replaces MultiZen at the **desktop execution layer**; it does not replace Web, the database,
the rule engine, or Relay. W01 proved compatible behavior, then W02 deliberately moved the active
first-party package/preload/MCP/consumer identities to an owned contract before operational use.
**Platform decision, 10 August 2026:** v1 commits to **Windows x64 only**; macOS Apple Silicon moves
to MKB-07 after v1. Mac hardware is available, so this is a priority choice rather than a hardware
constraint: the Windows slice is already verified end to end, while macOS still needs Apple Developer
enrollment, notarization, a LaunchAgent helper, and Keychain storage, none of which is started or
owned, and no operator workflow depends on macOS today. The control against paying for this twice is
that the Relay keeps a shared core with thin OS adapters, so MKB-07 adds a platform instead of
reopening one. V1 does not redesign MultiZen or develop a Chromium engine.

**Immediate delivery target, 15 August 2026:** complete pre-MKB-04 remediation on top of the verified Windows x64
managed-mode contract. An owner-led demonstration may use disposable profiles and show the
Web → Relay → MKT Browser flow, but it is not a pilot, distribution approval, or permission to use
real accounts. The one-download onboarding journey, secure enrollment/migration, controlled updates,
pilot duration, and real-account gates remain separate. Code signing is no longer among them: on
12 August the owner decided v1 ships **unsigned** for the internal fleet, so SmartScreen appears once
and the setup journey must announce it in advance.

Phase 01 implementation now produces one installer carrying a pinned Relay archive and MKT
Browser. Relay releases use retained `MKTTool-Relay-vN.zip` R2 objects, carry measured version, size,
and SHA-256 metadata, and refuse publication when the local build sidecar is missing, stale, or does
not match the archive. The combined installer verifies pinned size before hashing, keeps its NSIS
include ASCII-only, and records whether Relay pre-existed so uninstall removes only an owned Relay;
unknown ownership preserves it. It writes only under `release/installer/` and leaves the frozen
MKB-02 directory artifact unchanged. Clean-account install, reboot, and uninstall verification remain
a human gate because this machine's live Relay and Browser must not be stopped.

Current remediation advances Relay source and the combined-installer pin to v12. Relay v12 accepts
Browser contract v4 while preserving the v11 minimum for planned retirement. Its local ZIP is
34,181,785 bytes with SHA-256
`fe6de7fcf23a811682226a765c2986d1dc7e0242ef247ec61f1e5bd56dcd998c`; its packaged smoke path
passed crypto, signed cleanup, recovery health, and finalization. It is not published, and no
operational distribution is claimed until the immutable authenticated v12 object exists. The fresh
local Node 22 combined installer proves the packaging path without claiming that the release channel
is available.

Release-authority ceremony tooling is now implemented and verified without creating production key
material. The owner machine can create the delegated Ed25519 key directly into DPAPI CurrentUser; a
portable offline tool creates two independently encrypted root backups on separate drive roots,
signs the first delegation, reads both copies back, and requires a recovery proof from backup B. The
offline-tool ZIP, delegated key, and root key each use a separate paper fingerprint, preventing a
modified transfer drive from substituting either ceremony code or authority. The physical ceremony
remains open, so Phase 05 implementation and MKB-04 remain
blocked. See [release-signing-key-ceremony.md](release-signing-key-ceremony.md).

Phase 06 setup-conflict integration is now implemented locally without changing Relay v12. The
combined installer persists its standard-user PowerShell detector beside MKT Browser. Contract v4
adds the runtime-dependent `local-install-ready-v1` capability only when that same detector accepts
the expected running Browser and Relay and finds no foreign process, fixed-port, MultiZen-process,
or startup-entry conflict. `/setup` requires the capability and sends a failed or unavailable
inspection to installer repair instead of reporting `Ready`. Focused runtime tests pass 7/7,
the complete Browser Node 22 installer suite passes 97/97 with packaging contracts at 24/24,
focused MKTTool setup tests pass 28/28, and both repositories pass typecheck and lint. Clean-Windows
matrices and the unfamiliar-operator gate remain open.

**Team-installation boundary, reviewed 11 August 2026:** the owner-led demo may use the current
technical artifacts, but team members must not be asked to install the Relay ZIP and Browser
directory themselves. MKB-03 now has a hard zero-confusion gate: one authenticated Windows
download opens one resumable current-PC journey — an announced SmartScreen click-through, sign in,
confirm the detected PC, then reach the non-error `Waiting for administrator approval` state or
`Ready`. Ordinary operators never handle
Relay/MCP vocabulary, keys, tokens, ports, paths, archives, checksums, localhost pages, or commands.
The first-device secret bootstrap remains a separate ADMIN-only local ceremony.

The frozen MKB-02 Windows technical package was regenerated on 12 August at
`E:\MKTWorkspace\MKTBrowser\apps\desktop\release\win-unpacked\MKTBrowser.exe`; its current SHA-256 is
`238d5d6fd5e373b052c484ceab90698f6dc295205a59be6573f9928b01db4f42`. Node guards passed 2/2,
W02 passed 8/8, MKB-01 passed 8/8, MKB-01E passed 7/7, MKB-02 passed 18/18, and
Windows packaging guards passed 3/3. That frozen checkpoint passed typecheck, build, and packaged
verification. Current Phase 00 remediation adds real workspace lint and CI/package quality guards;
23 packaging contracts, the complete Node 22 installer suite, lint, and typecheck pass on 14 August.
The fresh unsigned installer at `release/installer/MKTBrowser-win-x64.exe` is 146,006,574 bytes with
SHA-256 `b66c3cf89ac683063372d320c7a77193be1d90a3a0427066318fc6e849dc4f2b`.
It embeds the exact Relay v12 archive and manifest, but remains local and unpublished. The packaged
verifier proves contract-v4 capability
reporting, a profile-management-only tool inventory, deterministic managed create/retry, correlated
create/launch diagnostics, direct-launch and delete locks, endpoint-free proxy summaries, atomic
managed launch, Windows Chrome launcher-PID handoff, process-confirmed close, and clean
application/profile cleanup with no disposable Chrome process left behind. Packaging retries
`rcedit` only for the transient `Unable to commit changes` failure; every other edit failure stops
immediately. The executable is still unsigned, so this is technical checkpoint evidence, not a
release, distribution approval, or pilot approval. The earlier dedicated-proxy exit-IP match remains
separate real-proxy evidence.

> **Language rule — 10 August 2026:** all new or materially revised project artifacts and product
> copy must be in English. Direct conversation with the project owner may remain in Vietnamese.
> The active MKT Browser records are maintained in English; historical records remain intact.

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
| 6 | Team handoff | 🟡 Web/Facebook ready; Reddit desktop blocked | 11/08 | Railway, authentication, authorization, backups, and the technical Relay release path are ready, so Web-only/Facebook handoff and an owner-led disposable-profile demo may proceed. Reddit team self-installation and real-account handoff remain blocked by MKB-03, then the MKB-04 pilot/canary gates. Do not give ordinary operators the current Relay ZIP and Browser directory; data entry and training follow the relevant gate. |

## Stream C — Internal MKT Browser

Architecture, flows, license gates, acceptance, and rollback are defined in the
[MKT Browser plan](../plans/260810-0244-mkt-browser-noi-bo/plan.md). The fork belongs in a separate
repository. MKTTool retains only the consuming contract, Relay, and release page.

| # | Phase | Status | Exit gate |
|---|---|---|---|
| MKB-00 | Source, license, and engine | ✅ Verified 11 August | A Windows build opened a disposable profile through a **real working proxy**; its observed exit IP matched an independent proxy probe; engine conditionally approved for unmodified internal use on Windows x64 |
| MKB-W01 | Windows-only product isolation (authorized exception) | ✅ Verified 10 August | Independent Windows identity/data root; upstream updater/heartbeat/publishing absent; current MCP adapter remains green |
| MKB-W02 | Windows internal clean break | ✅ Verified 10 August | Dedicated port `47822`, MKT Browser-only internal contract, no legacy fallback, packaged lifecycle through updated MKTTool consumer |
| MKB-01 | Windows compatibility and product identity | ✅ Verified 11 August | Copy-only first-launch importer preserves the MultiZen source; five primary-screen baselines captured; Windows CI runs W01/W02 guards, typecheck, package build, and packaged runtime-contract verification on every push/PR |
| MKB-01E | Electron upgrade and renderer hardening | ✅ Verified 11 August | Electron 42.8.1 / ABI 146 package; native module rebuild; sandbox/CSP/default-deny IPC and MCP inventories; fixed-seed fingerprint unchanged and five visual baselines accepted |
| MKB-02 | Managed mode | ✅ Verified 12 August | Contract v3 diagnostics, profile-token capability separation, managed proxy/fingerprint/delete/direct-launch locks, current-device Browser health, Relay v7 correlation, and cross-repository packaged verification are green |
| MKB-03 | Windows onboarding, installer, and controlled updates | 🟡 Phases 01-04 implemented; lifecycle subset pushed; setup-conflict integration verified locally; Phase 05 and human gates open — [execution plan](../plans/260812-1301-mkb-03-windows-onboarding-and-installer/plan.md) | Local findings have code fixes for WebRTC containment, engine fallback, live Relay identity reconciliation, progress, guidance, pre-mutation conflict detection, ownership-aware uninstall cleanup, signed ADMIN Relay retirement, separate Browser-only profile deletion, and a setup-time verdict from the shared installer detector. MKT Browser contract v4 removes deletion from MCP and conditionally reports `local-install-ready-v1`; `/setup` fails closed to installer repair when it is absent. Relay v12 accepts contract v4, preserves the v11 retirement floor, and forwards the additive capability without a Relay rebuild. Phase 05 is blocked on the owner offline root/delegation ceremony. Relay v12 publication, clean-account/UAC, SmartScreen/LNA, network matrices, offline-admin, migration, update/rollback, and unfamiliar-operator rehearsal remain open. |
| MKB-04 | Technical pilot and one canary account | ⬜ Not started | An unfamiliar operator completes setup with zero developer intervention; two Windows devices remain green for seven days; one account completes a 14-day cold start |
| MKB-05 | Team rollout | ⬜ Not started | Canary completes cold start; MKT Browser becomes default; rollback uses only the frozen W01 checkpoint and never restores a MultiZen adapter fallback |
| MKB-06 | Custom UX/UI | ⏸ Deferred beyond v1 | Begin only from observed usage feedback; does not block MKB-00 through MKB-05 |
| MKB-07 | macOS Apple Silicon | ⏸ Deferred beyond v1 | Native arm64 build, engine approved for macOS, signed/notarized DMG, LaunchAgent + Keychain, macOS added to the CI matrix |

**MKB-00 evidence, completed 11 August 2026:** Official MultiZen `v0.3.1` is pinned at
`83c6898b2de3de1122b5fea88008fbbaa4677bff` in the separate `E:\MKTWorkspace\MKTBrowser` checkout. The
unmodified Windows x64 build, the 22-tool MCP contract, and MKTTool's current adapter passed with
disposable profiles; focused fail-closed tests passed 27/27. The CloakBrowser binary is approved
only conditionally for unmodified internal use through official downloads and must not be bundled or
redistributed. On 11 August, the current packaged build consumed a dedicated proxy from a fixed local
handoff file, deleted that file before network activity, obtained a non-direct exit IP through an
independent probe, and opened a disposable profile whose in-browser exit IP matched that expected
value. The profile then closed and deleted; the final profile, MKT Browser process, handoff-file, and
disposable-root counts were all zero. No account, cookie, TOTP value, proxy endpoint, credential, or
observed IP was printed or retained. Apple Silicon belongs to MKB-07 and is not an MKB-00 gate.

**MKB-W01 evidence, 10 August 2026:** The project owner authorized a bounded Windows-first
exception while MKB-00 was still open. The fork now builds as `MKTBrowser.exe` with application ID
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

**MKB-01 evidence, completed 11 August 2026:** A fresh normal Windows launch now detects a legacy
MultiZen profile database only when the MKT Browser profile database does not exist, then offers a
copy or a fresh start. The copy uses a read-only SQLite backup, copies profile and shared-extension
directories, rewrites only the copied profile paths, excludes the legacy MCP token/settings, and
never writes or deletes the source. Disposable `--user-data-dir` launches skip discovery. Importer
and runtime tests passed 9/9; W01/W02 guards passed 8/8; typecheck passed. Corrupt legacy databases
now produce an unreadable discovery state so the operator may choose `Start fresh` or quit; a database
row whose profile directory is missing aborts the staged import before the MKT Browser store is
published. Five primary-screen PNG baselines were captured from the packaged app. The Windows
workflow now runs on every push and pull
request with an OS-parameterised matrix, builds the directory package, and calls `get_runtime_info`
through the packaged executable. That package check exposed two release-only defects and closed
both: an empty PE copyright argument that broke `rcedit`, and a native ABI rebuild that previously
left source tests using the Electron binary. Packaging now restores every development copy in a
`finally` block, while the packaged copy retains the Electron ABI. MKB-01 is complete and supplied
the compatibility baseline used by MKB-01E.

**MKB-01E evidence, completed 11 August 2026:** The Windows package moved from end-of-life Electron
33 to pinned Electron `42.8.1` with modules ABI `146`, `better-sqlite3` `12.11.1`, electron-vite 5,
and electron-builder 26. The renderer now runs with sandboxing, context isolation, Node integration
disabled, web security enabled, a restrictive CSP, denied popup creation, and denied top-level
renderer navigation. Every preload/main IPC invoke and pushed event belongs to a classified
inventory and rejects non-primary-renderer senders; every exposed MCP tool has an explicit class,
and unknown or unclassified tools fail closed. The packaging path bundles first-party workspaces,
uses a sandbox-compatible CommonJS preload, restores source Node-ABI binaries in `finally`, and
reports the live packaged engine as `cloakbrowser / 146.0.7680.177.5 / ready`.

Verification passed: Node guards 2/2, MKB-01E 6/6, MKB-01 9/9, W02 8/8, typecheck, lint, Windows
directory build, packaged runtime/lifecycle verification, and script syntax checks. Fingerprint
cleanup failures now fail the measurement instead of being swallowed. The packaged lifecycle uses a
scoped system Chrome fixture to prove update persistence, invalid proxy input rejection, real launch,
close, delete, application exit, and clean process/temp-root removal without weakening normal launch
flags. The fixed-seed configured and observed fingerprints remained byte-for-byte equivalent across
the Electron upgrade, and the five Electron 42 primary-screen baselines retained layout, text,
resources, and preload behavior. The current executable SHA-256 is
`4253401aa1a59995f30d2d49a5875a5b705453c751c008b1e5437ce19d99e37b` and it remains unsigned.

**MKB-02 evidence, completed 12 August 2026:** Contract version `3` advertises
`idempotent-create-v1`, `atomic-launch-v1`, `managed-profile-v1`, and
`operation-diagnostics-v1`. Ticket `jti` remains the `operationId` through Relay and MKT Browser;
create retains its stable `requestId`; mismatched diagnostics fail closed; returned support detail is
limited to operation/request IDs, stage, code, duration, and app/contract/schema/engine versions.
Proxy endpoints, credentials, tickets, cookies, page content, fingerprint seeds, and external
references are absent from diagnostics, activity summaries, and MCP proxy summaries.

The token discovered by Relay is profile-management only. Page-read, page-control, cookie, and raw-CDP
tools are hidden from `tools/list` and rejected from `tools/call`; no page-control token is issued by
this build. Managed profiles carry a visible managed state and cannot have proxy/fingerprint changed,
be deleted, be exported, or be launched directly through ordinary MCP, IPC, UI, or command-palette
paths. Atomic managed launch remains the only proxy mutation path and continues to verify persisted
state before Chromium starts.

Relay v7 is now required for both managed create and managed launch so old Relay builds cannot accept
an operation without preserving correlation. `/health` reports the live Browser/app/engine/contract
state on this PC, and listing/create/launch remain blocked until the current device has a compatible
contract, ready engine, and all four managed capabilities. Historical enrollment alone no longer
renders `Ready`; the Web setup surface instead shows an actionable repair state with expandable
support detail.

Verification passed across both repositories: MKT Browser MKB-02 18/18, desktop source tests 25/25,
typecheck, Windows build, and the packaged contract/lifecycle; MKTTool focused managed-flow tests
8 files/80 tests, full suite, typecheck, ESLint, and production build. The generic archive importer
remains for unmanaged/legacy data, while managed export is blocked; MKB-05 still owns the signed
transfer lock that prevents two active copies during a real device move.

The current technical estimate is **four to seven weeks**, still below the former five-to-eight-week
dual-platform range because macOS remains out of v1. The 11 August onboarding review made previously
implicit Windows work explicit: current-device readiness, ADMIN-only bootstrap, expiring one-use
recipient grants, legacy secret migration, and transactional Relay/Browser/engine updates. Retaining
the MultiZen UX/UI still keeps a separate design project off this critical path.

The Electron/native-module uncertainty is now retired by MKB-01E. The guided Windows
installer with secure enrollment and coordinated updates/rollback (MKB-03) carries most of the
remaining delivery uncertainty and now consumes the managed, idempotent local contract verified by
MKB-02.

**There is no database migration in the compatibility phase.** `antidetectProfileId`, `deviceId`,
and `proxyId` are sufficient to replace the provider. Add provider or version data to Postgres only
if the pilot demonstrates that ADMIN users genuinely need to track devices while they are offline.
MKB-03 may add only the minimal `RelayDevice` grant-generation/expiry/completion fields needed for
one-use secure enrollment; that is not a runtime-inventory table and stores no plaintext key.

**9Router pattern audit, 11 August 2026:** the useful overlap does not justify a second Relay
architecture or a new phase. Capability discovery, four-layer health, signed updates, and rollback
were already in MKB-01/MKB-03. MKB-01E inventories the desktop MCP/IPC surface, and MKB-02 now also
classifies every Relay JSON endpoint by method and capability, enforces token-level capability
separation across the local contract, and adds metadata-only `operationId`/stage/error correlation
across the local chain. Edge forwarding, public tunnels,
dynamic proxy pools, and identity fallback are rejected
because Relay remains loopback-only and every Reddit identity stays bound to one static proxy,
profile, device, and owner. Persistent server-side outcome receipts, offline device inventory, and a
circuit-breaker dashboard remain pilot-gated; none added a v1 database migration or changed the
estimate during that audit. The later Windows onboarding review is the reason for the current
four-to-seven-week range.

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

> **Emergency revoke is not remote wipe.** It blocks new tickets and clears server-side account
> assignments, but it cannot erase data already present on a lost PC. Rotate `VAULT_KEY_OPERATOR`
> when exposure is plausible. Planned retirement is a different ADMIN path: the exact reachable PC
> removes Relay identity data only after a signed, device-bound authorization and returns recipient
> proof. Browser profiles remain untouched in both paths.

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

## Critical path: current blockers

| Blocker | Nature | Owner |
|---|---|---|
| **MKB-03 zero-confusion Windows onboarding** | Phases 01-04 are implemented in code; controlled updates/rollback, conflict repair, and real Windows/database rehearsal evidence remain | Engineering + responsible operator |
| **MKB-04 pilot and canary** | An unfamiliar-operator setup test, two-device seven-day pilot, then one 14-day canary cold start are elapsed evidence gates | Engineering + responsible operator + time |
| ~~**Windows code-signing certificate**~~ | Resolved 12 August 2026: v1 ships unsigned for the internal fleet. The accepted cost is one announced SmartScreen click-through and an installer binary backed only by a checksum from the same host; the offline manifest root still carries anti-downgrade authority | Closed — owner decision |
| **Static proxies + accounts** | Procurement (VND 3–8 million once) | Budget owner |
| **14-day cold start** | Real elapsed time cannot be compressed | Nobody — wait |

Account/proxy procurement, subreddit selection, and content preparation may run in parallel with the
fork. After MKB-04 starts, sign in only one canary account; the fleet waits for its cold start so a
desktop fault is not multiplied across identities. Phase 05 still does not begin before M3.

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
| **M0B — Fork tương thích** | Windows build từ nguồn ghim mở được profile qua **proxy thật**, IP ra khớp |
| **M0C — Desktop pilot** | Bộ cài Windows đã ký + managed mode + rollback xanh trên hai máy Windows trong 7 ngày |
| **M0D — Nick thăm dò** | Một nick ít quan trọng đi hết 14 ngày cold-start, không sai IP/profile |
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
| **Hoãn macOS làm Windows ăn sâu vào lõi** | Viết thẳng hành vi Windows vào lõi thì MKB-07 phải mổ lại chứ không phải cắm thêm | Lõi chung + adapter OS mỏng cho path/autostart/kho khóa; test contract và mật mã đánh vào lõi |
| **Đến MKB-07 mới biết Mac vướng** | Rosetta, Gatekeeper, helper, Keychain hoặc WebRTC có thể lệch hành vi thật, và lúc đó team đã quen bản Windows | arm64 native là cổng cứng, notarization, hai máy Mac pilot; không cho nhân viên chạy `xattr` |
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
| MKT Browser + engine ngoài | Chứng thư ký Windows: **0đ — chốt 12/08 không mua, v1 dùng nội bộ nên chấp nhận SmartScreen**. Apple Developer vẫn **chưa chốt**, thuộc MKB-07 | **Chưa chốt** — engine mới nhất có thể cần subscription |
| Máy chạy | dùng máy sẵn có | 0đ |
| Thay nick hao hụt | – | ~500k-1tr |
| **Tổng** | **3-8 triệu + chi phí fork/ký chưa chốt** | **~1,2-1,7 triệu + engine nếu có** |
