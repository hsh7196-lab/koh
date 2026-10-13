<%@ page language="java" contentType="text/html; charset=UTF-8" pageEncoding="UTF-8"%>
<!DOCTYPE html>
<html>
<head>
    <meta charset="UTF-8">
    <title>GPS 실시간 추적 시스템</title>
    <!-- 오픈소스 무료 지도 라이브러리 (Leaflet CSS) -->
    <link rel="stylesheet" href="https://unpkg.com/leaflet@1.9.4/dist/leaflet.css" />
    <style>
        html, body {
            width: 100%;
            height: 100%;
            margin: 0;
            padding: 0;
            font-family: 'Noto Sans KR', sans-serif;
        }
        #map {
            width: 100%;
            height: 100vh;
            z-index: 1;
        }
        /* 기존 정보 상자 디자인 유지 및 레이어 조정 */
        #info-box {
            position: absolute;
            top: 70px; /* 상단 메뉴 바 아래로 위치 조정 */
            left: 10px;
            z-index: 1000;
            background: white;
            padding: 12px 18px;
            border-radius: 8px;
            box-shadow: 0 2px 8px rgba(0,0,0,0.25);
        }
        #info-box h3 {
            margin: 0 0 8px 0;
            font-size: 16px;
        }
        #info-box p {
            margin: 0;
            font-size: 13px;
            color: #555;
        }

        /* 새로 추가된 상단 네비게이션/회원 바 (지도 위에 띄움) */
        #top-bar {
            position: absolute;
            top: 0;
            left: 0;
            width: 100%;
            height: 50px;
            background: rgba(33, 37, 41, 0.9); /* 반투명 검은색 */
            color: white;
            z-index: 1000;
            display: flex;
            align-items: center;
            justify-content: space-between;
            padding: 0 20px;
            box-sizing: border-box;
        }
        #top-bar .logo {
            font-size: 16px;
            font-weight: bold;
        }
        #top-bar .user-menu a {
            color: white;
            text-decoration: none;
            margin-left: 12px;
            font-size: 14px;
            padding: 5px 10px;
            border-radius: 4px;
            background: #4a5568;
            transition: 0.2s;
        }
        #top-bar .user-menu a:hover {
            background: #2b6cb0;
        }
        #top-bar .user-menu .welcome-text {
            font-size: 14px;
            margin-right: 8px;
            color: #e2e8f0;
        }
    </style>
</head>
<body>

    <!-- 1. 새로 추가된 상단 통합 헤더 (로그인 / 세션 처리) -->
    <div id="top-bar">
        <div class="logo">📡 GPS 관제 센터</div>
        <div class="user-menu">
            <%
                // 세션에서 로그인 사용자 정보 확인
                String loginUser = (String) session.getAttribute("loginUser");
                if (loginUser == null) {
            %>
                <!-- 비로그인 상태일 때 -->
                <a href="login.jsp">로그인</a>
                <a href="signup.jsp">회원가입</a>
          <%
    } else {
%>
    <!-- 로그인 상태일 때 -->
    <span class="welcome-text"><strong><%= loginUser %></strong>님 접속 중</span>
    <a href="mypage.jsp">마이페이지</a>
    <!-- ⭕ 수정 후: 컨텍스트 경로 추가 -->
    <a href="${pageContext.request.contextPath}/logout">로그아웃</a>
<%
    }
%>
        </div>
    </div>

    <!-- 2. 기존 정보 박스 -->
    <div id="info-box">
        <h3>🛰️ GPS 추적 시스템</h3>
        <p id="coord-text">현재 위치를 불러오는 중...</p>
    </div>

    <!-- 3. 지도가 표시될 영역 (기존 유지) -->
    <div id="map"></div>

    <!-- 오픈소스 무료 지도 라이브러리 (Leaflet JS) -->
    <script src="https://unpkg.com/leaflet@1.9.4/dist/leaflet.js"></script>
    
    <script>
        // 1. 기본 위치 (서울 시청 위도, 경도)
        var defaultLat = 37.5665;
        var defaultLng = 126.9780;

        // 2. 지도 생성 (OpenStreetMap 기반)
        var map = L.map('map').setView([defaultLat, defaultLng], 15);

        L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
            maxZoom: 19,
            attribution: '© OpenStreetMap contributors'
        }).addTo(map);

        // 3. 마커 생성
        var marker = L.marker([defaultLat, defaultLng]).addTo(map);
        marker.bindPopup("<b>가상 GPS 위치</b><br>서울 시청").openPopup();

        // 4. GPS 위치 업데이트 함수
        function updateGpsPosition(lat, lng) {
            var newLatLng = new L.LatLng(lat, lng);
            marker.setLatLng(newLatLng);
            map.setView(newLatLng, 15);
            document.getElementById('coord-text').innerText = "위도: " + lat + ", 경도: " + lng;
        }

        // 테스트용 시뮬레이션 (3초 후 강남역 이동)
        setTimeout(function() {
            updateGpsPosition(37.4979, 127.0276); 
            marker.bindPopup("<b>이동된 GPS 위치</b><br>강남역").openPopup();
        }, 3000);
    </script>
</body>
</html>