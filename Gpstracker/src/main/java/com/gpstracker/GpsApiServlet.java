package com.gpstracker;

import java.io.IOException;
import java.io.PrintWriter;
import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.util.List;

import jakarta.servlet.annotation.WebServlet;
import jakarta.servlet.http.HttpServlet;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;
import jakarta.servlet.http.HttpSession;

import com.gpstracker.Devicestore.Device;
import com.gpstracker.Devicestore.Point;

/**
 * GPS API
 *
 * [기기 → 서버]  (세션 없이 기기 토큰으로 인증)
 *   POST /api/location        deviceId, token, lat, lng, [speed(km/h)], [battery(0~100)]
 *
 * [브라우저 → 서버]  (로그인 세션 필요, POST는 X-Requested-With: fetch 헤더 필요)
 *   POST /api/logout                       로그아웃 (세션 종료)
 *   GET  /api/devices                      내 기기 + 공용 데모 기기와 최신 위치
 *   GET  /api/devices/{id}/history         from, to (epoch ms)
 *   POST /api/devices                      name  -> 기기 등록
 *   POST /api/devices/{id}/fence           lat, lng, radius(m, 0이면 해제)
 *   POST /api/devices/{id}/delete          기기 삭제 (본인 기기만)
 *
 * Tomcat 11 (jakarta.*) 기준입니다. Tomcat 9 이하라면 import의 jakarta.servlet 을 javax.servlet 으로 바꾸세요.
 */
@WebServlet("/api/*")
public class GpsApiServlet extends HttpServlet {

    private static final long serialVersionUID = 1L;
    private static final long MAX_HISTORY_SPAN_MS = 7L * 24 * 60 * 60 * 1000;

    // ---------------------------------------------------------------- GET

    @Override
    protected void doGet(HttpServletRequest req, HttpServletResponse resp) throws IOException {
        String user = requireUser(req, resp);
        if (user == null) {
            return;
        }
        String[] p = parts(req);

        if (p.length == 1 && p[0].equals("devices")) {
            listDevices(user, resp);
        } else if (p.length == 3 && p[0].equals("devices") && p[2].equals("history")) {
            history(user, p[1], req, resp);
        } else {
            error(resp, 404, "존재하지 않는 API입니다.");
        }
    }

    // ---------------------------------------------------------------- POST

    @Override
    protected void doPost(HttpServletRequest req, HttpServletResponse resp) throws IOException {
        req.setCharacterEncoding("UTF-8");
        String[] p = parts(req);

        // 기기가 위치를 보내는 경로: 세션이 아니라 토큰으로 인증
        if (p.length == 1 && p[0].equals("location")) {
            receiveLocation(req, resp);
            return;
        }

        // 로그아웃: 세션이 이미 만료됐어도 성공으로 응답합니다.
        if (p.length == 1 && p[0].equals("logout")) {
            logout(req, resp);
            return;
        }

        // 이하는 브라우저 전용: 로그인 + CSRF 방어(커스텀 헤더)
        String user = requireUser(req, resp);
        if (user == null) {
            return;
        }
        if (!"fetch".equals(req.getHeader("X-Requested-With"))) {
            error(resp, 403, "허용되지 않은 요청입니다.");
            return;
        }

        if (p.length == 1 && p[0].equals("devices")) {
            createDevice(user, req, resp);
        } else if (p.length == 3 && p[0].equals("devices") && p[2].equals("fence")) {
            setFence(user, p[1], req, resp);
        } else if (p.length == 3 && p[0].equals("devices") && p[2].equals("delete")) {
            deleteDevice(user, p[1], resp);
        } else {
            error(resp, 404, "존재하지 않는 API입니다.");
        }
    }

    // ---------------------------------------------------------------- handlers

    private void logout(HttpServletRequest req, HttpServletResponse resp) throws IOException {
        if (!"fetch".equals(req.getHeader("X-Requested-With"))) {
            error(resp, 403, "허용되지 않은 요청입니다.");
            return;
        }
        HttpSession s = req.getSession(false);
        if (s != null) {
            s.invalidate();
        }
        json(resp, 200, "{\"ok\":true}");
    }

    private void receiveLocation(HttpServletRequest req, HttpServletResponse resp) throws IOException {
        Device d = Devicestore.get(req.getParameter("deviceId"));
        String token = req.getParameter("token");
        if (d == null || token == null
                || !MessageDigest.isEqual(d.token.getBytes(StandardCharsets.UTF_8),
                        token.getBytes(StandardCharsets.UTF_8))) {
            error(resp, 401, "기기 ID 또는 토큰이 올바르지 않습니다.");
            return;
        }

        double lat;
        double lng;
        try {
            lat = Double.parseDouble(req.getParameter("lat"));
            lng = Double.parseDouble(req.getParameter("lng"));
        } catch (Exception e) {
            error(resp, 400, "lat, lng 는 숫자여야 합니다.");
            return;
        }
        if (!(lat >= -90 && lat <= 90 && lng >= -180 && lng <= 180)) {
            error(resp, 400, "좌표 범위가 올바르지 않습니다.");
            return;
        }

        double speed = clamp(parseDouble(req.getParameter("speed"), 0), 0, 400);
        int battery = (int) clamp(parseDouble(req.getParameter("battery"), -1), -1, 100);

        // 기기 시계는 믿지 않고 서버 수신 시각을 기록합니다.
        d.addPoint(new Point(System.currentTimeMillis(), lat, lng, speed, battery));
        json(resp, 200, "{\"ok\":true}");
    }

    private void listDevices(String user, HttpServletResponse resp) throws IOException {
        StringBuilder sb = new StringBuilder();
        sb.append("{\"now\":").append(System.currentTimeMillis()).append(",\"devices\":[");
        List<Device> list = Devicestore.listFor(user);
        for (int i = 0; i < list.size(); i++) {
            if (i > 0) {
                sb.append(',');
            }
            appendDevice(sb, list.get(i), user);
        }
        sb.append("]}");
        json(resp, 200, sb.toString());
    }

    private void history(String user, String id, HttpServletRequest req, HttpServletResponse resp)
            throws IOException {
        Device d = Devicestore.get(id);
        if (!Devicestore.canAccess(d, user)) {
            error(resp, 404, "기기를 찾을 수 없습니다.");
            return;
        }
        long now = System.currentTimeMillis();
        long from = (long) parseDouble(req.getParameter("from"), now - 3600_000L);
        long to = (long) parseDouble(req.getParameter("to"), now);
        if (to < from) {
            error(resp, 400, "기간이 올바르지 않습니다.");
            return;
        }
        if (to - from > MAX_HISTORY_SPAN_MS) {
            from = to - MAX_HISTORY_SPAN_MS;
        }

        StringBuilder sb = new StringBuilder("{\"points\":[");
        List<Point> pts = d.range(from, to);
        for (int i = 0; i < pts.size(); i++) {
            Point pt = pts.get(i);
            if (i > 0) {
                sb.append(',');
            }
            sb.append('[').append(pt.ts).append(',').append(pt.lat).append(',').append(pt.lng).append(']');
        }
        sb.append("]}");
        json(resp, 200, sb.toString());
    }

    private void createDevice(String user, HttpServletRequest req, HttpServletResponse resp)
            throws IOException {
        String name = req.getParameter("name");
        name = name == null ? "" : name.trim();
        if (name.isEmpty() || name.length() > 30) {
            error(resp, 400, "기기 이름은 1~30자로 입력하세요.");
            return;
        }
        Device d = Devicestore.create(user, name);
        if (d == null) {
            error(resp, 400, "기기는 최대 " + Devicestore.MAX_DEVICES_PER_USER + "개까지 등록할 수 있습니다.");
            return;
        }
        StringBuilder sb = new StringBuilder();
        appendDevice(sb, d, user);
        json(resp, 200, sb.toString());
    }

    private void setFence(String user, String id, HttpServletRequest req, HttpServletResponse resp)
            throws IOException {
        Device d = Devicestore.get(id);
        if (!Devicestore.canAccess(d, user)) {
            error(resp, 404, "기기를 찾을 수 없습니다.");
            return;
        }
        double radius = parseDouble(req.getParameter("radius"), 0);
        if (radius <= 0) {
            d.setFence(0, 0, 0);
            json(resp, 200, "{\"ok\":true}");
            return;
        }
        double lat = parseDouble(req.getParameter("lat"), Double.NaN);
        double lng = parseDouble(req.getParameter("lng"), Double.NaN);
        if (!(lat >= -90 && lat <= 90 && lng >= -180 && lng <= 180) || radius > 50000) {
            error(resp, 400, "구역 값이 올바르지 않습니다. (반경은 50km 이하)");
            return;
        }
        d.setFence(lat, lng, radius);
        json(resp, 200, "{\"ok\":true}");
    }

    private void deleteDevice(String user, String id, HttpServletResponse resp) throws IOException {
        Device d = Devicestore.get(id);
        if (!Devicestore.isOwner(d, user)) {
            error(resp, 404, "삭제할 수 있는 기기가 아닙니다.");
            return;
        }
        Devicestore.remove(id);
        json(resp, 200, "{\"ok\":true}");
    }

    // ---------------------------------------------------------------- helpers

    private static void appendDevice(StringBuilder sb, Device d, String user) {
        boolean mine = Devicestore.isOwner(d, user);
        sb.append("{\"id\":").append(q(d.id));
        sb.append(",\"name\":").append(q(d.name));
        sb.append(",\"mine\":").append(mine);
        if (mine) {
            sb.append(",\"token\":").append(q(d.token)); // 토큰은 기기 주인에게만 보여줍니다.
        }
        if (d.getFenceRadius() > 0) {
            sb.append(",\"fence\":{\"lat\":").append(d.getFenceLat())
              .append(",\"lng\":").append(d.getFenceLng())
              .append(",\"r\":").append(d.getFenceRadius()).append('}');
        } else {
            sb.append(",\"fence\":null");
        }
        Point last = d.last();
        if (last == null) {
            sb.append(",\"last\":null");
        } else {
            sb.append(",\"last\":{\"lat\":").append(last.lat)
              .append(",\"lng\":").append(last.lng)
              .append(",\"speed\":").append(last.speed)
              .append(",\"battery\":").append(last.battery)
              .append(",\"ts\":").append(last.ts).append('}');
        }
        sb.append('}');
    }

    private static String requireUser(HttpServletRequest req, HttpServletResponse resp) throws IOException {
        HttpSession s = req.getSession(false);
        Object u = s == null ? null : s.getAttribute("loginUser");
        if (!(u instanceof String)) {
            error(resp, 401, "로그인이 필요합니다.");
            return null;
        }
        return (String) u;
    }

    private static String[] parts(HttpServletRequest req) {
        String path = req.getPathInfo();
        if (path == null || path.equals("/")) {
            return new String[0];
        }
        return path.substring(1).split("/");
    }

    private static double parseDouble(String s, double fallback) {
        if (s == null) {
            return fallback;
        }
        try {
            return Double.parseDouble(s.trim());
        } catch (NumberFormatException e) {
            return fallback;
        }
    }

    private static double clamp(double v, double min, double max) {
        if (Double.isNaN(v)) {
            return min;
        }
        return Math.max(min, Math.min(max, v));
    }

    private static void error(HttpServletResponse resp, int status, String message) throws IOException {
        json(resp, status, "{\"error\":" + q(message) + "}");
    }

    private static void json(HttpServletResponse resp, int status, String body) throws IOException {
        resp.setStatus(status);
        resp.setContentType("application/json;charset=UTF-8");
        resp.setHeader("Cache-Control", "no-store");
        PrintWriter w = resp.getWriter();
        w.write(body);
        w.flush();
    }

    /** JSON 문자열 리터럴로 안전하게 변환 */
    private static String q(String s) {
        StringBuilder sb = new StringBuilder(s.length() + 2);
        sb.append('"');
        for (int i = 0; i < s.length(); i++) {
            char c = s.charAt(i);
            switch (c) {
                case '"':
                    sb.append("\\\"");
                    break;
                case '\\':
                    sb.append("\\\\");
                    break;
                case '\n':
                    sb.append("\\n");
                    break;
                case '\r':
                    sb.append("\\r");
                    break;
                case '\t':
                    sb.append("\\t");
                    break;
                default:
                    if (c < 0x20) {
                        sb.append(String.format("\\u%04x", (int) c));
                    } else {
                        sb.append(c);
                    }
            }
        }
        return sb.append('"').toString();
    }
}