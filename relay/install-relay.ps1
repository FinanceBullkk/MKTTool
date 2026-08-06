<#
Cài cầu nối MKTTool lên một máy operator.

Chép `.exe` vào thư mục người dùng, dựng sẵn file cấu hình rỗng, tạo shortcut Startup + desktop,
rồi bật cầu nối và mở trang trạng thái. Chạy được nhiều lần — đây cũng là đường **nâng cấp** khi
có bản `.exe` mới.

## Vì sao không vào Program Files

Cầu nối để khóa riêng và file cấu hình ngay cạnh `.exe` (xem `relay-home.ts`), mà Program Files
thì không ghi được. Triệu chứng sẽ là một dòng lỗi lúc khởi động, giữa lúc không ai đang nhìn.

## Vì sao file này phải có BOM

Windows PowerShell 5.1 đọc `.ps1` **không có BOM** theo bảng mã ANSI của máy, và mọi chữ tiếng
Việt ở đây thành ký tự lạ. Script build có phép kiểm bắt buộc BOM — xem `build-relay-executable.ts`.

Ba biến môi trường dưới đây cho phép trỏ đi chỗ khác. Chúng tồn tại để nghiệm thu chạy được mà
không đụng vào Startup của máy thật, không phải để dùng lúc cài.
#>
$ErrorActionPreference = "Stop"

$exeName = "MKTTool-Relay.exe"
$statusUrl = "http://127.0.0.1:47821"

$sourceExe = Join-Path $PSScriptRoot $exeName
$relayDir = if ($env:RELAY_DIR) { $env:RELAY_DIR } else { Join-Path $env:LOCALAPPDATA "MKTTool-Relay" }
$startupDir = if ($env:RELAY_STARTUP_DIR) { $env:RELAY_STARTUP_DIR } else { Join-Path $env:APPDATA "Microsoft\Windows\Start Menu\Programs\Startup" }
$desktopDir = if ($env:RELAY_DESKTOP_DIR) { $env:RELAY_DESKTOP_DIR } else { Join-Path $env:USERPROFILE "Desktop" }

$targetExe = Join-Path $relayDir $exeName
$configFile = Join-Path $relayDir "relay-config.json"

function Write-Step($index, $text) {
    Write-Host "  [$index/5] $text"
}

function Fail($text) {
    Write-Host ""
    Write-Host "  $text" -ForegroundColor Red
    Write-Host ""
    exit 1
}

<#
Tạo một shortcut trỏ tới cầu nối.

`WindowStyle = 7` là thu nhỏ. Cố ý **không ẩn hẳn**: cầu nối là tiến trình giữ khóa vùng operator
và mở một cổng trên máy này — người ngồi đó phải nhìn thấy được là nó đang chạy, và tắt được mà
không cần mở Task Manager.

## Vì sao tạo tên ASCII rồi mới đổi tên

`WScript.Shell` là COM đời cũ: mọi chuỗi đi qua nó bị ép về bảng mã ANSI của máy. Trên một máy
Windows đặt tiếng Anh thì "Cầu nối" thành "C?u n?i" — mà `?` không hợp lệ trong tên file, nên
`Save()` ném `FileNotFoundException` với câu chẳng liên quan gì tới nguyên nhân. Đổi tên sau đó
bằng `Move-Item` thì không qua COM, và Unicode đi qua nguyên vẹn.

Cùng lý do, **không đặt `Description`**: nó cũng bị ép ANSI, và một tooltip đọc ra "C?u n?i" trông
như phần mềm hỏng. Tên shortcut và biểu tượng đã nói đủ.
#>
function New-RelayShortcut($linkPath) {
    $stagingPath = Join-Path (Split-Path $linkPath -Parent) "MKTTool-Relay-staging.lnk"

    $shell = New-Object -ComObject WScript.Shell
    $shortcut = $shell.CreateShortcut($stagingPath)
    $shortcut.TargetPath = $targetExe
    $shortcut.WorkingDirectory = $relayDir
    $shortcut.WindowStyle = 7
    $shortcut.Save()

    Move-Item -Path $stagingPath -Destination $linkPath -Force
}

Write-Host ""
Write-Host "  Cài cầu nối MKTTool"
Write-Host "  ───────────────────────────────────────────────────────────────"
Write-Host ""

if (-not (Test-Path $sourceExe)) {
    Fail "Không thấy $exeName cạnh file này. Hai file phải nằm cùng một thư mục — giải nén lại gói tải về rồi chạy lại."
}

# Bản cũ đang chạy sẽ giữ file .exe và làm lệnh chép thất bại. Đây là đường nâng cấp nên phải tắt
# trước; cầu nối không có đường thoát êm nào khác.
$running = Get-Process -Name ([System.IO.Path]::GetFileNameWithoutExtension($exeName)) -ErrorAction SilentlyContinue
if ($running) {
    Write-Step 1 "Tắt cầu nối đang chạy…"
    $running | Stop-Process -Force
    # Windows cần một nhịp mới nhả khóa file.
    Start-Sleep -Seconds 2
} else {
    Write-Step 1 "Chưa có cầu nối nào đang chạy."
}

Write-Step 2 "Chép vào $relayDir"
if (-not (Test-Path $relayDir)) { New-Item -ItemType Directory -Path $relayDir -Force | Out-Null }
try {
    Copy-Item -Path $sourceExe -Destination $targetExe -Force
} catch {
    Fail "Không chép được: $($_.Exception.Message)`n  Nhiều khả năng cầu nối vẫn đang chạy — kết thúc $exeName trong Task Manager rồi chạy lại."
}

<#
Gỡ dấu "tải từ Internet" (Mark-of-the-Web) khỏi bản VỪA CHÉP.

Không gỡ thì Windows hỏi lại ở **mỗi lần chạy**, kể cả lượt tự bật cùng máy — mà lượt đó chạy
ngầm, nên người dùng chỉ thấy "không có cầu nối" mà không thấy hộp nào để bấm.

Chỉ gỡ trên file đã nằm trong thư mục cài, không đụng file trong Downloads: cái quyết định đây là
bản của team hay không là mã băm SHA-256 trên trang tải, không phải cái cờ này.
#>
Unblock-File -Path $targetExe -ErrorAction SilentlyContinue

<#
File cấu hình dựng sẵn để người cài chỉ phải **điền**, không phải tự gõ đúng tên từng ô.

**Không ghi đè bản có sẵn.** Ở đường nâng cấp, ghi đè là xóa mất khóa vùng operator của máy này —
thứ không có ở đâu khác để lấy lại, và mất nó thì mọi mật khẩu nick trong kho thành chuỗi vô nghĩa.
#>
if (Test-Path $configFile) {
    Write-Step 3 "Giữ nguyên relay-config.json đã có."
} else {
    Write-Step 3 "Dựng relay-config.json rỗng để điền."
    $template = [ordered]@{
        deviceId = ""
        serverPublicKey = ""
        vaultKeyOperator = ""
        webOrigin = ""
        multizenToken = ""
    }
    # KHÔNG dùng `Set-Content -Encoding utf8`: trên Windows PowerShell 5.1 nó ghi kèm BOM, và
    # `JSON.parse` phía cầu nối nghẹn ngay ký tự đầu tiên. Triệu chứng là câu "không phải JSON hợp
    # lệ" cho một file nhìn bằng mắt thì hoàn toàn đúng cú pháp — đã vấp thật 06/08/2026, ở đúng
    # lượt cài đầu tiên của bản 2.
    #
    # Cầu nối nay cũng tự bỏ BOM khi đọc, nên đây là lớp thứ hai chứ không phải lớp duy nhất:
    # người dùng mở file bằng Notepad rồi lưu lại là BOM quay về.
    [IO.File]::WriteAllText($configFile, ($template | ConvertTo-Json), (New-Object Text.UTF8Encoding $false))
}

Write-Step 4 "Tạo shortcut Startup + desktop"
foreach ($dir in @($startupDir, $desktopDir)) {
    if (-not (Test-Path $dir)) { New-Item -ItemType Directory -Path $dir -Force | Out-Null }
}
New-RelayShortcut (Join-Path $startupDir "Cầu nối MKTTool.lnk")
New-RelayShortcut (Join-Path $desktopDir "Cầu nối MKTTool.lnk")

<#
Bật thử. **Bước này hỏng KHÔNG phải là cài hỏng.**

Windows chặn chạy file lạ tải từ mạng, và người dùng bấm "Không chạy" là `Start-Process` ném lỗi
`The operation was canceled by the user`. Bản đầu để lỗi đó rơi ra ngoài, nên `setup.bat` kết
luận "Cài đặt thất bại" — trong khi ba bước thật (chép file, dựng cấu hình, tạo shortcut) đều đã
xong từ trước. Câu đó cử người đi cài lại một thứ đã cài đúng. Đã vấp thật 06/08/2026.

Nên bắt lỗi tại chỗ và nói đúng hiện trạng: máy đã cài xong, chỉ là chưa bật được.
#>
Write-Step 5 "Bật cầu nối"
$launched = $true
try {
    Start-Process -FilePath $targetExe -WorkingDirectory $relayDir -WindowStyle Minimized -ErrorAction Stop
} catch {
    $launched = $false
    Write-Host ""
    Write-Host "  Đã cài xong, nhưng chưa bật được cầu nối:" -ForegroundColor Yellow
    Write-Host "    $($_.Exception.Message)"
    Write-Host "  Thường là Windows hỏi lại vì file tải từ mạng và câu trả lời là Không."
    Write-Host "  Bấm đúp shortcut ""Cầu nối MKTTool"" ngoài desktop, chọn More info -> Run anyway."
    Write-Host ""
}

if ($launched) {
    # Cho nó kịp mở cổng trước khi trình duyệt gọi tới, kẻo trang đầu tiên người cài nhìn thấy lại
    # là trang báo không kết nối được.
    Start-Sleep -Seconds 3
    if (-not $env:RELAY_SKIP_BROWSER) { Start-Process $statusUrl }
}

Write-Host ""
Write-Host "  ───────────────────────────────────────────────────────────────"
Write-Host "  Xong phần máy. Còn ba việc làm trên trang vừa mở:" -ForegroundColor Green
Write-Host ""
Write-Host "  1. Chép KHÓA CÔNG KHAI trên trang đó, gửi quản trị viên ghi vào sổ"
Write-Host "     tại /relay-devices trên web app."
Write-Host "  2. Quản trị viên gửi lại MÃ MÁY. Mở file cấu hình rồi điền vào:"
Write-Host "     $configFile"
Write-Host "     Điền nốt serverPublicKey, vaultKeyOperator, webOrigin."
Write-Host "  3. Tắt bật lại cầu nối bằng shortcut ngoài desktop — cấu hình chỉ"
Write-Host "     được đọc lúc khởi động."
Write-Host ""
exit 0
