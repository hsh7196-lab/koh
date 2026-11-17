import com.sun.net.httpserver.HttpExchange;
import com.sun.net.httpserver.HttpHandler;
import com.sun.net.httpserver.HttpServer;

import java.io.*;
import java.net.*;
import java.nio.charset.StandardCharsets;
import java.nio.file.*;
import java.security.MessageDigest;
import java.time.Instant;
import java.time.LocalDateTime;
import java.time.ZoneId;
import java.time.format.DateTimeFormatter;
import java.util.*;
import java.util.concurrent.*;
import java.util.concurrent.atomic.AtomicBoolean;

public class GpsServer {
    private static final int DEFAULT_PORT = 8080;
    private static final Path DATA_DIR = Paths.get("data");
    private static final Path PUBLIC_DIR = Paths.get("public");

    private static final ConcurrentHashMap<String, User> users = new ConcurrentHashMap<>();
    private static final ConcurrentHashMap<String, String> sessions = new ConcurrentHashMap<>(); // token -> username
    private static final ConcurrentHashMap<String, Device> devices = new ConcurrentHashMap<>(); // deviceId -> Device
    private static final ConcurrentHashMap<String, List<GpsPoint>> history = new ConcurrentHashMap<>(); // deviceId -> points
    private static final ConcurrentHashMap<String, GpsPoint> latestPoints = new ConcurrentHashMap<>(); // deviceId -> latest point
    private static final ConcurrentHashMap<String, SimulatorTask> activeSimulators = new ConcurrentHashMap<>();

    // SSE subscribers
    private static final Set<HttpExchange> sseClients = ConcurrentHashMap.newKeySet();
    private static final Map<String, String> envConfig = new ConcurrentHashMap<>();
    private static volatile String activeEnvPath = "None";
    private static volatile long activeEnvLastModified = 0;
    private static volatile boolean activeEnvLoaded = false;

    public static synchronized void loadEnv() {
        List<Path> candidates = new ArrayList<>();
        // Priority 1: directory containing GpsServer.class (most reliable across all launch scripts)
        try {
            File codeSource = new File(GpsServer.class.getProtectionDomain().getCodeSource().getLocation().toURI());
            File parent = codeSource.isDirectory() ? codeSource : codeSource.getParentFile();
            if (parent != null) candidates.add(new File(parent, ".env").toPath());
        } catch (Exception ignored) {}
        // Priority 2: user.dir
        candidates.add(Paths.get(System.getProperty("user.dir", "."), ".env"));
        candidates.add(Paths.get(".env"));

        for (Path p : candidates) {
            Path abs = p.toAbsolutePath().normalize();
            if (Files.exists(abs) && !Files.isDirectory(abs)) {
                try {
                    List<String> lines = Files.readAllLines(abs, StandardCharsets.UTF_8);
                    envConfig.clear();
                    for (String line : lines) {
                        line = line.replace("\uFEFF", "").trim();
                        if (line.isEmpty() || line.startsWith("#")) continue;
                        int eq = line.indexOf('=');
                        if (eq > 0) {
                            String k = line.substring(0, eq).trim();
                            String v = line.substring(eq + 1).trim();
                            if ((v.startsWith("\"") && v.endsWith("\"")) || (v.startsWith("'") && v.endsWith("'"))) {
                                if (v.length() >= 2) v = v.substring(1, v.length() - 1).trim();
                            }
                            envConfig.put(k, v);
                        }
                    }
                    activeEnvPath = abs.toString();
                    activeEnvLastModified = Files.getLastModifiedTime(abs).toMillis();
                    activeEnvLoaded = true;
                    return;
                } catch (Exception ignored) {}
            }
        }
    }

    public static String getEnv(String key, String def) {
        // Priority 1: .env configuration in project directory
        String val = envConfig.get(key);
        if (val != null && !val.trim().isEmpty()) return val.trim();
        // Priority 2: OS/Process environment variable
        val = System.getenv(key);
        if (val != null && !val.trim().isEmpty()) return val.trim();
        return def;
    }

    public static void main(String[] args) throws Exception {
        loadEnv();
        int port = DEFAULT_PORT;
        try {
            port = Integer.parseInt(getEnv("PORT", String.valueOf(DEFAULT_PORT)));
        } catch (NumberFormatException ignored) {}

        if (args.length > 0) {
            try {
                port = Integer.parseInt(args[0]);
            } catch (NumberFormatException ignored) {}
        }

        initDirectories();
        loadData();
        ensureDefaultUser();

        HttpServer server;
        try {
            server = HttpServer.create(new InetSocketAddress("0.0.0.0", port), 0);
        } catch (java.net.BindException be) {
            System.err.println("\n=================================================================");
            System.err.println(" [오류] 포트 " + port + "이(가) 이미 사용 중입니다!");
            System.err.println(" 이전에 열려 있는 서버 검은 창(GeoLive/java)을 닫거나,");
            System.err.println(" 작업 관리자에서 실행 중인 java.exe를 종료한 후 다시 실행해 주세요.");
            System.err.println("=================================================================\n");
            throw be;
        }
        server.setExecutor(Executors.newVirtualThreadPerTaskExecutor());

        // API routes
        server.createContext("/api/info", new InfoHandler(port));
        server.createContext("/api/auth/register", new RegisterHandler());
        server.createContext("/api/auth/login", new LoginHandler());
        server.createContext("/api/auth/me", new MeHandler());

        server.createContext("/api/devices", new DevicesHandler());
        server.createContext("/api/devices/reset-token", new ResetTokenHandler());

        server.createContext("/api/gps/update", new GpsUpdateHandler());
        server.createContext("/api/gps/osm", new OsmGpsHandler()); // Traccar / OsmAnd client protocol
        server.createContext("/api/gps/latest", new GpsLatestHandler());
        server.createContext("/api/gps/history", new GpsHistoryHandler());
        server.createContext("/api/gps/stream", new GpsStreamHandler());

        server.createContext("/api/simulator/toggle", new SimulatorToggleHandler());

        // Static files handler (public folder)
        server.createContext("/", new StaticFileHandler());

        server.start();

        printWelcomeBanner(port);

        // Keep running until shutdown
        Runtime.getRuntime().addShutdownHook(new Thread(() -> {
            System.out.println("\n[GPS Server] Shutting down, saving data...");
            saveData();
            System.out.println("[GPS Server] Data saved successfully. Goodbye!");
        }));
    }

    private static void printWelcomeBanner(int port) {
        String localIp = getLocalIpAddress();
        String publicUrl = getEnv("PUBLIC_URL", "");
        System.out.println("=================================================================");
        System.out.println("   🛰️  실시간 GPS 관제 & 동선 트래커 서버가 시작되었습니다!     ");
        System.out.println("=================================================================");
        System.out.println(" • 로컬 웹 브라우저 접속: http://localhost:" + port);
        System.out.println(" • 스마트폰 / 모바일 접속: http://" + localIp + ":" + port);
        if (!publicUrl.isEmpty()) {
            System.out.println(" • 공개 HTTPS 터널 주소 : " + publicUrl);
            System.out.println(" • 스마트폰 공개 트래커 : " + publicUrl + "/tracker.html");
        } else {
            System.out.println(" • 공개 HTTPS 터널 주소 : (미설정 - .env에 PUBLIC_URL을 설정하세요)");
        }
        System.out.println(" • 기본 관리자 계정    : 아이디: admin / 비밀번호: admin1234");
        System.out.println("=================================================================");
        System.out.println("   스마트폰 브라우저나 Traccar 앱으로 위 주소에 접속하여 연동하세요! ");
        System.out.println("=================================================================\n");
    }

    public static String getLocalIpAddress() {
        try {
            Enumeration<NetworkInterface> interfaces = NetworkInterface.getNetworkInterfaces();
            while (interfaces.hasMoreElements()) {
                NetworkInterface iface = interfaces.nextElement();
                if (iface.isLoopback() || !iface.isUp()) continue;
                Enumeration<InetAddress> addresses = iface.getInetAddresses();
                while (addresses.hasMoreElements()) {
                    InetAddress addr = addresses.nextElement();
                    if (addr instanceof Inet4Address && !addr.isLoopbackAddress()) {
                        String ip = addr.getHostAddress();
                        if (ip.startsWith("192.168.") || ip.startsWith("10.") || ip.startsWith("172.")) {
                            return ip;
                        }
                    }
                }
            }
        } catch (Exception ignored) {}
        return "127.0.0.1";
    }

    // -------------------------------------------------------------
    // Data Models
    // -------------------------------------------------------------
    public record User(String username, String passwordHash, String nickname, long createdAt) {}

    public static class Device {
        public String id;
        public String owner;
        public String name;
        public String description;
        public String color;
        public String icon; // car, walk, bike, bus, pet
        public String secretKey;
        public long createdAt;
        public long lastSeen;

        public Device(String id, String owner, String name, String description, String color, String icon, String secretKey, long createdAt) {
            this.id = id;
            this.owner = owner;
            this.name = name;
            this.description = description;
            this.color = color;
            this.icon = icon;
            this.secretKey = secretKey;
            this.createdAt = createdAt;
            this.lastSeen = 0;
        }
    }

    public record GpsPoint(
            String deviceId,
            double lat,
            double lng,
            double speed,     // km/h
            double altitude,  // meters
            double bearing,   // 0~360 degrees
            double accuracy,  // meters
            int battery,      // 0~100 %
            long timestamp    // epoch millis
    ) {}

    // -------------------------------------------------------------
    // Persistence (JSON)
    // -------------------------------------------------------------
    private static void initDirectories() {
        try {
            Files.createDirectories(DATA_DIR);
            Files.createDirectories(PUBLIC_DIR);
        } catch (IOException e) {
            e.printStackTrace();
        }
    }

    private static synchronized void loadData() {
        try {
            Path usersFile = DATA_DIR.resolve("users.json");
            if (Files.exists(usersFile)) {
                String content = Files.readString(usersFile, StandardCharsets.UTF_8);
                List<Map<String, Object>> list = MiniJson.parseArray(content);
                for (var map : list) {
                    String username = (String) map.get("username");
                    String hash = (String) map.get("passwordHash");
                    String nick = (String) map.get("nickname");
                    long created = getLong(map, "createdAt", System.currentTimeMillis());
                    users.put(username, new User(username, hash, nick, created));
                }
            }

            Path devicesFile = DATA_DIR.resolve("devices.json");
            if (Files.exists(devicesFile)) {
                String content = Files.readString(devicesFile, StandardCharsets.UTF_8);
                List<Map<String, Object>> list = MiniJson.parseArray(content);
                for (var map : list) {
                    Device d = new Device(
                            (String) map.get("id"),
                            (String) map.get("owner"),
                            (String) map.get("name"),
                            getString(map, "description", ""),
                            getString(map, "color", "#3B82F6"),
                            getString(map, "icon", "car"),
                            (String) map.get("secretKey"),
                            getLong(map, "createdAt", System.currentTimeMillis())
                    );
                    if (map.containsKey("lastSeen")) {
                        d.lastSeen = getLong(map, "lastSeen", 0L);
                    }
                    devices.put(d.id, d);
                }
            }

            Path locationsFile = DATA_DIR.resolve("locations.json");
            if (Files.exists(locationsFile)) {
                String content = Files.readString(locationsFile, StandardCharsets.UTF_8);
                Map<String, Object> root = MiniJson.parseObject(content);
                for (Map.Entry<String, Object> entry : root.entrySet()) {
                    String devId = entry.getKey();
                    if (entry.getValue() instanceof List<?> rawList) {
                        List<GpsPoint> points = new CopyOnWriteArrayList<>();
                        for (Object o : rawList) {
                            if (o instanceof Map<?, ?> m) {
                                GpsPoint p = mapToPoint(devId, m);
                                points.add(p);
                            }
                        }
                        history.put(devId, points);
                        if (!points.isEmpty()) {
                            latestPoints.put(devId, points.get(points.size() - 1));
                        }
                    }
                }
            }
        } catch (Exception e) {
            System.err.println("[Data] Error loading saved data: " + e.getMessage());
        }
    }

    private static synchronized void saveData() {
        try {
            // Save users
            StringBuilder ub = new StringBuilder("[\n");
            int i = 0;
            for (User u : users.values()) {
                if (i++ > 0) ub.append(",\n");
                ub.append("  {\"username\":").append(MiniJson.quote(u.username()))
                        .append(",\"passwordHash\":").append(MiniJson.quote(u.passwordHash()))
                        .append(",\"nickname\":").append(MiniJson.quote(u.nickname()))
                        .append(",\"createdAt\":").append(u.createdAt()).append("}");
            }
            ub.append("\n]");
            Files.writeString(DATA_DIR.resolve("users.json"), ub.toString(), StandardCharsets.UTF_8);

            // Save devices
            StringBuilder db = new StringBuilder("[\n");
            i = 0;
            for (Device d : devices.values()) {
                if (i++ > 0) db.append(",\n");
                db.append("  {\"id\":").append(MiniJson.quote(d.id))
                        .append(",\"owner\":").append(MiniJson.quote(d.owner))
                        .append(",\"name\":").append(MiniJson.quote(d.name))
                        .append(",\"description\":").append(MiniJson.quote(d.description))
                        .append(",\"color\":").append(MiniJson.quote(d.color))
                        .append(",\"icon\":").append(MiniJson.quote(d.icon))
                        .append(",\"secretKey\":").append(MiniJson.quote(d.secretKey))
                        .append(",\"createdAt\":").append(d.createdAt)
                        .append(",\"lastSeen\":").append(d.lastSeen).append("}");
            }
            db.append("\n]");
            Files.writeString(DATA_DIR.resolve("devices.json"), db.toString(), StandardCharsets.UTF_8);

            // Save recent locations (up to 5000 points per device to keep disk usage reasonable)
            StringBuilder lb = new StringBuilder("{\n");
            int devIdx = 0;
            for (Map.Entry<String, List<GpsPoint>> entry : history.entrySet()) {
                if (devIdx++ > 0) lb.append(",\n");
                lb.append("  ").append(MiniJson.quote(entry.getKey())).append(": [\n");
                List<GpsPoint> list = entry.getValue();
                int start = Math.max(0, list.size() - 5000);
                for (int pIdx = start; pIdx < list.size(); pIdx++) {
                    if (pIdx > start) lb.append(",\n");
                    GpsPoint p = list.get(pIdx);
                    lb.append("    {\"lat\":").append(p.lat())
                            .append(",\"lng\":").append(p.lng())
                            .append(",\"speed\":").append(p.speed())
                            .append(",\"altitude\":").append(p.altitude())
                            .append(",\"bearing\":").append(p.bearing())
                            .append(",\"accuracy\":").append(p.accuracy())
                            .append(",\"battery\":").append(p.battery())
                            .append(",\"timestamp\":").append(p.timestamp()).append("}");
                }
                lb.append("\n  ]");
            }
            lb.append("\n}");
            Files.writeString(DATA_DIR.resolve("locations.json"), lb.toString(), StandardCharsets.UTF_8);

        } catch (Exception e) {
            System.err.println("[Data] Error saving data: " + e.getMessage());
        }
    }

    private static double getDouble(Map<?, ?> m, String key, double def) {
        Object val = m.get(key);
        if (val instanceof Number n) return n.doubleValue();
        return def;
    }

    private static long getLong(Map<?, ?> m, String key, long def) {
        Object val = m.get(key);
        if (val instanceof Number n) return n.longValue();
        return def;
    }

    private static int getInt(Map<?, ?> m, String key, int def) {
        Object val = m.get(key);
        if (val instanceof Number n) return n.intValue();
        return def;
    }

    private static String getString(Map<?, ?> m, String key, String def) {
        Object val = m.get(key);
        if (val instanceof String s) return s;
        return def;
    }

    private static GpsPoint mapToPoint(String deviceId, Map<?, ?> m) {
        return new GpsPoint(
                deviceId,
                getDouble(m, "lat", 0.0),
                getDouble(m, "lng", 0.0),
                getDouble(m, "speed", 0.0),
                getDouble(m, "altitude", 0.0),
                getDouble(m, "bearing", 0.0),
                getDouble(m, "accuracy", 0.0),
                getInt(m, "battery", 100),
                getLong(m, "timestamp", System.currentTimeMillis())
        );
    }

    private static void ensureDefaultUser() {
        if (users.isEmpty()) {
            String adminUser = getEnv("ADMIN_USERNAME", "admin");
            String adminPass = getEnv("ADMIN_PASSWORD", "admin1234");
            String defaultHash = hashPassword(adminPass);
            User admin = new User(adminUser, defaultHash, "관리자", System.currentTimeMillis());
            users.put(adminUser, admin);

            // Add demo devices
            Device demo1 = new Device("DEV-CAR-101", adminUser, "내 승용차 (GV70)", "출퇴근 및 주말 드라이브용 차량", "#2563EB", "car", "key-demo-car-101", System.currentTimeMillis());
            Device demo2 = new Device("DEV-PHONE-202", adminUser, "내 스마트폰 (Galaxy S24)", "개인 휴대용 스마트폰 실시간 위치", "#10B981", "walk", "key-demo-phone-202", System.currentTimeMillis());
            devices.put(demo1.id, demo1);
            devices.put(demo2.id, demo2);

            // Add some realistic initial path for demo (Seoul city center drive)
            generateInitialDemoHistory(demo1.id);

            saveData();
        }
    }

    private static void generateInitialDemoHistory(String devId) {
        List<GpsPoint> list = new CopyOnWriteArrayList<>();
        // Route: Gwanghwamun -> City Hall -> Seoul Station -> Yongsan -> Banpo Bridge -> Gangnam Station
        double[][] coords = {
                {37.5759, 126.9768, 30.0, 150.0}, // Gwanghwamun
                {37.5663, 126.9779, 35.0, 160.0}, // City Hall
                {37.5559, 126.9723, 40.0, 175.0}, // Seoul Station
                {37.5384, 126.9654, 45.0, 155.0}, // Samgakji
                {37.5255, 126.9678, 55.0, 140.0}, // Yongsan
                {37.5133, 126.9959, 65.0, 110.0}, // Banpo Bridge south
                {37.5045, 127.0050, 48.0, 125.0}, // Express Bus Terminal
                {37.4981, 127.0276, 25.0, 130.0}  // Gangnam Station
        };

        long now = System.currentTimeMillis();
        long startTime = now - (coords.length * 60 * 1000L); // 1 minute per leg

        for (int i = 0; i < coords.length; i++) {
            long t = startTime + (i * 60 * 1000L);
            GpsPoint p = new GpsPoint(
                    devId,
                    coords[i][0],
                    coords[i][1],
                    coords[i][2], // speed
                    25.0 + i * 2, // alt
                    coords[i][3], // bearing
                    4.5,
                    95 - i,
                    t
            );
            list.add(p);
        }
        history.put(devId, list);
        if (!list.isEmpty()) {
            latestPoints.put(devId, list.get(list.size() - 1));
            Device d = devices.get(devId);
            if (d != null) d.lastSeen = now;
        }
    }

    // -------------------------------------------------------------
    // Helper Methods
    // -------------------------------------------------------------
    public static String hashPassword(String password) {
        try {
            MessageDigest md = MessageDigest.getInstance("SHA-256");
            byte[] hash = md.digest(password.getBytes(StandardCharsets.UTF_8));
            StringBuilder sb = new StringBuilder();
            for (byte b : hash) {
                sb.append(String.format("%02x", b));
            }
            return sb.toString();
        } catch (Exception e) {
            return password;
        }
    }

    public static String generateToken() {
        return UUID.randomUUID().toString().replace("-", "") + Long.toHexString(System.currentTimeMillis());
    }

    private static User getAuthenticatedUser(HttpExchange exchange) {
        String authHeader = exchange.getRequestHeaders().getFirst("Authorization");
        if (authHeader != null && authHeader.startsWith("Bearer ")) {
            String token = authHeader.substring(7).trim();
            String username = sessions.get(token);
            if (username != null) {
                return users.get(username);
            }
        }
        return null;
    }

    private static void sendJsonResponse(HttpExchange exchange, int statusCode, String json) throws IOException {
        byte[] bytes = json.getBytes(StandardCharsets.UTF_8);
        exchange.getResponseHeaders().set("Content-Type", "application/json; charset=UTF-8");
        exchange.getResponseHeaders().set("Access-Control-Allow-Origin", "*");
        exchange.getResponseHeaders().set("Access-Control-Allow-Headers", "Content-Type, Authorization");
        exchange.getResponseHeaders().set("Access-Control-Allow-Methods", "GET, POST, PUT, DELETE, OPTIONS");
        exchange.sendResponseHeaders(statusCode, bytes.length);
        try (OutputStream os = exchange.getResponseBody()) {
            os.write(bytes);
        }
    }

    private static void broadcastSse(String event, String data) {
        String message = "event: " + event + "\ndata: " + data + "\n\n";
        byte[] bytes = message.getBytes(StandardCharsets.UTF_8);

        Iterator<HttpExchange> iterator = sseClients.iterator();
        while (iterator.hasNext()) {
            HttpExchange client = iterator.next();
            try {
                OutputStream os = client.getResponseBody();
                os.write(bytes);
                os.flush();
            } catch (Exception e) {
                iterator.remove();
                try { client.close(); } catch (Exception ignored) {}
            }
        }
    }

    public static void recordGpsPoint(GpsPoint point) {
        Device dev = devices.get(point.deviceId());
        if (dev != null) {
            dev.lastSeen = point.timestamp();
        }

        history.computeIfAbsent(point.deviceId(), k -> new CopyOnWriteArrayList<>()).add(point);
        latestPoints.put(point.deviceId(), point);

        // Broadcast to SSE clients
        String pointJson = "{\"deviceId\":" + MiniJson.quote(point.deviceId())
                + ",\"lat\":" + point.lat()
                + ",\"lng\":" + point.lng()
                + ",\"speed\":" + point.speed()
                + ",\"altitude\":" + point.altitude()
                + ",\"bearing\":" + point.bearing()
                + ",\"accuracy\":" + point.accuracy()
                + ",\"battery\":" + point.battery()
                + ",\"timestamp\":" + point.timestamp() + "}";
        broadcastSse("gps-update", pointJson);
    }

    // -------------------------------------------------------------
    // HTTP Handlers
    // -------------------------------------------------------------
    static class InfoHandler implements HttpHandler {
        private final int port;
        public InfoHandler(int port) { this.port = port; }

        @Override
        public void handle(HttpExchange exchange) throws IOException {
            if ("OPTIONS".equalsIgnoreCase(exchange.getRequestMethod())) {
                sendJsonResponse(exchange, 200, "{}");
                return;
            }

            // Always reload .env so edits to PUBLIC_URL are reflected immediately
            loadEnv();

            String localIp = getLocalIpAddress();
            String envPublicUrl = getEnv("PUBLIC_URL", "");

            // Detect if accessed via HTTPS proxy / Cloudflare Tunnel / ngrok
            String hostHeader = exchange.getRequestHeaders().getFirst("Host");
            String protoHeader = exchange.getRequestHeaders().getFirst("X-Forwarded-Proto");
            String detectedUrl = "";

            if (!envPublicUrl.isEmpty()) {
                detectedUrl = envPublicUrl.replaceAll("/+$", "");
            } else if (protoHeader != null && hostHeader != null && "https".equalsIgnoreCase(protoHeader)) {
                detectedUrl = "https://" + hostHeader;
            }

            String json = "{\"port\":" + port
                    + ",\"localIp\":" + MiniJson.quote(localIp)
                    + ",\"publicUrl\":" + MiniJson.quote(detectedUrl)
                    + ",\"envPath\":" + MiniJson.quote(activeEnvPath)
                    + ",\"envLoaded\":" + activeEnvLoaded
                    + ",\"envLastModified\":" + activeEnvLastModified
                    + ",\"serverTime\":" + System.currentTimeMillis() + "}";

            exchange.getResponseHeaders().set("Cache-Control", "no-cache, no-store, must-revalidate");
            exchange.getResponseHeaders().set("Pragma", "no-cache");
            sendJsonResponse(exchange, 200, json);
        }
    }

    static class RegisterHandler implements HttpHandler {
        @Override
        public void handle(HttpExchange exchange) throws IOException {
            if ("OPTIONS".equalsIgnoreCase(exchange.getRequestMethod())) {
                sendJsonResponse(exchange, 200, "{}");
                return;
            }
            if (!"POST".equalsIgnoreCase(exchange.getRequestMethod())) {
                sendJsonResponse(exchange, 405, "{\"error\":\"Method not allowed\"}");
                return;
            }
            String body = new String(exchange.getRequestBody().readAllBytes(), StandardCharsets.UTF_8);
            Map<String, Object> req = MiniJson.parseObject(body);
            String username = (String) req.get("username");
            String password = (String) req.get("password");
            String nickname = (String) req.getOrDefault("nickname", username);

            if (username == null || username.trim().isEmpty() || password == null || password.length() < 4) {
                sendJsonResponse(exchange, 400, "{\"error\":\"아이디와 4자리 이상의 비밀번호를 입력해주세요.\"}");
                return;
            }
            username = username.trim().toLowerCase();
            if (users.containsKey(username)) {
                sendJsonResponse(exchange, 409, "{\"error\":\"이미 존재하는 아이디입니다.\"}");
                return;
            }

            User user = new User(username, hashPassword(password), nickname, System.currentTimeMillis());
            users.put(username, user);
            saveData();

            String token = generateToken();
            sessions.put(token, username);

            sendJsonResponse(exchange, 200, "{\"success\":true,\"token\":" + MiniJson.quote(token) + ",\"username\":" + MiniJson.quote(username) + ",\"nickname\":" + MiniJson.quote(nickname) + "}");
        }
    }

    static class LoginHandler implements HttpHandler {
        @Override
        public void handle(HttpExchange exchange) throws IOException {
            if ("OPTIONS".equalsIgnoreCase(exchange.getRequestMethod())) {
                sendJsonResponse(exchange, 200, "{}");
                return;
            }
            if (!"POST".equalsIgnoreCase(exchange.getRequestMethod())) {
                sendJsonResponse(exchange, 405, "{\"error\":\"Method not allowed\"}");
                return;
            }
            String body = new String(exchange.getRequestBody().readAllBytes(), StandardCharsets.UTF_8);
            Map<String, Object> req = MiniJson.parseObject(body);
            String username = (String) req.get("username");
            String password = (String) req.get("password");

            if (username == null || password == null) {
                sendJsonResponse(exchange, 400, "{\"error\":\"아이디와 비밀번호를 입력해주세요.\"}");
                return;
            }
            username = username.trim().toLowerCase();
            User user = users.get(username);
            if (user == null || !user.passwordHash().equals(hashPassword(password))) {
                sendJsonResponse(exchange, 401, "{\"error\":\"아이디 또는 비밀번호가 일치하지 않습니다.\"}");
                return;
            }

            String token = generateToken();
            sessions.put(token, username);

            sendJsonResponse(exchange, 200, "{\"success\":true,\"token\":" + MiniJson.quote(token) + ",\"username\":" + MiniJson.quote(username) + ",\"nickname\":" + MiniJson.quote(user.nickname()) + "}");
        }
    }

    static class MeHandler implements HttpHandler {
        @Override
        public void handle(HttpExchange exchange) throws IOException {
            if ("OPTIONS".equalsIgnoreCase(exchange.getRequestMethod())) {
                sendJsonResponse(exchange, 200, "{}");
                return;
            }
            User user = getAuthenticatedUser(exchange);
            if (user == null) {
                sendJsonResponse(exchange, 401, "{\"error\":\"인증이 필요합니다.\"}");
                return;
            }
            sendJsonResponse(exchange, 200, "{\"username\":" + MiniJson.quote(user.username()) + ",\"nickname\":" + MiniJson.quote(user.nickname()) + "}");
        }
    }

    static class DevicesHandler implements HttpHandler {
        @Override
        public void handle(HttpExchange exchange) throws IOException {
            if ("OPTIONS".equalsIgnoreCase(exchange.getRequestMethod())) {
                sendJsonResponse(exchange, 200, "{}");
                return;
            }
            User user = getAuthenticatedUser(exchange);
            if (user == null) {
                sendJsonResponse(exchange, 401, "{\"error\":\"인증이 필요합니다.\"}");
                return;
            }

            String method = exchange.getRequestMethod().toUpperCase();
            switch (method) {
                case "GET" -> handleListDevices(exchange, user);
                case "POST" -> handleCreateDevice(exchange, user);
                case "DELETE" -> handleDeleteDevice(exchange, user);
                default -> sendJsonResponse(exchange, 405, "{\"error\":\"Method not allowed\"}");
            }
        }

        private void handleListDevices(HttpExchange exchange, User user) throws IOException {
            StringBuilder sb = new StringBuilder("[");
            int count = 0;
            for (Device d : devices.values()) {
                if (d.owner.equals(user.username())) {
                    if (count++ > 0) sb.append(",");
                    GpsPoint latest = latestPoints.get(d.id);
                    sb.append("{\"id\":").append(MiniJson.quote(d.id))
                            .append(",\"name\":").append(MiniJson.quote(d.name))
                            .append(",\"description\":").append(MiniJson.quote(d.description))
                            .append(",\"color\":").append(MiniJson.quote(d.color))
                            .append(",\"icon\":").append(MiniJson.quote(d.icon))
                            .append(",\"secretKey\":").append(MiniJson.quote(d.secretKey))
                            .append(",\"createdAt\":").append(d.createdAt)
                            .append(",\"lastSeen\":").append(d.lastSeen);
                    if (latest != null) {
                        sb.append(",\"latest\":{\"lat\":").append(latest.lat())
                                .append(",\"lng\":").append(latest.lng())
                                .append(",\"speed\":").append(latest.speed())
                                .append(",\"bearing\":").append(latest.bearing())
                                .append(",\"battery\":").append(latest.battery())
                                .append(",\"timestamp\":").append(latest.timestamp()).append("}");
                    } else {
                        sb.append(",\"latest\":null");
                    }
                    sb.append("}");
                }
            }
            sb.append("]");
            sendJsonResponse(exchange, 200, sb.toString());
        }

        private void handleCreateDevice(HttpExchange exchange, User user) throws IOException {
            String body = new String(exchange.getRequestBody().readAllBytes(), StandardCharsets.UTF_8);
            Map<String, Object> req = MiniJson.parseObject(body);
            String name = (String) req.get("name");
            String desc = (String) req.getOrDefault("description", "");
            String color = (String) req.getOrDefault("color", "#2563EB");
            String icon = (String) req.getOrDefault("icon", "car");

            if (name == null || name.trim().isEmpty()) {
                sendJsonResponse(exchange, 400, "{\"error\":\"기기 이름을 입력해주세요.\"}");
                return;
            }

            String customId = (String) req.get("id");
            String id;
            if (customId != null && !customId.trim().isEmpty()) {
                id = customId.trim().toUpperCase();
                if (devices.containsKey(id)) {
                    sendJsonResponse(exchange, 409, "{\"error\":\"이미 사용 중인 기기 ID입니다.\"}");
                    return;
                }
            } else {
                id = "DEV-" + UUID.randomUUID().toString().substring(0, 8).toUpperCase();
            }

            String secretKey = "key-" + UUID.randomUUID().toString().substring(0, 12);
            Device dev = new Device(id, user.username(), name.trim(), desc, color, icon, secretKey, System.currentTimeMillis());
            devices.put(id, dev);
            saveData();

            sendJsonResponse(exchange, 200, "{\"success\":true,\"id\":" + MiniJson.quote(id) + ",\"secretKey\":" + MiniJson.quote(secretKey) + "}");
        }

        private void handleDeleteDevice(HttpExchange exchange, User user) throws IOException {
            String query = exchange.getRequestURI().getQuery();
            Map<String, String> params = parseQuery(query);
            String id = params.get("id");
            if (id == null) {
                sendJsonResponse(exchange, 400, "{\"error\":\"기기 ID가 필요합니다.\"}");
                return;
            }
            Device d = devices.get(id);
            if (d == null || !d.owner.equals(user.username())) {
                sendJsonResponse(exchange, 404, "{\"error\":\"기기를 찾을 수 없거나 권한이 없습니다.\"}");
                return;
            }
            devices.remove(id);
            history.remove(id);
            latestPoints.remove(id);
            saveData();

            sendJsonResponse(exchange, 200, "{\"success\":true}");
        }
    }

    static class ResetTokenHandler implements HttpHandler {
        @Override
        public void handle(HttpExchange exchange) throws IOException {
            if ("OPTIONS".equalsIgnoreCase(exchange.getRequestMethod())) {
                sendJsonResponse(exchange, 200, "{}");
                return;
            }
            User user = getAuthenticatedUser(exchange);
            if (user == null) {
                sendJsonResponse(exchange, 401, "{\"error\":\"인증이 필요합니다.\"}");
                return;
            }
            String body = new String(exchange.getRequestBody().readAllBytes(), StandardCharsets.UTF_8);
            Map<String, Object> req = MiniJson.parseObject(body);
            String id = (String) req.get("id");
            Device d = devices.get(id);
            if (d == null || !d.owner.equals(user.username())) {
                sendJsonResponse(exchange, 404, "{\"error\":\"기기를 찾을 수 없습니다.\"}");
                return;
            }
            d.secretKey = "key-" + UUID.randomUUID().toString().substring(0, 12);
            saveData();
            sendJsonResponse(exchange, 200, "{\"success\":true,\"secretKey\":" + MiniJson.quote(d.secretKey) + "}");
        }
    }

    // -------------------------------------------------------------
    // GPS Ingestion Handlers
    // -------------------------------------------------------------
    static class GpsUpdateHandler implements HttpHandler {
        @Override
        public void handle(HttpExchange exchange) throws IOException {
            if ("OPTIONS".equalsIgnoreCase(exchange.getRequestMethod())) {
                sendJsonResponse(exchange, 200, "{}");
                return;
            }
            if (!"POST".equalsIgnoreCase(exchange.getRequestMethod())) {
                sendJsonResponse(exchange, 405, "{\"error\":\"Method not allowed\"}");
                return;
            }

            String body = new String(exchange.getRequestBody().readAllBytes(), StandardCharsets.UTF_8);
            Map<String, Object> req = MiniJson.parseObject(body);

            String deviceId = (String) req.get("deviceId");
            String secretKey = (String) req.get("secretKey");

            if (deviceId == null) {
                sendJsonResponse(exchange, 400, "{\"error\":\"deviceId가 필요합니다.\"}");
                return;
            }

            Device dev = devices.get(deviceId);
            if (dev == null) {
                sendJsonResponse(exchange, 404, "{\"error\":\"등록되지 않은 기기 ID입니다.\"}");
                return;
            }
            if (dev.secretKey != null && !dev.secretKey.isEmpty()) {
                if (secretKey == null || !secretKey.equals(dev.secretKey)) {
                    sendJsonResponse(exchange, 403, "{\"error\":\"Secret key가 올바르지 않거나 누락되었습니다.\"}");
                    return;
                }
            }

            double lat = ((Number) req.getOrDefault("lat", 0.0)).doubleValue();
            double lng = ((Number) req.getOrDefault("lng", 0.0)).doubleValue();
            double speed = ((Number) req.getOrDefault("speed", 0.0)).doubleValue();
            double altitude = ((Number) req.getOrDefault("altitude", 0.0)).doubleValue();
            double bearing = ((Number) req.getOrDefault("bearing", 0.0)).doubleValue();
            double accuracy = ((Number) req.getOrDefault("accuracy", 0.0)).doubleValue();
            int battery = ((Number) req.getOrDefault("battery", 100)).intValue();
            long timestamp = ((Number) req.getOrDefault("timestamp", System.currentTimeMillis())).longValue();

            GpsPoint point = new GpsPoint(deviceId, lat, lng, speed, altitude, bearing, accuracy, battery, timestamp);
            recordGpsPoint(point);

            sendJsonResponse(exchange, 200, "{\"success\":true,\"timestamp\":" + timestamp + "}");
        }
    }

    // Supports Traccar Client / OsmAnd protocol
    // GET or POST: /api/gps/osm?id=123456&lat=37.5&lon=127.0&timestamp=1699999999&speed=20.5&bearing=180&altitude=50&batt=85
    static class OsmGpsHandler implements HttpHandler {
        @Override
        public void handle(HttpExchange exchange) throws IOException {
            if ("OPTIONS".equalsIgnoreCase(exchange.getRequestMethod())) {
                sendJsonResponse(exchange, 200, "{}");
                return;
            }

            Map<String, String> params = new HashMap<>();
            String query = exchange.getRequestURI().getQuery();
            if (query != null) {
                params.putAll(parseQuery(query));
            }
            if ("POST".equalsIgnoreCase(exchange.getRequestMethod())) {
                String body = new String(exchange.getRequestBody().readAllBytes(), StandardCharsets.UTF_8);
                if (body.contains("=")) {
                    params.putAll(parseQuery(body));
                }
            }

            String id = params.get("id");
            if (id == null) id = params.get("deviceId");
            if (id == null) {
                sendJsonResponse(exchange, 400, "id parameter required");
                return;
            }

            Device dev = devices.get(id);
            if (dev == null) {
                // Auto register unknown Traccar client device under admin or create placeholder
                dev = new Device(id, "admin", "Traccar Client (" + id + ")", "Traccar 앱에서 자동 감지된 기기", "#8B5CF6", "phone", "key-" + id, System.currentTimeMillis());
                devices.put(id, dev);
            }

            try {
                double lat = Double.parseDouble(params.getOrDefault("lat", "0.0"));
                double lon = Double.parseDouble(params.getOrDefault("lon", params.getOrDefault("lng", "0.0")));
                double speed = Double.parseDouble(params.getOrDefault("speed", "0.0")) * 3.6; // OsmAnd sends speed in knots or m/s, convert to km/h approx
                double altitude = Double.parseDouble(params.getOrDefault("altitude", "0.0"));
                double bearing = Double.parseDouble(params.getOrDefault("bearing", params.getOrDefault("heading", "0.0")));
                double accuracy = Double.parseDouble(params.getOrDefault("accuracy", "0.0"));
                int battery = 100;
                if (params.containsKey("batt")) {
                    battery = (int) Math.round(Double.parseDouble(params.get("batt")));
                }

                long ts = System.currentTimeMillis();
                if (params.containsKey("timestamp")) {
                    try {
                        ts = Long.parseLong(params.get("timestamp"));
                        if (ts < 10000000000L) ts *= 1000L; // convert sec to millis if needed
                    } catch (Exception ignored) {}
                }

                GpsPoint point = new GpsPoint(id, lat, lon, speed, altitude, bearing, accuracy, battery, ts);
                recordGpsPoint(point);

                sendJsonResponse(exchange, 200, "OK");
            } catch (Exception e) {
                sendJsonResponse(exchange, 400, "Bad parameters: " + e.getMessage());
            }
        }
    }

    static class GpsLatestHandler implements HttpHandler {
        @Override
        public void handle(HttpExchange exchange) throws IOException {
            if ("OPTIONS".equalsIgnoreCase(exchange.getRequestMethod())) {
                sendJsonResponse(exchange, 200, "{}");
                return;
            }
            Map<String, String> params = parseQuery(exchange.getRequestURI().getQuery());
            String deviceId = params.get("deviceId");

            if (deviceId != null) {
                GpsPoint p = latestPoints.get(deviceId);
                if (p == null) {
                    sendJsonResponse(exchange, 200, "{\"point\":null}");
                } else {
                    sendJsonResponse(exchange, 200, "{\"point\":" + pointToJson(p) + "}");
                }
            } else {
                StringBuilder sb = new StringBuilder("{");
                int count = 0;
                for (Map.Entry<String, GpsPoint> e : latestPoints.entrySet()) {
                    if (count++ > 0) sb.append(",");
                    sb.append(MiniJson.quote(e.getKey())).append(":").append(pointToJson(e.getValue()));
                }
                sb.append("}");
                sendJsonResponse(exchange, 200, sb.toString());
            }
        }
    }

    static class GpsHistoryHandler implements HttpHandler {
        @Override
        public void handle(HttpExchange exchange) throws IOException {
            if ("OPTIONS".equalsIgnoreCase(exchange.getRequestMethod())) {
                sendJsonResponse(exchange, 200, "{}");
                return;
            }

            Map<String, String> params = parseQuery(exchange.getRequestURI().getQuery());
            String deviceId = params.get("deviceId");
            if (deviceId == null) {
                sendJsonResponse(exchange, 400, "{\"error\":\"deviceId가 필요합니다.\"}");
                return;
            }

            long from = 0;
            long to = Long.MAX_VALUE;
            try {
                if (params.containsKey("from")) from = Long.parseLong(params.get("from"));
                if (params.containsKey("to")) to = Long.parseLong(params.get("to"));
            } catch (NumberFormatException ignored) {}

            List<GpsPoint> list = history.getOrDefault(deviceId, Collections.emptyList());
            List<GpsPoint> filtered = new ArrayList<>();
            double totalDistanceKm = 0.0;
            double maxSpeed = 0.0;
            double speedSum = 0.0;
            int speedCount = 0;

            GpsPoint prev = null;
            for (GpsPoint p : list) {
                if (p.timestamp() >= from && p.timestamp() <= to) {
                    filtered.add(p);
                    if (p.speed() > maxSpeed) maxSpeed = p.speed();
                    if (p.speed() > 0.5) {
                        speedSum += p.speed();
                        speedCount++;
                    }
                    if (prev != null) {
                        totalDistanceKm += calculateDistanceKm(prev.lat(), prev.lng(), p.lat(), p.lng());
                    }
                    prev = p;
                }
            }

            double avgSpeed = speedCount > 0 ? (speedSum / speedCount) : 0.0;
            long durationMillis = filtered.size() > 1 ? (filtered.get(filtered.size() - 1).timestamp() - filtered.get(0).timestamp()) : 0;

            // Detect stops (> 3 minutes with speed < 1.0 km/h)
            List<Map<String, Object>> stops = detectStops(filtered);

            StringBuilder sb = new StringBuilder("{");
            sb.append("\"deviceId\":").append(MiniJson.quote(deviceId))
                    .append(",\"count\":").append(filtered.size())
                    .append(",\"totalDistanceKm\":").append(String.format(Locale.US, "%.2f", totalDistanceKm))
                    .append(",\"maxSpeed\":").append(String.format(Locale.US, "%.1f", maxSpeed))
                    .append(",\"avgSpeed\":").append(String.format(Locale.US, "%.1f", avgSpeed))
                    .append(",\"durationMillis\":").append(durationMillis)
                    .append(",\"stops\":").append(stopsToJson(stops))
                    .append(",\"points\":[");

            for (int i = 0; i < filtered.size(); i++) {
                if (i > 0) sb.append(",");
                sb.append(pointToJson(filtered.get(i)));
            }
            sb.append("]}");

            sendJsonResponse(exchange, 200, sb.toString());
        }

        private List<Map<String, Object>> detectStops(List<GpsPoint> points) {
            List<Map<String, Object>> stops = new ArrayList<>();
            if (points.size() < 2) return stops;

            int stopStartIdx = -1;
            for (int i = 0; i < points.size(); i++) {
                GpsPoint p = points.get(i);
                if (p.speed() < 1.5) {
                    if (stopStartIdx == -1) stopStartIdx = i;
                } else {
                    if (stopStartIdx != -1) {
                        long duration = points.get(i - 1).timestamp() - points.get(stopStartIdx).timestamp();
                        if (duration >= 3 * 60 * 1000L) { // 3 min threshold
                            GpsPoint sp = points.get(stopStartIdx);
                            Map<String, Object> stop = new HashMap<>();
                            stop.put("lat", sp.lat());
                            stop.put("lng", sp.lng());
                            stop.put("startTime", sp.timestamp());
                            stop.put("endTime", points.get(i - 1).timestamp());
                            stop.put("durationMinutes", duration / (60 * 1000L));
                            stops.add(stop);
                        }
                        stopStartIdx = -1;
                    }
                }
            }
            return stops;
        }

        private String stopsToJson(List<Map<String, Object>> stops) {
            StringBuilder sb = new StringBuilder("[");
            for (int i = 0; i < stops.size(); i++) {
                if (i > 0) sb.append(",");
                Map<String, Object> s = stops.get(i);
                sb.append("{\"lat\":").append(s.get("lat"))
                        .append(",\"lng\":").append(s.get("lng"))
                        .append(",\"startTime\":").append(s.get("startTime"))
                        .append(",\"endTime\":").append(s.get("endTime"))
                        .append(",\"durationMinutes\":").append(s.get("durationMinutes")).append("}");
            }
            sb.append("]");
            return sb.toString();
        }
    }

    static class GpsStreamHandler implements HttpHandler {
        @Override
        public void handle(HttpExchange exchange) throws IOException {
            exchange.getResponseHeaders().set("Content-Type", "text/event-stream");
            exchange.getResponseHeaders().set("Cache-Control", "no-cache");
            exchange.getResponseHeaders().set("Connection", "keep-alive");
            exchange.getResponseHeaders().set("Access-Control-Allow-Origin", "*");
            exchange.sendResponseHeaders(200, 0);

            sseClients.add(exchange);

            // Send initial ping
            try {
                OutputStream os = exchange.getResponseBody();
                os.write(": ping\n\n".getBytes(StandardCharsets.UTF_8));
                os.flush();
            } catch (Exception e) {
                sseClients.remove(exchange);
                exchange.close();
            }
        }
    }

    // -------------------------------------------------------------
    // Virtual GPS Simulator
    // -------------------------------------------------------------
    static class SimulatorToggleHandler implements HttpHandler {
        @Override
        public void handle(HttpExchange exchange) throws IOException {
            if ("OPTIONS".equalsIgnoreCase(exchange.getRequestMethod())) {
                sendJsonResponse(exchange, 200, "{}");
                return;
            }
            String body = new String(exchange.getRequestBody().readAllBytes(), StandardCharsets.UTF_8);
            Map<String, Object> req = MiniJson.parseObject(body);
            String deviceId = (String) req.get("deviceId");

            if (deviceId == null) {
                sendJsonResponse(exchange, 400, "{\"error\":\"deviceId가 필요합니다.\"}");
                return;
            }

            SimulatorTask existing = activeSimulators.remove(deviceId);
            if (existing != null) {
                existing.stop();
                sendJsonResponse(exchange, 200, "{\"running\":false,\"message\":\"시뮬레이터가 중지되었습니다.\"}");
            } else {
                SimulatorTask task = new SimulatorTask(deviceId);
                activeSimulators.put(deviceId, task);
                task.start();
                sendJsonResponse(exchange, 200, "{\"running\":true,\"message\":\"가상 GPS 주행 시뮬레이터가 시작되었습니다 (2초마다 위치 전송).\"}");
            }
        }
    }

    static class SimulatorTask {
        private final String deviceId;
        private final AtomicBoolean running = new AtomicBoolean(false);
        private Thread thread;

        // Waypoints in Seoul: Han River & Gangnam Tour
        private final double[][] waypoints = {
                {37.5188, 126.9385}, // Yeouido Hangang Park
                {37.5255, 126.9535}, // Mapo Bridge
                {37.5280, 126.9750}, // Ichon Hangang
                {37.5150, 126.9950}, // Banpo Bridge
                {37.5240, 127.0200}, // Hannam Bridge south
                {37.5300, 127.0500}, // Seongsu Bridge
                {37.5170, 127.0600}, // Cheongdam
                {37.5088, 127.0630}, // Samseong COEX
                {37.4981, 127.0276}, // Gangnam Station
                {37.4833, 127.0322}, // Yangjae
                {37.4950, 127.0100}, // Seoul Nat'l Univ. of Education
                {37.5050, 126.9800}  // Dongjak
        };

        public SimulatorTask(String deviceId) {
            this.deviceId = deviceId;
        }

        public void start() {
            running.set(true);
            thread = Thread.ofVirtual().start(() -> {
                int currentWp = 0;
                double curLat = waypoints[0][0];
                double curLng = waypoints[0][1];
                int battery = 98;

                while (running.get()) {
                    try {
                        int nextWp = (currentWp + 1) % waypoints.length;
                        double targetLat = waypoints[nextWp][0];
                        double targetLng = waypoints[nextWp][1];

                        // Move towards next waypoint in small steps
                        double dLat = (targetLat - curLat);
                        double dLng = (targetLng - curLng);
                        double dist = Math.sqrt(dLat * dLat + dLng * dLng);

                        if (dist < 0.0008) {
                            currentWp = nextWp;
                        } else {
                            curLat += (dLat / dist) * 0.00045;
                            curLng += (dLng / dist) * 0.00045;
                        }

                        // Add slight GPS jitter for realism
                        double jitterLat = (Math.random() - 0.5) * 0.00004;
                        double jitterLng = (Math.random() - 0.5) * 0.00004;

                        double bearing = Math.toDegrees(Math.atan2(dLng, dLat));
                        if (bearing < 0) bearing += 360.0;

                        double speed = 40.0 + (Math.random() * 20.0); // 40~60 km/h
                        if (dist < 0.001) speed = 10.0; // slowing at turns

                        GpsPoint point = new GpsPoint(
                                deviceId,
                                curLat + jitterLat,
                                curLng + jitterLng,
                                Math.round(speed * 10.0) / 10.0,
                                32.0 + (Math.random() * 5.0),
                                Math.round(bearing * 10.0) / 10.0,
                                3.8,
                                Math.max(10, battery--),
                                System.currentTimeMillis()
                        );

                        recordGpsPoint(point);
                        Thread.sleep(2000); // Send every 2 seconds
                    } catch (InterruptedException e) {
                        break;
                    } catch (Exception e) {
                        e.printStackTrace();
                    }
                }
            });
        }

        public void stop() {
            running.set(false);
            if (thread != null) thread.interrupt();
        }
    }

    // -------------------------------------------------------------
    // Static Files (public/)
    // -------------------------------------------------------------
    static class StaticFileHandler implements HttpHandler {
        @Override
        public void handle(HttpExchange exchange) throws IOException {
            String path = exchange.getRequestURI().getPath();
            if (path == null || path.equals("/") || path.isEmpty()) {
                path = "/index.html";
            }

            // Prevent path traversal
            if (path.contains("..")) {
                send404(exchange);
                return;
            }

            Path file = PUBLIC_DIR.resolve(path.substring(1)).normalize();
            if (!file.startsWith(PUBLIC_DIR) || !Files.exists(file) || Files.isDirectory(file)) {
                send404(exchange);
                return;
            }

            String mime = getMimeType(file.toString());
            byte[] bytes = Files.readAllBytes(file);

            exchange.getResponseHeaders().set("Content-Type", mime);
            exchange.getResponseHeaders().set("Cache-Control", "no-cache");
            exchange.sendResponseHeaders(200, bytes.length);
            try (OutputStream os = exchange.getResponseBody()) {
                os.write(bytes);
            }
        }

        private void send404(HttpExchange exchange) throws IOException {
            byte[] msg = "404 Not Found".getBytes(StandardCharsets.UTF_8);
            exchange.getResponseHeaders().set("Content-Type", "text/plain; charset=UTF-8");
            exchange.sendResponseHeaders(404, msg.length);
            try (OutputStream os = exchange.getResponseBody()) {
                os.write(msg);
            }
        }

        private String getMimeType(String name) {
            String lower = name.toLowerCase();
            if (lower.endsWith(".html") || lower.endsWith(".htm")) return "text/html; charset=UTF-8";
            if (lower.endsWith(".js")) return "application/javascript; charset=UTF-8";
            if (lower.endsWith(".css")) return "text/css; charset=UTF-8";
            if (lower.endsWith(".json")) return "application/json; charset=UTF-8";
            if (lower.endsWith(".png")) return "image/png";
            if (lower.endsWith(".jpg") || lower.endsWith(".jpeg")) return "image/jpeg";
            if (lower.endsWith(".svg")) return "image/svg+xml";
            if (lower.endsWith(".ico")) return "image/x-icon";
            return "application/octet-stream";
        }
    }

    // -------------------------------------------------------------
    // Utilities: Haversine distance, Query parser, JSON helpers
    // -------------------------------------------------------------
    public static double calculateDistanceKm(double lat1, double lon1, double lat2, double lon2) {
        final int R = 6371; // Earth radius in km
        double latDistance = Math.toRadians(lat2 - lat1);
        double lonDistance = Math.toRadians(lon2 - lon1);
        double a = Math.sin(latDistance / 2) * Math.sin(latDistance / 2)
                + Math.cos(Math.toRadians(lat1)) * Math.cos(Math.toRadians(lat2))
                * Math.sin(lonDistance / 2) * Math.sin(lonDistance / 2);
        double c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
        return R * c;
    }

    private static Map<String, String> parseQuery(String query) {
        Map<String, String> result = new HashMap<>();
        if (query == null || query.isEmpty()) return result;
        for (String param : query.split("&")) {
            String[] entry = param.split("=", 2);
            if (entry.length > 1) {
                result.put(URLDecoder.decode(entry[0], StandardCharsets.UTF_8),
                           URLDecoder.decode(entry[1], StandardCharsets.UTF_8));
            } else if (entry.length == 1) {
                result.put(URLDecoder.decode(entry[0], StandardCharsets.UTF_8), "");
            }
        }
        return result;
    }

    private static String pointToJson(GpsPoint p) {
        return "{\"deviceId\":" + MiniJson.quote(p.deviceId())
                + ",\"lat\":" + p.lat()
                + ",\"lng\":" + p.lng()
                + ",\"speed\":" + p.speed()
                + ",\"altitude\":" + p.altitude()
                + ",\"bearing\":" + p.bearing()
                + ",\"accuracy\":" + p.accuracy()
                + ",\"battery\":" + p.battery()
                + ",\"timestamp\":" + p.timestamp() + "}";
    }

    // -------------------------------------------------------------
    // MiniJson: Lightweight, Zero-dependency JSON parser & serializer
    // -------------------------------------------------------------
    public static class MiniJson {
        public static String quote(String string) {
            if (string == null || string.isEmpty()) return "\"\"";
            StringBuilder sb = new StringBuilder("\"");
            for (int i = 0; i < string.length(); i++) {
                char c = string.charAt(i);
                switch (c) {
                    case '"' -> sb.append("\\\"");
                    case '\\' -> sb.append("\\\\");
                    case '\b' -> sb.append("\\b");
                    case '\f' -> sb.append("\\f");
                    case '\n' -> sb.append("\\n");
                    case '\r' -> sb.append("\\r");
                    case '\t' -> sb.append("\\t");
                    default -> {
                        if (c < ' ') {
                            String t = "000" + Integer.toHexString(c);
                            sb.append("\\u").append(t.substring(t.length() - 4));
                        } else {
                            sb.append(c);
                        }
                    }
                }
            }
            sb.append("\"");
            return sb.toString();
        }

        public static Map<String, Object> parseObject(String json) {
            Object res = parse(new JsonTokenizer(json));
            if (res instanceof Map<?, ?> m) {
                @SuppressWarnings("unchecked")
                Map<String, Object> casted = (Map<String, Object>) m;
                return casted;
            }
            return new HashMap<>();
        }

        public static List<Map<String, Object>> parseArray(String json) {
            Object res = parse(new JsonTokenizer(json));
            if (res instanceof List<?> l) {
                List<Map<String, Object>> out = new ArrayList<>();
                for (Object item : l) {
                    if (item instanceof Map<?, ?> m) {
                        @SuppressWarnings("unchecked")
                        Map<String, Object> casted = (Map<String, Object>) m;
                        out.add(casted);
                    }
                }
                return out;
            }
            return new ArrayList<>();
        }

        private static Object parse(JsonTokenizer tokenizer) {
            tokenizer.skipWhitespace();
            char c = tokenizer.peek();
            if (c == '{') return parseObj(tokenizer);
            if (c == '[') return parseArr(tokenizer);
            if (c == '"') return parseStr(tokenizer);
            if (c == 't' || c == 'f') return parseBool(tokenizer);
            if (c == 'n') return parseNull(tokenizer);
            return parseNum(tokenizer);
        }

        private static Map<String, Object> parseObj(JsonTokenizer tokenizer) {
            Map<String, Object> map = new LinkedHashMap<>();
            tokenizer.next(); // consume '{'
            tokenizer.skipWhitespace();
            if (tokenizer.peek() == '}') {
                tokenizer.next();
                return map;
            }
            while (true) {
                tokenizer.skipWhitespace();
                String key = parseStr(tokenizer);
                tokenizer.skipWhitespace();
                if (tokenizer.next() != ':') throw new IllegalArgumentException("Expected ':'");
                Object val = parse(tokenizer);
                map.put(key, val);
                tokenizer.skipWhitespace();
                char next = tokenizer.next();
                if (next == '}') break;
                if (next != ',') throw new IllegalArgumentException("Expected ',' or '}' but found " + next);
            }
            return map;
        }

        private static List<Object> parseArr(JsonTokenizer tokenizer) {
            List<Object> list = new ArrayList<>();
            tokenizer.next(); // consume '['
            tokenizer.skipWhitespace();
            if (tokenizer.peek() == ']') {
                tokenizer.next();
                return list;
            }
            while (true) {
                list.add(parse(tokenizer));
                tokenizer.skipWhitespace();
                char next = tokenizer.next();
                if (next == ']') break;
                if (next != ',') throw new IllegalArgumentException("Expected ',' or ']' but found " + next);
            }
            return list;
        }

        private static String parseStr(JsonTokenizer tokenizer) {
            tokenizer.next(); // consume opening quote
            StringBuilder sb = new StringBuilder();
            while (true) {
                char c = tokenizer.next();
                if (c == '"') break;
                if (c == '\\') {
                    char esc = tokenizer.next();
                    switch (esc) {
                        case '"' -> sb.append('"');
                        case '\\' -> sb.append('\\');
                        case '/' -> sb.append('/');
                        case 'b' -> sb.append('\b');
                        case 'f' -> sb.append('\f');
                        case 'n' -> sb.append('\n');
                        case 'r' -> sb.append('\r');
                        case 't' -> sb.append('\t');
                        case 'u' -> {
                            String hex = "" + tokenizer.next() + tokenizer.next() + tokenizer.next() + tokenizer.next();
                            sb.append((char) Integer.parseInt(hex, 16));
                        }
                        default -> sb.append(esc);
                    }
                } else {
                    sb.append(c);
                }
            }
            return sb.toString();
        }

        private static Boolean parseBool(JsonTokenizer tokenizer) {
            StringBuilder sb = new StringBuilder();
            while (Character.isLetter(tokenizer.peek())) {
                sb.append(tokenizer.next());
            }
            String s = sb.toString();
            if ("true".equalsIgnoreCase(s)) return Boolean.TRUE;
            if ("false".equalsIgnoreCase(s)) return Boolean.FALSE;
            throw new IllegalArgumentException("Unknown boolean token: " + s);
        }

        private static Object parseNull(JsonTokenizer tokenizer) {
            for (int i = 0; i < 4; i++) tokenizer.next(); // consume 'null'
            return null;
        }

        private static Number parseNum(JsonTokenizer tokenizer) {
            StringBuilder sb = new StringBuilder();
            while (true) {
                char c = tokenizer.peek();
                if (Character.isDigit(c) || c == '-' || c == '+' || c == '.' || c == 'e' || c == 'E') {
                    sb.append(tokenizer.next());
                } else {
                    break;
                }
            }
            String s = sb.toString();
            if (s.contains(".") || s.contains("e") || s.contains("E")) {
                return Double.parseDouble(s);
            }
            long l = Long.parseLong(s);
            if (l >= Integer.MIN_VALUE && l <= Integer.MAX_VALUE) {
                return (int) l;
            }
            return l;
        }

        private static class JsonTokenizer {
            private final String src;
            private int pos = 0;

            public JsonTokenizer(String src) {
                this.src = src != null ? src.trim() : "";
            }

            public void skipWhitespace() {
                while (pos < src.length() && Character.isWhitespace(src.charAt(pos))) {
                    pos++;
                }
            }

            public char peek() {
                if (pos >= src.length()) return '\0';
                return src.charAt(pos);
            }

            public char next() {
                if (pos >= src.length()) return '\0';
                return src.charAt(pos++);
            }
        }
    }
}
