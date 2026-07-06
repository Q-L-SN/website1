import * as S from '/js/shared.js';
import * as G from '/js/global.js';

const profileUpdateMessage = { date: new Date().toISOString() };
let openerAcknowledged = false;

window.addEventListener('message', event => {
    if (event.origin === window.location.origin && event.data?.type === 'user-profile-update-received') {
        openerAcknowledged = true;
    }
});

localStorage.setItem('user-profile-update-pending', JSON.stringify(profileUpdateMessage));
localStorage.setItem('user-profile-update', JSON.stringify(profileUpdateMessage)); // 发信号，内容必须是JSON
window.opener?.postMessage({
    type: 'user-profile-update',
    payload: profileUpdateMessage
}, window.location.origin);

setTimeout(() => {
    if (!openerAcknowledged) {
        try {
            if (window.opener && !window.opener.closed && window.opener.location.origin === window.location.origin) {
                window.opener.location.reload();
            }
        } catch {
            // opener不可访问时只关闭弹窗，登录态已经由cookie保存
        }
    }
    window.close(); // 关闭弹窗
}, 500);
