import * as S from '/js/shared.js';
import * as G from '/js/global.js';

localStorage.setItem('user-profile-update', JSON.stringify({ date: new Date() })); // 发信号，内容必须是JSON
window.close(); // 关闭弹窗