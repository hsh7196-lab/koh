package controller; // 만약 패키지 이름이 com.controller 라면 package com.controller; 로 수정

import java.io.IOException;
import java.sql.Connection;
import java.sql.PreparedStatement;
import java.sql.ResultSet;

import jakarta.servlet.ServletException;
import jakarta.servlet.annotation.WebServlet;
import jakarta.servlet.http.HttpServlet;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;
import jakarta.servlet.http.HttpSession;

import com.util.DBUtil; // DBUtil 패키지가 com.util 이라면 import com.util.DBUtil; 로 수정

@WebServlet("/login")
public class LoginServlet extends HttpServlet {
    private static final long serialVersionUID = 1L;

    protected void doPost(HttpServletRequest request, HttpServletResponse response) 
            throws ServletException, IOException {
        
        request.setCharacterEncoding("UTF-8");
        
        // 1. login.jsp의 입력창(<input name="userId">, <input name="userPw">)에서 사용자가 친 값 가져오기
        String userId = request.getParameter("userId");
        String userPw = request.getParameter("userPw");

        boolean isValidUser = false;
        String userName = "";

        // 2. MySQL에 조회할 SQL 쿼리문 준비
        String sql = "SELECT user_name FROM users WHERE user_id = ? AND user_pw = ?";

        // 3. DB 연결 및 조회 실행
        try (Connection conn = DBUtil.getConnection();
             PreparedStatement pstmt = conn.prepareStatement(sql)) {
            
            // ? 물음표 자리에 사용자가 입력한 ID와 PW 세팅
            pstmt.setString(1, userId);
            pstmt.setString(2, userPw);

            try (ResultSet rs = pstmt.executeQuery()) {
                // DB에서 일치하는 회원을 찾았을 경우
                if (rs.next()) {
                    isValidUser = true;
                    userName = rs.getString("user_name"); // DB의 user_name 컬럼 값 가져오기
                }
            }
        } catch (Exception e) {
            e.printStackTrace();
        }

     // 4. 로그인 성공 여부에 따른 화면 이동
        if (isValidUser) {
            // 로그인 성공시 세션에 회원 이름(아이디) 저장
            HttpSession session = request.getSession();
            session.setAttribute("loginUser", userName + "(" + userId + ")");
            
            // ⭕ 수정 후: ContextPath를 붙여서 /Gpstracker/index.jsp 로 올바르게 이동
            response.sendRedirect(request.getContextPath() + "/index.jsp");
        } else {
            // 로그인 실패시 login.jsp로 돌아감 (주소 뒤에 error=1 첨부)
            response.sendRedirect("login.jsp?error=1");
        }
    }
}