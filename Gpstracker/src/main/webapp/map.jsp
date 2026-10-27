<%@ page language="java" contentType="text/html; charset=UTF-8" pageEncoding="UTF-8"%>
<!DOCTYPE html>
<html>
<head>
    <meta charset="UTF-8">
    <title>커스텀 맵 실시간 GPS 관제</title>
    <style>
        /* 커스텀 가상 지도 스타일링 */
        #custom-map {
            width: 500px;
            height: 500px;
            background-color: #e8f4f8;
            border: 3px solid #333;
            border-radius: 10px;
            position: relative;
            overflow: hidden;
            background-image: 
                linear-gradient(#ccc 1px, transparent 1px),
                linear-gradient(90deg, #ccc 1px, transparent 1px);
            background-size: 50px 50px; /* 격자무늬 가상 지도 */
        }

        /* 맵 위의 가상 GPS 단말 마커 */
        #gps-marker {
            width: 20px;
            height: 20px;
            background-color: #ff3366;
            border: 2px solid #ffffff;
            border-radius: 50%;
            position: absolute;
            top: 250px;
            left: 250px;
            transform: translate(-50%, -50%);
            transition: all 0.8s ease-out; /* 부드러운 위치 이동 효과 */
            box-shadow: 0 0 10px rgba(255, 51, 102, 0.8);
        }

        #status {
            padding: 10px;
            background: #f0f0f0;
            font-weight: bold;
            margin-bottom: 10px;
            width: 480px;
        }
    </style>
</head>
<body>

    <h2>gpstracker 커스텀 맵 실시간 관제</h2>
    <div id="status">상태: 연결 대기 중...</div>

    <!-- 직접 만든 가상 맵 영역 -->
    <div id="custom-map">
        <div id="gps-marker"></div>
    </div>

    <script>
        var marker = document.getElementById("gps-marker");
        var statusDiv = document.getElementById("status");

        // 8282 포트를 사용하는 Tomcat 서버의 웹소켓 연결 URL 설정
        var wsProtocol = window.location.protocol === "https:" ? "wss://" : "ws://";
        var wsUrl = wsProtocol + window.location.hostname + ":8282/gpstracker/gps-websocket";
        
        var socket = new WebSocket(wsUrl);

        socket.onopen = function() {
            statusDiv.innerText = "상태: 실시간 GPS 서버 연결 완료 (포트 8282) 🟢";
        };

        socket.onmessage = function(event) {
            // 서버에서 수신한 X, Y 위치값
            var gpsData = JSON.parse(event.data);
            var x = gpsData.x;
            var y = gpsData.y;

            // 직접 만든 맵 위에 마커 위치 업데이트
            marker.style.left = x + "px";
            marker.style.top = y + "px";

            statusDiv.innerText = `상태: 위치 수신 중 🟢 | X: ${x}px, Y: ${y}px`;
        };

        socket.onclose = function() {
            statusDiv.innerText = "상태: 서버 연결 끊김 🔴";
        };

        socket.onerror = function(error) {
            statusDiv.innerText = "상태: 연결 오류 발생 🔴";
        };
    </script>
</body>
</html>