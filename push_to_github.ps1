# ====================================================================
# GeoLive GitHub Push PowerShell Script
# Repository: https://github.com/hsh7196-lab/koh.git
# ====================================================================

[Console]::OutputEncoding = [System.Text.Encoding]::UTF8
$OutputEncoding = [System.Text.Encoding]::UTF8

Set-Location -Path $PSScriptRoot

Write-Host "=================================================================" -ForegroundColor Cyan
Write-Host "   🚀 GeoLive 실시간 GPS 관제 완성본 GitHub 업로드" -ForegroundColor Cyan
Write-Host "   Repository: https://github.com/hsh7196-lab/koh.git" -ForegroundColor Gray
Write-Host "=================================================================" -ForegroundColor Cyan
Write-Host ""

$gitCmd = Get-Command git -ErrorAction SilentlyContinue
if (-not $gitCmd) {
    Write-Host "[안내] Git이 시스템에 설치되어 있지 않습니다." -ForegroundColor Yellow
    Write-Host ""
    Write-Host "[방법 1] 브라우저 웹 업로드 (가장 간편!)" -ForegroundColor Green
    Write-Host "  1. https://github.com/hsh7196-lab/koh 접속"
    Write-Host "  2. [Add file] -> [Upload files] 클릭"
    Write-Host "  3. 파일들을 드래그 앤 드롭 후 [Commit changes] 클릭"
    Write-Host ""
    Write-Host "[방법 2] Git 설치 (https://git-scm.com/download/win)" -ForegroundColor Green
    Write-Host "  Git 설치 후 이 스크립트를 다시 실행하시면 바로 푸시됩니다."
    Write-Host ""
    Read-Host "계속하려면 Enter 키를 누르세요..."
    exit 1
}

Write-Host "[1/4] Git 저장소 초기화 중..." -ForegroundColor Yellow
if (-not (Test-Path ".git")) {
    git init
    git branch -M main
}

Write-Host "[2/4] 원격 저장소 연결 중..." -ForegroundColor Yellow
git remote remove origin 2>$null
git remote add origin https://github.com/hsh7196-lab/koh.git

Write-Host "[3/4] 파일 스테이징 및 커밋 생성..." -ForegroundColor Yellow
git add .
git commit -m "feat: GeoLive 실시간 GPS 관제 플랫폼 완성본 업로드 (실시간 추적, 모바일 QR 연동, 동선 히스토리)"

Write-Host "[4/4] GitHub로 푸시(Push)..." -ForegroundColor Yellow
git push -u origin main --force

if ($LASTEXITCODE -eq 0) {
    Write-Host ""
    Write-Host "=================================================================" -ForegroundColor Green
    Write-Host "   🎉 GitHub 업로드가 성공적으로 완료되었습니다!" -ForegroundColor Green
    Write-Host "   확인: https://github.com/hsh7196-lab/koh" -ForegroundColor Cyan
    Write-Host "=================================================================" -ForegroundColor Green
} else {
    Write-Host ""
    Write-Host "[오류] GitHub 푸시 실패. 권한 또는 네트워크를 확인해주세요." -ForegroundColor Red
}

Read-Host "계속하려면 Enter 키를 누르세요..."