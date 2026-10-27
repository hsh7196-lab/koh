package controller; // 프로젝트 패키지 경로에 맞게 확인 (com.controller 등)

import java.io.IOException;
import java.sql.Connection;
import java.sql.PreparedStatement;
import java.sql.ResultSet;

import jakarta.servlet.ServletException;
import jakarta.servlet.annotation.WebServlet;
import jakarta.servlet.http.HttpServlet;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;

import com.util.DBUtil; // DBUtil 패키지 경로 확인 (util.DBUtil 등)

@WebServlet("/signup")
public class SignupServlet extends HttpServlet {
    private static final long serialVersionUID = 1L;

    protected void doPost(HttpServletRequest request, HttpServletResponse response) 
            throws ServletException, IOException {
        
        request.setCharacterEncoding("UTF-8");
        
        String userId = request.getParameter("userId");
        String userPw = request.getParameter("userPw");
        String userName = request.getParameter("userName");

        // 1. 아이디 중복 체크 쿼리
        String checkSql = "SELECT user_id FROM users WHERE user_id = ?";
        // 2. 회원 등록 쿼리
        String insertSql = "INSERT INTO users (user_id, user_pw, user_name) VALUES (?, ?, ?)";

        try (Connection conn = DBUtil.getConnection()) {
            
            // 중복 확인
            try (PreparedStatement checkPstmt = conn.prepareStatement(checkSql)) {
                checkPstmt.setString(1, userId);
                try (ResultSet rs = checkPstmt.executeQuery()) {
                    if (rs.next()) {
                        // 이미 존재하는 아이디인 경우
                        response.sendRedirect("signup.jsp?error=duplicate");
                        return;
                    }
                }
            }

            // DB에 회원 정보 저장
            try (PreparedStatement insertPstmt = conn.prepareStatement(insertSql)) {
                insertPstmt.setString(1, userId);
                insertPstmt.setString(2, userPw);
                insertPstmt.setString(3, userName);

                int result = insertPstmt.executeUpdate();

                if (result > 0) {
                    // 회원가입 성공 시 로그인 페이지로 이동
                    response.sendRedirect("login.jsp?signup=success");
                } else {
                    response.sendRedirect("signup.jsp?error=fail");
                }
            }

        } catch (Exception e) {
            e.printStackTrace();
            response.sendRedirect("signup.jsp?error=fail");
        }
    }
}