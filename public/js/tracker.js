// ====================================================================
// Smartphone GPS Transmitter - Client Logic (GeoLive Tracker)
// ====================================================================

let miniMap = null;
let miniMarker = null;
let isTransmitting = false;
let watchId = null;
let txTimer = null;
let txCount = 0;
let wakeLock = null;

// Config
let config = {
  deviceId: 'DEV-CAR-101',
  secretKey: '',
  interval: 3000,
  serverUrl: ''
};

// Current cached GPS fix
let lastKnownPosition = null;

document.addEventListener('DOMContentLoaded', () => {
  parseUrlParams();
  checkSecurityContext();
  initMiniMap();
  initWakeLockSupport();
  lucide.createIcons();
});

function checkSecurityContext() {
  const isSecure = window.isSecureContext || window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1';
  const banner = document.getElementById('https-warning-banner');
  if (!isSecure && banner) {
    banner.classList.remove('hidden');
  }
}

function parseUrlParams() {
  const params = new URLSearchParams(window.location.search);
  if (params.has('deviceId')) config.deviceId = params.get('deviceId');
  if (params.has('secretKey')) config.secretKey = params.get('secretKey');
  if (params.has('interval')) config.interval = parseInt(params.get('interval'), 10);
  if (params.has('serverUrl')) config.serverUrl = params.get('serverUrl');

  // Restore saved config if not in URL
  const savedDev = localStorage.getItem('gl_tx_device');
  if (savedDev && !params.has('deviceId')) config.deviceId = savedDev;
  const savedKey = localStorage.getItem('gl_tx_key');
  if (savedKey && !params.has('secretKey')) config.secretKey = savedKey;

  updateConfigUI();
}

function updateConfigUI() {
  document.getElementById('tracker-device-id').textContent = config.deviceId;
  document.getElementById('input-device-id').value = config.deviceId;
  const srvEl = document.getElementById('input-server-url');
  if (srvEl) srvEl.value = config.serverUrl || '';
  document.getElementById('input-secret-key').value = config.secretKey;
  document.getElementById('select-interval').value = config.interval.toString();
  document.getElementById('tracker-interval-pill').textContent = `${config.interval / 1000}초 주기`;
}

function toggleConfig() {
  const panel = document.getElementById('config-panel');
  panel.classList.toggle('hidden');
}

function saveConfig() {
  config.deviceId = document.getElementById('input-device-id').value.trim() || 'DEV-PHONE-202';
  const srvEl = document.getElementById('input-server-url');
  if (srvEl) config.serverUrl = srvEl.value.trim();
  config.secretKey = document.getElementById('input-secret-key').value.trim();
  config.interval = parseInt(document.getElementById('select-interval').value, 10);

  localStorage.setItem('gl_tx_device', config.deviceId);
  localStorage.setItem('gl_tx_server', config.serverUrl);
  localStorage.setItem('gl_tx_key', config.secretKey);

  updateConfigUI();
  toggleConfig();

  if (isTransmitting) {
    stopTransmission();
    startTransmission();
  }
}

function initMiniMap() {
  miniMap = L.map('mini-map', {
    center: [37.5665, 126.9780],
    zoom: 14,
    zoomControl: false,
    attributionControl: false
  });

  L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
    maxZoom: 18
  }).addTo(miniMap);
}

// -------------------------------------------------------------
// Screen Wake Lock (Keep Screen On)
// -------------------------------------------------------------
async function initWakeLockSupport() {
  document.addEventListener('visibilitychange', async () => {
    if (wakeLock !== null && document.visibilityState === 'visible') {
      try {
        wakeLock = await navigator.wakeLock.request('screen');
      } catch (e) {}
    }
  });
}

async function requestWakeLock() {
  if ('wakeLock' in navigator) {
    try {
      wakeLock = await navigator.wakeLock.request('screen');
      console.log('Screen WakeLock active');
    } catch (e) {
      console.warn('WakeLock error', e);
    }
  }
}

function releaseWakeLock() {
  if (wakeLock) {
    wakeLock.release().then(() => { wakeLock = null; });
  }
}

// -------------------------------------------------------------
// Transmission Control
// -------------------------------------------------------------
function toggleTransmission() {
  if (isTransmitting) {
    stopTransmission();
  } else {
    startTransmission();
  }
}

function startTransmission() {
  if (!navigator.geolocation) {
    alert('이 브라우저는 GPS 위치 정보를 지원하지 않습니다.');
    return;
  }

  isTransmitting = true;
  requestWakeLock();

  const btn = document.getElementById('btn-toggle-transmission');
  btn.className = 'w-full py-4 rounded-2xl font-bold text-base transition duration-200 flex items-center justify-center gap-2 shadow-xl bg-gradient-to-r from-rose-600 to-red-600 text-white shadow-rose-600/30 active:scale-[0.98]';
  document.getElementById('btn-label').textContent = 'GPS 전송 중지하기';
  document.getElementById('btn-icon').setAttribute('data-lucide', 'square');

  const badge = document.getElementById('tx-status-badge');
  badge.innerHTML = `<span class="w-2 h-2 rounded-full bg-emerald-400 animate-ping"></span> 전송 중`;
  badge.className = 'px-2.5 py-1 rounded-full text-xs font-semibold bg-emerald-500/20 text-emerald-400 border border-emerald-500/30 flex items-center gap-1.5';

  lucide.createIcons();

  // 1. High-accuracy continuous GPS watcher
  const geoOptions = {
    enableHighAccuracy: true,
    timeout: 15000,
    maximumAge: 0
  };

  watchId = navigator.geolocation.watchPosition(
    onGeolocationSuccess,
    onGeolocationError,
    geoOptions
  );

  // 2. Periodic Sender Timer
  txTimer = setInterval(sendCachedLocation, config.interval);

  // Send first fix immediately
  navigator.geolocation.getCurrentPosition(
    pos => {
      onGeolocationSuccess(pos);
      sendCachedLocation();
    },
    onGeolocationError,
    geoOptions
  );
}

function stopTransmission() {
  isTransmitting = false;
  releaseWakeLock();

  if (watchId !== null) {
    navigator.geolocation.clearWatch(watchId);
    watchId = null;
  }
  if (txTimer !== null) {
    clearInterval(txTimer);
    txTimer = null;
  }

  const btn = document.getElementById('btn-toggle-transmission');
  btn.className = 'w-full py-4 rounded-2xl font-bold text-base transition duration-200 flex items-center justify-center gap-2 shadow-xl bg-gradient-to-r from-emerald-600 to-teal-600 text-white shadow-emerald-600/30 active:scale-[0.98]';
  document.getElementById('btn-label').textContent = 'GPS 실시간 전송 시작';
  document.getElementById('btn-icon').setAttribute('data-lucide', 'play');

  const badge = document.getElementById('tx-status-badge');
  badge.innerHTML = `<span class="w-2 h-2 rounded-full bg-slate-500"></span> 전송 중지`;
  badge.className = 'px-2.5 py-1 rounded-full text-xs font-semibold bg-slate-800 text-slate-400 border border-slate-700 flex items-center gap-1.5';

  lucide.createIcons();
}

function onGeolocationSuccess(pos) {
  lastKnownPosition = pos;

  const crd = pos.coords;
  const speedKmh = crd.speed != null ? Math.max(0, crd.speed * 3.6) : 0.0;

  // Update UI Telemetry
  document.getElementById('tx-speed').textContent = speedKmh.toFixed(1);
  document.getElementById('tx-lat').textContent = crd.latitude.toFixed(6);
  document.getElementById('tx-lng').textContent = crd.longitude.toFixed(6);
  document.getElementById('tx-accuracy').textContent = `± ${crd.accuracy.toFixed(1)} m`;

  const alt = crd.altitude != null ? `${Math.round(crd.altitude)} m` : '-- m';
  const heading = crd.heading != null && !isNaN(crd.heading) ? `${Math.round(crd.heading)}°` : '--°';
  document.getElementById('tx-alt-bearing').textContent = `${alt} / ${heading}`;

  // Mini map update
  const latlng = [crd.latitude, crd.longitude];
  if (!miniMarker) {
    miniMarker = L.circleMarker(latlng, {
      radius: 8,
      fillColor: '#10B981',
      color: '#ffffff',
      weight: 2,
      opacity: 1,
      fillOpacity: 0.9
    }).addTo(miniMap);
    miniMap.setView(latlng, 15);
  } else {
    miniMarker.setLatLng(latlng);
    miniMap.panTo(latlng);
  }
}

function onGeolocationError(err) {
  console.warn(`Geolocation Error (${err.code}): ${err.message}`);
  let msg = 'GPS 수신 오류: ' + err.message;
  if (err.code === 1) {
    msg = '위치 정보 권한이 거부되었습니다. 스마트폰 브라우저 설정에서 위치 권한을 허용해주세요.';
    stopTransmission();
  }
  document.getElementById('tx-status-badge').textContent = 'GPS 오류';
  alert(msg);
}

async function sendCachedLocation() {
  if (!lastKnownPosition) return;

  const crd = lastKnownPosition.coords;
  const speedKmh = crd.speed != null ? Math.max(0, crd.speed * 3.6) : 0.0;

  let batteryLevel = 100;
  try {
    if ('getBattery' in navigator) {
      const b = await navigator.getBattery();
      batteryLevel = Math.round(b.level * 100);
    }
  } catch (e) {}

  const payload = {
    deviceId: config.deviceId,
    secretKey: config.secretKey,
    lat: crd.latitude,
    lng: crd.longitude,
    speed: Math.round(speedKmh * 10) / 10,
    altitude: crd.altitude != null ? Math.round(crd.altitude * 10) / 10 : 0.0,
    bearing: crd.heading != null && !isNaN(crd.heading) ? Math.round(crd.heading * 10) / 10 : 0.0,
    accuracy: Math.round(crd.accuracy * 10) / 10,
    battery: batteryLevel,
    timestamp: lastKnownPosition.timestamp || Date.now()
  };

  const targetUrl = config.serverUrl ? (config.serverUrl.replace(/\/+$/, '') + '/api/gps/update') : '/api/gps/update';

  try {
    const res = await fetch(targetUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    });

    if (res.ok) {
      txCount++;
      document.getElementById('tx-count').textContent = txCount;
      const badge = document.getElementById('tx-status-badge');
      badge.innerHTML = `<span class="w-2 h-2 rounded-full bg-emerald-400 animate-ping"></span> 전송 성공 (${txCount}회)`;
    } else {
      console.warn('Server rejected GPS update', await res.text());
    }
  } catch (e) {
    console.error('Failed to post GPS update', e);
  }
}
