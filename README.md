# 🛰️ GeoLive - 실시간 GPS 관제 & 동선 분석 플랫폼

스마트폰의 실제 GPS 센서와 연동하여 **실시간 위치를 지도에 표시**하고, **시간대별 이동 동선(경로) 및 체류 지점(정차 시간), 주행 속도를 타임라인 슬라이더로 재생**할 수 있는 풀스택 관제 웹 애플리케이션입니다.

---

## 🌟 시스템 아키텍처 및 주요 특징

- **백엔드 (Backend)**: Java 17/21/25 가상 스레드(Virtual Thread) 기반 내장 고성능 서버 (0-Dependency, 외부 설치 불필요).
- **데이터베이스 (Database)**: `data/` 폴더 내 JSON 영구 데이터베이스 (`users.json`, `devices.json`, `locations.json`).
- **프론트엔드 (Frontend)**: Leaflet.js, OpenStreetMap / CartoDB Positron 고화질 타일, HTML5 Geolocation API, Screen WakeLock API, Lucide Icons, 로컬 내장 QRCode 엔진.
- **실시간 통신 (Realtime)**: Server-Sent Events (SSE) 기반 양방향 실시간 위치 푸시 스트림.
- **보안 & 환경설정 (Security & Config)**: `.env` 환경 변수 분리 지원, SHA-256 비밀번호 단방향 암호화, 기기별 고유 `Secret Key` 검증.
- **모바일 연동 (Mobile GPS & HTTPS)**:
  - 브라우저 보안 규격(Secure Context)에 따른 **HTTPS 무료 터널(Cloudflare Tunnel / ngrok)** 완벽 지원.
  - 별도 앱 설치 없이 스마트폰 Safari/Chrome 브라우저에서 실제 GPS 센서 연동 (1초~10초 주기).
  - Traccar Client 앱 호환 프로토콜 내장.

---

## ⚙️ 환경 변수 설정 (`.env`)

프로젝트 루트의 `.env` 파일에서 주요 설정을 관리할 수 있습니다:

| 환경 변수명 | 기본값 | 설명 |
| :--- | :--- | :--- |
| `PORT` | `8080` | 웹 서버 포트 번호 |
| `ADMIN_USERNAME` | `admin` | 초기 관리자 아이디 |
| `ADMIN_PASSWORD` | `admin1234` | 초기 관리자 비밀번호 (보안을 위해 변경 권장) |
| `PUBLIC_URL` | *(비워둠 또는 지정)* | 외부 접속용 공인 HTTPS 주소 (예: `https://briefing-flashers-mining-beads.trycloudflare.com`) |

> 💡 **스마트 기본 주소 자동 적용 안내**:  
> `.env` 파일에 `PUBLIC_URL`이 설정되어 있으면 'GPS 연동하기' 버튼을 눌렀을 때 생성되는 QR코드와 스마트폰 접속 링크가 **내부 IP가 아닌 이 공개 HTTPS 주소로 자동 설정**됩니다. 설정되어 있지 않을 때만 로컬 Wi-Fi IP(`http://10.x.x.x:8080`)가 대체 사용됩니다.

> 🔒 **보안 안내**: 기기별로 발급되는 고유 `Secret Key`가 요청 헤더나 JSON 본문에 포함되어야만 위치 데이터가 갱신되며, 권한이 없는 제3자의 위치 위조 전송이 차단됩니다.

---

## 🚀 단계별 실행 및 실제 핸드폰 GPS 연동 가이드

### [1단계] 서버 실행하기 (PC)
1. 탐색기에서 **`start.bat`** 파일을 더블 클릭합니다.
   - 자동으로 소스코드가 컴파일되고 웹 서버가 포트 `8080`으로 시작됩니다.
   - 브라우저에서 관제 대시보드([http://localhost:8080](http://localhost:8080))가 자동으로 열립니다.
2. 기본 관리자 계정으로 로그인합니다:
   - **아이디:** `admin` / **비밀번호:** `admin1234` (또는 회원가입 탭에서 신규 생성)

---

### [2단계] 모바일(LTE/5G/외부 Wi-Fi) 접속을 위한 HTTPS 터널 실행
> ⚠️ **스마트폰 브라우저(Safari, Chrome)의 필수 보안 규칙:**  
> 스마트폰 브라우저는 보안상 **HTTPS(암호화된 보안 연결)**에서만 GPS 위치 권한 팝업을 허용합니다.  
> 따라서 컴퓨터 밖(LTE/5G)에서 핸드폰으로 접속하려면 아래 무료 HTTPS 터널을 켭니다.

1. 프로젝트 폴더의 **`start_tunnel.bat`** 파일을 더블 클릭합니다.
2. 검은 콘솔 창에 Cloudflare Tunnel이 시작되면서 아래와 같은 **무료 공개 HTTPS 링크**가 출력됩니다:
   ```text
   https://xxxx-xxxx-xxxx.trycloudflare.com
   ```
3. 이 공개 HTTPS 주소를 프로젝트 루트의 **`.env`** 파일에 입력해 둡니다:
   ```env
   PUBLIC_URL=https://xxxx-xxxx-xxxx.trycloudflare.com
   ```
   > 💡 **자동 연동 팁:** `.env`에 `PUBLIC_URL`을 적어두면 대시보드의 **[내 폰 GPS 연동]** 버튼과 QR코드, 기기별 복사 링크가 모두 이 HTTPS 주소로 자동 설정됩니다. (대시보드 모달 창 상단의 주소 입력칸에서 직접 변경 후 **[적용]**을 누를 수도 있습니다.)

---

### [3단계] 스마트폰에서 GPS 연동 및 실제 위치 전송
1. 스마트폰 카메라로 대시보드 화면의 **QR 코드**를 스캔합니다.  
   *(또는 위 `https://xxxx.trycloudflare.com/tracker.html?deviceId=DEV-PHONE-202&secretKey=...` 링크를 스마트폰 카톡/문자로 열기)*
2. 스마트폰 브라우저에서 **"위치 권한을 허용하시겠습니까?"** 팝업이 뜨면 **[허용]**을 터치합니다.
3. 스마트폰 화면의 커다란 **[GPS 실시간 전송 시작]** 버튼을 터치합니다.
4. **전송 상태 확인**:
   - 스마트폰 화면에 내 현재 위도, 경도, 시속(km/h), 고도, 오차(±m), 누적 전송 횟수가 실시간 카운트됩니다.
   - 화면이 꺼지지 않도록 **Screen WakeLock** 기능이 자동으로 켜집니다.

---

### [4단계] PC 관제 화면에서 실시간 추적 및 동선 확인
1. PC 모니터의 관제 대시보드 상단 기기 선택창에서 내 폰 기기(`DEV-PHONE-202`)를 선택합니다.
2. 지도 위에 스마트폰의 실제 위치가 실시간 마커와 펄스 애니메이션으로 나타납니다.
3. 걸어가거나 차량으로 이동하면:
   - 지도의 마커가 이동 방향(나침반 각도)에 맞춰 회전하며 부드럽게 이동합니다.
   - 우측 상단 계기판의 주행 속도계(km/h)와 주행 상태가 실시간으로 갱신됩니다.
   - 지나온 길이 굵은 코발트 블루 궤적 라인(Tail)으로 그려집니다.

---

### [5단계] 시간대별 동선(히스토리) 타임라인 재생
1. 상단 모드 스위처에서 **[동선 히스토리]** 탭을 클릭합니다.
2. [오늘 전체] 또는 [최근 1시간]을 누르고 **[조회]**를 클릭합니다.
3. 지도에 출발 지점(🟢 START), 도착 지점(🏁 END), 3분 이상 머문 정차 지점(🛑 STOP)이 표시됩니다.
4. 하단 타임라인 컨트롤러의 **[▶ 재생]** 버튼을 누르거나 슬라이더를 드래그하면, 특정 시각에 어디에 있었는지 차량 마커가 이동하며 시간과 속도를 실시간으로 재현합니다.

---

## 🛠️ 수동 실행 명령어 (터미널)

### Java 백엔드 실행
```bash
# 컴파일
javac -encoding UTF-8 GpsServer.java

# 서버 구동
java -Dfile.encoding=UTF-8 -Djava.net.preferIPv4Stack=true GpsServer
```

### Cloudflare HTTPS 터널 직접 실행 (선택사항)
```bash
# cloudflared를 이용한 무료 HTTPS 터널링
cloudflared tunnel --url http://localhost:8080
```

---

## 📁 디렉터리 및 주요 파일 구조

```
realtime-gps-tracker/
├── GpsServer.java          # 가상 스레드 기반 고성능 Java 백엔드 (SSE, REST API, 인증, 데이터 보존)
├── .env                    # 서버 포트, 관리자 비밀번호, 공개 HTTPS URL 설정
├── .env.example            # 환경 변수 템플릿
├── start.bat               # 윈도우 원클릭 서버 실행기
├── start.ps1               # PowerShell 서버 실행기
├── start_tunnel.bat        # 윈도우 원클릭 Cloudflare HTTPS 터널 실행기
├── start_tunnel.ps1        # PowerShell HTTPS 터널 실행기
├── README.md               # 시스템 및 GPS 연동 상세 매뉴얼
├── data/                   # 영구 데이터베이스 (JSON)
│   ├── users.json          # 가입 사용자 및 암호화 비밀번호
│   ├── devices.json        # 등록 기기 및 고유 시크릿 키
│   └── locations.json      # 기기별 GPS 위치 기록
└── public/                 # 관제 웹 프론트엔드
    ├── index.html          # 메인 관제 대시보드 (위치 검색, 4종 타일, 타임라인)
    ├── tracker.html        # 스마트폰 전용 실시간 GPS 송신 모바일 웹앱
    ├── guide.html          # 상세 연동 매뉴얼 및 소스코드 예제 센터
    ├── css/style.css       # 글래스모피즘 & 레이더 마커 스타일
    └── js/
        ├── app.js          # 지도 대시보드, 위치 검색, SSE 수신, 타임라인 재생 엔진
        ├── tracker.js      # 스마트폰 GPS 센서 읽기 & 서버 전송 로직
        └── qrcode.min.js   # 100% 로컬 독립형 순수 JS QR코드 생성 엔진
```
