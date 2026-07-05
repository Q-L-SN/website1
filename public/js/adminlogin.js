function submitAdminLogin() {
    const ID = document.getElementById('ID').value;
    const password = document.getElementById('password').value;
    if (!ID || !password) {
        alert('请输入用户名和密码');
        return;
    }
    fetch('/api/admin_login', {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json'
        },
        body: JSON.stringify({ ID, password })
    })
    .then(response => {
        if (response.status === 204) {
            window.location.href = '/censor';
            return;
        }
        if (response.status === 401) {
            alert('用户名或密码错误');
            return;
        }
        if (response.status === 403) {
            window.location.href = '/censor';
            return;
        }
        alert('登录失败：' + response.status);
    });
}

document.getElementById('loginButton').addEventListener('click', submitAdminLogin);
document.getElementById('password').addEventListener('keydown', event => {
    if (event.key === 'Enter') {
        submitAdminLogin();
    }
});
