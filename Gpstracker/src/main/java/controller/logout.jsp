<%@ page language="java" contentType="text/html; charset=UTF-8" pageEncoding="UTF-8"%>
<%
    // 1. 현재 사용자 세션 해제 (로그인 정보 삭제)
    session.invalidate();

    // 2. 로그인 페이지(또는 메인 페이지)로 즉시 이동
    response.sendRedirect("login.jsp");
%>