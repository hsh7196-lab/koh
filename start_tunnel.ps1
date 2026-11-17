# ====================================================================
# GeoLive 외부망 HTTPS 터널 PowerShell 실행기 (Cloudflare Tunnel)
# ====================================================================

[Console]::OutputEncoding = [System.Text.Encoding]::UTF8
$OutputEncoding = [System.Text.Encoding]::UTF8

Write-Host "=================================================================" -ForegroundColor Cyan
Write-Host "   🌐 GeoLive 외부망(LTE/5G) 접속용 Cloudflare HTTPS 터널 시작" -ForegroundColor Cyan
Write-Host "=================================================================" -ForegroundColor Cyan
Write-Host ""

Set-Location -Path $PSScriptRoot

$cfCmd = Get-Command cloudflared -ErrorAction SilentlyContinue
$cfExe = Join-Path $PSScriptRoot "cloudflared.exe"

if (-not $cfCmd -and -not (Test-Path $cfExe)) {
    Write-Host "[1/2] cloudflared.exe를 다운로드하는 중입니다 (약 10~20초 소요)..." -ForegroundColor Yellow
    try {
        [Net.ServicePointManager]::SecurityProtocol = [Net.SecurityProtocolType]::Tls12
        Invoke-WebRequest -Uri "https://github.com/cloudflare/cloudflared/releases/latest/download/cloudflared-windows-amd64.exe" -OutFile $cfExe -UseBasicParsing
        Write-Host "다운로드 완료!" -ForegroundColor Green
    } catch {
        Write-Host "[오류] 다운로드 실패. 브라우저에서 아래 링크로 직접 다운로드하여 이 폴더에 넣어주세요:" -ForegroundColor Red
        Write-Host "https://github.com/cloudflare/cloudflared/releases/latest/download/cloudflared-windows-amd64.exe"
        pause
        exit 1
    }
}

Write-Host "[2/2] HTTPS 공개 터널 연결 시작..." -ForegroundColor Green
Write-Host "콘솔에 나타나는 'https://xxxx.trycloudflare.com' 링크를 스마트폰으로 열어주세요." -ForegroundColor White
Write-Host "스마트폰 브라우저에서 정식 HTTPS로 인식되어 실제 GPS 권한이 허용됩니다!" -ForegroundColor Green
Write-Host "=================================================================" -ForegroundColor Cyan
Write-Host ""

if (Test-Path $cfExe) {
    & $cfExe tunnel --url http://localhost:8080
} else {
    cloudflared tunnel --url http://localhost:8080
}
