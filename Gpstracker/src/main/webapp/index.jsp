<%@ page language="java" contentType="text/html; charset=UTF-8" pageEncoding="UTF-8"%>
<%
    String ctx = request.getContextPath();

    // 로그인 여부 확인.
    // 기존 index.jsp에서 쓰던 세션 속성 이름이 아래 목록에 없다면 여기에 추가해 주세요.
    String[] sessionKeys = {"loginUser", "loginId", "userId", "user", "member", "id"};
    Object loginObj = null;
    for (String k : sessionKeys) {
        loginObj = session.getAttribute(k);
        if (loginObj != null) break;
    }
    boolean loggedIn = (loginObj != null);

    // 문자열이면 그대로, 객체(DTO)면 "회원"으로 표시. 필요하면 getter 호출로 바꿔 쓰세요.
    String displayName = (loginObj instanceof String) ? (String) loginObj : "회원";
    displayName = displayName.replace("&", "&amp;").replace("<", "&lt;")
                             .replace(">", "&gt;").replace("\"", "&quot;");
%>
<!DOCTYPE html>
<html lang="ko">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>Gpstracker</title>

  <link rel="stylesheet" href="https://cdn.jsdelivr.net/gh/orioncactus/pretendard@v1.3.9/dist/web/variable/pretendardvariable-dynamic-subset.min.css">
  <link rel="preconnect" href="https://fonts.googleapis.com">
  <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
  <link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Noto+Serif+KR:wght@500;600&display=swap">
  <link rel="stylesheet" href="https://unpkg.com/leaflet@1.9.4/dist/leaflet.css">
  <link rel="stylesheet" href="<%=ctx%>/assets/css/app.css">
</head>
<body data-ctx="<%=ctx%>" data-login="<%=loggedIn%>">

<!-- 아이콘 모음 -->
<svg width="0" height="0" style="position:absolute" aria-hidden="true">
  <defs>
    <symbol id="i-play" viewBox="0 0 24 24"><polygon points="7 4 20 12 7 20 7 4"/></symbol>
    <symbol id="i-pause" viewBox="0 0 24 24"><path d="M8 5v14M16 5v14"/></symbol>
    <symbol id="i-reset" viewBox="0 0 24 24"><path d="M3 12a9 9 0 1 0 3-6.7"/><path d="M3 4v5h5"/></symbol>
    <symbol id="i-plus" viewBox="0 0 24 24"><path d="M12 5v14M5 12h14"/></symbol>
    <symbol id="i-trash" viewBox="0 0 24 24"><path d="M4 7h16M9 7V4h6v3M6 7l1 13h10l1-13"/></symbol>
    <symbol id="i-copy" viewBox="0 0 24 24"><rect x="9" y="9" width="11" height="11" rx="2"/><path d="M5 15V6a2 2 0 0 1 2-2h9"/></symbol>
    <symbol id="i-layers" viewBox="0 0 24 24"><path d="M12 3 3 8l9 5 9-5-9-5z"/><path d="M3 13l9 5 9-5"/></symbol>
    <symbol id="i-target" viewBox="0 0 24 24"><circle cx="12" cy="12" r="7"/><circle cx="12" cy="12" r="2"/><path d="M12 2v3M12 19v3M2 12h3M19 12h3"/></symbol>
    <symbol id="i-edit" viewBox="0 0 24 24"><path d="M4 20h4L19 9l-4-4L4 16v4z"/></symbol>
  </defs>
</svg>

<header class="topbar">
  <a class="brand" href="<%=ctx%>/index.jsp" aria-label="Gpstracker 홈">
    <svg viewBox="0 0 26 26" fill="none" aria-hidden="true">
      <circle cx="13" cy="13" r="11" stroke="#c9a96b" stroke-width="1.4"/>
      <circle cx="13" cy="13" r="5.5" stroke="#c9a96b" stroke-width="1.4" opacity=".55"/>
      <circle cx="13" cy="13" r="2" fill="#c9a96b"/>
    </svg>
    Gpstracker
  </a>

  <div class="topbar-right">
    <span class="conn" id="conn">시뮬레이션 중</span>

    <nav class="userbox" aria-label="계정">
      <% if (loggedIn) { %>
        <span class="who"><%=displayName%>님</span>
        <a href="<%=ctx%>/mypage.jsp">마이페이지</a>
        <a href="<%=ctx%>/logout">로그아웃</a>
      <% } else { %>
        <a href="<%=ctx%>/login.jsp">로그인</a>
        <a class="cta" href="<%=ctx%>/signup.jsp">회원가입</a>
      <% } %>
    </nav>
  </div>
</header>

<div class="shell">

  <!-- ================= 왼쪽 패널 ================= -->
  <aside class="panel" aria-label="기기와 기능">

    <h2 class="sec-title">내 기기</h2>
    <div class="dev-list" id="dev-list"></div>

    <section class="focus" aria-live="polite">
      <div class="focus-head">
        <div>
          <h3 class="focus-name" id="f-name" style="margin:0">기기를 선택하세요</h3>
          <p class="focus-state" id="f-state"></p>
        </div>
        <button class="btn icon ghost" id="f-edit" type="button" aria-label="기기 이름과 색상 바꾸기">
          <svg class="i"><use href="#i-edit"/></svg>
        </button>
      </div>

      <div class="meter" id="f-meter" role="img" aria-label="배터리 잔량"><i></i></div>

      <dl class="facts">
        <dt>배터리</dt><dd id="f-bat">-</dd>
        <dt>마지막 신호</dt><dd id="f-ago">-</dd>
        <dt>위치</dt><dd id="f-pos">-</dd>
      </dl>

      <div class="opt">
        <div class="opt-text">
          <strong>분실 모드</strong>
          <span>켜면 1초마다 위치를 받고, 변화를 바로 알려요.</span>
        </div>
        <label class="switch">
          <span class="sr">분실 모드</span>
          <input type="checkbox" id="f-lost"><span></span>
        </label>
      </div>

      <div class="opt">
        <div class="opt-text">
          <strong>위치 갱신 주기</strong>
          <span id="f-mode-help">짧을수록 정확하고 배터리를 더 써요.</span>
        </div>
        <select id="f-mode" aria-label="위치 갱신 주기">
          <option value="live">실시간 (3초)</option>
          <option value="saver">배터리 절약 (10초)</option>
        </select>
      </div>
    </section>

    <div class="tabs" role="tablist" aria-label="기능">
      <button class="tab" role="tab" id="tab-route" aria-controls="p-route" aria-selected="true" data-tab="route">경로</button>
      <button class="tab" role="tab" id="tab-zone" aria-controls="p-zone" aria-selected="false" data-tab="zone">안전구역</button>
      <button class="tab" role="tab" id="tab-alert" aria-controls="p-alert" aria-selected="false" data-tab="alert">알림<span class="badge" id="badge" hidden>0</span></button>
      <button class="tab" role="tab" id="tab-share" aria-controls="p-share" aria-selected="false" data-tab="share">공유</button>
    </div>

    <!-- 경로 -->
    <section class="tabpanel" id="p-route" role="tabpanel" aria-labelledby="tab-route">
      <div class="row">
        <label class="sr" for="r-date">날짜</label>
        <input type="date" id="r-date">
        <div class="seg" id="r-quick">
          <button type="button" data-day="0">오늘</button>
          <button type="button" data-day="1">어제</button>
        </div>
      </div>

      <p class="empty" id="r-empty" hidden>이 날짜에는 기록이 없어요. 기기가 움직이면 경로가 자동으로 쌓여요.</p>

      <div id="r-body" hidden>
        <dl class="stats" style="margin-top:16px">
          <div><dt>이동 거리</dt><dd id="r-dist">-</dd></div>
          <div><dt>이동 시간</dt><dd id="r-dur">-</dd></div>
          <div><dt>기록 지점</dt><dd id="r-count">-</dd></div>
        </dl>

        <div class="player" style="margin-top:14px">
          <button class="btn icon primary" id="r-play" type="button" aria-label="재생">
            <svg class="i"><use href="#i-play"/></svg>
          </button>
          <label class="sr" for="r-range">재생 위치</label>
          <input type="range" id="r-range" min="0" max="0" value="0">
          <time id="r-time">--:--</time>
        </div>

        <div class="row" style="justify-content:space-between">
          <div class="seg" id="r-speed" aria-label="재생 속도">
            <button type="button" data-speed="1" aria-pressed="false">1배</button>
            <button type="button" data-speed="4" aria-pressed="true">4배</button>
            <button type="button" data-speed="16" aria-pressed="false">16배</button>
          </div>
          <button class="btn sm ghost" id="r-reset" type="button">
            <svg class="i" style="width:15px;height:15px"><use href="#i-reset"/></svg>처음부터
          </button>
        </div>
      </div>
    </section>

    <!-- 안전구역 -->
    <section class="tabpanel" id="p-zone" role="tabpanel" aria-labelledby="tab-zone" hidden>
      <p class="hint">기기가 반경 안팎을 드나들면 알려드려요.</p>
      <div class="row">
        <button class="btn primary" id="z-add" type="button">
          <svg class="i"><use href="#i-plus"/></svg>안전구역 추가
        </button>
      </div>
      <p class="empty" id="z-empty" hidden>등록된 안전구역이 없어요. 집이나 학교처럼 자주 가는 곳을 추가해 보세요.</p>
      <ul class="items" id="z-list"></ul>
    </section>

    <!-- 알림 -->
    <section class="tabpanel" id="p-alert" role="tabpanel" aria-labelledby="tab-alert" hidden>
      <div class="row" style="justify-content:space-between">
        <div class="seg" id="e-filter" aria-label="알림 종류">
          <button type="button" data-f="all" aria-pressed="true">전체</button>
          <button type="button" data-f="zone" aria-pressed="false">안전구역</button>
          <button type="button" data-f="state" aria-pressed="false">기기 상태</button>
        </div>
        <button class="btn sm ghost" id="e-read" type="button">모두 읽음</button>
      </div>

      <div class="opt" style="margin-top:14px">
        <div class="opt-text">
          <strong>브라우저 알림</strong>
          <span>탭을 보고 있지 않을 때도 알려줘요.</span>
        </div>
        <label class="switch">
          <span class="sr">브라우저 알림 받기</span>
          <input type="checkbox" id="e-notif"><span></span>
        </label>
      </div>

      <p class="empty" id="e-empty" hidden>새 알림이 없어요.</p>
      <ul class="items" id="e-list"></ul>
    </section>

    <!-- 공유 -->
    <section class="tabpanel" id="p-share" role="tabpanel" aria-labelledby="tab-share" hidden>
      <p class="hint">선택한 기기의 위치를 정해진 시간 동안만 볼 수 있는 링크예요. 시간이 지나면 저절로 닫혀요.</p>
      <div class="row">
        <label class="sr" for="s-exp">공유 시간</label>
        <select id="s-exp">
          <option value="30">30분</option>
          <option value="60" selected>1시간</option>
          <option value="1440">24시간</option>
        </select>
        <button class="btn primary" id="s-make" type="button">링크 만들기</button>
      </div>
      <p class="empty" id="s-empty" hidden>공유 중인 링크가 없어요.</p>
      <ul class="items" id="s-list"></ul>
      <p class="hint" style="margin-top:16px">링크를 여는 공유 페이지는 서버를 연결한 뒤에 동작해요.</p>
    </section>

  </aside>

  <!-- ================= 지도 ================= -->
  <main class="mapwrap">
    <div id="map" aria-label="기기 위치 지도"></div>

    <div class="map-ui">
      <button class="map-btn" id="m-fit" type="button" aria-label="모든 기기 보기" title="모든 기기 보기">
        <svg class="i"><use href="#i-target"/></svg>
      </button>
      <button class="map-btn" id="m-style" type="button" aria-label="지도 스타일 바꾸기" title="지도 스타일 바꾸기">
        <svg class="i"><use href="#i-layers"/></svg>
      </button>
    </div>

    <div class="map-chip" id="banner" hidden>
      <span>지도를 눌러 안전구역의 중심을 정하세요</span>
      <button class="btn sm" id="banner-cancel" type="button">취소</button>
    </div>

    <div class="map-chip plain" id="replay-chip" hidden></div>
  </main>
</div>

<div class="toasts" id="toasts" role="status" aria-live="polite"></div>

<!-- 안전구역 추가 -->
<dialog id="dlg-zone" aria-labelledby="dz-title">
  <form id="zone-form" method="dialog">
    <h2 id="dz-title">안전구역 추가</h2>
    <label class="field">
      <span>이름</span>
      <input type="text" id="dz-name" maxlength="20" required placeholder="예: 집, 학교">
    </label>
    <label class="field">
      <span>반경 <output id="dz-out">300m</output></span>
      <input type="range" id="dz-r" min="100" max="2000" step="50" value="300">
    </label>
    <div class="dlg-actions">
      <button class="btn" type="button" id="dz-cancel">취소</button>
      <button class="btn primary" type="submit">저장</button>
    </div>
  </form>
</dialog>

<!-- 기기 이름과 색상 -->
<dialog id="dlg-dev" aria-labelledby="dd-title">
  <form id="dev-form" method="dialog">
    <h2 id="dd-title">기기 이름과 색상</h2>
    <label class="field">
      <span>이름</span>
      <input type="text" id="dd-name" maxlength="16" required>
    </label>
    <div class="field">
      <span>색상</span>
      <div class="swatches" id="dd-colors"></div>
    </div>
    <div class="dlg-actions">
      <button class="btn" type="button" id="dd-cancel">취소</button>
      <button class="btn primary" type="submit">저장</button>
    </div>
  </form>
</dialog>

<script src="https://unpkg.com/leaflet@1.9.4/dist/leaflet.js"></script>
<script>
  // 서버와 연결할 때 주석을 풀고 주소를 맞춰 주세요.
  // window.GPS_CONFIG = {
  //   wsUrl: (location.protocol === 'https:' ? 'wss://' : 'ws://') + location.host + '<%=ctx%>/ws/location',
  //   devicesUrl: '<%=ctx%>/api/devices'
  // };
</script>
<script src="<%=ctx%>/assets/js/app.js"></script>
</body>
</html>
