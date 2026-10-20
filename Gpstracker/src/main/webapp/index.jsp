<%@ page language="java" contentType="text/html; charset=UTF-8" pageEncoding="UTF-8" isELIgnored="true"%>
<%!
    /** HTML 출력용 이스케이프 (XSS 방지) */
    private static String esc(String s) {
        if (s == null) return "";
        StringBuilder sb = new StringBuilder(s.length() + 16);
        for (int i = 0; i < s.length(); i++) {
            char c = s.charAt(i);
            switch (c) {
                case '&':  sb.append("&amp;");  break;
                case '<':  sb.append("&lt;");   break;
                case '>':  sb.append("&gt;");   break;
                case '"':  sb.append("&quot;"); break;
                case '\'': sb.append("&#39;");  break;
                default:   sb.append(c);
            }
        }
        return sb.toString();
    }
%>
<%
    // ▼ 카카오 개발자 사이트(developers.kakao.com)에서 발급한 'JavaScript 키'를 따옴표 안에 넣으세요.
    //   비워 두면 기본 지도(OpenStreetMap)로 표시됩니다.
    final String KAKAO_JS_KEY = "";
    String kakaoKey = KAKAO_JS_KEY.replaceAll("[^A-Za-z0-9]", "");

    // 로그인하지 않은 사용자는 로그인 페이지로 보냅니다.
    String loginUser = (String) session.getAttribute("loginUser");
    if (loginUser == null) {
        response.sendRedirect(request.getContextPath() + "/login.jsp");
        return;
    }
    response.setHeader("Cache-Control", "no-store");
%>
<!DOCTYPE html>
<html lang="ko">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>GPS 관제 센터</title>
<link rel="stylesheet" href="https://unpkg.com/leaflet@1.9.4/dist/leaflet.css"
      integrity="sha256-p4NxAoJBhIIN+hmNHrzRCf9tD/miZyoHS5obTRR9BMY=" crossorigin="">
<style>
    :root {
        --ink: #1d2733;
        --paper: #f6f5f2;
        --line: #dcd9d2;
        --muted: #6b7480;
        --signal: #1f6feb;
        --stale: #c77d0a;
        --idle: #8a8f98;
        --fence: #c0392b;
        --bar: 52px;
    }
    * { box-sizing: border-box; }
    html, body { height: 100%; margin: 0; }
    body {
        display: flex; flex-direction: column;
        font-family: "Pretendard", "Noto Sans KR", "Malgun Gothic", -apple-system, "Segoe UI", sans-serif;
        font-size: 14px; color: var(--ink); background: var(--paper);
    }
    [hidden] { display: none !important; }
    button, input, select { font: inherit; color: inherit; }
    :focus-visible { outline: 2px solid var(--signal); outline-offset: 2px; }

    /* ---------- 상단 바 ---------- */
    #top-bar {
        position: relative; z-index: 10;
        flex: none; height: var(--bar); padding: 0 16px;
        display: flex; align-items: center; justify-content: space-between; gap: 12px;
        background: var(--ink); color: #fff;
    }
    #top-bar .logo { font-size: 16px; font-weight: 700; letter-spacing: .2px; }
    #top-bar .right { display: flex; align-items: center; gap: 10px; font-size: 13px; }
    #top-bar .who { color: #cfd6df; }
    #top-bar a, #top-bar button.link {
        color: #fff; text-decoration: none; background: #3a4757; border: 0;
        padding: 6px 10px; border-radius: 4px; cursor: pointer; font-size: 13px;
    }
    #top-bar a:hover, #top-bar button.link:hover { background: #2b6cb0; }
    #top-bar form { margin: 0; }
    #conn { display: inline-flex; align-items: center; gap: 6px; color: #cfd6df; font-size: 12px; }
    #conn i { width: 8px; height: 8px; border-radius: 50%; background: #3fb950; display: inline-block; }
    #conn.bad i { background: #f85149; }

    /* ---------- 본문 ---------- */
    #app { flex: 1; min-height: 0; display: flex; }
    #side {
        position: relative; z-index: 2;
        flex: none; width: 330px; overflow-y: auto; padding: 4px 16px 24px;
        border-right: 1px solid var(--line); background: var(--paper);
    }
    #map { flex: 1; min-width: 0; position: relative; overflow: hidden; z-index: 1; }
    #map.picking { cursor: crosshair; }

    #side section { padding: 14px 0; border-bottom: 1px solid var(--line); }
    #side section:last-child { border-bottom: 0; }
    #side h2 { margin: 0 0 10px; font-size: 14px; font-weight: 700; display: flex; justify-content: space-between; align-items: center; }
    .muted { color: var(--muted); }
    .hint { margin: 6px 0 0; font-size: 12px; color: var(--muted); line-height: 1.5; }

    .btn {
        border: 1px solid var(--line); background: #fff; padding: 6px 10px; border-radius: 4px; cursor: pointer;
    }
    .btn:hover { border-color: #aeb4bc; }
    .btn.primary { background: var(--ink); border-color: var(--ink); color: #fff; }
    .btn.danger { color: var(--fence); }
    .btns { display: flex; gap: 8px; flex-wrap: wrap; margin-top: 10px; }

    /* 긴급 버튼 스타일 */
    .emergency-btn-group {
        margin-top: 6px;
        display: flex;
        gap: 8px;
    }
    .btn-call {
        flex: 1;
        padding: 9px 10px;
        border: none;
        border-radius: 4px;
        font-size: 13px;
        font-weight: bold;
        color: white;
        cursor: pointer;
        display: flex;
        align-items: center;
        justify-content: center;
        gap: 4px;
        transition: opacity 0.2s;
    }
    .btn-call:hover { opacity: 0.85; }
    .btn-parent { background-color: #1f6feb; }
    .btn-police { background-color: #c0392b; }

    /* 기기 목록 */
    #list { list-style: none; margin: 0; padding: 0; }
    .row {
        width: 100%; text-align: left; background: transparent; border: 0; border-left: 3px solid transparent;
        padding: 9px 8px; display: grid; grid-template-columns: 14px 1fr; column-gap: 8px; cursor: pointer;
    }
    .row:hover { background: #ecebe6; }
    .row.on { background: #fff; border-left-color: var(--signal); }
    .row .dot { grid-row: 1 / span 2; align-self: center; }
    .rname { font-weight: 600; }
    .rsub { font-size: 12px; color: var(--muted); }
    .dot { width: 10px; height: 10px; border-radius: 50%; background: var(--idle); display: inline-block; }
    .dot.online { background: var(--signal); }
    .dot.offline { background: var(--stale); }

    /* 선택한 기기 */
    .dhead { display: flex; align-items: center; justify-content: space-between; gap: 8px; }
    .dname { font-size: 16px; }
    .badge { font-size: 12px; padding: 2px 8px; border-radius: 10px; color: #fff; background: var(--idle); }
    .badge.online { background: var(--signal); }
    .badge.offline { background: var(--stale); }
    dl { display: grid; grid-template-columns: 88px 1fr; row-gap: 6px; margin: 12px 0 0; }
    dt { color: var(--muted); }
    dd { margin: 0; font-variant-numeric: tabular-nums; word-break: break-all; }

    label.field { display: flex; flex-direction: column; gap: 4px; margin-bottom: 10px; text-align: left; }
    label.field span { font-weight: 600; font-size: 12px; color: #334155; }
    select, input[type=number], input[type=date], input[type=text] {
        border: 1px solid var(--line); background: #fff; border-radius: 4px; padding: 7px 8px; width: 100%;
    }
    input[type=number] { width: 90px; }
    label.check { display: flex; align-items: center; gap: 8px; cursor: pointer; }

    /* 지도 위 마커 */
    .pin {
        display: block; width: 100%; height: 100%; border-radius: 50%; border: 3px solid #fff;
        background: var(--idle); box-shadow: 0 0 0 1px rgba(0,0,0,.35), 0 2px 6px rgba(0,0,0,.35);
    }
    .pin.online { background: var(--signal); }
    .pin.offline { background: var(--stale); }
    .pin.online.sel { animation: pulse 2s ease-out infinite; }
    @keyframes pulse {
        0%   { box-shadow: 0 0 0 1px rgba(0,0,0,.35), 0 0 0 0 rgba(31,111,235,.55); }
        100% { box-shadow: 0 0 0 1px rgba(0,0,0,.35), 0 0 0 18px rgba(31,111,235,0); }
    }
    @media (prefers-reduced-motion: reduce) { .pin.online.sel { animation: none; } }

    /* 알림 토스트 */
    #toasts {
        position: fixed; top: calc(var(--bar) + 12px); left: 50%; transform: translateX(-50%);
        z-index: 2000; display: flex; flex-direction: column; gap: 8px; width: min(420px, 92vw); pointer-events: none;
    }
    .toast {
        background: #fff; border: 1px solid var(--line); border-left: 4px solid var(--signal);
        border-radius: 4px; padding: 10px 12px; box-shadow: 0 4px 14px rgba(0,0,0,.18);
    }
    .toast.warn { border-left-color: var(--stale); }
    .toast.alert { border-left-color: var(--fence); font-weight: 600; }
    .toast.ok { border-left-color: #2da44e; }

    /* 대화상자 */
    dialog { border: 1px solid var(--line); border-radius: 8px; padding: 18px; width: min(460px, 92vw); }
    dialog::backdrop { background: rgba(20,28,38,.45); }
    dialog h3 { margin: 0 0 12px; font-size: 16px; }
    dialog pre {
        margin: 6px 0 12px; padding: 10px; background: #f0efeb; border-radius: 4px;
        white-space: pre-wrap; word-break: break-all; font-size: 12px;
    }
    .err { color: var(--fence); font-size: 12px; min-height: 16px; margin: 6px 0 0; }

    @media (max-width: 760px) {
        #app { flex-direction: column; }
        #map { order: 1; flex: 1 1 55%; }
        #side { order: 2; width: 100%; flex: 1 1 45%; border-right: 0; border-top: 1px solid var(--line); }
        #top-bar .who { display: none; }
    }
</style>
</head>
<body>

<header id="top-bar">
    <div class="logo">GPS 관제 센터</div>
    <div class="right">
        <span id="conn"><i></i><span id="connText">연결 중</span></span>
        <span class="who"><strong><%= esc(loginUser) %></strong>님</span>
        <a href="mypage.jsp">마이페이지</a>
        <!-- 404 경로 오류를 수정한 로그아웃 폼 -->
        <form method="get" action="logout" style="display:inline;">
            <button type="submit" class="link">로그아웃</button>
        </form>
    </div>
</header>

<div id="app">
    <aside id="side">
        <!-- 긴급 호출 및 신고 섹션 -->
        <section>
            <h2>긴급 호출 및 신고</h2>
            <div class="emergency-btn-group">
                <button type="button" class="btn-call btn-parent" id="callParentBtn">
                    📞 보호자 호출
                </button>
                <button type="button" class="btn-call btn-police" id="callPoliceBtn">
                    🚨 관할 경찰서 신고
                </button>
            </div>
        </section>

        <section>
            <h2>기기 <button type="button" class="btn" id="addBtn">기기 추가</button></h2>
            <ul id="list"></ul>
        </section>

        <section>
            <h2>선택한 기기</h2>
            <div id="details"><p class="muted">목록에서 기기를 선택하세요.</p></div>
            <label class="check" style="margin-top:12px">
                <input type="checkbox" id="follow" checked> 위치를 따라 지도 이동
            </label>
        </section>

        <section>
            <h2>이동 경로 <span class="muted" id="trailInfo" style="font-weight:400"></span></h2>
            <label class="field"><span>조회 기간</span>
                <select id="range">
                    <option value="1" selected>최근 1시간</option>
                    <option value="6">최근 6시간</option>
                    <option value="24">최근 24시간</option>
                    <option value="day">날짜 지정</option>
                    <option value="off">표시 안 함</option>
                </select>
            </label>
            <label class="field" id="dayRow" hidden><span>날짜 선택</span> <input type="date" id="day"></label>
        </section>

        <section>
            <h2>지도</h2>
            <label class="check" id="trafficRow" hidden>
                <input type="checkbox" id="traffic"> 실시간 교통정보 표시
            </label>
            <p class="hint" id="mapHint"></p>
        </section>

        <section>
            <h2>지오펜스</h2>
            <label class="field" style="flex-direction:row; align-items:center;">
                <span>반경</span>
                <input type="number" id="radius" value="300" min="50" max="50000" step="50"> m
            </label>
            <div class="btns" style="margin-top:0">
                <button type="button" class="btn" id="fenceSet">구역 지정</button>
                <button type="button" class="btn" id="fenceClear">구역 해제</button>
            </div>
            <p class="hint" id="fenceHint"></p>
        </section>
    </aside>

    <div id="map"></div>
</div>

<div id="toasts" role="status" aria-live="polite"></div>

<!-- 기기 및 인적사항 추가 대화상자 -->
<dialog id="addDlg">
    <form id="addForm">
        <h3>기기 및 인적사항 추가</h3>
        
        <label class="field">
            <span>기기 명칭 (필수)</span>
            <input type="text" id="devName" maxlength="30" placeholder="예: 자녀 스마트워치" required>
        </label>
        
        <label class="field">
            <span>사용자 본인 번호</span>
            <input type="text" id="userPhone" placeholder="예: 010-1234-5678">
        </label>

        <label class="field">
            <span>보호자 번호 (긴급 연락처)</span>
            <input type="text" id="parentPhone" placeholder="예: 010-9876-5432">
        </label>

        <label class="field">
            <span>사용자 거주 주소</span>
            <input type="text" id="userAddress" placeholder="예: 서울특별시 종로구 세종대로 209">
        </label>

        <p class="err" id="addErr"></p>
        <div class="btns" style="justify-content:flex-end">
            <button type="button" class="btn" id="addCancel">취소</button>
            <button type="submit" class="btn primary">등록</button>
        </div>
    </form>
</dialog>

<!-- 기기 연결 정보 -->
<dialog id="infoDlg">
    <h3>기기 연결 정보</h3>
    <p class="muted" style="margin:0 0 8px">기기가 아래 주소로 위치를 보내도록 설정하세요. 토큰은 비밀번호처럼 다루세요.</p>
    <pre id="infoText"></pre>
    <div class="btns" style="justify-content:flex-end;margin-top:0">
        <button type="button" class="btn primary" id="infoClose">닫기</button>
    </div>
</dialog>

<script src="https://unpkg.com/leaflet@1.9.4/dist/leaflet.js"
        integrity="sha256-20nQCchB9co0qIjJZRGuk2/Z9VM+kNiyxNV1lvTlZBo=" crossorigin=""></script>
<script>
(function () {
    'use strict';

    var CTX = '<%= request.getContextPath() %>';
    var KAKAO_KEY = '<%= kakaoKey %>';
    var POLL_MS = 3000;
    var OFFLINE_MS = 60000;
    var LOW_BATTERY = 15;
    var TRAIL_COLOR = '#1f6feb';
    var FENCE_COLOR = '#c0392b';
    var STATUS_LABEL = { online: '수신 중', offline: '신호 끊김', none: '위치 없음' };

    // ---------- 상태 ----------
    var GM = null;
    var devices = {};
    var order = [];
    var markers = {};
    var selectedId = null;
    var offset = 0;
    var inside = {};
    var fenceKeys = {};
    var lowWarned = {};
    var fenceMode = false;
    var fenceLayer = null, drawnFenceKey = '';
    var trailLine = null, trailEnd = 0, trailLive = false, trailCount = 0, trailReq = 0;

    // ---------- 요소 ----------
    function $(id) { return document.getElementById(id); }
    var listEl = $('list'), detailsEl = $('details'), followEl = $('follow');
    var rangeEl = $('range'), dayEl = $('day'), dayRow = $('dayRow'), trailInfo = $('trailInfo');
    var radiusEl = $('radius'), fenceSetBtn = $('fenceSet'), fenceHint = $('fenceHint');
    var toastsEl = $('toasts'), trafficRow = $('trafficRow'), trafficEl = $('traffic'), mapHint = $('mapHint');

    // ---------- 유틸 ----------
    function esc(s) {
        return String(s).replace(/[&<>"']/g, function (c) {
            return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
        });
    }
    function serverNow() { return Date.now() + offset; }
    function pad(n) { return n < 10 ? '0' + n : '' + n; }
    function ago(ms) {
        var s = Math.max(0, Math.round(ms / 1000));
        if (s < 5) return '방금 전';
        if (s < 60) return s + '초 전';
        var m = Math.floor(s / 60);
        if (m < 60) return m + '분 전';
        var h = Math.floor(m / 60);
        if (h < 24) return h + '시간 ' + (m % 60) + '분 전';
        return Math.floor(h / 24) + '일 전';
    }
    function distM(aLat, aLng, bLat, bLng) {
        var R = 6371000, t = Math.PI / 180;
        var dLat = (bLat - aLat) * t, dLng = (bLng - aLng) * t;
        var x = Math.sin(dLat / 2) * Math.sin(dLat / 2) +
                Math.cos(aLat * t) * Math.cos(bLat * t) * Math.sin(dLng / 2) * Math.sin(dLng / 2);
        return 2 * R * Math.asin(Math.sqrt(x));
    }
    function statusOf(d, now) {
        if (!d.last) return 'none';
        return (now - d.last.ts > OFFLINE_MS) ? 'offline' : 'online';
    }
    function fenceKey(d) { return d.fence ? d.fence.lat + '|' + d.fence.lng + '|' + d.fence.r : ''; }
    function pinSize(cls) { return cls.indexOf('sel') >= 0 ? 26 : 20; }

    function toast(msg, kind) {
        var el = document.createElement('div');
        el.className = 'toast ' + (kind || '');
        el.textContent = msg;
        toastsEl.appendChild(el);
        while (toastsEl.children.length > 4) toastsEl.removeChild(toastsEl.firstChild);
        setTimeout(function () { if (el.parentNode) el.parentNode.removeChild(el); }, 7000);
    }

    // ---------- 서버 통신 ----------
    function api(path, opts) {
        opts = opts || {};
        opts.credentials = 'same-origin';
        opts.headers = { 'X-Requested-With': 'fetch' };
        return fetch(CTX + '/api' + path, opts).then(function (r) {
            if (r.status === 401) {
                location.href = CTX + '/login.jsp';
                throw new Error('unauthorized');
            }
            return r.json().then(function (j) {
                if (!r.ok) throw new Error(j && j.error ? j.error : 'HTTP ' + r.status);
                return j;
            }, function () {
                throw new Error('HTTP ' + r.status);
            });
        });
    }
    function post(path, params) {
        return api(path, { method: 'POST', body: new URLSearchParams(params || {}) });
    }
    function setConn(ok) {
        $('conn').className = ok ? '' : 'bad';
        $('connText').textContent = ok ? '서버 연결됨' : '서버 응답 없음';
    }

    // ---------- 긴급 호출 및 관할 경찰서 위치연동 ----------
    $('callParentBtn').addEventListener('click', function () {
        var d = devices[selectedId];
        if (!d) {
            toast('선택된 기기가 없습니다.', 'warn');
            return;
        }
        var parentPhone = d.parentPhone || "010-1234-5678";
        var posText = d.last ? ("위도: " + d.last.lat.toFixed(5) + ", 경도: " + d.last.lng.toFixed(5)) : "위치 미수신";

        if (confirm("보호자(" + parentPhone + ")에게 연락하시겠습니까?\n\n- 기기: " + d.name + "\n- 현재 GPS 위치: " + posText)) {
            window.location.href = "tel:" + parentPhone;
        }
    });

    $('callPoliceBtn').addEventListener('click', function () {
        var d = devices[selectedId];
        var posText = (d && d.last) ? ("위도 " + d.last.lat.toFixed(5) + ", 경도 " + d.last.lng.toFixed(5)) : "위치 미수신";
        var userAddr = (d && d.userAddress) ? d.userAddress : "미등록 주소";

        var confirmMsg = "🚨 긴급 관할 경찰서 신고\n\n" +
                         "• 대상 기기: " + (d ? d.name : "미선택") + "\n" +
                         "• GPS 수신 좌표: " + posText + "\n" +
                         "• 등록 거주 주소: " + userAddr + "\n\n" +
                         "112 긴급 대표번호로 연결하고 현재 좌표 위치의 경찰서를 조회할까요?";

        if (confirm(confirmMsg)) {
            if (d && d.last) {
                var policeMapUrl = "https://map.naver.com/v5/search/경찰서?c=" + d.last.lng + "," + d.last.lat + ",15,0,0,0,dh";
                window.open(policeMapUrl, '_blank');
            }
            window.location.href = "tel:112";
        }
    });

    // ----- 기본 지도: Leaflet + OpenStreetMap -----
    function leafletAdapter() {
        var map = L.map('map', { zoomControl: false }).setView([37.5665, 126.9780], 14);
        L.control.zoom({ position: 'bottomright' }).addTo(map);
        L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
            maxZoom: 19,
            attribution: '&copy; OpenStreetMap contributors'
        }).addTo(map);

        function icon(cls) {
            var size = pinSize(cls);
            return L.divIcon({
                className: '',
                html: '<span class="pin ' + cls + '"></span>',
                iconSize: [size, size],
                iconAnchor: [size / 2, size / 2]
            });
        }
        return {
            name: 'leaflet',
            traffic: false,
            onClick: function (cb) { map.on('click', function (e) { cb(e.latlng.lat, e.latlng.lng); }); },
            onDragStart: function (cb) { map.on('dragstart', cb); },
            focus: function (lat, lng) { map.setView([lat, lng], Math.max(map.getZoom(), 15)); },
            panTo: function (lat, lng) { map.panTo([lat, lng]); },
            setCursor: function (c) { $('map').style.cursor = c || ''; },
            setTraffic: function () {},
            marker: function (lat, lng, cls, title, onClick) {
                var m = L.marker([lat, lng], { icon: icon(cls), title: title, keyboard: false }).addTo(map);
                m.on('click', onClick);
                var cur = cls;
                return {
                    set: function (la, ln, c) {
                        m.setLatLng([la, ln]);
                        if (c !== cur) { m.setIcon(icon(c)); cur = c; }
                    },
                    remove: function () { map.removeLayer(m); }
                };
            },
            line: function (pts, color) {
                var pl = L.polyline(pts, { color: color, weight: 4, opacity: 0.75, lineJoin: 'round' }).addTo(map);
                return {
                    add: function (la, ln) { pl.addLatLng([la, ln]); },
                    fit: function () {
                        if (pl.getLatLngs().length > 1) map.fitBounds(pl.getBounds(), { padding: [40, 40] });
                    },
                    remove: function () { map.removeLayer(pl); }
                };
            },
            circle: function (lat, lng, r, color) {
                var c = L.circle([lat, lng], {
                    radius: r, color: color, weight: 2, fillColor: color, fillOpacity: 0.08, interactive: false
                }).addTo(map);
                return { remove: function () { map.removeLayer(c); } };
            }
        };
    }

    // ----- 카카오맵 -----
    function kakaoAdapter() {
        var km = kakao.maps;
        var map = new km.Map($('map'), { center: new km.LatLng(37.5665, 126.9780), level: 4 });
        map.addControl(new km.MapTypeControl(), km.ControlPosition.TOPRIGHT);
        map.addControl(new km.ZoomControl(), km.ControlPosition.BOTTOMRIGHT);
        window.addEventListener('resize', function () { map.relayout(); });
        var trafficOn = false;

        function ll(la, ln) { return new km.LatLng(la, ln); }
        return {
            name: 'kakao',
            traffic: true,
            onClick: function (cb) {
                km.event.addListener(map, 'click', function (e) { cb(e.latLng.getLat(), e.latLng.getLng()); });
            },
            onDragStart: function (cb) { km.event.addListener(map, 'dragstart', cb); },
            focus: function (lat, lng) {
                map.setCenter(ll(lat, lng));
                if (map.getLevel() > 4) map.setLevel(4);
            },
            panTo: function (lat, lng) { map.panTo(ll(lat, lng)); },
            setCursor: function (c) { if (typeof map.setCursor === 'function') map.setCursor(c || ''); },
            setTraffic: function (on) {
                if (on && !trafficOn) { map.addOverlayMapTypeId(km.MapTypeId.TRAFFIC); trafficOn = true; }
                else if (!on && trafficOn) { map.removeOverlayMapTypeId(km.MapTypeId.TRAFFIC); trafficOn = false; }
            },
            marker: function (lat, lng, cls, title, onClick) {
                var s = document.createElement('span');
                s.title = title;
                s.style.display = 'block';
                s.style.cursor = 'pointer';
                function paint(c) {
                    var size = pinSize(c);
                    s.className = 'pin ' + c;
                    s.style.width = size + 'px';
                    s.style.height = size + 'px';
                }
                paint(cls);
                s.addEventListener('click', function (e) { e.stopPropagation(); onClick(); });
                var ov = new km.CustomOverlay({
                    position: ll(lat, lng), content: s, xAnchor: 0.5, yAnchor: 0.5, zIndex: 3, clickable: true
                });
                ov.setMap(map);
                var cur = cls;
                return {
                    set: function (la, ln, c) {
                        ov.setPosition(ll(la, ln));
                        if (c !== cur) { paint(c); cur = c; }
                    },
                    remove: function () { ov.setMap(null); }
                };
            },
            line: function (pts, color) {
                var path = pts.map(function (p) { return ll(p[0], p[1]); });
                var pl = null;
                function make() {
                    pl = new km.Polyline({ path: path, strokeWeight: 5, strokeColor: color, strokeOpacity: 0.8, strokeStyle: 'solid' });
                    pl.setMap(map);
                }
                if (path.length >= 2) make();
                return {
                    add: function (la, ln) {
                        path.push(ll(la, ln));
                        if (pl) pl.setPath(path);
                        else if (path.length >= 2) make();
                    },
                    fit: function () {
                        if (path.length < 2) return;
                        var b = new km.LatLngBounds();
                        path.forEach(function (p) { b.extend(p); });
                        map.setBounds(b, 40, 40, 40, 40);
                    },
                    remove: function () { if (pl) pl.setMap(null); }
                };
            },
            circle: function (lat, lng, r, color) {
                var c = new km.Circle({
                    center: ll(lat, lng), radius: r,
                    strokeWeight: 2, strokeColor: color, strokeOpacity: 0.9, strokeStyle: 'solid',
                    fillColor: color, fillOpacity: 0.1
                });
                c.setMap(map);
                return { remove: function () { c.setMap(null); } };
            }
        };
    }

    // ---------- 마커 ----------
    function pinClass(d) { return d.status + (d.id === selectedId ? ' sel' : ''); }
    function updateMarker(d) {
        var m = markers[d.id];
        if (!d.last) { removeMarker(d.id); return; }
        if (!m) {
            markers[d.id] = GM.marker(d.last.lat, d.last.lng, pinClass(d), d.name,
                (function (id) { return function () { select(id, true); }; })(d.id));
        } else {
            m.set(d.last.lat, d.last.lng, pinClass(d));
        }
    }
    function removeMarker(id) {
        if (markers[id]) { markers[id].remove(); delete markers[id]; }
    }

    // ---------- 지오펜스 ----------
    function drawFence() {
        if (fenceLayer) { fenceLayer.remove(); fenceLayer = null; }
        var d = devices[selectedId];
        drawnFenceKey = d ? fenceKey(d) : '';
        if (d && d.fence) fenceLayer = GM.circle(d.fence.lat, d.fence.lng, d.fence.r, FENCE_COLOR);
        updateFenceUi();
    }
    function setFenceMode(on) {
        fenceMode = on && !!selectedId;
        $('map').classList.toggle('picking', fenceMode);
        if (GM) GM.setCursor(fenceMode ? 'crosshair' : '');
        updateFenceUi();
    }
    function updateFenceUi() {
        var d = devices[selectedId];
        fenceSetBtn.textContent = fenceMode ? '지정 취소' : '구역 지정';
        fenceSetBtn.disabled = !d;
        $('fenceClear').disabled = !(d && d.fence);
        if (fenceMode) {
            fenceHint.textContent = '지도에서 구역의 중심이 될 위치를 누르세요.';
        } else if (d && d.fence) {
            fenceHint.textContent = '반경 ' + Math.round(d.fence.r) + 'm 구역이 설정되어 있습니다.';
        } else {
            fenceHint.textContent = '구역을 지정하면 기기가 구역을 드나들 때 알림이 표시됩니다.';
        }
    }

    // ---------- 이동 경로 ----------
    function getRange() {
        var v = rangeEl.value;
        if (v === 'off') return null;
        if (v === 'day') {
            if (!dayEl.value) return null;
            var from = new Date(dayEl.value + 'T00:00:00').getTime();
            return { from: from, to: from + 86400000 - 1, live: false };
        }
        var now = serverNow();
        return { from: now - Number(v) * 3600000, to: now + 60000, live: true };
    }
    function clearTrail() {
        trailReq++;
        if (trailLine) { trailLine.remove(); trailLine = null; }
        trailEnd = 0; trailLive = false; trailCount = 0;
        trailInfo.textContent = '';
    }
    function loadTrail() {
        clearTrail();
        var d = devices[selectedId], r = getRange();
        if (!d || !r || !GM) return;
        var ticket = trailReq;
        api('/devices/' + encodeURIComponent(d.id) + '/history?from=' + Math.round(r.from) + '&to=' + Math.round(r.to))
            .then(function (res) {
                if (ticket !== trailReq) return;
                var pts = res.points;
                trailLine = GM.line(pts.map(function (p) { return [p[1], p[2]]; }), TRAIL_COLOR);
                trailEnd = pts.length ? pts[pts.length - 1][0] : (d.last ? d.last.ts : 0);
                trailLive = r.live;
                trailCount = pts.length;
                trailInfo.textContent = pts.length + '개 지점';
                if (!r.live && pts.length > 1) {
                    followEl.checked = false;
                    trailLine.fit();
                }
            })
            .catch(function () { trailInfo.textContent = '불러오지 못했습니다'; });
    }

    // ---------- 선택 ----------
    function select(id, pan) {
        selectedId = id;
        setFenceMode(false);
        order.forEach(function (k) { if (devices[k]) updateMarker(devices[k]); });
        drawFence();
        loadTrail();
        var d = devices[id];
        if (pan && d && d.last) {
            followEl.checked = true;
            GM.focus(d.last.lat, d.last.lng);
        }
        renderList();
        renderDetails();
    }

    // ---------- 알림 ----------
    function checkAlerts(od, nd) {
        var name = nd.name;
        if (od) {
            if (od.status === 'online' && nd.status === 'offline') toast('신호 끊김: ' + name, 'warn');
            else if (od.status === 'offline' && nd.status === 'online') toast('신호 복구: ' + name, 'ok');
        }
        var key = fenceKey(nd);
        if (fenceKeys[nd.id] !== key) { fenceKeys[nd.id] = key; delete inside[nd.id]; }
        if (nd.fence && nd.last) {
            var isIn = distM(nd.last.lat, nd.last.lng, nd.fence.lat, nd.fence.lng) <= nd.fence.r;
            if (inside[nd.id] !== undefined && inside[nd.id] !== isIn) {
                toast((isIn ? '구역 진입: ' : '구역 이탈: ') + name, isIn ? 'ok' : 'alert');
            }
            inside[nd.id] = isIn;
        }
        if (nd.last && nd.last.battery >= 0) {
            if (nd.last.battery <= LOW_BATTERY && !lowWarned[nd.id]) {
                lowWarned[nd.id] = true;
                toast('배터리 부족: ' + name + ' (' + nd.last.battery + '%)', 'warn');
            } else if (nd.last.battery > LOW_BATTERY + 5) {
                lowWarned[nd.id] = false;
            }
        }
    }

    function onSelectedUpdate(od, nd) {
        var moved = nd.last && (!od || !od.last || od.last.ts !== nd.last.ts);
        if (moved && followEl.checked) GM.panTo(nd.last.lat, nd.last.lng);
        if (moved && trailLine && trailLive && nd.last.ts > trailEnd) {
            trailLine.add(nd.last.lat, nd.last.lng);
            trailEnd = nd.last.ts;
            trailCount++;
            trailInfo.textContent = trailCount + '개 지점';
        }
        if (fenceKey(nd) !== drawnFenceKey) drawFence();
    }

    // ---------- 화면 그리기 ----------
    function renderList() {
        if (!order.length) {
            listEl.innerHTML = '<li class="muted" style="padding:8px">등록된 기기가 없습니다. 기기 추가를 눌러 시작하세요.</li>';
            return;
        }
        listEl.innerHTML = order.map(function (id) {
            var d = devices[id];
            var sub = d.last ? '마지막 수신 ' + ago(serverNow() - d.last.ts) : '위치 수신 전';
            return '<li><button type="button" class="row' + (id === selectedId ? ' on' : '') + '" data-id="' + esc(id) + '">' +
                   '<span class="dot ' + d.status + '"></span>' +
                   '<span class="rname">' + esc(d.name) + '</span>' +
                   '<span class="rsub">' + esc(sub) + '</span></button></li>';
        }).join('');
    }

    function renderDetails() {
        var d = devices[selectedId];
        if (!d) { detailsEl.innerHTML = '<p class="muted">목록에서 기기를 선택하세요.</p>'; return; }
        var l = d.last;
        var h = '<div class="dhead"><strong class="dname">' + esc(d.name) + '</strong>' +
                '<span class="badge ' + d.status + '">' + STATUS_LABEL[d.status] + '</span></div><dl>';
        
        if (l) {
            h += '<dt>위치</dt><dd>' + l.lat.toFixed(5) + ', ' + l.lng.toFixed(5) + '</dd>';
            h += '<dt>속도</dt><dd>' + Math.round(l.speed) + ' km/h</dd>';
            h += '<dt>배터리</dt><dd>' + (l.battery >= 0 ? l.battery + '%' : '알 수 없음') + '</dd>';
            h += '<dt>마지막 수신</dt><dd id="agoText">' + ago(serverNow() - l.ts) + '</dd>';
        } else {
            h += '<dt>위치</dt><dd>수신 전</dd>';
        }

        h += '<dt>본인 연락처</dt><dd>' + esc(d.userPhone || '미등록') + '</dd>';
        h += '<dt>보호자 연락처</dt><dd>' + esc(d.parentPhone || '미등록') + '</dd>';
        h += '<dt>거주 주소</dt><dd>' + esc(d.userAddress || '미등록') + '</dd>';

        h += '</dl>';
        if (d.mine) {
            h += '<div class="btns"><button type="button" class="btn" data-act="info">연결 정보</button>' +
                 '<button type="button" class="btn danger" data-act="delete">기기 삭제</button></div>';
        }
        detailsEl.innerHTML = h;
    }

    // ---------- 주기적 갱신 ----------
    function poll() {
        return api('/devices').then(function (res) {
            offset = res.now - Date.now();
            setConn(true);
            var seen = {};
            order = [];
            res.devices.forEach(function (nd) {
                seen[nd.id] = true;
                order.push(nd.id);
                nd.status = statusOf(nd, res.now);
                var od = devices[nd.id];
                devices[nd.id] = nd;
                updateMarker(nd);
                checkAlerts(od, nd);
                if (nd.id === selectedId) onSelectedUpdate(od, nd);
            });
            Object.keys(devices).forEach(function (id) {
                if (seen[id]) return;
                removeMarker(id);
                delete devices[id]; delete inside[id]; delete fenceKeys[id]; delete lowWarned[id];
                if (id === selectedId) { selectedId = null; clearTrail(); drawFence(); }
            });
            if (!selectedId && res.devices.length) {
                var withPos = res.devices.filter(function (x) { return x.last; })[0] || res.devices[0];
                select(withPos.id, true);
            }
            renderList();
            renderDetails();
            updateFenceUi();
        }).catch(function (e) {
            if (!e || e.message !== 'unauthorized') setConn(false);
        });
    }

    // ---------- 이벤트 ----------
    listEl.addEventListener('click', function (e) {
        var btn = e.target.closest('button[data-id]');
        if (btn) select(btn.getAttribute('data-id'), true);
    });

    detailsEl.addEventListener('click', function (e) {
        var btn = e.target.closest('button[data-act]');
        var d = devices[selectedId];
        if (!btn || !d) return;
        if (btn.getAttribute('data-act') === 'info') showInfo(d);
        if (btn.getAttribute('data-act') === 'delete') {
            if (!confirm('"' + d.name + '" 기기를 삭제할까요? 위치 기록도 함께 사라집니다.')) return;
            post('/devices/' + encodeURIComponent(d.id) + '/delete')
                .then(function () { selectedId = null; return poll(); })
                .catch(function (err) { toast('삭제하지 못했습니다: ' + err.message, 'warn'); });
        }
    });

    rangeEl.addEventListener('change', function () {
        dayRow.hidden = rangeEl.value !== 'day';
        loadTrail();
    });
    dayEl.addEventListener('change', loadTrail);
    (function () {
        var t = new Date();
        dayEl.max = t.getFullYear() + '-' + pad(t.getMonth() + 1) + '-' + pad(t.getDate());
    })();

    fenceSetBtn.addEventListener('click', function () { setFenceMode(!fenceMode); });
    $('fenceClear').addEventListener('click', function () {
        if (!selectedId) return;
        post('/devices/' + encodeURIComponent(selectedId) + '/fence', { radius: 0 })
            .then(poll)
            .catch(function (err) { toast('해제하지 못했습니다: ' + err.message, 'warn'); });
    });

    // 기기 및 인적사항 추가 제출 이벤트
    var addDlg = $('addDlg');
    $('addBtn').addEventListener('click', function () {
        $('devName').value = '';
        $('userPhone').value = '';
        $('parentPhone').value = '';
        $('userAddress').value = '';
        $('addErr').textContent = '';
        addDlg.showModal();
        $('devName').focus();
    });
    $('addCancel').addEventListener('click', function () { addDlg.close(); });
    $('addForm').addEventListener('submit', function (e) {
        e.preventDefault();
        post('/devices', {
            name: $('devName').value,
            userPhone: $('userPhone').value,
            parentPhone: $('parentPhone').value,
            userAddress: $('userAddress').value
        })
        .then(function (nd) {
            addDlg.close();
            return poll().then(function () { select(nd.id, false); showInfo(devices[nd.id] || nd); });
        })
        .catch(function (err) { $('addErr').textContent = err.message; });
    });

    // 연결 정보
    var infoDlg = $('infoDlg');
    function showInfo(d) {
        var url = location.origin + CTX + '/api/location';
        $('infoText').textContent =
            '주소    ' + url + '\n' +
            '기기 ID ' + d.id + '\n' +
            '토큰    ' + d.token + '\n\n' +
            '테스트 (터미널):\n' +
            'curl -X POST "' + url + '" -d "deviceId=' + d.id + '" -d "token=' + d.token +
            '" -d "lat=37.5665" -d "lng=126.9780" -d "speed=0" -d "battery=80"';
        infoDlg.showModal();
    }
    $('infoClose').addEventListener('click', function () { infoDlg.close(); });

    setInterval(function () {
        var d = devices[selectedId], el = $('agoText');
        if (d && d.last && el) el.textContent = ago(serverNow() - d.last.ts);
    }, 1000);

    updateFenceUi();

    // ---------- 부팅 ----------
    function boot() {
        GM.onDragStart(function () { followEl.checked = false; });
        GM.onClick(function (lat, lng) {
            if (!fenceMode || !selectedId) return;
            var r = Number(radiusEl.value);
            if (!(r >= 50 && r <= 50000)) { toast('반경은 50~50000m 사이로 입력하세요.', 'warn'); return; }
            post('/devices/' + encodeURIComponent(selectedId) + '/fence', { lat: lat, lng: lng, radius: r })
                .then(function () { setFenceMode(false); return poll(); })
                .catch(function (err) { toast('구역을 저장하지 못했습니다: ' + err.message, 'warn'); });
        });

        trafficRow.hidden = !GM.traffic;
        trafficEl.addEventListener('change', function () { GM.setTraffic(trafficEl.checked); });
        mapHint.textContent = GM.name === 'kakao'
            ? '지도 오른쪽 위에서 일반 지도와 스카이뷰(위성)를 바꿀 수 있어요.'
            : '기본 지도(OpenStreetMap)를 사용 중입니다. index.jsp 맨 위에 카카오 JavaScript 키를 넣으면 카카오맵(스카이뷰, 실시간 교통정보)으로 바뀝니다.';

        (function loop() {
            poll().then(function () { setTimeout(loop, document.hidden ? 15000 : POLL_MS); });
        })();
    }

    var started = false;
    function start(adapter, note) {
        if (started) return;
        started = true;
        GM = adapter;
        boot();
        if (note) toast(note, 'warn');
    }
    function startLeaflet(note) {
        if (started) return;
        $('map').innerHTML = '';
        start(leafletAdapter(), note);
    }

    if (KAKAO_KEY) {
        var sdk = document.createElement('script');
        sdk.src = 'https://dapi.kakao.com/v2/maps/sdk.js?appkey=' + encodeURIComponent(KAKAO_KEY) + '&autoload=false';
        sdk.onload = function () {
            try {
                kakao.maps.load(function () {
                    if (started) return;
                    try { start(kakaoAdapter()); }
                    catch (e) { startLeaflet('카카오맵을 시작하지 못해 기본 지도로 표시합니다. 키와 도메인 설정을 확인하세요.'); }
                });
            } catch (e) {
                startLeaflet('카카오맵을 시작하지 못해 기본 지도로 표시합니다. 키와 도메인 설정을 확인하세요.');
            }
        };
        sdk.onerror = function () { startLeaflet('카카오맵을 불러오지 못해 기본 지도로 표시합니다.'); };
        document.head.appendChild(sdk);
        setTimeout(function () { startLeaflet('카카오맵 응답이 없어 기본 지도로 표시합니다.'); }, 8000);
    } else {
        startLeaflet();
    }
})();
</script>
</body>
</html>