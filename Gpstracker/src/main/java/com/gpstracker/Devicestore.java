package com.gpstracker;

import java.security.SecureRandom;
import java.util.ArrayDeque;
import java.util.ArrayList;
import java.util.Comparator;
import java.util.List;
import java.util.Map;
import java.util.concurrent.ConcurrentHashMap;

/**
 * 기기와 위치 기록을 메모리에 보관하는 저장소.
 *
 * 서버를 재시작하면 데이터가 사라집니다. 실제 서비스에서는 이 클래스의 메서드
 * 시그니처는 그대로 두고 내부만 DB(JDBC)로 바꾸면 서블릿과 화면은 수정하지 않아도 됩니다.
 */
public final class Devicestore {

    public static final int MAX_POINTS_PER_DEVICE = 5000;
    public static final int MAX_DEVICES_PER_USER = 10;
    /** 모든 로그인 사용자에게 보이는 공용 데모 기기의 owner 값 */
    public static final String PUBLIC_OWNER = "*";

    private static final String ID_CHARS = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
    private static final Map<String, Device> DEVICES = new ConcurrentHashMap<String, Device>();
    private static final SecureRandom RND = new SecureRandom();

    static {
        DEVICES.put("DEMO-001", new Device("DEMO-001", "데모 기기", PUBLIC_OWNER, "demo-token"));
    }

    private Devicestore() {
    }

    /** 위치 한 점 (불변) */
    public static final class Point {
        public final long ts;
        public final double lat;
        public final double lng;
        public final double speed; // km/h
        public final int battery; // 0~100, 알 수 없으면 -1

        public Point(long ts, double lat, double lng, double speed, int battery) {
            this.ts = ts;
            this.lat = lat;
            this.lng = lng;
            this.speed = speed;
            this.battery = battery;
        }
    }

    public static final class Device {
        public final String id;
        public final String name;
        public final String owner;
        public final String token;

        // 지오펜스 (radius 0 이하 = 설정 없음)
        private volatile double fenceLat;
        private volatile double fenceLng;
        private volatile double fenceRadius;

        private final ArrayDeque<Point> points = new ArrayDeque<Point>();

        Device(String id, String name, String owner, String token) {
            this.id = id;
            this.name = name;
            this.owner = owner;
            this.token = token;
        }

        public double getFenceLat() {
            return fenceLat;
        }

        public double getFenceLng() {
            return fenceLng;
        }

        public double getFenceRadius() {
            return fenceRadius;
        }

        public void setFence(double lat, double lng, double radius) {
            this.fenceLat = lat;
            this.fenceLng = lng;
            this.fenceRadius = radius;
        }

        public synchronized void addPoint(Point p) {
            points.addLast(p);
            while (points.size() > MAX_POINTS_PER_DEVICE) {
                points.removeFirst();
            }
        }

        public synchronized Point last() {
            return points.peekLast();
        }

        public synchronized List<Point> range(long from, long to) {
            List<Point> out = new ArrayList<Point>();
            for (Point p : points) {
                if (p.ts >= from && p.ts <= to) {
                    out.add(p);
                }
            }
            return out;
        }
    }

    public static Device get(String id) {
        return id == null ? null : DEVICES.get(id);
    }

    /** 이 사용자가 볼 수 있는 기기인지 (본인 기기 또는 공용 데모 기기) */
    public static boolean canAccess(Device d, String user) {
        return d != null && user != null
                && (PUBLIC_OWNER.equals(d.owner) || d.owner.equals(user));
    }

    public static boolean isOwner(Device d, String user) {
        return d != null && user != null && d.owner.equals(user);
    }

    public static List<Device> listFor(final String user) {
        List<Device> out = new ArrayList<Device>();
        for (Device d : DEVICES.values()) {
            if (canAccess(d, user)) {
                out.add(d);
            }
        }
        out.sort(new Comparator<Device>() {
            @Override
            public int compare(Device a, Device b) {
                boolean am = a.owner.equals(user);
                boolean bm = b.owner.equals(user);
                if (am != bm) {
                    return am ? -1 : 1;
                }
                return a.id.compareTo(b.id);
            }
        });
        return out;
    }

    /** 새 기기를 등록합니다. 한도를 넘으면 null. */
    public static synchronized Device create(String owner, String name) {
        int count = 0;
        for (Device d : DEVICES.values()) {
            if (d.owner.equals(owner)) {
                count++;
            }
        }
        if (count >= MAX_DEVICES_PER_USER) {
            return null;
        }
        String id;
        do {
            id = "GPS-" + randomChars(6);
        } while (DEVICES.containsKey(id));
        Device d = new Device(id, name, owner, randomHex(24));
        DEVICES.put(id, d);
        return d;
    }

    public static boolean remove(String id) {
        return id != null && DEVICES.remove(id) != null;
    }

    private static String randomChars(int n) {
        StringBuilder sb = new StringBuilder(n);
        for (int i = 0; i < n; i++) {
            sb.append(ID_CHARS.charAt(RND.nextInt(ID_CHARS.length())));
        }
        return sb.toString();
    }

    private static String randomHex(int n) {
        StringBuilder sb = new StringBuilder(n);
        for (int i = 0; i < n; i++) {
            sb.append(Character.forDigit(RND.nextInt(16), 16));
        }
        return sb.toString();
    }
}