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
<title>마이페이지 - GPS 관제 센터</title>
<style>
    :root {
        --ink: #1d2733; --paper: #f6f5f2; --line: #dcd9d2; --muted: #6b7480;
        --signal: #1f6feb; --stale: #c77d0a; --danger: #c0392b;
    }
    * { box-sizing: border-box; }
    [hidden] { display: none !important; }
    html, body { margin: 0; min-height: 100%; }
    body {
        font-family: "Pretendard", "Noto Sans KR", "Malgun Gothic", -apple-system, "Segoe UI", sans-serif;
        font-size: 14px; color: var(--ink); background: var(--paper);
    }
    button, input { font: inherit; color: inherit; }
    :focus-visible { outline: 2px solid var(--signal); outline-offset: 2px; }

    header {
        height: 52px; padding: 0 16px; display: flex; align-items: center; justify-content: space-between;
        background: var(--ink); color: #fff;
    }
    header .logo { color: #fff; text-decoration: none; font-size: 16px; font-weight: 700; }
    header .right { display: flex; align-items: center; gap: 10px; font-size: 13px; }
    header .right a, header .right button {
        color: #fff; text-decoration: none; background: #3a4757; border: 0;
        padding: 6px 10px; border-radius: 4px; cursor: pointer; font-size: 13px;
    }
    header .right a:hover, header .right button:hover { background: #2b6cb0; }

    main { max-width: 900px; margin: 0 auto; padding: 24px 16px 64px; }
    h1 { margin: 0 0 4px; font-size: 22px; }
    .lead { margin: 0 0 8px; color: var(--muted); }
    section { padding: 22px 0; border-bottom: 1px solid var(--line); }
    section:last-child { border-bottom: 0; }
    h2 { margin: 0 0 12px; font-size: 16px; }

    dl { display: grid; grid-template-columns: 110px 1fr; row-gap: 8px; margin: 0; }
    dt { color: var(--muted); }
    dd { margin: 0; }

    .addrow { display: flex; gap: 8px; margin-bottom: 14px; flex-wrap: wrap; }
    input[type=text] { border: 1px solid var(--line); background: #fff; border-radius: 4px; padding: 7px 9px; width: min(280px, 100%); }
    .btn { border: 1px solid var(--line); background: #fff; padding: 6px 12px; border-radius: 4px; cursor: pointer; }
    .btn:hover { border-color: #aeb4bc; }
    .btn.primary { background: var(--ink); border-color: var(--ink); color: #fff; }
    .btn.danger { color: var(--danger); }
    .msg { min-height: 18px; margin: 0 0 8px; font-size: 13px; }
    .msg.err { color: var(--danger); }
    .msg.ok { color: #1a7f37; }

    .scroll { overflow-x: auto; }
    table { width: 100%; border-collapse: collapse; background: #fff; border: 1px solid var(--line); }
    th, td { text-align: left; padding: 9px 10px; border-bottom: 1px solid var(--line); vertical-align: middle; }
    th { background: #efeeea; font-weight: 600; white-space: nowrap; }
    td.mono { font-family: Consolas, "Courier New", monospace; font-size: 13px; word-break: break-all; }
    tr:last-child td { border-bottom: 0; }
    .dot { display: inline-block; width: 9px; height: 9px; border-radius: 50%; background: #8a8f98; margin-right: 6px; }
    .dot.online { background: var(--signal); }
    .dot.offline { background: var(--stale); }
    .empty { padding: 18px; color: var(--muted); background: #fff; border: 1px dashed var(--line); }
    pre { margin: 0; padding: 12px; background: #fff; border: 1px solid var(--line); border-radius: 4px; white-space: pre-wrap; word-break: break-all; font-size: 13px; }
</style>
</head>
<body>

<header>
    <a class="logo" href="<%= request.getContextPath() %>/index.jsp">GPS 관제 센터</a>
    <div class="right">
        <a href="<%= request.getContextPath() %>/index.jsp">관제 화면</a>
        <button type="button" id="logoutBtn">로그아웃</button>
    </div>
</header>

<main>
    <h1>마이페이지</h1>
    <p class="lead">내 계정과 등록한 기기를 관리합니다.</p>

    <section>
        <h2>내 계정</h2>
        <dl>
            <dt>아이디</dt><dd><strong><%= esc(loginUser) %></strong></dd>
        </dl>
    </section>

    <section>
        <h2>내 기기 <span id="count" style="color:var(--muted);font-weight:400"></span></h2>
        <form class="addrow" id="addForm">
            <input type="text" id="devName" maxlength="30" placeholder="새 기기 이름 (예: 우리집 강아지)" required>
            <button type="submit" class="btn primary">기기 추가</button>
        </form>
        <p class="msg" id="msg" role="status"></p>
        <div id="tableWrap"><div class="empty">불러오는 중...</div></div>
    </section>

    <section>
        <h2>위치 전송 주소</h2>
        <p class="lead">기기(또는 시뮬레이터)가 이 주소로 deviceId, token, lat, lng 를 POST 하면 위치가 기록됩니다.</p>
        <pre id="endpoint"></pre>
    </section>
</main>

<script>
(function () {
    'use strict';
    var CTX = '<%= request.getContextPath() %>';
    function $(id) { return document.getElementById(id); }
    function esc(s) {
        return String(s).replace(/[&<>"']/g, function (c) {
            return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
        });
    }
    function ago(ms) {
        var s = Math.max(0, Math.round(ms / 1000));
        if (s < 5) return '방금 전';
        if (s < 60) return s + '초 전';
        var m = Math.floor(s / 60);
        if (m < 60) return m + '분 전';
        var h = Math.floor(m / 60);
        if (h < 24) return h + '시간 전';
        return Math.floor(h / 24) + '일 전';
    }
    function say(text, kind) {
        var m = $('msg');
        m.textContent = text || '';
        m.className = 'msg' + (kind ? ' ' + kind : '');
    }

    function api(path, opts) {
        opts = opts || {};
        opts.credentials = 'same-origin';
        opts.headers = { 'X-Requested-With': 'fetch' };
        return fetch(CTX + '/api' + path, opts).then(function (r) {
            if (r.status === 401) { location.href = CTX + '/login.jsp'; throw new Error('unauthorized'); }
            return r.json().then(function (j) {
                if (!r.ok) throw new Error(j && j.error ? j.error : 'HTTP ' + r.status);
                return j;
            }, function () { throw new Error('HTTP ' + r.status); });
        });
    }
    function post(path, params) {
        return api(path, { method: 'POST', body: new URLSearchParams(params || {}) });
    }

    var mine = [];

    function render(now) {
        $('count').textContent = mine.length ? '(' + mine.length + '개)' : '';
        if (!mine.length) {
            $('tableWrap').innerHTML = '<div class="empty">등록한 기기가 없습니다. 위에서 이름을 입력하고 기기 추가를 누르세요.</div>';
            return;
        }
        var rows = mine.map(function (d) {
            var status = !d.last ? 'none' : (now - d.last.ts > 60000 ? 'offline' : 'online');
            var seen = d.last ? ago(now - d.last.ts) : '수신 전';
            return '<tr data-id="' + esc(d.id) + '">' +
                '<td><strong>' + esc(d.name) + '</strong></td>' +
                '<td class="mono">' + esc(d.id) + '</td>' +
                '<td><span class="dot ' + status + '"></span>' + esc(seen) + '</td>' +
                '<td class="mono"><span data-token="' + esc(d.token) + '">••••••••••••</span> ' +
                    '<button type="button" class="btn" data-act="token">보기</button></td>' +
                '<td><button type="button" class="btn danger" data-act="delete">삭제</button></td>' +
                '</tr>';
        }).join('');
        $('tableWrap').innerHTML = '<div class="scroll"><table><thead><tr>' +
            '<th>이름</th><th>기기 ID</th><th>마지막 수신</th><th>토큰</th><th>관리</th>' +
            '</tr></thead><tbody>' + rows + '</tbody></table></div>';
    }

    function load() {
        return api('/devices').then(function (res) {
            mine = res.devices.filter(function (d) { return d.mine; });
            render(res.now);
        }).catch(function (e) {
            if (e.message !== 'unauthorized') $('tableWrap').innerHTML = '<div class="empty">기기 목록을 불러오지 못했습니다: ' + esc(e.message) + '</div>';
        });
    }

    $('addForm').addEventListener('submit', function (e) {
        e.preventDefault();
        say('');
        post('/devices', { name: $('devName').value })
            .then(function (nd) {
                $('devName').value = '';
                say('"' + nd.name + '" 기기를 추가했습니다. 아래 표에서 기기 ID와 토큰을 확인하세요.', 'ok');
                return load();
            })
            .catch(function (err) { say(err.message, 'err'); });
    });

    $('tableWrap').addEventListener('click', function (e) {
        var btn = e.target.closest('button[data-act]');
        if (!btn) return;
        var tr = btn.closest('tr');
        var id = tr.getAttribute('data-id');
        if (btn.getAttribute('data-act') === 'token') {
            var span = tr.querySelector('span[data-token]');
            var shown = btn.textContent === '숨기기';
            span.textContent = shown ? '••••••••••••' : span.getAttribute('data-token');
            btn.textContent = shown ? '보기' : '숨기기';
        } else if (btn.getAttribute('data-act') === 'delete') {
            if (!confirm('이 기기를 삭제할까요? 위치 기록도 함께 사라집니다.')) return;
            post('/devices/' + encodeURIComponent(id) + '/delete')
                .then(function () { say('기기를 삭제했습니다.', 'ok'); return load(); })
                .catch(function (err) { say(err.message, 'err'); });
        }
    });

    $('logoutBtn').addEventListener('click', function () {
        function go() { location.href = CTX + '/login.jsp'; }
        fetch(CTX + '/api/logout', {
            method: 'POST', credentials: 'same-origin', headers: { 'X-Requested-With': 'fetch' }
        }).then(go, go);
    });

    $('endpoint').textContent = 'POST ' + location.origin + CTX + '/api/location\n' +
        '필수: deviceId, token, lat, lng    선택: speed(km/h), battery(0~100)';

    load();
})();
</script>
</body>
</html>
