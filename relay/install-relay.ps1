<#
Cài cầu nối MKTTool lên một máy operator.

Chép `.exe` vào thư mục người dùng, dựng sẵn file cấu hình rỗng, tạo shortcut Startup + desktop,
rồi bật cầu nối và mở trang trạng thái. Chạy được nhiều lần — đây cũng là đường **nâng cấp** khi
có bản `.exe` mới.

## Vì sao không vào Program Files

Cầu nối để dữ liệu bảo vệ theo người dùng và file cấu hình ngay cạnh `.exe` (xem `relay-home.ts`),
mà Program Files thì không ghi được. Triệu chứng sẽ là một dòng lỗi lúc khởi động, giữa lúc không ai đang nhìn.

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
$shortcutSaveMaxAttempts = 5

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
The shortcut name stays ASCII because WScript.Shell can pass its path through the machine ANSI
code page. Saving directly also removes the shared staging-file rename that failed when Explorer
or antivirus briefly held the old destination open.

Only Windows sharing and lock violations are retryable. Access denied, invalid paths, and every
other error fail immediately. The bounded retry keeps installation deterministic when a lock is
not transient.
#>
function Test-RetryableShortcutError($errorRecord) {
    $exception = $errorRecord.Exception
    while ($exception) {
        $windowsErrorCode = $exception.HResult -band 0xffff
        if ($windowsErrorCode -in @(32, 33)) { return $true }
        $exception = $exception.InnerException
    }
    return $false
}

function Test-RelayShortcut($linkPath) {
    if (-not (Test-Path -LiteralPath $linkPath)) { return $false }

    $shell = $null
    $shortcut = $null
    try {
        $shell = New-Object -ComObject WScript.Shell
        $shortcut = $shell.CreateShortcut($linkPath)
        return [string]::Equals(
            $shortcut.TargetPath,
            $targetExe,
            [StringComparison]::OrdinalIgnoreCase
        )
    } catch {
        return $false
    } finally {
        if ($shortcut -and [Runtime.InteropServices.Marshal]::IsComObject($shortcut)) {
            [void][Runtime.InteropServices.Marshal]::FinalReleaseComObject($shortcut)
        }
        if ($shell -and [Runtime.InteropServices.Marshal]::IsComObject($shell)) {
            [void][Runtime.InteropServices.Marshal]::FinalReleaseComObject($shell)
        }
    }
}

function New-RelayShortcut($linkPath) {
    if (Test-RelayShortcut $linkPath) { return }

    for ($attempt = 1; $attempt -le $shortcutSaveMaxAttempts; $attempt++) {
        $shell = $null
        $shortcut = $null
        $retry = $false
        try {
            $shell = New-Object -ComObject WScript.Shell
            $shortcut = $shell.CreateShortcut($linkPath)
            $shortcut.TargetPath = $targetExe
            $shortcut.WorkingDirectory = $relayDir
            $shortcut.WindowStyle = 7
            $shortcut.Save()
            return
        } catch {
            if (-not (Test-RetryableShortcutError $_) -or $attempt -eq $shortcutSaveMaxAttempts) {
                throw
            }
            $retry = $true
        } finally {
            if ($shortcut -and [Runtime.InteropServices.Marshal]::IsComObject($shortcut)) {
                [void][Runtime.InteropServices.Marshal]::FinalReleaseComObject($shortcut)
            }
            if ($shell -and [Runtime.InteropServices.Marshal]::IsComObject($shell)) {
                [void][Runtime.InteropServices.Marshal]::FinalReleaseComObject($shell)
            }
        }
        if ($retry) { Start-Sleep -Milliseconds (250 * $attempt) }
    }
}

function Remove-OwnedLegacyShortcut($linkPath) {
    if (-not (Test-Path -LiteralPath $linkPath)) { return }

    $shell = $null
    $shortcut = $null
    try {
        $shell = New-Object -ComObject WScript.Shell
        $shortcut = $shell.CreateShortcut($linkPath)
        $legacyTarget = $shortcut.TargetPath
    } catch {
        Write-Warning "Could not inspect the legacy shortcut. It was preserved."
        return
    } finally {
        if ($shortcut -and [Runtime.InteropServices.Marshal]::IsComObject($shortcut)) {
            [void][Runtime.InteropServices.Marshal]::FinalReleaseComObject($shortcut)
        }
        if ($shell -and [Runtime.InteropServices.Marshal]::IsComObject($shell)) {
            [void][Runtime.InteropServices.Marshal]::FinalReleaseComObject($shell)
        }
    }

    if (-not [string]::Equals($legacyTarget, $targetExe, [StringComparison]::OrdinalIgnoreCase)) {
        Write-Warning "The legacy shortcut does not belong to this Relay installation. It was preserved."
        return
    }

    try {
        Remove-Item -LiteralPath $linkPath -Force -ErrorAction Stop
    } catch {
        Write-Warning "Could not remove the legacy shortcut because another process is using it. Installation can continue."
    }
}

Write-Host ""
Write-Host "  Install MKTTool Relay"
Write-Host "  ---------------------------------------------------------------"
Write-Host ""

if (-not (Test-Path $sourceExe)) {
    Fail "$exeName was not found beside this script. Extract the package again, then retry."
}

# Bản cũ đang chạy sẽ giữ file .exe và làm lệnh chép thất bại. Đây là đường nâng cấp nên phải tắt
# trước; cầu nối không có đường thoát êm nào khác.
$running = Get-Process -Name ([System.IO.Path]::GetFileNameWithoutExtension($exeName)) -ErrorAction SilentlyContinue
if ($running) {
    Write-Step 1 "Stopping the running Relay..."
    $running | Stop-Process -Force
    # Windows cần một nhịp mới nhả khóa file.
    Start-Sleep -Seconds 2
} else {
    Write-Step 1 "No running Relay was found."
}

Write-Step 2 "Copying files to $relayDir"
if (-not (Test-Path $relayDir)) { New-Item -ItemType Directory -Path $relayDir -Force | Out-Null }
try {
    Copy-Item -Path $sourceExe -Destination $targetExe -Force
} catch {
    Fail "Could not copy the Relay: $($_.Exception.Message)`n  The previous Relay may still be running. Close $exeName in Task Manager, then retry."
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

**Không ghi đè bản có sẵn.** Ở đường nâng cấp, ghi đè sẽ xóa metadata không nhạy cảm mà máy này
đã nhận từ web. Operator key và device private key nằm trong DPAPI CurrentUser, không nằm trong JSON.
#>
if (Test-Path $configFile) {
    Write-Step 3 "Preserving the existing relay-config.json."
} else {
    Write-Step 3 "Creating an empty relay-config.json."
    $template = [ordered]@{
        deviceId = ""
        serverPublicKey = ""
        webOrigin = ""
        mktBrowserToken = ""
        mktBrowserUrl = ""
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

Write-Step 4 "Creating Startup and desktop shortcuts"
foreach ($dir in @($startupDir, $desktopDir)) {
    if (-not (Test-Path $dir)) { New-Item -ItemType Directory -Path $dir -Force | Out-Null }
}
New-RelayShortcut (Join-Path $startupDir "MKTTool Relay.lnk")
New-RelayShortcut (Join-Path $desktopDir "MKTTool Relay.lnk")
Remove-OwnedLegacyShortcut (Join-Path $startupDir "Cầu nối MKTTool.lnk")
Remove-OwnedLegacyShortcut (Join-Path $desktopDir "Cầu nối MKTTool.lnk")

<#
Bật thử. **Bước này hỏng KHÔNG phải là cài hỏng.**

Windows chặn chạy file lạ tải từ mạng, và người dùng bấm "Không chạy" là `Start-Process` ném lỗi
`The operation was canceled by the user`. Bản đầu để lỗi đó rơi ra ngoài, nên `setup.bat` kết
luận "Cài đặt thất bại" — trong khi ba bước thật (chép file, dựng cấu hình, tạo shortcut) đều đã
xong từ trước. Câu đó cử người đi cài lại một thứ đã cài đúng. Đã vấp thật 06/08/2026.

Nên bắt lỗi tại chỗ và nói đúng hiện trạng: máy đã cài xong, chỉ là chưa bật được.
#>
Write-Step 5 "Starting the Relay"
$launched = $true
try {
    Start-Process -FilePath $targetExe -WorkingDirectory $relayDir -WindowStyle Minimized -ErrorAction Stop
} catch {
    $launched = $false
    Write-Host ""
    Write-Host "  Installation finished, but the Relay could not start:" -ForegroundColor Yellow
    Write-Host "    $($_.Exception.Message)"
    Write-Host "  Windows may have blocked the downloaded application."
    Write-Host "  Open the MKTTool Relay desktop shortcut, then choose More info -> Run anyway."
    Write-Host ""
}

if ($launched) {
    # Cho nó kịp mở cổng trước khi trình duyệt gọi tới, kẻo trang đầu tiên người cài nhìn thấy lại
    # là trang báo không kết nối được.
    Start-Sleep -Seconds 3
    if (-not $env:RELAY_SKIP_BROWSER) { Start-Process $statusUrl }
}

Write-Host ""
Write-Host "  ---------------------------------------------------------------"
Write-Host "  Local installation is complete." -ForegroundColor Green
Write-Host ""
Write-Host "  Continue onboarding at /setup in MKTTool."
Write-Host "  The Relay status page is available at $statusUrl."
Write-Host "  Operator secrets remain local and are never stored in relay-config.json."
Write-Host ""
exit 0
