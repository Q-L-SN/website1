import * as S from '/js/shared.js';
import * as G from '/js/global.js';

const dialogCode = Number(G.params.get('dialogCode') || 1); // 默认为Not Found错误
const side = G.params.get('side');
const displayURL = new URLSearchParams(location.search).get('displayURL');

G.editURL(displayURL ?? document.referrer, false, false);

function handleUserProfileUpdate(newValue) {
    if (newValue !== null) {
        G.editURL(displayURL, false, true);
    }
}

G.listenStorageChange('user-profile-update', handleUserProfileUpdate);
window.addEventListener('message', event => {
    if (event.origin === window.location.origin && event.data?.type === 'user-profile-update') {
        event.source?.postMessage({ type: 'user-profile-update-received' }, event.origin);
        handleUserProfileUpdate(event.data.payload);
    }
});

const pendingProfileUpdate = localStorage.getItem('user-profile-update-pending');
if (pendingProfileUpdate !== null) {
    localStorage.removeItem('user-profile-update-pending');
    handleUserProfileUpdate(JSON.parse(pendingProfileUpdate));
}

const errorCode = G.params.get('errorCode'); // side !== 'client'
const oldURL = G.params.get('oldURL'); // dialogCode === 2 || dialogCode === 3
const minAge = G.params.get('minAge'); // dialogCode === 4
const actualAge = G.params.get('actualAge') // dialogCode === 4
const bannedUntil = new Intl.DateTimeFormat(navigator.language, {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
}).format(new Date(G.params.get('bannedUntil'))); // dialogCode === 7，这会自动将时间字符串转换成用户本地的格式

const displayDialog = document.getElementById('code-' + dialogCode + '-dialog')
const closeButton = displayDialog.querySelector('.dialog-close-button');
const dialogTitle = displayDialog.querySelector('[slot="title"]');
const dialogBody = displayDialog.querySelector('[slot="body"]');

switch (dialogCode) {
case 4:
    const p1 = document.createElement('p');
    const p2 = document.createElement('p');
    p1.textContent = 
        'To maintain a secure platform environment, ' +
        'we currently only allow login and registration with GitHub accounts that are at least ' + minAge +
        ' days old.';
    p2.textContent =
        'We detected that your GitHub account is currently ' + actualAge +
        ' days old. Please try again once your account meets this requirement.';
    dialogBody.appendChild(p1);
    dialogBody.appendChild(p2);
    break;
case 5:
    if (side === 'callback') {
        closeButton.hidden = false;
    }
    break;
case 6:
    switch (side) {
    case 'server':
    case 'callback':
        dialogTitle.textContent = 'A server-side error occurred: ' + errorCode;
        break;
    case 'client':
        dialogTitle.textContent = 'A client-side error occurred';
        dialogBody.textContent = 'You may still be able to view the error after returning to this page, ' +
            'but enabling “Preserve log” in Developer Tools provides a more reliable record.';
        break;
    }
    break;
case 7:
    const p3 = document.createElement('p');
    const p4 = document.createElement('p');
    const a = document.createElement('a');
    p3.textContent =
        'Due to a violation of our Terms of Service, ' +
        'your account is currently restricted from logging in. This suspension will be lifted on ' + bannedUntil + '.';
    p4.textContent =
        'If you believe this was done in error, you may submit an appeal by contacting us at ';
    a.href = 'mailto:' + G.SUPPORT_EMAIL_ADDRESS + '?subject=' + encodeURIComponent(G.APPEAL_EMAIL_SUBJECT);
    a.textContent = G.SUPPORT_EMAIL_ADDRESS;
    dialogBody.appendChild(p3);
    p4.appendChild(a);
    dialogBody.appendChild(p4);
    break;
}

(() => {
    if (side !== 'callback' && closeButton) { //防御性编程，虽然目前side === 'client'是不需要隐藏的
        switch (dialogCode) {
        case 2:
        case 3:
            if (oldURL) {
                return;
            }
            break;
        case 6:
            if (window.history.length > 1) {
                return;
            }
            break;
        }
        closeButton.hidden = true;
    }
})();
closeButton.addEventListener('click', function(event) {
    if (side === 'callback') {
        return window.close();
    }
    switch (dialogCode) {
    case 1:
        G.editURL('/', false, true);
        break;
    case 2:
    case 3:
        G.editURL(oldURL, false, true);
        break;
    case 6:
        window.history.back();
        break;
    }
});

document.querySelector('#code-2-dialog .dialog-login-button').addEventListener('click', function() {
    G.loginWithGitHub();
});

document.querySelector('#code-3-dialog .dialog-login-button').addEventListener('click', function() {
    G.editURL('/adminlogin', false, true);
});

displayDialog.hidden = false; // 显示对应的对话框
