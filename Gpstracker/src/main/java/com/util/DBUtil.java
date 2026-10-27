package com.util; // 패키지명에 맞게 확인

import java.sql.Connection;
import java.sql.DriverManager;

public class DBUtil {
    // ⬇️ 아래 URL 부분에서 '본인_db명'을 'gps_db'로 수정했습니다!
    private static final String URL = "jdbc:mysql://localhost:3306/gps_db?serverTimezone=UTC&useSSL=false&allowPublicKeyRetrieval=true";
    private static final String USER = "root";
    private static final String PASS = "1234"; // <-- 여기에 본인의 진짜 MySQL 비밀번호를 적어주세요!

    public static Connection getConnection() throws Exception {
        Class.forName("com.mysql.cj.jdbc.Driver");
        return DriverManager.getConnection(URL, USER, PASS);
    }
}