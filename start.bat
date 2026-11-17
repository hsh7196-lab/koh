@echo off
chcp 65001 > nul
title GeoLive Realtime GPS Server

cd /d "%~dp0"

echo =====================================================================
echo    GeoLive 실시간 GPS 관제 시스템을 시작합니다...
echo =====================================================================
echo.

where java >nul 2>nul
if %errorlevel% neq 0 (
    echo [오류] Java가 시스템에 설치되어 있지 않거나 PATH에 등록되지 않았습니다.
    echo JDK 또는 JRE 17 이상을 설치해주세요.
    pause
    exit /b 1
)

echo [1/2] 서버 소스코드 빌드 중...
javac -encoding UTF-8 GpsServer.java
if %errorlevel% neq 0 (
    echo [경고] 컴파일 실패. 기존 클래스로 실행을 시도합니다...
)

echo [2/2] GPS 웹 서버 구동 중 (Port: 8080)...
echo.
echo 대시보드 주소: http://localhost:8080
echo.

start "" "http://localhost:8080"

java -Dfile.encoding=UTF-8 -Djava.net.preferIPv4Stack=true GpsServer
pause