<%@ page language="java" contentType="text/html; charset=UTF-8" pageEncoding="UTF-8"%>
<!DOCTYPE html>
<html lang="ko">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>GPS 관제 시스템 - 로그인</title>
    <style>
        * {
            box-sizing: border-box;
            margin: 0;
            padding: 0;
            font-family: 'Pretendard', -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif;
        }

        body {
            display: flex;
            justify-content: center;
            align-items: center;
            min-height: 100vh;
            background: linear-gradient(135deg, #1e293b 0%, #0f172a 100%);
            color: #333;
        }

        .login-card {
            background: #ffffff;
            width: 100%;
            max-width: 400px;
            padding: 40px 32px;
            border-radius: 16px;
            box-shadow: 0 10px 25px rgba(0, 0, 0, 0.3);
            text-align: center;
        }

        .login-header {
            margin-bottom: 28px;
        }

        .login-header .logo-icon {
            font-size: 42px;
            margin-bottom: 10px;
            display: inline-block;
        }

        .login-header h2 {
            font-size: 22px;
            font-weight: 700;
            color: #0f172a;
            margin-bottom: 6px;
        }

        .login-header p {
            font-size: 13px;
            color: #64748b;
        }

        .alert-error {
            background-color: #fef2f2;
            border: 1px solid #fecaca;
            color: #dc2626;
            padding: 10px;
            border-radius: 8px;
            font-size: 13px;
            margin-bottom: 20px;
            text-align: left;
        }

        .alert-success {
            background-color: #f0fdf4;
            border: 1px solid #bbf7d0;
            color: #16a34a;
            padding: 10px;
            border-radius: 8px;
            font-size: 13px;
            margin-bottom: 20px;
            text-align: left;
        }

        .form-group {
            margin-bottom: 18px;
            text-align: left;
        }

        .form-group label {
            display: block;
            font-size: 13px;
            font-weight: 600;
            color: #334155;
            margin-bottom: 6px;
        }

        .form-group input {
            width: 100%;
            padding: 12px 14px;
            font-size: 14px;
            border: 1px solid #cbd5e1;
            border-radius: 8px;
            outline: none;
            transition: all 0.2s ease-in-out;
            background-color: #f8fafc;
        }

        .form-group input:focus {
            border-color: #3b82f6;
            background-color: #ffffff;
            box-shadow: 0 0 0 3px rgba(59, 130, 246, 0.2);
        }

        .btn-submit {
            width: 100%;
            padding: 12px;
            font-size: 15px;
            font-weight: 600;
            color: #ffffff;
            background-color: #2563eb;
            border: none;
            border-radius: 8px;
            cursor: pointer;
            transition: background-color 0.2s ease-in-out;
            margin-top: 10px;
        }

        .btn-submit:hover {
            background-color: #1d4ed8;
        }

        .login-footer {
            margin-top: 24px;
            font-size: 13px;
            color: #64748b;
        }

        .login-footer a {
            color: #2563eb;
            text-decoration: none;
            font-weight: 600;
            margin-left: 4px;
        }

        .login-footer a:hover {
            text-decoration: underline;
        }
    </style>
</head>
<body>

    <div class="login-card">
        <div class="login-header">
            <div class="logo-icon">📡</div>
            <h2>GPS 관제 시스템</h2>
            <p>실시간 위치 추적 서비스에 접속하세요</p>
        </div>

        <%-- 회원가입 성공 알림 --%>
        <% if ("success".equals(request.getParameter("signup"))) { %>
            <div class="alert-success">
                ✅ 회원가입이 완료되었습니다. 로그인해 주세요.
            </div>
        <% } %>

        <%-- 로그인 실패 알림 --%>
        <% if ("1".equals(request.getParameter("error"))) { %>
            <div class="alert-error">
                ⚠️ 아이디 또는 비밀번호가 올바르지 않습니다.
            </div>
        <% } %>

        <form action="${pageContext.request.contextPath}/login" method="post">
            <div class="form-group">
                <label for="userId">아이디</label>
                <input type="text" id="userId" name="userId" placeholder="아이디를 입력하세요" required autocomplete="off">
            </div>

            <div class="form-group">
                <label for="userPw">비밀번호</label>
                <input type="password" id="userPw" name="userPw" placeholder="비밀번호를 입력하세요" required>
            </div>

            <button type="submit" class="btn-submit">로그인</button>
        </form>

        <div class="login-footer">
            아직 계정이 없으신가요?
            <a href="signup.jsp">회원가입</a>
        </div>
    </div>

</body>
</html>