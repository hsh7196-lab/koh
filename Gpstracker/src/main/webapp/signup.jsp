<%@ page language="java" contentType="text/html; charset=UTF-8" pageEncoding="UTF-8"%>
<!DOCTYPE html>
<html>
<head>
<meta charset="UTF-8">
<title>회원가입</title>
<style>
    body { font-family: Arial, sans-serif; display: flex; justify-content: center; align-items: center; height: 100vh; margin: 0; background-color: #f4f4f9; }
    .signup-container { background: #fff; padding: 30px; border-radius: 8px; box-shadow: 0 4px 6px rgba(0,0,0,0.1); width: 300px; }
    .signup-container h2 { text-align: center; margin-bottom: 20px; }
    .input-group { margin-bottom: 15px; }
    .input-group label { display: block; margin-bottom: 5px; font-weight: bold; }
    .input-group input { width: 100%; padding: 8px; box-sizing: border-box; border: 1px solid #ccc; border-radius: 4px; }
    .btn { width: 100%; padding: 10px; background-color: #28a745; color: white; border: none; border-radius: 4px; cursor: pointer; font-size: 16px; }
    .btn:hover { background-color: #218838; }
    .error-msg { color: red; font-size: 13px; text-align: center; margin-bottom: 10px; }
</style>
</head>
<body>

<div class="signup-container">
    <h2>회원가입</h2>
    
    <% if ("duplicate".equals(request.getParameter("error"))) { %>
        <div class="error-msg">이미 존재하는 아이디입니다.</div>
    <% } else if ("fail".equals(request.getParameter("error"))) { %>
        <div class="error-msg">회원가입에 실패했습니다. 다시 시도해주세요.</div>
    <% } %>

    <form action="${pageContext.request.contextPath}/signup" method="post">
        <div class="input-group">
            <label for="userId">아이디</label>
            <input type="text" id="userId" name="userId" required>
        </div>
        <div class="input-group">
            <label for="userPw">비밀번호</label>
            <input type="password" id="userPw" name="userPw" required>
        </div>
        <div class="input-group">
            <label for="userName">이름</label>
            <input type="text" id="userName" name="userName" required>
        </div>
        <button type="submit" class="btn">가입하기</button>
    </form>
</div>

</body>
</html>