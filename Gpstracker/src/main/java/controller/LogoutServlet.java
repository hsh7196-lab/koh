package controller; // 사용 중인 패키지명 확인 (예: package com.tracker.controller;)

import java.io.IOException;
import jakarta.servlet.ServletException;
import jakarta.servlet.annotation.WebServlet;
import jakarta.servlet.http.HttpServlet;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;
import jakarta.servlet.http.HttpSession;

@WebServlet("/logout") // ⚠️ 이 부분이 없으면 톰캣이 /logout 경로를 찾지 못하고 404를 반환합니다.
public class LogoutServlet extends HttpServlet {
    private static final long serialVersionUID = 1L;

    protected void doGet(HttpServletRequest request, HttpServletResponse response) 
            throws ServletException, IOException {
        
        HttpSession session = request.getSession(false);
        if (session != null) {
            session.invalidate(); // 세션 제거
        }
        
        // 로그아웃 후 로그인 페이지로 리다이렉트
        response.sendRedirect(request.getContextPath() + "/login.jsp");
    }

    // POST 요청이 들어와도 GET 로직으로 넘기도록 처리
    protected void doPost(HttpServletRequest request, HttpServletResponse response) 
            throws ServletException, IOException {
        doGet(request, response);
    }
}