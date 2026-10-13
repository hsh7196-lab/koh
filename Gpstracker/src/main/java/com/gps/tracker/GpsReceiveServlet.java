package com.gps.tracker;

import java.io.IOException;
import java.io.PrintWriter;
import jakarta.servlet.ServletException;
import jakarta.servlet.annotation.WebServlet;
import jakarta.servlet.http.HttpServlet;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;

@WebServlet("/receive")
public class GpsReceiveServlet extends HttpServlet {
    private static final long serialVersionUID = 1L;

    protected void doGet(HttpServletRequest request, HttpServletResponse response) throws ServletException, IOException {
        // 한글 깨짐 방지
        request.setCharacterEncoding("UTF-8");
        response.setContentType("text/html; charset=UTF-8");

        // 1. 기기가 보낸 위도(lat)와 경도(lng) 파라미터 받기
        String lat = request.getParameter("lat");
        String lng = request.getParameter("lng");

        PrintWriter out = response.getWriter();

        // 2. 값이 잘 들어왔는지 확인
        if (lat != null && lng != null) {
            System.out.println("🛰️ [GPS 수신 성공] 위도: " + lat + ", 경도: " + lng);
            
            // 나중에 여기에 MySQL에 INSERT 하는 코드가 들어갑니다!

            out.print("OK - Lat: " + lat + ", Lng: " + lng);
        } else {
            out.print("FAIL - lat and lng are required.");
        }
    }

    protected void doPost(HttpServletRequest request, HttpServletResponse response) throws ServletException, IOException {
        doGet(request, response);
    }
}