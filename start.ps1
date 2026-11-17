# ====================================================================
# GeoLive ?ㅼ떆媛?GPS 愿???쒕쾭 PowerShell ?ㅽ뻾 ?ㅽ겕由쏀듃
# ====================================================================

[Console]::OutputEncoding = [System.Text.Encoding]::UTF8
$OutputEncoding = [System.Text.Encoding]::UTF8

Write-Host "=================================================================" -ForegroundColor Cyan
Write-Host "   ?쎇截?GeoLive ?ㅼ떆媛?GPS 愿??諛??숈꽑 遺꾩꽍 ?쒖뒪???쒖옉" -ForegroundColor Cyan
Write-Host "=================================================================" -ForegroundColor Cyan
Write-Host ""

Set-Location -Path $PSScriptRoot

# 1. Java ?ㅼ튂 ?뺤씤
$javaCmd = Get-Command java -ErrorAction SilentlyContinue
if (-not $javaCmd) {
    Write-Host "[?ㅻ쪟] Java媛 ?쒖뒪?쒖뿉 ?ㅼ튂?섏뼱 ?덉? ?딆뒿?덈떎." -ForegroundColor Red
    Write-Host "Java 17 ?댁긽(JDK/JRE)???ㅼ튂?댁＜?몄슂."
    pause
    exit 1
}

# 1.5. ?ы듃 8080 ?먯쑀 ?꾨줈?몄뒪 ?뺣━
$conn = Get-NetTCPConnection -LocalPort 8080 -State Listen -ErrorAction SilentlyContinue
if ($conn) {
    Write-Host "[?덈궡] ?ы듃 8080???ъ슜 以묒씤 ?댁쟾 ?꾨줈?몄뒪(PID: $($conn.OwningProcess))瑜??뺣━?⑸땲??.." -ForegroundColor Yellow
    Stop-Process -Id $conn.OwningProcess -Force -ErrorAction SilentlyContinue
    Start-Sleep -Milliseconds 500
}

# 2. 而댄뙆???뺤씤
Write-Host "[1/2] ?쒕쾭 ?뚯뒪肄붾뱶 鍮뚮뱶 諛??뺤씤 以?.." -ForegroundColor Yellow
javac -encoding UTF-8 GpsServer.java
if ($LASTEXITCODE -ne 0) {
    Write-Host "[寃쎄퀬] 而댄뙆??寃쎄퀬 ?먮뒗 ?ㅻ쪟 諛쒖깮. 湲곗〈 ?대옒?ㅻ줈 ?ㅽ뻾???쒕룄?⑸땲??" -ForegroundColor Yellow
}

# 3. 濡쒖뺄 IP 媛먯?
$localIp = (Get-NetIPAddress -AddressFamily IPv4 -InterfaceAlias "Wi-Fi*", "?대뜑??", "Ethernet*" -ErrorAction SilentlyContinue | Where-Object { $_.IPAddress -notlike "127.*" -and $_.IPAddress -notlike "169.254.*" } | Select-Object -First 1).IPAddress
if (-not $localIp) { $localIp = "127.0.0.1" }

# 4. .env ?ㅼ젙 ?뺤씤 (PUBLIC_URL)
$publicUrl = ""
if (Test-Path ".env") {
    Get-Content ".env" -Encoding UTF8 | ForEach-Object {
        $line = $_.Trim()
        if ($line -like "PUBLIC_URL=*") {
            $publicUrl = ($line.Substring(11)).Trim().Trim('"').Trim("'")
        }
    }
}

Write-Host "[2/2] GPS ???쒕쾭 援щ룞 ?쒖옉 (Port: 8080)" -ForegroundColor Green
Write-Host ""
Write-Host " ??PC 釉뚮씪?곗? ?묒냽 二쇱냼 : http://localhost:8080" -ForegroundColor Cyan
if ($publicUrl) {
    Write-Host " ??怨듦컻 HTTPS ?곕꼸 二쇱냼 : $publicUrl" -ForegroundColor Green
    Write-Host " ???ㅻ쭏?명룿 ?꾩슜 ?몃옒而? : $publicUrl/tracker.html" -ForegroundColor Magenta
} else {
    Write-Host " ???ㅻ쭏?명룿 Wi-Fi 二쇱냼   : http://$localIp`:8080" -ForegroundColor Yellow
    Write-Host " ???ㅻ쭏?명룿 Wi-Fi ?몃옒而?: http://$localIp`:8080/tracker.html" -ForegroundColor Yellow
}
Write-Host " ??湲곕낯 愿由ъ옄 怨꾩젙      : admin / admin1234" -ForegroundColor White
Write-Host "=================================================================" -ForegroundColor Cyan
Write-Host "?쒕쾭媛 ?ㅽ뻾 以묒엯?덈떎. 李쎌쓣 ?レ쑝硫??쒕쾭媛 醫낅즺?⑸땲??" -ForegroundColor Gray
Write-Host ""

Start-Process "http://localhost:8080"

java -Dfile.encoding=UTF-8 -Djava.net.preferIPv4Stack=true GpsServer
