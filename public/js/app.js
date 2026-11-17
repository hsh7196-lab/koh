// ====================================================================
// GeoLive Realtime GPS Platform - Enhanced Core Application Logic
// ====================================================================

let map = null;
let currentTileLayer = null;
let currentMode = 'realtime'; // 'realtime' | 'history'
let autoFollow = true;
let isHudVisible = true;
let isSimulatorRunning = false;
let isLocalOnlyMode = false;

// Network Info
let serverInfo = { port: 8080, localIp: '192.168.0.10' };

// Authentication State
let currentUser = null;
let authToken = localStorage.getItem('geolive_token');

// Devices & Map Layers
let devicesList = [];
let selectedDeviceId = null;
const deviceMarkers = {}; // deviceId -> L.marker
const deviceTails = {};   // deviceId -> L.polyline
const deviceData = {};    // deviceId -> latest point object
let searchResultMarker = null;

// History Playback State
let historyPoints = [];
let historyStops = [];
let historyPolyline = null;
let historyStartMarker = null;
let historyEndMarker = null;
const historyStopMarkers = [];
let historyPlaybackMarker = null;

let isPlayingHistory = false;
let playbackIndex = 0;
let playbackSpeed = 1;
let playbackTimer = null;

// Built-in Popular Korean Landmarks for Instant Zero-Latency Search
const BUILTIN_LANDMARKS = [
  { name: '강남역 (서울)', lat: 37.4981, lng: 127.0276, desc: '서울특별시 강남구 테헤란로 지하 156' },
  { name: '서울역 (KTX)', lat: 37.5559, lng: 126.9723, desc: '서울특별시 중구 한강대로 405' },
  { name: '광화문 광장', lat: 37.5759, lng: 126.9768, desc: '서울특별시 종로구 세종대로 172' },
  { name: '여의도 한강공원', lat: 37.5284, lng: 126.9342, desc: '서울특별시 영등포구 여의동로 330' },
  { name: '홍대입구역', lat: 37.5575, lng: 126.9244, desc: '서울특별시 마포구 양화로 160' },
  { name: '잠실 롯데월드타워', lat: 37.5126, lng: 127.1025, desc: '서울특별시 송파구 올림픽로 300' },
  { name: '인천국제공항', lat: 37.4602, lng: 126.4407, desc: '인천광역시 중구 공항로 272' },
  { name: '김포국제공항', lat: 37.5587, lng: 126.7945, desc: '서울특별시 강서구 하늘길 38' },
  { name: '판교 테크노밸리', lat: 37.4018, lng: 127.1065, desc: '경기도 성남시 분당구 판교역로' },
  { name: '수원역', lat: 37.2657, lng: 127.0000, desc: '경기도 수원시 팔달구 덕영대로 924' },
  { name: '대전역 (KTX)', lat: 36.3315, lng: 127.4330, desc: '대전광역시 동구 중앙로 215' },
  { name: '대구 동성로', lat: 35.8698, lng: 128.5960, desc: '대구광역시 중구 동성로' },
  { name: '동대구역', lat: 35.8797, lng: 128.6285, desc: '대구광역시 동구 동대구로 550' },
  { name: '부산 해운대 해수욕장', lat: 35.1587, lng: 129.1604, desc: '부산광역시 해운대구 해운대해변로 264' },
  { name: '부산역 (KTX)', lat: 35.1152, lng: 129.0422, desc: '부산광역시 동구 중앙대로 206' },
  { name: '광주송정역', lat: 35.1376, lng: 126.7915, desc: '광주광역시 광산구 상무대로 201' },
  { name: '울산역', lat: 35.5516, lng: 129.1386, desc: '울산광역시 울주군 삼남읍 울산역로 177' },
  { name: '제주국제공항', lat: 33.5104, lng: 126.4914, desc: '제주특별자치도 제주시 공항로 2' },
  { name: '서귀포 중문관광단지', lat: 33.2484, lng: 126.4131, desc: '제주특별자치도 서귀포시 중문관광로' },
  { name: '강릉 경포대', lat: 37.7950, lng: 128.8967, desc: '강원특별자치도 강릉시 경포로 365' },
  { name: '속초 해수욕장', lat: 38.1906, lng: 128.6033, desc: '강원특별자치도 속초시 조양동' },
  { name: '독도', lat: 37.2408, lng: 131.8683, desc: '경상북도 울릉군 울릉읍 독도리' }
];

// Initialize on DOM load
document.addEventListener('DOMContentLoaded', async () => {
  initMap();
  await detectEnvironmentAndServer();
  await checkAuth();
  await loadDevices();
  initRealtimeStream();

  lucide.createIcons();
  initHistoryDateInputs();
});

// -------------------------------------------------------------
// Environment Detection (Server vs Local Standalone)
// -------------------------------------------------------------
async function detectEnvironmentAndServer() {
  const badge = document.getElementById('backend-status-badge');

  // Check if opened via file:// or if server responds
  if (window.location.protocol === 'file:') {
    enableLocalStandaloneMode('로컬 브라우저 모드');
    return;
  }

  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 2000);
    const res = await fetch('/api/info', { signal: controller.signal });
    clearTimeout(timeout);

    if (res.ok) {
      serverInfo = await res.json();
      isLocalOnlyMode = false;
      badge.innerHTML = `<span class="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse"></span> 서버 연결됨`;
      badge.className = 'px-2 py-0.5 text-[11px] font-semibold rounded-full bg-emerald-500/20 text-emerald-400 border border-emerald-500/30 flex items-center gap-1';
    } else {
      enableLocalStandaloneMode('오프라인 로컬 모드');
    }
  } catch (e) {
    enableLocalStandaloneMode('오프라인 로컬 모드');
  }

  // Set default custom IP / URL input in guide
  const customIpInput = document.getElementById('guide-custom-ip');
  if (customIpInput) {
    customIpInput.value = getEffectiveBaseUrl();
  }
}

function enableLocalStandaloneMode(label) {
  isLocalOnlyMode = true;
  const badge = document.getElementById('backend-status-badge');
  badge.innerHTML = `<span class="w-1.5 h-1.5 rounded-full bg-cyan-400"></span> ${label}`;
  badge.className = 'px-2 py-0.5 text-[11px] font-semibold rounded-full bg-cyan-500/20 text-cyan-300 border border-cyan-500/30 flex items-center gap-1';
  badge.title = '서버 없이 브라우저 자체 로컬 저장소로 모든 기능(회원가입, 로그인, 시뮬레이션, 동선 조회)이 동작합니다.';

  // Ensure default demo data in localStorage
  ensureLocalStorageDemoData();
}

function ensureLocalStorageDemoData() {
  if (!localStorage.getItem('gl_local_users')) {
    const defaultUsers = {
      'admin': { username: 'admin', password: 'admin1234', nickname: '관리자' }
    };
    localStorage.setItem('gl_local_users', JSON.stringify(defaultUsers));
  }

  if (!localStorage.getItem('gl_local_devices')) {
    const defaultDevices = [
      { id: 'DEV-CAR-101', name: '내 승용차 (GV70)', owner: 'admin', color: '#2563EB', icon: 'car', secretKey: 'key-demo-car-101', lastSeen: Date.now() },
      { id: 'DEV-PHONE-202', name: '내 스마트폰 (Galaxy S24)', owner: 'admin', color: '#10B981', icon: 'walk', secretKey: 'key-demo-phone-202', lastSeen: 0 }
    ];
    localStorage.setItem('gl_local_devices', JSON.stringify(defaultDevices));
  }

  if (!localStorage.getItem('gl_local_history')) {
    const now = Date.now();
    // Demo Seoul Path
    const coords = [
      [37.5759, 126.9768, 30.0, 150.0],
      [37.5663, 126.9779, 35.0, 160.0],
      [37.5559, 126.9723, 40.0, 175.0],
      [37.5384, 126.9654, 45.0, 155.0],
      [37.5255, 126.9678, 55.0, 140.0],
      [37.5133, 126.9959, 65.0, 110.0],
      [37.5045, 127.0050, 48.0, 125.0],
      [37.4981, 127.0276, 25.0, 130.0]
    ];
    const points = coords.map((c, i) => ({
      deviceId: 'DEV-CAR-101',
      lat: c[0],
      lng: c[1],
      speed: c[2],
      altitude: 30 + i * 2,
      bearing: c[3],
      accuracy: 3.5,
      battery: 95 - i,
      timestamp: now - ((coords.length - i) * 60000)
    }));

    const hist = { 'DEV-CAR-101': points };
    localStorage.setItem('gl_local_history', JSON.stringify(hist));
  }
}

// -------------------------------------------------------------
// Map Initialization & Visual Tile Layers
// -------------------------------------------------------------
function initMap() {
  map = L.map('map', {
    center: [37.5665, 126.9780],
    zoom: 14,
    zoomControl: false
  });

  // Top-left zoom control
  L.control.zoom({ position: 'bottomright' }).addTo(map);

  // Set default tile layer to CartoDB Positron (Clear, high contrast, clean Korean text)
  setTileLayer('pos');
}

function setTileLayer(type) {
  if (currentTileLayer) map.removeLayer(currentTileLayer);

  const btns = {
    pos: document.getElementById('tile-pos'),
    osm: document.getElementById('tile-osm'),
    dark: document.getElementById('tile-dark'),
    sat: document.getElementById('tile-sat')
  };

  for (let k in btns) {
    if (btns[k]) {
      btns[k].className = 'px-2.5 py-1 text-xs rounded-lg font-medium transition text-slate-300 hover:text-white';
    }
  }

  if (type === 'pos') {
    // CartoDB Positron: Extremely clean, modern, high contrast for routes & cars
    currentTileLayer = L.tileLayer('https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png', {
      maxZoom: 20,
      subdomains: 'abcd',
      attribution: '© OpenStreetMap, © CARTO'
    }).addTo(map);
    if (btns.pos) btns.pos.className = 'px-2.5 py-1 text-xs rounded-lg font-bold transition bg-blue-600 text-white';
  } else if (type === 'osm') {
    // Standard OpenStreetMap Bright
    currentTileLayer = L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
      maxZoom: 19,
      attribution: '© OpenStreetMap contributors'
    }).addTo(map);
    if (btns.osm) btns.osm.className = 'px-2.5 py-1 text-xs rounded-lg font-bold transition bg-blue-600 text-white';
  } else if (type === 'dark') {
    // CartoDB Dark Matter for night tracking
    currentTileLayer = L.tileLayer('https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png', {
      maxZoom: 19,
      subdomains: 'abcd',
      attribution: '© CARTO'
    }).addTo(map);
    if (btns.dark) btns.dark.className = 'px-2.5 py-1 text-xs rounded-lg font-bold transition bg-blue-600 text-white';
  } else if (type === 'sat') {
    // Esri World Imagery (Satellite)
    currentTileLayer = L.tileLayer('https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}', {
      maxZoom: 18,
      attribution: '© Esri, Maxar'
    }).addTo(map);
    if (btns.sat) btns.sat.className = 'px-2.5 py-1 text-xs rounded-lg font-bold transition bg-blue-600 text-white';
  }
}

function toggleHudVisibility() {
  isHudVisible = !isHudVisible;
  const realtimeHud = document.getElementById('realtime-hud');
  const btn = document.getElementById('btn-toggle-hud');

  if (isHudVisible) {
    realtimeHud.classList.remove('opacity-0', 'pointer-events-none', 'translate-x-12');
    btn.innerHTML = `<i data-lucide="eye" class="w-4 h-4 text-cyan-400"></i><span class="hidden sm:inline">지도 넓게보기</span>`;
  } else {
    realtimeHud.classList.add('opacity-0', 'pointer-events-none', 'translate-x-12');
    btn.innerHTML = `<i data-lucide="eye-off" class="w-4 h-4 text-amber-400"></i><span class="hidden sm:inline">정보창 보이기</span>`;
  }
  lucide.createIcons();
}

// -------------------------------------------------------------
// [NEW FEATURE] Location Search (Nominatim + Built-in Hotspots)
// -------------------------------------------------------------
async function handleLocationSearch(e) {
  if (e) e.preventDefault();
  const query = document.getElementById('map-search-input').value.trim();
  if (!query) return;

  const resultsList = document.getElementById('search-results-list');
  resultsList.classList.remove('hidden');
  resultsList.innerHTML = '<div class="text-xs text-slate-400 py-2 text-center flex items-center justify-center gap-1.5"><i data-lucide="loader" class="w-3.5 h-3.5 animate-spin"></i> 위치 검색 중...</div>';
  lucide.createIcons();

  // 1. Search local landmark database
  const localMatches = BUILTIN_LANDMARKS.filter(item =>
    item.name.includes(query) || item.desc.includes(query)
  );

  // 2. Fetch online Nominatim Geocoding API
  let onlineResults = [];
  try {
    const res = await fetch(`https://nominatim.openstreetmap.org/search?format=json&q=${encodeURIComponent(query)}&limit=5&countrycodes=kr,us,jp`);
    if (res.ok) {
      onlineResults = await res.json();
    }
  } catch (err) {
    console.warn('Online geocode error, using local landmarks only');
  }

  // Combine results
  resultsList.innerHTML = '';

  if (localMatches.length === 0 && onlineResults.length === 0) {
    resultsList.innerHTML = '<div class="text-xs text-slate-400 py-2 text-center">검색 결과가 없습니다. 다른 지명이나 주소를 입력해보세요.</div>';
    return;
  }

  // Render local matches
  localMatches.forEach(item => {
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'w-full text-left px-2.5 py-1.5 rounded-lg hover:bg-slate-800 transition flex items-center justify-between text-xs group';
    btn.innerHTML = `
      <div class="truncate pr-2">
        <span class="font-bold text-slate-100 group-hover:text-blue-400">${item.name}</span>
        <span class="text-[10px] text-slate-400 block truncate">${item.desc}</span>
      </div>
      <span class="px-1.5 py-0.5 rounded bg-blue-600/30 text-blue-300 text-[10px] font-mono flex-shrink-0">주요거점</span>
    `;
    btn.onclick = () => {
      quickJumpLocation(item.lat, item.lng, item.name);
      resultsList.classList.add('hidden');
    };
    resultsList.appendChild(btn);
  });

  // Render online results
  onlineResults.forEach(item => {
    const lat = parseFloat(item.lat);
    const lng = parseFloat(item.lon);
    const name = item.display_name.split(',')[0];
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'w-full text-left px-2.5 py-1.5 rounded-lg hover:bg-slate-800 transition flex items-center justify-between text-xs group';
    btn.innerHTML = `
      <div class="truncate pr-2">
        <span class="font-bold text-slate-100 group-hover:text-emerald-400">${name}</span>
        <span class="text-[10px] text-slate-400 block truncate">${item.display_name}</span>
      </div>
      <span class="px-1.5 py-0.5 rounded bg-emerald-600/30 text-emerald-300 text-[10px] font-mono flex-shrink-0">지도주소</span>
    `;
    btn.onclick = () => {
      quickJumpLocation(lat, lng, name);
      resultsList.classList.add('hidden');
    };
    resultsList.appendChild(btn);
  });
}

function quickJumpLocation(lat, lng, name) {
  map.flyTo([lat, lng], 15, { duration: 1.2 });

  if (searchResultMarker) map.removeLayer(searchResultMarker);

  const searchIcon = L.divIcon({
    html: `<div class="px-2.5 py-1 rounded-xl bg-gradient-to-r from-blue-600 to-indigo-600 text-white font-bold text-xs shadow-2xl border-2 border-white flex items-center gap-1.5 animate-bounce">📍 ${name}</div>`,
    className: 'search-pin',
    iconSize: [80, 30],
    iconAnchor: [40, 30]
  });

  searchResultMarker = L.marker([lat, lng], { icon: searchIcon }).addTo(map)
    .bindPopup(`<b>${name}</b><br>위도: ${lat.toFixed(5)}<br>경도: ${lng.toFixed(5)}`)
    .openPopup();
}

// -------------------------------------------------------------
// Authentication (Server + Local Standalone Support)
// -------------------------------------------------------------
async function checkAuth() {
  // If we already have token
  if (authToken) {
    if (isLocalOnlyMode) {
      const users = JSON.parse(localStorage.getItem('gl_local_users') || '{}');
      for (let u in users) {
        if (authToken.includes(u)) {
          currentUser = { username: users[u].username, nickname: users[u].nickname };
          break;
        }
      }
    } else {
      try {
        const res = await fetch('/api/auth/me', {
          headers: { 'Authorization': `Bearer ${authToken}` }
        });
        if (res.ok) {
          currentUser = await res.json();
        } else {
          localStorage.removeItem('geolive_token');
          authToken = null;
          currentUser = null;
        }
      } catch (e) {
        console.warn('Auth verify failed');
      }
    }
  }

  // If still not logged in, auto login as default admin for instant experience
  if (!currentUser) {
    await performLogin('admin', 'admin1234', true);
  }

  renderUserSection();
}

async function performLogin(username, password, isSilent = false) {
  if (isLocalOnlyMode) {
    const users = JSON.parse(localStorage.getItem('gl_local_users') || '{}');
    const user = users[username.toLowerCase()];
    if (user && user.password === password) {
      authToken = 'local-token-' + username + '-' + Date.now();
      localStorage.setItem('geolive_token', authToken);
      currentUser = { username: user.username, nickname: user.nickname };
      return { success: true };
    }
    throw new Error('아이디 또는 비밀번호가 일치하지 않습니다.');
  } else {
    try {
      const res = await fetch('/api/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username, password })
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || '로그인 실패');

      authToken = data.token;
      localStorage.setItem('geolive_token', authToken);
      currentUser = { username: data.username, nickname: data.nickname };
      return { success: true };
    } catch (e) {
      // Fallback to local mode if server is not responding
      if (!isSilent) console.warn('Server login error, switching to local auth', e);
      enableLocalStandaloneMode('로컬 브라우저 모드');
      return performLogin(username, password, isSilent);
    }
  }
}

async function performRegister(username, password, nickname) {
  if (isLocalOnlyMode) {
    const users = JSON.parse(localStorage.getItem('gl_local_users') || '{}');
    const uKey = username.toLowerCase();
    if (users[uKey]) {
      throw new Error('이미 존재하는 아이디입니다.');
    }
    users[uKey] = { username: uKey, password, nickname: nickname || username };
    localStorage.setItem('gl_local_users', JSON.stringify(users));

    authToken = 'local-token-' + uKey + '-' + Date.now();
    localStorage.setItem('geolive_token', authToken);
    currentUser = { username: uKey, nickname: nickname || username };
    return { success: true };
  } else {
    try {
      const res = await fetch('/api/auth/register', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username, password, nickname })
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || '회원가입 실패');

      authToken = data.token;
      localStorage.setItem('geolive_token', authToken);
      currentUser = { username: data.username, nickname: data.nickname };
      return { success: true };
    } catch (e) {
      enableLocalStandaloneMode('로컬 브라우저 모드');
      return performRegister(username, password, nickname);
    }
  }
}

function renderUserSection() {
  const container = document.getElementById('user-section');
  if (currentUser) {
    container.innerHTML = `
      <div class="flex items-center space-x-1.5 sm:space-x-2">
        <div class="w-8 h-8 rounded-full bg-blue-600/30 border border-blue-500/50 flex items-center justify-center text-blue-400 font-bold text-xs shadow">
          ${currentUser.nickname.substring(0, 1).toUpperCase()}
        </div>
        <div class="hidden xl:block text-left">
          <div class="text-xs font-bold text-slate-100 leading-tight">${currentUser.nickname}</div>
          <div class="text-[10px] text-slate-400 font-mono">@${currentUser.username}</div>
        </div>
        <button onclick="handleLogout()" title="로그아웃" class="p-1.5 text-slate-400 hover:text-rose-400 transition ml-0.5">
          <i data-lucide="log-out" class="w-4 h-4"></i>
        </button>
      </div>
    `;
  } else {
    container.innerHTML = `
      <button onclick="openAuthModal('login')" class="px-3 py-1.5 bg-blue-600 hover:bg-blue-500 text-white rounded-lg text-xs font-bold transition shadow">
        로그인 / 가입
      </button>
    `;
  }
  lucide.createIcons();
}

function handleLogout() {
  localStorage.removeItem('geolive_token');
  authToken = null;
  currentUser = null;
  renderUserSection();
  loadDevices();
}

// -------------------------------------------------------------
// Device Management (Server + Local Standalone Support)
// -------------------------------------------------------------
async function loadDevices() {
  const select = document.getElementById('device-select');
  if (!currentUser) {
    select.innerHTML = '<option value="">로그인이 필요합니다</option>';
    return;
  }

  if (isLocalOnlyMode) {
    devicesList = JSON.parse(localStorage.getItem('gl_local_devices') || '[]');
  } else {
    try {
      const res = await fetch('/api/devices', {
        headers: { 'Authorization': `Bearer ${authToken}` }
      });
      if (res.ok) {
        devicesList = await res.json();
      } else {
        devicesList = JSON.parse(localStorage.getItem('gl_local_devices') || '[]');
      }
    } catch (e) {
      devicesList = JSON.parse(localStorage.getItem('gl_local_devices') || '[]');
    }
  }

  select.innerHTML = '';
  if (devicesList.length === 0) {
    select.innerHTML = '<option value="">등록된 기기 없음 (+ 클릭)</option>';
    return;
  }

  devicesList.forEach(dev => {
    const opt = document.createElement('option');
    opt.value = dev.id;
    opt.textContent = `${dev.name} (${dev.id})`;
    select.appendChild(opt);

    if (dev.latest) {
      updateDevicePosition(dev.latest);
    }
  });

  if (!selectedDeviceId || !devicesList.some(d => d.id === selectedDeviceId)) {
    selectedDeviceId = devicesList[0].id;
  }
  select.value = selectedDeviceId;
  onDeviceChange(selectedDeviceId);
}

function onDeviceChange(devId) {
  selectedDeviceId = devId;
  const dev = devicesList.find(d => d.id === devId);
  if (!dev) return;

  document.getElementById('hud-device-name').textContent = dev.name;
  document.getElementById('hud-device-id').textContent = dev.id;

  const iconWrap = document.getElementById('hud-device-icon-wrap');
  iconWrap.style.borderColor = dev.color || '#3b82f6';

  const iconEl = document.getElementById('hud-device-icon');
  iconEl.setAttribute('data-lucide', getDeviceIconName(dev.icon));
  lucide.createIcons();

  const pt = deviceData[devId] || (dev.latest ? dev.latest : null);
  if (pt) {
    updateDevicePosition(pt);
    if (autoFollow) {
      map.panTo([pt.lat, pt.lng]);
    }
  }

  updateGuideModalInfo(dev);

  if (currentMode === 'history') {
    fetchHistory();
  }
}

function getDeviceIconName(iconType) {
  switch (iconType) {
    case 'car': return 'car';
    case 'phone': return 'smartphone';
    case 'walk': return 'footprints';
    case 'bike': return 'bike';
    case 'pet': return 'paw-print';
    default: return 'navigation';
  }
}

// -------------------------------------------------------------
// Realtime Ingestion & Visual Markers
// -------------------------------------------------------------
function initRealtimeStream() {
  if (!isLocalOnlyMode && window.EventSource) {
    try {
      const es = new EventSource('/api/gps/stream');
      es.addEventListener('gps-update', (event) => {
        try {
          const pt = JSON.parse(event.data);
          handleGpsUpdate(pt);
        } catch (e) {}
      });
    } catch (e) {}
  }

  // Universal periodic check
  setInterval(async () => {
    if (!selectedDeviceId) return;

    if (!isLocalOnlyMode) {
      try {
        const res = await fetch(`/api/gps/latest?deviceId=${selectedDeviceId}`);
        if (res.ok) {
          const data = await res.json();
          if (data.point) handleGpsUpdate(data.point);
        }
      } catch (e) {}
    }
  }, 3000);
}

function handleGpsUpdate(point) {
  deviceData[point.deviceId] = point;

  const dev = devicesList.find(d => d.id === point.deviceId);
  if (dev) dev.lastSeen = point.timestamp;

  if (currentMode === 'realtime') {
    updateDevicePosition(point);

    if (point.deviceId === selectedDeviceId) {
      updateHudTelemetry(point);
      if (autoFollow) {
        map.panTo([point.lat, point.lng], { animate: true, duration: 0.8 });
      }
    }
  }
}

function updateDevicePosition(point) {
  const dev = devicesList.find(d => d.id === point.deviceId) || {
    id: point.deviceId,
    name: point.deviceId,
    color: '#2563EB',
    icon: 'car'
  };

  const latlng = [point.lat, point.lng];

  // Tail Polyline (Recent 30 fixes)
  if (!deviceTails[point.deviceId]) {
    deviceTails[point.deviceId] = L.polyline([latlng], {
      color: dev.color || '#2563EB',
      weight: 5,
      opacity: 0.85,
      dashArray: '4, 8',
      lineCap: 'round'
    }).addTo(map);
  } else {
    const tail = deviceTails[point.deviceId];
    const pts = tail.getLatLngs();
    pts.push(L.latLng(latlng));
    if (pts.length > 30) pts.shift();
    tail.setLatLngs(pts);
  }

  // Device Live Marker
  if (!deviceMarkers[point.deviceId]) {
    const customIcon = createCustomMarkerIcon(dev, point.bearing);
    const marker = L.marker(latlng, { icon: customIcon }).addTo(map);

    marker.bindPopup(`
      <div class="text-xs font-sans text-slate-900 p-1">
        <div class="font-bold text-sm text-blue-600">${dev.name}</div>
        <div class="text-slate-500 font-mono text-[10px] mb-1">${point.deviceId}</div>
        <div>현재 속도: <b>${point.speed} km/h</b></div>
        <div>배터리: <b>${point.battery}%</b></div>
        <div class="text-[10px] text-slate-400 mt-1">${formatDate(point.timestamp)}</div>
      </div>
    `);

    deviceMarkers[point.deviceId] = marker;
  } else {
    const marker = deviceMarkers[point.deviceId];
    marker.setLatLng(latlng);
    marker.setIcon(createCustomMarkerIcon(dev, point.bearing));
  }
}

function createCustomMarkerIcon(dev, bearing) {
  const color = dev.color || '#2563EB';
  const rotation = bearing || 0;

  const html = `
    <div class="gps-marker-container">
      <div class="gps-marker-circle radar-pulse" style="background-color: ${color};">
        <div style="transform: rotate(${rotation}deg); display: flex; align-items: center; justify-content: center; width: 100%; height: 100%;">
          <i data-lucide="${getDeviceIconName(dev.icon)}" style="width: 20px; height: 20px; color: white;"></i>
        </div>
      </div>
      <div class="gps-marker-arrow" style="transform: rotate(${rotation}deg); border-bottom-color: ${color};"></div>
    </div>
  `;

  return L.divIcon({
    html: html,
    className: 'custom-gps-icon',
    iconSize: [44, 44],
    iconAnchor: [22, 22],
    popupAnchor: [0, -22]
  });
}

function updateHudTelemetry(pt) {
  document.getElementById('hud-speed-num').textContent = Math.round(pt.speed);

  const moveEl = document.getElementById('hud-moving-status');
  if (pt.speed > 3) {
    moveEl.innerHTML = `<span class="w-2 h-2 rounded-full bg-emerald-400 animate-pulse"></span> 주행 중`;
    moveEl.className = 'text-xs sm:text-sm font-bold text-emerald-400 mt-1 flex items-center justify-end gap-1';
  } else if (pt.speed > 0.5) {
    moveEl.innerHTML = `<span class="w-2 h-2 rounded-full bg-amber-400"></span> 서행 / 정차`;
    moveEl.className = 'text-xs sm:text-sm font-bold text-amber-400 mt-1 flex items-center justify-end gap-1';
  } else {
    moveEl.innerHTML = `<span class="w-2 h-2 rounded-full bg-slate-400"></span> 정차 중`;
    moveEl.className = 'text-xs sm:text-sm font-bold text-slate-400 mt-1 flex items-center justify-end gap-1';
  }

  document.getElementById('hud-battery-text').textContent = `${pt.battery}%`;
  document.getElementById('hud-coord-text').textContent = `${pt.lat.toFixed(5)}, ${pt.lng.toFixed(5)}`;
  document.getElementById('hud-alt-bearing').textContent = `${Math.round(pt.altitude)} m / ${Math.round(pt.bearing)}°`;
  document.getElementById('hud-accuracy').textContent = `± ${pt.accuracy.toFixed(1)} m`;

  const timeDiffSec = Math.round((Date.now() - pt.timestamp) / 1000);
  let timeStr = '방금 전';
  if (timeDiffSec > 60) timeStr = `${Math.floor(timeDiffSec / 60)}분 전`;
  else if (timeDiffSec > 5) timeStr = `${timeDiffSec}초 전`;
  document.getElementById('hud-last-seen').textContent = timeStr;

  const badge = document.getElementById('hud-online-badge');
  if (timeDiffSec < 60) {
    badge.textContent = '온라인';
    badge.className = 'px-1.5 py-0.2 text-[10px] font-semibold rounded bg-emerald-500/20 text-emerald-400 border border-emerald-500/30';
  } else {
    badge.textContent = '오프라인';
    badge.className = 'px-1.5 py-0.2 text-[10px] font-semibold rounded bg-slate-800 text-slate-300';
  }

  lucide.createIcons();
}

function toggleAutoFollow() {
  autoFollow = !autoFollow;
  const btn = document.getElementById('btn-auto-follow');
  if (autoFollow) {
    btn.innerHTML = `<i data-lucide="crosshair" class="w-3.5 h-3.5"></i><span>위치 자동 추적: ON</span>`;
    btn.className = 'flex-1 py-1.5 px-2 rounded-lg text-xs font-semibold transition flex items-center justify-center gap-1 bg-blue-600/20 text-blue-300 border border-blue-500/40 hover:bg-blue-600/30';
    const pt = deviceData[selectedDeviceId];
    if (pt) map.panTo([pt.lat, pt.lng]);
  } else {
    btn.innerHTML = `<i data-lucide="crosshair" class="w-3.5 h-3.5"></i><span>위치 자동 추적: OFF</span>`;
    btn.className = 'flex-1 py-1.5 px-2 rounded-lg text-xs font-semibold transition flex items-center justify-center gap-1 bg-slate-800 text-slate-400 border border-slate-700 hover:bg-slate-700';
  }
  lucide.createIcons();
}

// -------------------------------------------------------------
// Simulator (Server + Local Standalone Support)
// -------------------------------------------------------------
let localSimulatorTimer = null;
const seoulTourWaypoints = [
  { lat: 37.5759, lng: 126.9768, name: '광화문' },
  { lat: 37.5663, lng: 126.9779, name: '시청' },
  { lat: 37.5559, lng: 126.9723, name: '서울역' },
  { lat: 37.5384, lng: 126.9654, name: '삼각지' },
  { lat: 37.5255, lng: 126.9678, name: '용산' },
  { lat: 37.5133, lng: 126.9959, name: '반포대교' },
  { lat: 37.5045, lng: 127.0050, name: '고속터미널' },
  { lat: 37.4981, lng: 127.0276, name: '강남역' },
  { lat: 37.5088, lng: 127.0630, name: '삼성역 코엑스' },
  { lat: 37.5240, lng: 127.0200, name: '압구정' }
];

async function toggleSimulator() {
  if (!selectedDeviceId) {
    alert('기기를 먼저 선택해주세요.');
    return;
  }

  isSimulatorRunning = !isSimulatorRunning;
  const btn = document.getElementById('btn-simulator');

  if (isSimulatorRunning) {
    btn.innerHTML = `<i data-lucide="stop-circle" class="w-3.5 h-3.5"></i><span>시뮬레이터 중지</span>`;
    btn.className = 'py-1.5 px-2.5 rounded-lg text-xs font-semibold transition flex items-center justify-center gap-1 bg-rose-600/20 text-rose-300 border border-rose-500/40 hover:bg-rose-600/30';

    if (!isLocalOnlyMode) {
      try {
        await fetch('/api/simulator/toggle', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ deviceId: selectedDeviceId })
        });
      } catch (e) {}
    }

    // Run client simulator loop (always works!)
    let curWp = 0;
    let curLat = seoulTourWaypoints[0].lat;
    let curLng = seoulTourWaypoints[0].lng;

    localSimulatorTimer = setInterval(() => {
      if (!isSimulatorRunning) {
        clearInterval(localSimulatorTimer);
        return;
      }
      curWp = (curWp + 1) % seoulTourWaypoints.length;
      const target = seoulTourWaypoints[curWp];

      curLat += (target.lat - curLat) * 0.35 + (Math.random() - 0.5) * 0.0003;
      curLng += (target.lng - curLng) * 0.35 + (Math.random() - 0.5) * 0.0003;

      const pt = {
        deviceId: selectedDeviceId,
        lat: curLat,
        lng: curLng,
        speed: Math.round(35 + Math.random() * 25),
        altitude: 32.0,
        bearing: Math.round(Math.random() * 360),
        accuracy: 3.2,
        battery: 92,
        timestamp: Date.now()
      };

      handleGpsUpdate(pt);

      // Save to local history
      const hist = JSON.parse(localStorage.getItem('gl_local_history') || '{}');
      if (!hist[selectedDeviceId]) hist[selectedDeviceId] = [];
      hist[selectedDeviceId].push(pt);
      localStorage.setItem('gl_local_history', JSON.stringify(hist));
    }, 2000);

  } else {
    btn.innerHTML = `<i data-lucide="play-circle" class="w-3.5 h-3.5"></i><span>가상 주행 테스트</span>`;
    btn.className = 'py-1.5 px-2.5 rounded-lg text-xs font-semibold transition flex items-center justify-center gap-1 bg-purple-600/20 text-purple-300 border border-purple-500/40 hover:bg-purple-600/30';

    if (localSimulatorTimer) {
      clearInterval(localSimulatorTimer);
      localSimulatorTimer = null;
    }

    if (!isLocalOnlyMode) {
      try {
        await fetch('/api/simulator/toggle', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ deviceId: selectedDeviceId })
        });
      } catch (e) {}
    }
  }
  lucide.createIcons();
}

// -------------------------------------------------------------
// Mode Switch: Realtime vs History
// -------------------------------------------------------------
function switchMode(mode) {
  currentMode = mode;
  const btnRealtime = document.getElementById('btn-tab-realtime');
  const btnHistory = document.getElementById('btn-tab-history');

  const realtimeHud = document.getElementById('realtime-hud');
  const historyHud = document.getElementById('history-hud');
  const timelineBar = document.getElementById('timeline-bar');

  if (mode === 'realtime') {
    btnRealtime.className = 'px-3.5 py-1.5 rounded-lg text-xs sm:text-sm font-semibold transition-all flex items-center gap-1.5 bg-blue-600 text-white shadow-md';
    btnHistory.className = 'px-3.5 py-1.5 rounded-lg text-xs sm:text-sm font-semibold transition-all flex items-center gap-1.5 text-slate-300 hover:text-white';

    realtimeHud.classList.remove('hidden');
    historyHud.classList.add('hidden');
    timelineBar.classList.add('hidden');

    clearHistoryLayer();
    for (let id in deviceMarkers) deviceMarkers[id].addTo(map);
    for (let id in deviceTails) deviceTails[id].addTo(map);
  } else {
    btnRealtime.className = 'px-3.5 py-1.5 rounded-lg text-xs sm:text-sm font-semibold transition-all flex items-center gap-1.5 text-slate-300 hover:text-white';
    btnHistory.className = 'px-3.5 py-1.5 rounded-lg text-xs sm:text-sm font-semibold transition-all flex items-center gap-1.5 bg-blue-600 text-white shadow-md';

    realtimeHud.classList.add('hidden');
    historyHud.classList.remove('hidden');
    timelineBar.classList.remove('hidden');

    for (let id in deviceMarkers) map.removeLayer(deviceMarkers[id]);
    for (let id in deviceTails) map.removeLayer(deviceTails[id]);

    fetchHistory();
  }
}

// -------------------------------------------------------------
// History & Playback (Server + Local Standalone Support)
// -------------------------------------------------------------
function initHistoryDateInputs() {
  const startInput = document.getElementById('hist-start-time');
  const endInput = document.getElementById('hist-end-time');
  const now = new Date();
  const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 0, 0, 0);

  startInput.value = formatDateTimeLocal(todayStart);
  endInput.value = formatDateTimeLocal(new Date(now.getTime() + 60000));
}

function formatDateTimeLocal(d) {
  const pad = n => n.toString().padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

function setTimePreset(preset) {
  const startInput = document.getElementById('hist-start-time');
  const endInput = document.getElementById('hist-end-time');
  const now = new Date();

  document.querySelectorAll('.preset-btn').forEach(b => {
    b.className = 'preset-btn px-2 py-1 bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs font-medium rounded-lg text-center transition';
  });

  if (preset === '1h') {
    startInput.value = formatDateTimeLocal(new Date(now.getTime() - 3600000));
    endInput.value = formatDateTimeLocal(now);
  } else if (preset === 'today') {
    const today = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 0, 0, 0);
    startInput.value = formatDateTimeLocal(today);
    endInput.value = formatDateTimeLocal(now);
  } else if (preset === 'yesterday') {
    const yStart = new Date(now.getFullYear(), now.getMonth(), now.getDate() - 1, 0, 0, 0);
    const yEnd = new Date(now.getFullYear(), now.getMonth(), now.getDate() - 1, 23, 59, 59);
    startInput.value = formatDateTimeLocal(yStart);
    endInput.value = formatDateTimeLocal(yEnd);
  } else if (preset === 'all') {
    startInput.value = formatDateTimeLocal(new Date(now.getTime() - (7 * 24 * 3600000)));
    endInput.value = formatDateTimeLocal(now);
  }

  fetchHistory();
}

async function fetchHistory() {
  if (!selectedDeviceId) return;

  const startVal = document.getElementById('hist-start-time').value;
  const endVal = document.getElementById('hist-end-time').value;

  const from = startVal ? new Date(startVal).getTime() : 0;
  const to = endVal ? new Date(endVal).getTime() : Date.now();

  pauseHistoryPlayback();
  clearHistoryLayer();

  let data = null;

  if (isLocalOnlyMode) {
    const hist = JSON.parse(localStorage.getItem('gl_local_history') || '{}');
    const allPts = hist[selectedDeviceId] || [];
    const filtered = allPts.filter(p => p.timestamp >= from && p.timestamp <= to);

    let dist = 0;
    let maxSpd = 0;
    for (let i = 1; i < filtered.length; i++) {
      dist += calcDistKm(filtered[i-1].lat, filtered[i-1].lng, filtered[i].lat, filtered[i].lng);
      if (filtered[i].speed > maxSpd) maxSpd = filtered[i].speed;
    }

    data = {
      points: filtered,
      totalDistanceKm: dist.toFixed(2),
      maxSpeed: maxSpd.toFixed(1),
      avgSpeed: (filtered.length > 0 ? (maxSpd * 0.6).toFixed(1) : '0.0'),
      durationMillis: filtered.length > 1 ? (filtered[filtered.length - 1].timestamp - filtered[0].timestamp) : 0,
      stops: filtered.length > 4 ? [{ lat: filtered[Math.floor(filtered.length / 2)].lat, lng: filtered[Math.floor(filtered.length / 2)].lng, durationMinutes: 12 }] : []
    };
  } else {
    try {
      const res = await fetch(`/api/gps/history?deviceId=${selectedDeviceId}&from=${from}&to=${to}`);
      if (res.ok) {
        data = await res.json();
      }
    } catch (e) {
      console.warn('Server history failed, using local');
    }
  }

  if (!data || !data.points || data.points.length === 0) {
    alert('선택한 기간 동안 기록된 동선 데이터가 없습니다. 상단의 [가상 주행 테스트]를 켜서 동선을 기록하거나 날짜를 변경해보세요.');
    return;
  }

  historyPoints = data.points;
  historyStops = data.stops || [];

  document.getElementById('stat-distance').textContent = `${data.totalDistanceKm} km`;
  document.getElementById('stat-duration').textContent = formatDuration(data.durationMillis);
  document.getElementById('stat-speeds').textContent = `${data.avgSpeed} / ${data.maxSpeed} km/h`;
  document.getElementById('stat-stops').textContent = `${historyStops.length} 곳`;

  renderHistoryRoute();
}

function calcDistKm(lat1, lon1, lat2, lon2) {
  const R = 6371;
  const dLat = (lat2 - lat1) * Math.PI / 180;
  const dLon = (lon2 - lon1) * Math.PI / 180;
  const a = Math.sin(dLat / 2) * Math.sin(dLat / 2) +
            Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) *
            Math.sin(dLon / 2) * Math.sin(dLon / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return R * c;
}

function clearHistoryLayer() {
  if (historyPolyline) { map.removeLayer(historyPolyline); historyPolyline = null; }
  if (historyStartMarker) { map.removeLayer(historyStartMarker); historyStartMarker = null; }
  if (historyEndMarker) { map.removeLayer(historyEndMarker); historyEndMarker = null; }
  if (historyPlaybackMarker) { map.removeLayer(historyPlaybackMarker); historyPlaybackMarker = null; }
  historyStopMarkers.forEach(m => map.removeLayer(m));
  historyStopMarkers.length = 0;
}

function renderHistoryRoute() {
  const latlngs = historyPoints.map(p => [p.lat, p.lng]);

  // High-visibility dual Polyline (Outer Shadow + Neon Cobalt Stroke)
  historyPolyline = L.polyline(latlngs, {
    color: '#2563EB',
    weight: 6,
    opacity: 0.95,
    lineJoin: 'round',
    lineCap: 'round'
  }).addTo(map);

  const startPt = historyPoints[0];
  const startIcon = L.divIcon({
    html: `<div class="px-2.5 py-1 rounded-xl bg-emerald-600 text-white font-bold text-xs shadow-xl border-2 border-white flex items-center gap-1">🟢 출발</div>`,
    className: 'custom-flag-icon',
    iconSize: [56, 26],
    iconAnchor: [28, 26]
  });
  historyStartMarker = L.marker([startPt.lat, startPt.lng], { icon: startIcon }).addTo(map)
    .bindPopup(`<b>출발 지점</b><br>${formatDate(startPt.timestamp)}`);

  const endPt = historyPoints[historyPoints.length - 1];
  const endIcon = L.divIcon({
    html: `<div class="px-2.5 py-1 rounded-xl bg-rose-600 text-white font-bold text-xs shadow-xl border-2 border-white flex items-center gap-1">🏁 도착</div>`,
    className: 'custom-flag-icon',
    iconSize: [56, 26],
    iconAnchor: [28, 26]
  });
  historyEndMarker = L.marker([endPt.lat, endPt.lng], { icon: endIcon }).addTo(map)
    .bindPopup(`<b>도착 지점</b><br>${formatDate(endPt.timestamp)}`);

  historyStops.forEach((stop, idx) => {
    const stopIcon = L.divIcon({
      html: `<div class="gps-stop-marker" title="정차: ${stop.durationMinutes}분">🛑</div>`,
      className: '',
      iconSize: [32, 32],
      iconAnchor: [16, 16]
    });
    const sm = L.marker([stop.lat, stop.lng], { icon: stopIcon }).addTo(map)
      .bindPopup(`
        <div class="text-xs font-sans">
          <div class="font-bold text-rose-600 mb-1">🛑 정차 지점 #${idx + 1}</div>
          <div>체류 시간: <b>${stop.durationMinutes}분</b></div>
        </div>
      `);
    historyStopMarkers.push(sm);
  });

  map.fitBounds(historyPolyline.getBounds(), { padding: [60, 60] });

  const dev = devicesList.find(d => d.id === selectedDeviceId) || { color: '#3B82F6', icon: 'car' };
  const pbIcon = createPlaybackMarkerIcon(dev, startPt.bearing);
  historyPlaybackMarker = L.marker([startPt.lat, startPt.lng], { icon: pbIcon, zIndexOffset: 1000 }).addTo(map);

  const slider = document.getElementById('timeline-slider');
  slider.min = 0;
  slider.max = historyPoints.length - 1;
  slider.value = 0;
  playbackIndex = 0;

  document.getElementById('timeline-start-label').textContent = formatTimeOnly(startPt.timestamp);
  document.getElementById('timeline-end-label').textContent = formatTimeOnly(endPt.timestamp);

  updateTimelineDisplay(startPt);
}

function createPlaybackMarkerIcon(dev, bearing) {
  const color = dev.color || '#3B82F6';
  const rotation = bearing || 0;
  const html = `
    <div style="width: 40px; height: 40px; border-radius: 50%; background: ${color}; border: 3px solid #ffffff; box-shadow: 0 0 16px rgba(59, 130, 246, 0.95); display: flex; align-items: center; justify-content: center; transform: rotate(${rotation}deg);">
      <i data-lucide="${getDeviceIconName(dev.icon)}" style="width: 20px; height: 20px; color: white;"></i>
    </div>
  `;
  return L.divIcon({
    html: html,
    className: 'playback-marker',
    iconSize: [40, 40],
    iconAnchor: [20, 20]
  });
}

function onTimelineSlider(val) {
  playbackIndex = parseInt(val, 10);
  if (playbackIndex < 0) playbackIndex = 0;
  if (playbackIndex >= historyPoints.length) playbackIndex = historyPoints.length - 1;

  const pt = historyPoints[playbackIndex];
  if (pt && historyPlaybackMarker) {
    historyPlaybackMarker.setLatLng([pt.lat, pt.lng]);
    const dev = devicesList.find(d => d.id === selectedDeviceId) || { color: '#3B82F6', icon: 'car' };
    historyPlaybackMarker.setIcon(createPlaybackMarkerIcon(dev, pt.bearing));
    updateTimelineDisplay(pt);
  }
}

function updateTimelineDisplay(pt) {
  document.getElementById('timeline-current-time').textContent = formatDate(pt.timestamp);
  document.getElementById('timeline-current-speed').textContent = `${pt.speed} km/h`;
  lucide.createIcons();
}

function togglePlayHistory() {
  if (isPlayingHistory) pauseHistoryPlayback();
  else startHistoryPlayback();
}

function startHistoryPlayback() {
  if (historyPoints.length === 0) return;
  isPlayingHistory = true;
  document.getElementById('btn-play-pause').className = 'w-8 h-8 rounded-lg bg-amber-600 hover:bg-amber-500 text-white flex items-center justify-center transition shadow-lg';
  document.getElementById('icon-play-pause').setAttribute('data-lucide', 'pause');
  lucide.createIcons();

  if (playbackIndex >= historyPoints.length - 1) playbackIndex = 0;

  const stepMs = Math.max(30, Math.round(500 / playbackSpeed));
  playbackTimer = setInterval(() => {
    playbackIndex++;
    if (playbackIndex >= historyPoints.length) {
      pauseHistoryPlayback();
      return;
    }
    document.getElementById('timeline-slider').value = playbackIndex;
    onTimelineSlider(playbackIndex);
  }, stepMs);
}

function pauseHistoryPlayback() {
  isPlayingHistory = false;
  if (playbackTimer) {
    clearInterval(playbackTimer);
    playbackTimer = null;
  }
  const btn = document.getElementById('btn-play-pause');
  if (btn) {
    btn.className = 'w-8 h-8 rounded-lg bg-blue-600 hover:bg-blue-500 text-white flex items-center justify-center transition shadow-lg shadow-blue-500/20';
    document.getElementById('icon-play-pause').setAttribute('data-lucide', 'play');
    lucide.createIcons();
  }
}

function stepTimeline(delta) {
  playbackIndex = Math.max(0, Math.min(historyPoints.length - 1, playbackIndex + delta));
  document.getElementById('timeline-slider').value = playbackIndex;
  onTimelineSlider(playbackIndex);
}

function setPlaySpeed(speed) {
  playbackSpeed = speed;
  document.querySelectorAll('.speed-btn').forEach(b => {
    b.className = 'speed-btn px-2 py-0.5 rounded font-mono font-medium text-xs text-slate-300 hover:text-white';
  });
  event.target.className = 'speed-btn px-2 py-0.5 rounded font-mono font-medium text-xs bg-blue-600 text-white';

  if (isPlayingHistory) {
    pauseHistoryPlayback();
    startHistoryPlayback();
  }
}

// -------------------------------------------------------------
// Modals & UI Actions
// -------------------------------------------------------------
function openAuthModal(defaultTab = 'login') {
  document.getElementById('modal-auth').classList.remove('hidden');
  document.getElementById('auth-error').classList.add('hidden');
  document.getElementById('auth-success').classList.add('hidden');
  switchAuthTab(defaultTab);
}

function closeAuthModal() {
  document.getElementById('modal-auth').classList.add('hidden');
}

function switchAuthTab(tab) {
  const btnLogin = document.getElementById('auth-tab-login');
  const btnRegister = document.getElementById('auth-tab-register');
  const title = document.getElementById('auth-title');
  const nickWrap = document.getElementById('auth-nick-wrap');
  const submitBtn = document.getElementById('auth-submit-btn');

  document.getElementById('auth-error').classList.add('hidden');
  document.getElementById('auth-success').classList.add('hidden');

  if (tab === 'login') {
    btnLogin.className = 'flex-1 py-1.5 rounded-lg bg-blue-600 text-white transition font-bold';
    btnRegister.className = 'flex-1 py-1.5 rounded-lg text-slate-400 hover:text-white transition';
    title.textContent = '로그인';
    nickWrap.classList.add('hidden');
    submitBtn.textContent = '로그인';
  } else {
    btnLogin.className = 'flex-1 py-1.5 rounded-lg text-slate-400 hover:text-white transition';
    btnRegister.className = 'flex-1 py-1.5 rounded-lg bg-blue-600 text-white transition font-bold';
    title.textContent = '신규 회원가입';
    nickWrap.classList.remove('hidden');
    submitBtn.textContent = '회원가입 완료';
  }
}

async function handleAuthSubmit(e) {
  e.preventDefault();
  const username = document.getElementById('auth-username').value.trim();
  const password = document.getElementById('auth-password').value;
  const nickname = document.getElementById('auth-nickname').value.trim();
  const isRegister = !document.getElementById('auth-nick-wrap').classList.contains('hidden');

  const errEl = document.getElementById('auth-error');
  const succEl = document.getElementById('auth-success');
  errEl.classList.add('hidden');
  succEl.classList.add('hidden');

  try {
    if (isRegister) {
      await performRegister(username, password, nickname);
      succEl.textContent = '🎉 회원가입이 완료되었습니다! 자동으로 로그인되었습니다.';
      succEl.classList.remove('hidden');
    } else {
      await performLogin(username, password);
      succEl.textContent = '✅ 로그인이 완료되었습니다!';
      succEl.classList.remove('hidden');
    }

    setTimeout(() => {
      closeAuthModal();
      renderUserSection();
      loadDevices();
    }, 700);

  } catch (err) {
    errEl.textContent = err.message || '인증 처리 중 오류가 발생했습니다.';
    errEl.classList.remove('hidden');
  }
}

function openDeviceModal() {
  document.getElementById('modal-device').classList.remove('hidden');
  renderDeviceList();
}

function closeDeviceModal() {
  document.getElementById('modal-device').classList.add('hidden');
}

function renderDeviceList() {
  const container = document.getElementById('device-list-container');
  if (devicesList.length === 0) {
    container.innerHTML = '<div class="text-xs text-slate-400 py-3 text-center">등록된 기기가 없습니다. 위에서 새 기기를 등록하세요.</div>';
    return;
  }

  container.innerHTML = devicesList.map(d => `
    <div class="bg-slate-800/80 p-3 rounded-xl border border-slate-700 flex items-center justify-between">
      <div class="flex items-center space-x-3">
        <div class="w-8 h-8 rounded-lg flex items-center justify-center text-white" style="background-color: ${d.color};">
          <i data-lucide="${getDeviceIconName(d.icon)}" class="w-4 h-4"></i>
        </div>
        <div>
          <div class="text-xs font-bold text-slate-100">${d.name}</div>
          <div class="text-[10px] font-mono text-slate-400">ID: ${d.id} | 키: ${d.secretKey}</div>
        </div>
      </div>
      <div class="flex items-center space-x-1">
        <button onclick="copyDeviceTrackerUrl('${d.id}', '${d.secretKey}')" title="스마트폰 연동 링크 복사" class="p-1.5 text-slate-300 hover:text-emerald-400 bg-slate-700/60 rounded-lg text-xs flex items-center gap-1">
          <i data-lucide="link" class="w-3.5 h-3.5"></i>
        </button>
        <button onclick="deleteDevice('${d.id}')" title="기기 삭제" class="p-1.5 text-slate-400 hover:text-rose-400 bg-slate-700/60 rounded-lg text-xs">
          <i data-lucide="trash-2" class="w-3.5 h-3.5"></i>
        </button>
      </div>
    </div>
  `).join('');

  lucide.createIcons();
}

async function handleCreateDevice(e) {
  e.preventDefault();
  const name = document.getElementById('new-dev-name').value.trim();
  const idInput = document.getElementById('new-dev-id').value.trim();
  const icon = document.getElementById('new-dev-icon').value;
  const color = document.getElementById('new-dev-color').value;
  const description = document.getElementById('new-dev-desc').value.trim();

  const id = idInput ? idInput.toUpperCase() : ('DEV-' + Math.random().toString(36).substring(2, 8).toUpperCase());
  const secretKey = 'key-' + Math.random().toString(36).substring(2, 12);

  if (isLocalOnlyMode) {
    const devs = JSON.parse(localStorage.getItem('gl_local_devices') || '[]');
    devs.push({ id, name, icon, color, description, secretKey, owner: currentUser.username, lastSeen: 0 });
    localStorage.setItem('gl_local_devices', JSON.stringify(devs));
  } else {
    try {
      await fetch('/api/devices', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${authToken}`
        },
        body: JSON.stringify({ name, id, icon, color, description })
      });
    } catch (e) {
      const devs = JSON.parse(localStorage.getItem('gl_local_devices') || '[]');
      devs.push({ id, name, icon, color, description, secretKey, owner: currentUser.username, lastSeen: 0 });
      localStorage.setItem('gl_local_devices', JSON.stringify(devs));
    }
  }

  alert('기기가 성공적으로 등록되었습니다!');
  document.getElementById('new-dev-name').value = '';
  document.getElementById('new-dev-id').value = '';
  document.getElementById('new-dev-desc').value = '';

  await loadDevices();
  renderDeviceList();
}

async function deleteDevice(devId) {
  if (!confirm(`정말로 기기(${devId})를 삭제하시겠습니까?`)) return;

  if (isLocalOnlyMode) {
    let devs = JSON.parse(localStorage.getItem('gl_local_devices') || '[]');
    devs = devs.filter(d => d.id !== devId);
    localStorage.setItem('gl_local_devices', JSON.stringify(devs));
  } else {
    try {
      await fetch(`/api/devices?id=${devId}`, {
        method: 'DELETE',
        headers: { 'Authorization': `Bearer ${authToken}` }
      });
    } catch (e) {
      let devs = JSON.parse(localStorage.getItem('gl_local_devices') || '[]');
      devs = devs.filter(d => d.id !== devId);
      localStorage.setItem('gl_local_devices', JSON.stringify(devs));
    }
  }

  await loadDevices();
  renderDeviceList();
}

// -------------------------------------------------------------
// Guide Modal & 100% Guaranteed Local QR Code Generation
// -------------------------------------------------------------
async function openGuideModal() {
  document.getElementById('modal-guide').classList.remove('hidden');

  let dev = devicesList.find(d => d.id === selectedDeviceId);
  if (!dev && devicesList.length > 0) {
    dev = devicesList[0];
    selectedDeviceId = dev.id;
  }
  if (!dev) {
    dev = {
      id: 'DEV-PHONE-202',
      name: '내 스마트폰 (Galaxy S24)',
      secretKey: 'key-demo-phone-202'
    };
  }

  // Render immediately for zero UI delay
  updateGuideModalInfo(dev);

  // If running with server, refresh server info in background so any live .env change (PUBLIC_URL) is picked up
  if (!isLocalOnlyMode && window.location.protocol !== 'file:') {
    try {
      const res = await fetch(`/api/info?_t=${Date.now()}`, { cache: 'no-store' });
      if (res.ok) {
        serverInfo = await res.json();
        updateGuideModalInfo(dev);
      }
    } catch (e) {
      console.warn('Failed to refresh /api/info:', e);
    }
  }
}

function closeGuideModal() {
  document.getElementById('modal-guide').classList.add('hidden');
}

let userOverriddenHost = null;

function getEffectiveBaseUrl() {
  // 1. Explicit user override from modal input if user clicked [적용]
  if (userOverriddenHost && userOverriddenHost.trim()) {
    const trimmed = userOverriddenHost.trim();
    if (trimmed.startsWith('http://') || trimmed.startsWith('https://')) {
      return trimmed.replace(/\/+$/, '');
    }
    const port = (serverInfo && serverInfo.port) || 8080;
    return `http://${trimmed}${trimmed.includes(':') ? '' : ':' + port}`;
  }

  // 2. Primary: PUBLIC_URL from backend (.env configuration)
  if (serverInfo && serverInfo.publicUrl && serverInfo.publicUrl.trim()) {
    return serverInfo.publicUrl.trim().replace(/\/+$/, '');
  }

  // 3. Current browser origin if accessed via HTTPS
  if (window.location.protocol === 'https:') {
    return window.location.origin;
  }

  // 4. Fallback: Internal LAN IP
  let host = (serverInfo && serverInfo.localIp) || window.location.hostname;
  if (!host || host === '127.0.0.1' || host === 'localhost') {
    host = '192.168.0.10';
  }
  const port = (serverInfo && serverInfo.port) || window.location.port || 8080;
  return `http://${host}:${port}`;
}

function buildTrackerUrl(dev) {
  if (!dev || !dev.id) {
    dev = {
      id: 'DEV-PHONE-202',
      name: '내 스마트폰 (Galaxy S24)',
      secretKey: 'key-demo-phone-202'
    };
  }

  const baseUrl = getEffectiveBaseUrl();
  const isPublic = baseUrl.startsWith('https://');

  let warningMessage = null;
  if (!isPublic) {
    warningMessage = '.env 파일에 PUBLIC_URL이 설정되어 있지 않아 내부 로컬 주소(' + baseUrl + ')로 생성되었습니다. 스마트폰 브라우저는 HTTPS가 아니면 GPS 위치 권한을 엄격히 차단하므로, 외부망 모바일 기기에서 연동하려면 .env 파일에 PUBLIC_URL=https://... 을 설정해 주세요.';
  }

  // Safely construct query parameters without corrupting & or special characters
  const params = new URLSearchParams();
  params.set('deviceId', dev.id);
  params.set('secretKey', dev.secretKey || '');

  const url = `${baseUrl}/tracker.html?${params.toString()}`;
  return {
    url,
    baseUrl,
    isPublic,
    warningMessage
  };
}

function updateGuideModalInfo(dev) {
  if (!dev) {
    dev = {
      id: 'DEV-PHONE-202',
      name: '내 스마트폰 (Galaxy S24)',
      secretKey: 'key-demo-phone-202'
    };
  }

  const targetDevEl = document.getElementById('guide-target-device');
  if (targetDevEl) targetDevEl.textContent = `${dev.name || dev.id} (${dev.id})`;

  const info = buildTrackerUrl(dev);
  const trackerUrl = info.url;
  const baseUrl = info.baseUrl;

  // Display URL and update input box value if not overridden yet
  const trackerUrlInput = document.getElementById('guide-tracker-url');
  if (trackerUrlInput) trackerUrlInput.value = trackerUrl;

  const customIpInput = document.getElementById('guide-custom-ip');
  if (customIpInput && !userOverriddenHost) {
    customIpInput.value = baseUrl;
  }

  // Render QR Code using robust local qrcode.min.js with SVG fallback
  const canvas = document.getElementById('tracker-qr-canvas');
  const qrContainer = document.getElementById('tracker-qr-container');
  let qrRendered = false;

  if (window.QRCode) {
    if (canvas) {
      try {
        canvas.style.display = 'block';
        QRCode.toCanvas(canvas, trackerUrl, {
          width: 144,
          height: 144,
          dark: '#0f172a',
          light: '#ffffff'
        });
        qrRendered = true;
      } catch (canvasErr) {
        console.warn('Canvas QR render error, trying SVG fallback', canvasErr);
      }
    }

    if (!qrRendered && qrContainer) {
      try {
        const svgMarkup = QRCode.toSvg(trackerUrl, { width: 144, height: 144 });
        qrContainer.innerHTML = svgMarkup + '<span class="text-[10px] text-slate-500 font-bold mt-1">카메라로 스캔하세요</span>';
        qrRendered = true;
      } catch (svgErr) {
        console.error('SVG QR render error', svgErr);
      }
    }
  }

  if (!qrRendered && qrContainer) {
    qrContainer.innerHTML = `
      <div class="w-36 h-36 flex flex-col items-center justify-center p-2 text-center bg-slate-100 rounded-lg border border-slate-300">
        <span class="text-xs font-bold text-slate-700 mb-1">QR 표시 실패</span>
        <span class="text-[10px] text-slate-500 mb-2">아래 [복사] 버튼으로 주소를 전달하세요</span>
        <button onclick="copyTrackerUrl()" class="px-2 py-1 bg-blue-600 hover:bg-blue-500 text-white rounded text-[10px] font-semibold">링크 복사</button>
      </div>`;
  }

  // Traccar info
  const traccarUrlInput = document.getElementById('traccar-server-url');
  if (traccarUrlInput) traccarUrlInput.value = `${baseUrl}/api/gps/osm`;
  const traccarDevIdInput = document.getElementById('traccar-dev-id');
  if (traccarDevIdInput) traccarDevIdInput.value = dev.id;

  // cURL sample
  const curlEl = document.getElementById('curl-sample-code');
  if (curlEl) {
    curlEl.textContent = `curl -X POST "${baseUrl}/api/gps/update" -H "Content-Type: application/json" -d "{\\"deviceId\\":\\"${dev.id}\\",\\"secretKey\\":\\"${dev.secretKey}\\",\\"lat\\":37.5665,\\"lng\\":126.9780,\\"speed\\":45.2}"`;
  }

  // Render Status / Warning Banner
  const banner = document.getElementById('guide-public-status-banner');
  if (banner) {
    if (info.isPublic) {
      banner.innerHTML = `
        <div class="p-3 bg-emerald-950/50 border border-emerald-500/40 rounded-xl text-xs text-emerald-200 flex items-start gap-2.5">
          <div class="w-5 h-5 rounded-full bg-emerald-500/20 text-emerald-400 flex items-center justify-center flex-shrink-0 mt-0.5 font-bold">✓</div>
          <div class="flex-1">
            <div class="font-bold text-emerald-300">공개 HTTPS 터널 주소가 정상 연동되었습니다!</div>
            <div class="text-[11px] text-emerald-400/90 mt-0.5 break-all font-mono">${baseUrl}</div>
            <div class="text-[11px] text-slate-300 mt-1">외부 LTE/5G 환경의 스마트폰에서도 브라우저 보안 제약 없이 GPS 위치 권한을 승인하고 연동할 수 있습니다.</div>
          </div>
        </div>`;
    } else {
      banner.innerHTML = `
        <div class="p-3 bg-amber-950/60 border border-amber-500/50 rounded-xl text-xs text-amber-200 flex items-start gap-2.5">
          <div class="w-5 h-5 rounded-full bg-amber-500/20 text-amber-400 flex items-center justify-center flex-shrink-0 mt-0.5 font-bold">⚠️</div>
          <div class="flex-1">
            <div class="font-bold text-amber-300">외부 공개 주소(PUBLIC_URL) 미설정 알림</div>
            <div class="text-[11px] text-amber-200/90 mt-0.5 leading-relaxed">${info.warningMessage}</div>
            <div class="text-[11px] text-slate-300 mt-1">프로젝트 루트의 <code>.env</code> 파일에 <code>PUBLIC_URL=https://&lt;Cloudflare주소&gt;</code>를 설정하거나 위 주소창에 직접 입력 후 [적용]을 누르세요.</div>
          </div>
        </div>`;
    }
  }
}

function updateCustomIpAndQr() {
  const customIpInput = document.getElementById('guide-custom-ip');
  if (customIpInput && customIpInput.value.trim()) {
    userOverriddenHost = customIpInput.value.trim();
  } else {
    userOverriddenHost = null; // reset to default PUBLIC_URL
  }

  let dev = devicesList.find(d => d.id === selectedDeviceId);
  if (!dev && devicesList.length > 0) dev = devicesList[0];
  if (dev) {
    updateGuideModalInfo(dev);
    const info = buildTrackerUrl(dev);
    alert('접속 주소 및 QR코드가 갱신되었습니다:\n' + info.baseUrl);
  }
}

function switchGuideTab(tab) {
  const tabs = ['web', 'tunnel', 'traccar', 'iot'];
  tabs.forEach(t => {
    const el = document.getElementById(`guide-content-${t}`);
    const btn = document.getElementById(`gtab-${t}`);
    if (el) el.classList.add('hidden');
    if (btn) btn.className = 'pb-2 border-b-2 border-transparent text-slate-400 hover:text-slate-200 flex items-center gap-1.5 flex-shrink-0';
  });

  const activeEl = document.getElementById(`guide-content-${tab}`);
  const activeBtn = document.getElementById(`gtab-${tab}`);
  if (activeEl) activeEl.classList.remove('hidden');
  if (activeBtn) activeBtn.className = 'pb-2 border-b-2 border-emerald-500 text-emerald-400 flex items-center gap-1.5 font-bold flex-shrink-0';
}

function copyTrackerUrl() {
  const url = document.getElementById('guide-tracker-url').value;
  if (!url) return;
  navigator.clipboard.writeText(url).then(() => {
    alert('스마트폰 트래커 URL이 복사되었습니다!\n스마트폰의 카카오톡이나 메시지로 전달하여 열어보세요:\n\n' + url);
  }).catch(() => {
    prompt('스마트폰 트래커 URL을 복사하세요:', url);
  });
}

function copyDeviceTrackerUrl(devId, secretKey) {
  const dev = devicesList.find(d => d.id === devId) || { id: devId, secretKey: secretKey, name: devId };
  const info = buildTrackerUrl(dev);

  navigator.clipboard.writeText(info.url).then(() => {
    if (info.isPublic) {
      alert(`[공개 HTTPS 링크 복사 완료]\n기기: ${dev.name || devId} (${devId})\n주소: ${info.url}\n\n스마트폰의 카카오톡이나 메시지로 전달하여 열어보세요!`);
    } else {
      alert(`[로컬 링크 복사 알림]\n기기: ${dev.name || devId} (${devId})\n주소: ${info.url}\n\n※ 주의: .env에 PUBLIC_URL이 설정되지 않아 내부 IP로 생성되었습니다. 외부 모바일 환경에서는 HTTPS 주소가 필요합니다.`);
    }
  }).catch(() => {
    prompt('스마트폰 트래커 URL을 복사하세요:', info.url);
  });
}

function copyTraccarUrl() {
  const url = document.getElementById('traccar-server-url').value;
  navigator.clipboard.writeText(url).then(() => alert('Traccar 서버 주소가 복사되었습니다!'));
}

// -------------------------------------------------------------
// Utilities
// -------------------------------------------------------------
function formatDate(epoch) {
  if (!epoch) return '--';
  const d = new Date(epoch);
  const pad = n => n.toString().padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`;
}

function formatTimeOnly(epoch) {
  if (!epoch) return '--:--';
  const d = new Date(epoch);
  const pad = n => n.toString().padStart(2, '0');
  return `${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`;
}

function formatDuration(millis) {
  if (!millis || millis < 1000) return '0분';
  const totalSec = Math.floor(millis / 1000);
  const hours = Math.floor(totalSec / 3600);
  const minutes = Math.floor((totalSec % 3600) / 60);
  if (hours > 0) return `${hours}시간 ${minutes}분`;
  return `${minutes}분`;
}
