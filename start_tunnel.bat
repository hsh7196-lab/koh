@echo off
chcp 65001 > nul
title GeoLive 외부망 HTTPS 터널 실행기 (Cloudflare Tunnel)

echo =====================================================================
echo   🌐 GeoLive 외부망(LTE/5G) 접속용 Cloudflare HTTPS 터널을 실행합니다
echo =====================================================================
echo.

cd /d "%~dp0"

where cloudflared >nul 2>nul
if %errorlevel% neq 0 (
    if not exist "cloudflared.exe" (
        echo [1/2] cloudflared.exe가 없습니다. GitHub 공식 릴리즈에서 다운로드 중...
        echo 잠시만 기다려주세요 (약 10~20초 소요)...
        powershell -Command "[Net.ServicePointManager]::SecurityProtocol = [Net.SecurityProtocolType]::Tls12; (New-Object Net.WebClient).DownloadFile('https://github.com/cloudflare/cloudflared/releases/latest/download/cloudflared-windows-amd64.exe', 'cloudflared.exe')"
        if not exist "cloudflared.exe" (
            echo [오류] 다운로드 실패. 브라우저에서 아래 링크로 직접 받아 현재 폴더에 넣어주세요:
            echo https://github.com/cloudflare/cloudflared/releases/latest/download/cloudflared-windows-amd64.exe
            pause
            exit /b
        )
        echo 다운로드 완료!
    )
)

echo.
echo [2/2] HTTPS 공개 터널 연결 시작...
echo 콘솔에 나타나는 'https://xxxx-xxxx.trycloudflare.com' 주소를 확인하세요!
echo 그 주소로 스마트폰(LTE/5G)에서 접속하시면 GPS 권한이 100%% 정상 허용됩니다.
echo =====================================================================
echo.

if exist "cloudflared.exe" (
    .\cloudflared.exe tunnel --url http://localhost:8080
) else (
    cloudflared tunnel --url http://localhost:8080
)

pause
