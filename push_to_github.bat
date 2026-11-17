@echo off
chcp 65001 > nul
title GeoLive GitHub Push Utility

cd /d "%~dp0"

echo =====================================================================
echo    GeoLive 실시간 GPS 관제 완성본 GitHub 업로드
echo    Repository: https://github.com/hsh7196-lab/koh.git
echo =====================================================================
echo.

where git >nul 2>nul
if %errorlevel% neq 0 (
    echo [안내] Git이 시스템에 설치되어 있지 않습니다.
    echo.
    echo Git이 설치되어 있지 않다면 아래 2가지 방법 중 하나를 선택해 주세요:
    echo.
    echo [방법 1] 브라우저 웹 업로드 (가장 간편, 설치 불필요!)
    echo   1. https://github.com/hsh7196-lab/koh 접속
    echo   2. 상단 우측 [Add file] - [Upload files] 클릭
    echo   3. 현재 폴더의 파일들을 드래그 앤 드롭한 뒤 [Commit changes] 클릭
    echo.
    echo [방법 2] Git 설치 프로그램 다운로드
    echo   https://git-scm.com/download/win 에서 Git을 다운로드 후 기본값으로 설치하시면
    echo   이 배치 파일(push_to_github.bat)을 다시 더블 클릭하여 1초 만에 올릴 수 있습니다.
    echo.
    pause
    exit /b 1
)

echo [1/4] Git 저장소 초기화 중...
if not exist ".git" (
    git init
    git branch -M main
)

echo [2/4] 원격 저장소(Remote Origin) 연결 중...
git remote remove origin >nul 2>nul
git remote add origin https://github.com/hsh7196-lab/koh.git

echo [3/4] 완성본 파일 스테이징 및 커밋 생성 중...
git add .
git commit -m "feat: GeoLive 실시간 GPS 관제 플랫폼 완성본 업로드 (실시간 추적, 모바일 QR 연동, 동선 히스토리)"

echo [4/4] GitHub로 푸시(Push) 중...
echo (GitHub 로그인 창이 뜨면 브라우저 로그인 또는 토큰을 승인해 주세요)
echo.
git push -u origin main --force

if %errorlevel% equ 0 (
    echo.
    echo =====================================================================
    echo    GitHub 업로드가 성공적으로 완료되었습니다!
    echo    확인: https://github.com/hsh7196-lab/koh
    echo =====================================================================
) else (
    echo.
    echo [오류] GitHub 푸시 실패. 권한(로그인)을 확인해주세요.
)

pause