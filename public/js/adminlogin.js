document.getElementById('loginButton').addEventListener('click', function() {
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
    // 暂时搁置
});