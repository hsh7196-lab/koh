/* ==========================================================
   Gpstracker 화면 로직
   - 위치는 서버(WebSocket)가 없으면 시뮬레이션으로 움직여요.
   - 서버를 연결하면 window.GPS_CONFIG = { wsUrl, devicesUrl } 만 채우면 돼요.
     웹소켓 메시지 형식: { "id":"d1", "lat":37.56, "lng":126.97, "battery":82, "ts":1730000000000 }
   - 경로, 안전구역, 알림, 공유 링크는 지금은 브라우저(localStorage)에 저장해요.
   ========================================================== */
(function () {
  'use strict';

  /* ---------- 설정 ---------- */
  var CFG = {
    wsUrl: '',                       // 예: 'ws://localhost:8282/Gpstracker/ws/location'
    devicesUrl: '',                  // 예: '/Gpstracker/api/devices' -> [{id,name,color,battery,lat,lng}]
    center: [37.5665, 126.9780],
    offlineAfterMs: 30000,           // 이 시간 동안 신호가 없으면 "신호 없음" (실제 서비스에서는 5분 정도로)
    intervalMs: { live: 3000, saver: 10000, lost: 1000 },
    lowBattery: 20,
    historyDays: 30
  };
  Object.assign(CFG, window.GPS_CONFIG || {});

  var CTX = document.body.dataset.ctx || '';
  var BOOT = Date.now();

  var COLORS = ['#c9a96b', '#86c3a3', '#8fa8d8', '#d89aa6', '#b39ddb', '#d8b08c'];

  /* 시뮬레이션용 기본 기기 (서버를 연결하면 devicesUrl 결과로 대체돼요) */
  var DEFAULT_DEVICES = [
    {
      id: 'd1', name: '아이 가방', color: COLORS[0], battery: 86, speed: 30, drain: 0.03,
      path: [[37.5663, 126.9779], [37.5575, 126.9830], [37.5450, 126.9960], [37.5330, 127.0110], [37.5160, 127.0200], [37.4979, 127.0276]]
    },
    {
      id: 'd2', name: '자전거', color: COLORS[1], battery: 64, speed: 18, drain: 0.03,
      path: [[37.5110, 126.9960], [37.5120, 127.0100], [37.5150, 127.0250], [37.5200, 127.0400]]
    },
    {
      id: 'd3', name: '차량', color: COLORS[2], battery: 20.5, speed: 6, drain: 0.12,
      path: [[37.5219, 126.9245], [37.5230, 126.9290], [37.5215, 126.9330], [37.5190, 126.9300]],
      blackout: [45000, 110000]      // 부팅 45~110초 사이에는 신호가 끊긴 것처럼 보여줘요 (알림 확인용)
    }
  ];

  var TYPE = {
    exit:    { tone: 'bad',  group: 'zone',  title: '안전구역을 벗어났어요' },
    enter:   { tone: 'ok',   group: 'zone',  title: '안전구역에 들어왔어요' },
    lowbat:  { tone: 'warn', group: 'state', title: '배터리가 얼마 남지 않았어요' },
    offline: { tone: 'bad',  group: 'state', title: '신호가 끊겼어요' },
    online:  { tone: 'ok',   group: 'state', title: '신호가 다시 잡혔어요' },
    lost:    { tone: 'bad',  group: 'state', title: '분실 모드가 켜졌어요' },
    found:   { tone: 'ok',   group: 'state', title: '분실 모드를 껐어요' }
  };

  var K = {
    devs: 'gpst.devs.v1', zones: 'gpst.zones.v1', events: 'gpst.events.v1',
    shares: 'gpst.shares.v1', history: 'gpst.history.v1', notif: 'gpst.notif.v1'
  };

  /* ---------- 도우미 ---------- */
  function $(s, r) { return (r || document).querySelector(s); }
  function $$(s, r) { return Array.prototype.slice.call((r || document).querySelectorAll(s)); }

  function load(k, f) { try { var v = localStorage.getItem(k); return v ? JSON.parse(v) : f; } catch (e) { return f; } }
  function save(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch (e) { /* 저장 공간이 없으면 무시 */ } }

  function esc(s) {
    return String(s).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  }

  function dist(a, b) {
    var R = 6371000, t = Math.PI / 180;
    var dLat = (b[0] - a[0]) * t, dLng = (b[1] - a[1]) * t;
    var x = Math.sin(dLat / 2) * Math.sin(dLat / 2) +
            Math.cos(a[0] * t) * Math.cos(b[0] * t) * Math.sin(dLng / 2) * Math.sin(dLng / 2);
    return 2 * R * Math.asin(Math.sqrt(x));
  }

  function pad(n) { return String(n).padStart(2, '0'); }
  function dayKey(ts) { var d = new Date(ts); return d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate()); }
  function hhmm(ts) { var d = new Date(ts); return pad(d.getHours()) + ':' + pad(d.getMinutes()); }

  function fmtWhen(ts) {
    var d = new Date(ts);
    if (dayKey(ts) === dayKey(Date.now())) return hhmm(ts);
    return (d.getMonth() + 1) + '월 ' + d.getDate() + '일 ' + hhmm(ts);
  }

  function ago(ts) {
    var s = Math.max(0, Math.floor((Date.now() - ts) / 1000));
    if (s < 5) return '방금 전';
    if (s < 60) return s + '초 전';
    if (s < 3600) return Math.floor(s / 60) + '분 전';
    if (s < 86400) return Math.floor(s / 3600) + '시간 전';
    return Math.floor(s / 86400) + '일 전';
  }

  function fmtDist(m) { return m < 1000 ? Math.round(m) + 'm' : (m / 1000).toFixed(1) + 'km'; }

  function fmtDur(ms) {
    var m = Math.round(ms / 60000);
    if (m < 1) return '1분 미만';
    if (m < 60) return m + '분';
    var h = Math.floor(m / 60), r = m % 60;
    return r ? h + '시간 ' + r + '분' : h + '시간';
  }

  function remain(ts) {
    var s = Math.max(0, Math.floor((ts - Date.now()) / 1000));
    if (s >= 3600) return Math.floor(s / 3600) + '시간 ' + Math.floor((s % 3600) / 60) + '분 남음';
    if (s >= 60) return Math.floor(s / 60) + '분 남음';
    return s + '초 남음';
  }

  function randToken() {
    var a = new Uint8Array(12);
    (window.crypto || window.msCrypto).getRandomValues(a);
    return Array.prototype.map.call(a, function (b) { return b.toString(36).padStart(2, '0'); }).join('').slice(0, 18);
  }

  /* ---------- 상태 ---------- */
  var S = {
    devices: [],
    zones: load(K.zones, null),
    events: load(K.events, []),
    shares: load(K.shares, []),
    selectedId: null,
    tab: 'route',
    filter: 'all',
    adding: false,
    wsOk: false,
    notif: false,
    replay: { pts: [], i: 0, playing: false, speed: 4, timer: null, line: null, ghost: null, marks: [] }
  };

  var H = load(K.history, {});     // { 기기id: { '2026-10-27': [[ts,lat,lng], ...] } }
  var dirtyH = false;

  function byId(id) { return S.devices.filter(function (d) { return d.id === id; })[0]; }
  function cur() { return byId(S.selectedId); }

  /* ---------- 지도 ---------- */
  var map = L.map('map', { zoomControl: false, attributionControl: true }).setView(CFG.center, 12);
  L.control.zoom({ position: 'bottomright' }).addTo(map);

  var tiles = {
    dark: L.tileLayer('https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png', {
      maxZoom: 19, subdomains: 'abcd',
      attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> &copy; <a href="https://carto.com/attributions">CARTO</a>'
    }),
    light: L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
      maxZoom: 19,
      attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
    })
  };
  var tileKey = load('gpst.tile', 'dark');
  if (!tiles[tileKey]) tileKey = 'dark';
  tiles[tileKey].addTo(map);

  $('#m-style').addEventListener('click', function () {
    map.removeLayer(tiles[tileKey]);
    tileKey = tileKey === 'dark' ? 'light' : 'dark';
    tiles[tileKey].addTo(map);
    save('gpst.tile', tileKey);
  });

  $('#m-fit').addEventListener('click', fitAll);

  function fitAll() {
    var pts = S.devices.filter(function (d) { return d.lat != null; }).map(function (d) { return [d.lat, d.lng]; });
    if (!pts.length) return;
    if (pts.length === 1) { map.flyTo(pts[0], 15, { duration: .8 }); return; }
    map.flyToBounds(L.latLngBounds(pts), { padding: [70, 70], duration: .8, maxZoom: 15 });
  }

  /* ---------- 기기 ---------- */
  function prepPath(d) {
    d.cum = [0];
    for (var i = 1; i < d.path.length; i++) d.cum.push(d.cum[i - 1] + dist(d.path[i - 1], d.path[i]));
    d.total = d.cum[d.cum.length - 1];
    d.s = 0; d.dir = 1;
  }

  function posAt(d, s) {
    var c = d.cum, i = 1;
    while (i < c.length - 1 && c[i] < s) i++;
    var seg = (c[i] - c[i - 1]) || 1;
    var f = Math.min(1, Math.max(0, (s - c[i - 1]) / seg));
    var a = d.path[i - 1], b = d.path[i];
    return [a[0] + (b[0] - a[0]) * f, a[1] + (b[1] - a[1]) * f];
  }

  function makeDevice(def, custom) {
    var d = Object.assign({
      lat: null, lng: null, battery: 100, online: true, lost: false, mode: 'live',
      kmh: 0, lastSeen: Date.now(), lastTick: 0, inside: {}, trail: [], lowSent: false
    }, def, custom || {});
    if (d.path && d.path.length > 1) {
      prepPath(d);
      if (d.lat == null) { d.lat = d.path[0][0]; d.lng = d.path[0][1]; }
    }
    return d;
  }

  function saveDevs() {
    var out = {};
    S.devices.forEach(function (d) { out[d.id] = { name: d.name, color: d.color, lost: d.lost, mode: d.mode }; });
    save(K.devs, out);
  }

  function loadDevices() {
    var custom = load(K.devs, {});
    function build(list) { return list.map(function (def) { return makeDevice(def, custom[def.id]); }); }
    if (!CFG.devicesUrl) return Promise.resolve(build(DEFAULT_DEVICES));
    return fetch(CFG.devicesUrl, { credentials: 'same-origin' })
      .then(function (r) { if (!r.ok) throw new Error(r.status); return r.json(); })
      .then(function (list) { return build(list.map(function (x) { return Object.assign({ color: COLORS[0] }, x); })); })
      .catch(function () { return build(DEFAULT_DEVICES); });
  }

  function intervalFor(d) { return d.lost ? CFG.intervalMs.lost : (d.mode === 'saver' ? CFG.intervalMs.saver : CFG.intervalMs.live); }

  function stateText(d, withSpeed) {
    if (!d.online) return '신호 없음';
    if (d.lost) return '분실 모드';
    if (d.kmh > 2) return withSpeed ? '이동 중, 시속 ' + Math.round(d.kmh) + 'km' : '이동 중';
    return '정지';
  }

  /* ---------- 위치 수신 (시뮬레이션과 서버 공통 입구) ---------- */
  function applyFix(fix) {
    var d = byId(fix.id);
    if (!d || typeof fix.lat !== 'number' || typeof fix.lng !== 'number') return;
    var ts = fix.ts || Date.now();

    if (d.lat != null && d.lastFixTs) {
      var dt = (ts - d.lastFixTs) / 1000;
      d.kmh = dt > 0 ? dist([d.lat, d.lng], [fix.lat, fix.lng]) / dt * 3.6 : 0;
    }
    d.lat = fix.lat; d.lng = fix.lng; d.lastFixTs = ts; d.lastSeen = Date.now();
    if (typeof fix.battery === 'number') d.battery = fix.battery;

    if (!d.online) {
      d.online = true;
      pushEvent(d, 'online', '다시 위치를 받고 있어요');
    }

    d.trail.push([d.lat, d.lng]);
    if (d.trail.length > 40) d.trail.shift();

    record(d, ts);
    checkZones(d);
    checkBattery(d);
    updateMarker(d);

    if (d.id === S.selectedId) { drawTrail(); }
    paintDevList();
    paintFocus();
  }

  function checkBattery(d) {
    if (d.battery <= CFG.lowBattery && !d.lowSent) {
      d.lowSent = true;
      pushEvent(d, 'lowbat', '배터리 ' + Math.round(d.battery) + '% 남았어요');
    } else if (d.battery > CFG.lowBattery + 8) {
      d.lowSent = false;
    }
  }

  function checkZones(d) {
    S.zones.forEach(function (z) {
      var inside = dist([d.lat, d.lng], [z.lat, z.lng]) <= z.r;
      var prev = d.inside[z.id];
      d.inside[z.id] = inside;
      if (prev === undefined || !z.notify || prev === inside) return;
      pushEvent(d, inside ? 'enter' : 'exit',
        inside ? '‘' + z.name + '’ 안으로 들어왔어요' : '‘' + z.name + '’ 반경 ' + z.r + 'm 밖으로 나갔어요');
    });
  }

  /* ---------- 경로 기록 ---------- */
  function record(d, ts) {
    var day = dayKey(ts);
    var byDay = H[d.id] || (H[d.id] = {});
    var arr = byDay[day] || (byDay[day] = []);
    var last = arr[arr.length - 1];
    if (last && dist([last[1], last[2]], [d.lat, d.lng]) < 5 && ts - last[0] < 60000) return;
    arr.push([ts, +d.lat.toFixed(6), +d.lng.toFixed(6)]);
    if (arr.length > 3000) arr.shift();
    dirtyH = true;
  }

  function pruneHistory() {
    var limit = Date.now() - CFG.historyDays * 86400000;
    Object.keys(H).forEach(function (id) {
      Object.keys(H[id]).forEach(function (day) {
        var t = new Date(day + 'T00:00:00').getTime();
        if (!isNaN(t) && t < limit) { delete H[id][day]; dirtyH = true; }
      });
    });
  }

  /* 어제 기록이 없으면 샘플 경로를 만들어 재생 기능을 바로 써볼 수 있게 해요 */
  function seedYesterday(d) {
    if (!d.path) return;
    var y = new Date(); y.setDate(y.getDate() - 1);
    var day = dayKey(y.getTime());
    var byDay = H[d.id] || (H[d.id] = {});
    if (byDay[day]) return;
    var t0 = new Date(y.getFullYear(), y.getMonth(), y.getDate(), 8, 30).getTime();
    var arr = [], s = 0, dir = 1;
    for (var k = 0; k < 70; k++) {
      s += dir * (d.speed / 3.6) * 20;
      if (s >= d.total) { s = d.total; dir = -1; }
      if (s <= 0) { s = 0; dir = 1; }
      var p = posAt(d, s);
      arr.push([t0 + k * 20000, +p[0].toFixed(6), +p[1].toFixed(6)]);
    }
    byDay[day] = arr;
    dirtyH = true;
  }

  /* ---------- 마커 ---------- */
  function updateMarker(d) {
    if (d.lat == null) return;
    var cls = 'pin' + (d.id === S.selectedId ? ' sel' : '') + (!d.online ? ' off' : '') + (d.lost ? ' lost' : '');
    var sig = cls + '|' + d.color + '|' + d.name;
    var ll = [d.lat, d.lng];

    if (!d.marker) {
      d.marker = L.marker(ll, { riseOnHover: true, keyboard: false })
        .addTo(map)
        .on('click', function () { select(d.id); });
      d.marker.bindTooltip(esc(d.name), { direction: 'top', offset: [0, -20] });
    } else {
      d.marker.setLatLng(ll);
    }
    if (d._sig !== sig) {
      d._sig = sig;
      d.marker.setIcon(L.divIcon({
        className: 'pin-wrap', iconSize: [34, 34], iconAnchor: [17, 17],
        html: '<div class="' + cls + '" style="--dc:' + d.color + '"><i></i><b>' + esc(d.name.charAt(0)) + '</b></div>'
      }));
      d.marker.setTooltipContent(esc(d.name));
    }
  }

  var trailLine = null;
  function drawTrail() {
    var d = cur();
    if (trailLine) { map.removeLayer(trailLine); trailLine = null; }
    if (!d || d.trail.length < 2 || S.tab === 'route' && S.replay.pts.length > 1) return;
    trailLine = L.polyline(d.trail, { color: d.color, weight: 3, opacity: .45, dashArray: '2 7', lineCap: 'round', interactive: false }).addTo(map);
  }

  /* ---------- 기기 목록, 선택한 기기 ---------- */
  function renderDevList() {
    var box = $('#dev-list');
    box.innerHTML = S.devices.map(function (d) {
      return '<button type="button" class="dev" data-id="' + esc(d.id) + '" style="--c:' + d.color + '">' +
        '<span class="dev-dot"></span>' +
        '<span><span class="dev-name"></span><span class="dev-sub"></span></span>' +
        '<span class="dev-bat"></span></button>';
    }).join('');
    $$('.dev', box).forEach(function (b) {
      b.addEventListener('click', function () { select(b.dataset.id); });
    });
    paintDevList();
  }

  function paintDevList() {
    $$('#dev-list .dev').forEach(function (b) {
      var d = byId(b.dataset.id); if (!d) return;
      b.style.setProperty('--c', d.color);
      b.classList.toggle('off', !d.online);
      b.classList.toggle('lost', d.lost);
      if (d.id === S.selectedId) b.setAttribute('aria-current', 'true'); else b.removeAttribute('aria-current');
      $('.dev-name', b).textContent = d.name;
      $('.dev-sub', b).textContent = stateText(d, false);
      var bat = $('.dev-bat', b);
      bat.textContent = Math.round(d.battery) + '%';
      bat.classList.toggle('low', d.battery <= CFG.lowBattery);
    });
  }

  function paintFocus() {
    var d = cur();
    if (!d) return;
    $('#f-name').textContent = d.name;
    var st = $('#f-state');
    st.textContent = stateText(d, true);
    st.dataset.tone = !d.online || d.lost ? 'bad' : (d.kmh > 2 ? 'ok' : '');

    var pct = Math.max(0, Math.min(100, Math.round(d.battery)));
    $('#f-bat').textContent = pct + '%';
    var meter = $('#f-meter');
    meter.style.setProperty('--v', pct + '%');
    meter.classList.toggle('low', pct <= CFG.lowBattery);

    $('#f-ago').textContent = ago(d.lastSeen);
    $('#f-pos').textContent = d.lat != null ? d.lat.toFixed(5) + ', ' + d.lng.toFixed(5) : '-';

    var lost = $('#f-lost'); if (lost.checked !== d.lost) lost.checked = d.lost;
    var mode = $('#f-mode');
    if (mode.value !== d.mode) mode.value = d.mode;
    mode.disabled = d.lost;
    $('#f-mode-help').textContent = d.lost ? '분실 모드에서는 1초로 고정돼요.' : '짧을수록 정확하고 배터리를 더 써요.';
  }

  function select(id, opt) {
    S.selectedId = id;
    S.devices.forEach(function (d) { d._sig = null; updateMarker(d); });
    paintDevList();
    paintFocus();
    if (S.tab === 'route') loadRoute(); else drawTrail();
    var d = cur();
    if (d && d.lat != null && !(opt && opt.pan === false) && !(S.tab === 'route' && S.replay.pts.length > 1)) {
      map.flyTo([d.lat, d.lng], Math.max(map.getZoom(), 14), { duration: .8 });
    }
  }

  $('#f-lost').addEventListener('change', function (e) {
    var d = cur(); if (!d) return;
    d.lost = e.target.checked;
    d.lastTick = 0;     // 바로 다음 순간 위치를 받아요
    saveDevs();
    if (d.lost) pushEvent(d, 'lost', '1초마다 위치를 받고 있어요');
    else pushEvent(d, 'found', '평소 갱신 주기로 돌아갔어요');
    d._sig = null; updateMarker(d); paintDevList(); paintFocus();
  });

  $('#f-mode').addEventListener('change', function (e) {
    var d = cur(); if (!d) return;
    d.mode = e.target.value; saveDevs();
  });

  /* 기기 이름, 색상 */
  var dlgDev = $('#dlg-dev');
  $('#f-edit').addEventListener('click', function () {
    var d = cur(); if (!d) return;
    $('#dd-name').value = d.name;
    $('#dd-colors').innerHTML = COLORS.map(function (c, i) {
      return '<label style="--c:' + c + '"><input type="radio" name="dd-color" value="' + c + '"' +
        (c === d.color ? ' checked' : '') + ' aria-label="색상 ' + (i + 1) + '"><span></span></label>';
    }).join('');
    dlgDev.showModal();
    $('#dd-name').select();
  });
  $('#dd-cancel').addEventListener('click', function () { dlgDev.close(); });
  $('#dev-form').addEventListener('submit', function (e) {
    e.preventDefault();
    var d = cur(); if (!d) return;
    var name = $('#dd-name').value.trim();
    if (name) d.name = name;
    var c = $('input[name="dd-color"]:checked', dlgDev);
    if (c) d.color = c.value;
    d._sig = null; saveDevs(); updateMarker(d); paintDevList(); paintFocus(); renderEvents(); renderShares();
    dlgDev.close();
  });

  /* ---------- 탭 ---------- */
  function setTab(name) {
    S.tab = name;
    $$('.tab').forEach(function (t) { t.setAttribute('aria-selected', String(t.dataset.tab === name)); });
    ['route', 'zone', 'alert', 'share'].forEach(function (n) { $('#p-' + n).hidden = n !== name; });
    if (name === 'route') loadRoute(); else clearRoute();
    if (name !== 'zone' && S.adding) cancelAdd();
    drawTrail();
  }
  $$('.tab').forEach(function (t) { t.addEventListener('click', function () { setTab(t.dataset.tab); }); });

  /* ---------- 경로 재생 ---------- */
  var rDate = $('#r-date');
  var rRange = $('#r-range');

  function setDate(offsetDays) {
    var d = new Date(); d.setDate(d.getDate() - offsetDays);
    rDate.value = dayKey(d.getTime());
    loadRoute();
  }
  rDate.max = dayKey(Date.now());
  rDate.value = dayKey(Date.now());
  rDate.addEventListener('change', loadRoute);
  $$('#r-quick button').forEach(function (b) {
    b.addEventListener('click', function () { setDate(+b.dataset.day); });
  });

  function clearRoute() {
    stopReplay();
    var R = S.replay;
    [R.line, R.ghost].concat(R.marks).forEach(function (l) { if (l) map.removeLayer(l); });
    R.line = R.ghost = null; R.marks = []; R.pts = [];
    $('#replay-chip').hidden = true;
  }

  function loadRoute() {
    clearRoute();
    var d = cur(); if (!d) return;
    var pts = ((H[d.id] || {})[rDate.value]) || [];
    var has = pts.length > 1;
    $('#r-empty').hidden = has;
    $('#r-body').hidden = !has;
    if (!has) { drawTrail(); return; }

    var R = S.replay;
    R.pts = pts; R.i = 0;
    var ll = pts.map(function (p) { return [p[1], p[2]]; });

    R.line = L.polyline(ll, { color: d.color, weight: 4, opacity: .9, lineJoin: 'round', interactive: false }).addTo(map);
    R.marks = [
      L.circleMarker(ll[0], { radius: 5, color: d.color, weight: 2, fillColor: '#0e1512', fillOpacity: 1, interactive: false }).addTo(map),
      L.circleMarker(ll[ll.length - 1], { radius: 5, color: d.color, weight: 2, fillColor: d.color, fillOpacity: 1, interactive: false }).addTo(map)
    ];
    R.ghost = L.circleMarker(ll[0], { radius: 8, color: '#e2c88f', weight: 3, fillColor: '#0e1512', fillOpacity: 1, className: 'ghost-dot', interactive: false }).addTo(map);
    map.flyToBounds(R.line.getBounds(), { padding: [70, 70], duration: .7, maxZoom: 16 });

    var total = 0;
    for (var i = 1; i < ll.length; i++) total += dist(ll[i - 1], ll[i]);
    $('#r-dist').textContent = fmtDist(total);
    $('#r-dur').textContent = fmtDur(pts[pts.length - 1][0] - pts[0][0]);
    $('#r-count').textContent = pts.length + '개';

    rRange.max = pts.length - 1;
    setReplayIndex(0);
    drawTrail();
  }

  function setReplayIndex(i) {
    var R = S.replay; if (!R.pts.length) return;
    R.i = Math.max(0, Math.min(R.pts.length - 1, Math.round(i)));
    var p = R.pts[R.i];
    R.ghost.setLatLng([p[1], p[2]]);
    rRange.value = R.i;
    $('#r-time').textContent = hhmm(p[0]);
    var chip = $('#replay-chip');
    chip.textContent = hhmm(p[0]) + ' 위치';
    chip.hidden = false;
  }
  rRange.addEventListener('input', function () { setReplayIndex(+rRange.value); });

  function stopReplay() {
    var R = S.replay;
    if (R.timer) { clearInterval(R.timer); R.timer = null; }
    R.playing = false;
    var btn = $('#r-play');
    btn.setAttribute('aria-label', '재생');
    btn.innerHTML = '<svg class="i"><use href="#i-play"/></svg>';
  }

  function startReplay() {
    var R = S.replay; if (R.pts.length < 2) return;
    if (R.i >= R.pts.length - 1) setReplayIndex(0);
    R.playing = true;
    var btn = $('#r-play');
    btn.setAttribute('aria-label', '일시정지');
    btn.innerHTML = '<svg class="i"><use href="#i-pause"/></svg>';
    R.timer = setInterval(function () {
      if (R.i >= R.pts.length - 1) { stopReplay(); return; }
      setReplayIndex(R.i + R.speed);
      if (!map.getBounds().contains(R.ghost.getLatLng())) map.panTo(R.ghost.getLatLng(), { animate: true });
    }, 90);
  }

  $('#r-play').addEventListener('click', function () { if (S.replay.playing) stopReplay(); else startReplay(); });
  $('#r-reset').addEventListener('click', function () { setReplayIndex(0); });
  $$('#r-speed button').forEach(function (b) {
    b.addEventListener('click', function () {
      S.replay.speed = +b.dataset.speed;
      $$('#r-speed button').forEach(function (x) { x.setAttribute('aria-pressed', String(x === b)); });
    });
  });

  /* ---------- 안전구역 ---------- */
  var zoneLayers = {};
  var dlgZone = $('#dlg-zone');
  var preview = null, pendingLL = null;

  if (!S.zones) {
    // 처음 열었을 때 한 곳만 만들어 둬요. 아이 가방이 출발 직후 이 구역을 벗어나요.
    S.zones = [{ id: 'z-demo', name: '서울시청', lat: 37.5663, lng: 126.9779, r: 300, notify: true }];
    save(K.zones, S.zones);
  }

  function drawZones() {
    Object.keys(zoneLayers).forEach(function (id) { map.removeLayer(zoneLayers[id]); });
    zoneLayers = {};
    S.zones.forEach(function (z) {
      zoneLayers[z.id] = L.circle([z.lat, z.lng], {
        radius: z.r, color: '#c9a96b', weight: 1.5, dashArray: '5 7',
        fillColor: '#c9a96b', fillOpacity: z.notify ? .09 : .03, opacity: z.notify ? .9 : .4, interactive: false
      }).addTo(map);
    });
  }

  function renderZones() {
    $('#z-empty').hidden = S.zones.length > 0;
    $('#z-list').innerHTML = S.zones.map(function (z) {
      return '<li class="zone" data-id="' + esc(z.id) + '">' +
        '<button type="button" class="zone-main" data-act="go"><strong>' + esc(z.name) + '</strong><span>반경 ' + z.r + 'm</span></button>' +
        '<label class="switch"><span class="sr">' + esc(z.name) + ' 알림</span>' +
        '<input type="checkbox" data-act="notify"' + (z.notify ? ' checked' : '') + '><span></span></label>' +
        '<button type="button" class="btn icon ghost danger" data-act="del" aria-label="' + esc(z.name) + ' 삭제"><svg class="i"><use href="#i-trash"/></svg></button>' +
        '</li>';
    }).join('');
  }

  function persistZones() { save(K.zones, S.zones); drawZones(); renderZones(); }

  $('#z-list').addEventListener('click', function (e) {
    var li = e.target.closest('.zone'); if (!li) return;
    var z = S.zones.filter(function (x) { return x.id === li.dataset.id; })[0]; if (!z) return;
    var act = e.target.closest('[data-act]'); if (!act) return;
    if (act.dataset.act === 'go') {
      map.flyToBounds(zoneLayers[z.id].getBounds(), { padding: [80, 80], duration: .7 });
    } else if (act.dataset.act === 'del') {
      S.zones = S.zones.filter(function (x) { return x !== z; });
      S.devices.forEach(function (d) { delete d.inside[z.id]; });
      persistZones();
      toast({ type: 'online', title: '안전구역을 삭제했어요', body: '‘' + z.name + '’' }, null, true);
    }
  });
  $('#z-list').addEventListener('change', function (e) {
    var li = e.target.closest('.zone'); if (!li || e.target.dataset.act !== 'notify') return;
    var z = S.zones.filter(function (x) { return x.id === li.dataset.id; })[0]; if (!z) return;
    z.notify = e.target.checked; persistZones();
  });

  function startAdd() {
    S.adding = true;
    $('#map').classList.add('crosshair');
    $('#banner').hidden = false;
  }
  function cancelAdd() {
    S.adding = false;
    $('#map').classList.remove('crosshair');
    $('#banner').hidden = true;
  }
  $('#z-add').addEventListener('click', startAdd);
  $('#banner-cancel').addEventListener('click', cancelAdd);
  document.addEventListener('keydown', function (e) { if (e.key === 'Escape' && S.adding) cancelAdd(); });

  map.on('click', function (e) {
    if (!S.adding) return;
    cancelAdd();
    pendingLL = e.latlng;
    $('#dz-name').value = '안전구역 ' + (S.zones.length + 1);
    $('#dz-r').value = 300; $('#dz-out').textContent = '300m';
    preview = L.circle(pendingLL, { radius: 300, color: '#e2c88f', weight: 2, dashArray: '4 6', fillColor: '#e2c88f', fillOpacity: .1, interactive: false }).addTo(map);
    dlgZone.showModal();
    $('#dz-name').select();
  });

  $('#dz-r').addEventListener('input', function (e) {
    $('#dz-out').textContent = e.target.value + 'm';
    if (preview) preview.setRadius(+e.target.value);
  });
  $('#dz-cancel').addEventListener('click', function () { dlgZone.close(); });
  dlgZone.addEventListener('close', function () {
    if (preview) { map.removeLayer(preview); preview = null; }
  });
  $('#zone-form').addEventListener('submit', function (e) {
    e.preventDefault();
    if (!pendingLL) { dlgZone.close(); return; }
    var z = {
      id: 'z' + Date.now(), name: $('#dz-name').value.trim() || '안전구역',
      lat: pendingLL.lat, lng: pendingLL.lng, r: +$('#dz-r').value, notify: true
    };
    S.zones.push(z);
    // 지금 이미 안에 있는 기기는 알림을 보내지 않고 상태만 기록해요
    S.devices.forEach(function (d) { if (d.lat != null) d.inside[z.id] = dist([d.lat, d.lng], [z.lat, z.lng]) <= z.r; });
    persistZones();
    pendingLL = null;
    dlgZone.close();
  });

  /* ---------- 알림 ---------- */
  function pushEvent(d, type, body) {
    var e = {
      id: 'e' + Date.now() + Math.random().toString(36).slice(2, 6),
      type: type, devId: d.id, title: TYPE[type].title, body: body, ts: Date.now(), read: false
    };
    S.events.unshift(e);
    S.events = S.events.slice(0, 100);
    save(K.events, S.events);
    toast(e, d);
    renderEvents();
    desktopNotify(e, d);
  }

  function renderEvents() {
    var items = S.events.filter(function (e) { return S.filter === 'all' || (TYPE[e.type] && TYPE[e.type].group === S.filter); });
    $('#e-empty').hidden = items.length > 0;
    $('#e-list').innerHTML = items.map(function (e) {
      var d = byId(e.devId), t = TYPE[e.type] || { tone: 'warn' };
      return '<li class="ev tone-' + t.tone + (e.read ? '' : ' unread') + '" data-id="' + esc(e.id) + '">' +
        '<span class="ev-dot"></span>' +
        '<div><p class="ev-title">' + esc(e.title) + '</p><p class="ev-body">' + esc(d ? d.name : '삭제된 기기') + ': ' + esc(e.body) + '</p></div>' +
        '<time>' + fmtWhen(e.ts) + '</time></li>';
    }).join('');
    paintBadge();
  }

  function paintBadge() {
    var n = S.events.filter(function (e) { return !e.read; }).length;
    var b = $('#badge');
    b.hidden = n === 0;
    b.textContent = n > 99 ? '99+' : n;
  }

  $('#e-list').addEventListener('click', function (e) {
    var li = e.target.closest('.ev'); if (!li) return;
    var ev = S.events.filter(function (x) { return x.id === li.dataset.id; })[0]; if (!ev) return;
    ev.read = true; save(K.events, S.events);
    renderEvents();
    if (byId(ev.devId)) select(ev.devId);
  });
  $('#e-read').addEventListener('click', function () {
    S.events.forEach(function (e) { e.read = true; });
    save(K.events, S.events); renderEvents();
  });
  $$('#e-filter button').forEach(function (b) {
    b.addEventListener('click', function () {
      S.filter = b.dataset.f;
      $$('#e-filter button').forEach(function (x) { x.setAttribute('aria-pressed', String(x === b)); });
      renderEvents();
    });
  });

  function toast(e, d, silent) {
    var t = TYPE[e.type] || { tone: 'warn' };
    var el = document.createElement('div');
    el.className = 'toast tone-' + t.tone;
    el.innerHTML = '<strong>' + esc(e.title) + '</strong><span>' + esc((d ? d.name + ': ' : '') + e.body) + '</span>';
    var box = $('#toasts');
    box.appendChild(el);
    while (box.children.length > 4) box.removeChild(box.firstChild);
    setTimeout(function () { el.classList.add('out'); setTimeout(function () { el.remove(); }, 300); }, silent ? 2600 : 5000);
  }

  function desktopNotify(e, d) {
    if (!S.notif || !('Notification' in window) || Notification.permission !== 'granted') return;
    if (!document.hidden) return;
    try { new Notification(e.title, { body: (d ? d.name + ': ' : '') + e.body }); } catch (err) { /* 일부 브라우저는 생성자를 막아요 */ }
  }

  $('#e-notif').addEventListener('change', function (ev) {
    var box = ev.target;
    if (!box.checked) { S.notif = false; save(K.notif, false); return; }
    if (!('Notification' in window)) { box.checked = false; toast({ type: 'offline', title: '이 브라우저는 알림을 지원하지 않아요', body: '다른 브라우저에서 열어 보세요' }, null, true); return; }
    Notification.requestPermission().then(function (p) {
      S.notif = p === 'granted';
      box.checked = S.notif;
      save(K.notif, S.notif);
      if (!S.notif) toast({ type: 'offline', title: '알림이 허용되지 않았어요', body: '브라우저 주소창의 사이트 설정에서 허용해 주세요' }, null, true);
    });
  });

  /* ---------- 위치 공유 링크 ---------- */
  function renderShares() {
    var now = Date.now();
    S.shares = S.shares.filter(function (s) { return s.exp > now; });
    save(K.shares, S.shares);
    $('#s-empty').hidden = S.shares.length > 0;
    $('#s-list').innerHTML = S.shares.map(function (s) {
      var d = byId(s.devId);
      return '<li class="share" data-t="' + esc(s.token) + '">' +
        '<div class="share-main"><strong>' + esc(d ? d.name : '삭제된 기기') + '</strong><span class="js-remain" data-exp="' + s.exp + '">' + remain(s.exp) + '</span></div>' +
        '<button type="button" class="btn sm" data-act="copy"><svg class="i" style="width:15px;height:15px"><use href="#i-copy"/></svg>복사</button>' +
        '<button type="button" class="btn sm ghost danger" data-act="revoke">해제</button></li>';
    }).join('');
  }

  function shareUrl(token) { return location.origin + CTX + '/share.jsp?t=' + token; }

  function copyText(text) {
    if (navigator.clipboard && window.isSecureContext) return navigator.clipboard.writeText(text);
    return new Promise(function (resolve, reject) {
      var ta = document.createElement('textarea');
      ta.value = text; ta.style.position = 'fixed'; ta.style.opacity = '0';
      document.body.appendChild(ta); ta.select();
      try { document.execCommand('copy') ? resolve() : reject(); } catch (e) { reject(e); }
      ta.remove();
    });
  }

  $('#s-make').addEventListener('click', function () {
    var d = cur(); if (!d) return;
    var min = +$('#s-exp').value;
    var s = { token: randToken(), devId: d.id, exp: Date.now() + min * 60000 };
    S.shares.unshift(s);
    renderShares();
    copyText(shareUrl(s.token)).then(
      function () { toast({ type: 'online', title: '링크를 만들고 복사했어요', body: d.name + ', ' + (min >= 60 ? (min / 60) + '시간' : min + '분') + ' 동안 열려요' }, null, true); },
      function () { toast({ type: 'online', title: '링크를 만들었어요', body: '목록에서 복사 버튼을 눌러 주세요' }, null, true); }
    );
  });

  $('#s-list').addEventListener('click', function (e) {
    var li = e.target.closest('.share'); if (!li) return;
    var act = e.target.closest('[data-act]'); if (!act) return;
    var token = li.dataset.t;
    if (act.dataset.act === 'copy') {
      copyText(shareUrl(token)).then(
        function () { toast({ type: 'online', title: '링크를 복사했어요', body: '붙여넣어서 보내 주세요' }, null, true); },
        function () { toast({ type: 'offline', title: '복사하지 못했어요', body: '주소창 보안 연결(https)에서 다시 시도해 보세요' }, null, true); }
      );
    } else {
      S.shares = S.shares.filter(function (s) { return s.token !== token; });
      renderShares();
      toast({ type: 'online', title: '공유를 해제했어요', body: '이 링크로는 더 이상 볼 수 없어요' }, null, true);
    }
  });

  /* ---------- 서버 연결 (WebSocket) ---------- */
  var ws = null, wsTimer = null;

  function paintConn() {
    var c = $('#conn');
    c.textContent = S.wsOk ? '서버 연결됨' : (CFG.wsUrl ? '서버 연결 중, 시뮬레이션 표시' : '시뮬레이션 중');
    c.classList.toggle('live', S.wsOk);
  }

  function connectWs() {
    if (!CFG.wsUrl) return;
    var failed = false;
    function fail() {
      if (failed) return; failed = true;
      if (S.wsOk) { S.wsOk = false; paintConn(); }
      clearTimeout(wsTimer);
      wsTimer = setTimeout(connectWs, 10000);
    }
    try { ws = new WebSocket(CFG.wsUrl); } catch (e) { fail(); return; }
    ws.onopen = function () { S.wsOk = true; paintConn(); };
    ws.onmessage = function (m) {
      try {
        var data = JSON.parse(m.data);
        (Array.isArray(data) ? data : [data]).forEach(applyFix);
      } catch (e) { /* 형식이 다른 메시지는 건너뛰어요 */ }
    };
    ws.onerror = fail;
    ws.onclose = fail;
  }

  /* ---------- 시뮬레이션과 주기 작업 ---------- */
  function simStep(d, now) {
    var iv = intervalFor(d);
    if (now - d.lastTick < iv) return;
    var dt = Math.min(20, (now - d.lastTick) / 1000);
    if (!d.lastTick) dt = iv / 1000;
    d.lastTick = now;

    var el = now - BOOT;
    if (d.blackout && el >= d.blackout[0] && el < d.blackout[1]) return;   // 신호 끊김 흉내

    d.s += d.dir * (d.speed / 3.6) * dt;
    if (d.s >= d.total) { d.s = d.total; d.dir = -1; }
    if (d.s <= 0) { d.s = 0; d.dir = 1; }
    var p = posAt(d, d.s);
    d.battery = Math.max(1, d.battery - (d.drain || 0.03) * dt / 3);
    applyFix({ id: d.id, lat: p[0], lng: p[1], battery: d.battery, ts: now });
  }

  function tick() {
    var now = Date.now();
    S.devices.forEach(function (d) {
      if (!S.wsOk && d.path) simStep(d, now);
      if (d.online && now - d.lastSeen > CFG.offlineAfterMs) {
        d.online = false; d.kmh = 0;
        d._sig = null; updateMarker(d);
        pushEvent(d, 'offline', ago(d.lastSeen) + '부터 위치를 받지 못했어요');
      }
    });
    paintDevList();
    paintFocus();

    $$('.js-remain').forEach(function (el) { el.textContent = remain(+el.dataset.exp); });
    if (S.shares.some(function (s) { return s.exp <= now; })) renderShares();
  }

  setInterval(function () { if (dirtyH) { save(K.history, H); dirtyH = false; } }, 5000);
  window.addEventListener('pagehide', function () { if (dirtyH) save(K.history, H); });

  /* ---------- 시작 ---------- */
  loadDevices().then(function (list) {
    S.devices = list;
    pruneHistory();
    S.devices.forEach(seedYesterday);
    if (dirtyH) { save(K.history, H); dirtyH = false; }

    // 현재 상태를 기준으로 안전구역 안팎을 먼저 기록해 둬요 (시작하자마자 알림이 울리지 않도록)
    S.devices.forEach(function (d) {
      if (d.lat == null) return;
      S.zones.forEach(function (z) { d.inside[z.id] = dist([d.lat, d.lng], [z.lat, z.lng]) <= z.r; });
    });

    // 오늘 기록이 아직 없으면 샘플이 들어 있는 어제 경로를 먼저 보여줘요
    var first = S.devices[0];
    var todayPts = first && H[first.id] && H[first.id][dayKey(Date.now())];
    if (!todayPts || todayPts.length < 2) {
      var yd = new Date(); yd.setDate(yd.getDate() - 1);
      rDate.value = dayKey(yd.getTime());
    }

    S.notif = load(K.notif, false) && 'Notification' in window && Notification.permission === 'granted';
    $('#e-notif').checked = S.notif;

    renderDevList();
    drawZones();
    renderZones();
    renderEvents();
    renderShares();
    paintConn();

    S.devices.forEach(updateMarker);
    if (S.devices.length) select(S.devices[0].id, { pan: false });
    fitAll();
    setTab('route');

    connectWs();
    setInterval(tick, 1000);
  });

  // 서버 쪽에서 직접 시험해 볼 수 있게 열어 둬요 (개발자 도구 콘솔에서 Gpstracker.applyFix({...}))
  window.Gpstracker = { applyFix: applyFix, config: CFG };
})();