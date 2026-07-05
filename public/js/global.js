import * as S from '/js/shared.js';

export const params = new URLSearchParams(location.search);

export function editURL(newURL, pushInHistory, withRequest) {
    switch (true) {
    case withRequest && pushInHistory:
        window.location.href = newURL;
        break;
    case withRequest && !pushInHistory:
        window.location.replace(newURL);
        break;
    case !withRequest && pushInHistory:
        window.history.pushState(null, '', newURL);
        break;
    case !withRequest && !pushInHistory:
        window.history.replaceState(null, '', newURL);
        break;
    }
}

export const GITHUB_AUTH_URL = 'https://github.com/login/oauth/authorize?client_id=' + S.CLIENT_ID;
export const SUPPORT_EMAIL_ADDRESS = 'support@yourdomain.com' // 示例邮箱
export const APPEAL_EMAIL_SUBJECT = 'Appeal for Suspended Account';

export function openCenterPopup(url, title, width, height) {  // 居中显示window
    // 1. 获取当前窗口坐标
    const windowLeft = window.screenLeft !== undefined ? window.screenLeft : window.screenX;
    const windowTop = window.screenTop !== undefined ? window.screenTop : window.screenY;
    // 2. 获取当前窗口可见宽高
    const windowWidth = window.innerWidth || document.documentElement.clientWidth || window.screen.width;
    const windowHeight = window.innerHeight || document.documentElement.clientHeight || window.screen.height;
    // 3. 计算居中坐标
    const left = windowLeft + (windowWidth - width) / 2;
    const top = windowTop + (windowHeight - height) / 2;
    // 4. 拼接配置字符串
    const windowFeatures = 'width=' + width + ',height=' + height + ',top=' + top + ',left=' + left;
    // 5. 打开窗口
    const popup = window.open(url, title, windowFeatures);
    if (popup && window.focus) {
        popup.focus();
    }
    return popup;
}

export function loginWithGitHub() {
    openCenterPopup(GITHUB_AUTH_URL, 'Login with GitHub', 600, 700);
}

export function listenStorageChange(key, callback) {
    window.addEventListener('storage', function(event) { // 同域“公共频道”
        if (event.key === key) {
            let newValue;
            if (event.newValue === null) {
                newValue = null;
            } else {
                newValue = JSON.parse(event.newValue); // storage事件只能传递字符串
            }
            callback(newValue);
        }
    });
}

function gotoErrorPage(side, errorCode = null) {
    switch (side) {
    case 'client':
        window.history.replaceState({
            ...(window.history.state || {}),
            doNotReload: true,
        }, '') // 第三个参数省略，表示不修改显示的URL
        editURL('/dialogPage?dialogCode=6&side=client', true, true);
        break;
    case 'server':
        editURL('/dialogPage?dialogCode=6&side=server&errorCode=' + errorCode, false, true);
        break;
    }
}
export async function checkErrorCodeInURL(response) {
    if (response.status === 204) {
        return; // No Content，表示成功但没有数据返回
    }
    if (response.status === 401) {
        if ((await response.json()).isAdmin) {
            editURL('/dialogPage?dialogCode=3&displayURL=' + encodeURIComponent(window.location.href), false, true);
        } else {
            editURL('/dialogPage?dialogCode=2&displayURL=' + encodeURIComponent(window.location.href), false, true);
        }
        S.breakInThen();
    }
    if (response.status === 429) {
        editURL('/dialogPage?dialogCode=5&displayURL=' + encodeURIComponent(window.location.href), false, true);
        S.breakInThen();
    }
    if (!response.ok) {
        gotoErrorPage('server', response.status);
        S.breakInThen();
    }
    return response.json();
}

// 副作用代码，即使不显式export，只要有人import就会执行
window.addEventListener('error', function(event) { // 同步错误捕获
    gotoErrorPage('client', event);
}, true); // 捕获阶段监听，也能捕获到资源加载错误
window.addEventListener('unhandledrejection', function(event) { // 异步错误捕获
    if (event.reason === 'ImNotAnError') {
        event.preventDefault(); // 这是一个正常的流程，不需要被视为错误
        return;
    }
    gotoErrorPage('client', event);
});

window.addEventListener('popstate', function(event) {
    if (event.state?.doNotReload) {
        delete event.state.doNotReload;
        window.history.replaceState(event.state, '');
    } else {
        window.location.reload(); // 这之后执行的任何代码都无效
    }
});

class globalHeader extends HTMLElement { // 定义全局导航栏组件
    constructor() {
        super();
        // 创建 Shadow DOM（封装样式和结构）
        const shadow = this.attachShadow({ mode: 'open' });
        // 模板内容
        const template = document.createElement('template');
        template.innerHTML = `
            <style>
                /* 默认样式，:host指向自身，外部可通过::part(名字)进行覆盖 */
                :host {
                    position: fixed;
                    top: 0;
                    left: 0;
                    width: 100%;
                    max-width: 100%;
                    height: var(--nav-height);
                    background-color: rgba(10, 10, 10, 0.9);
                    backdrop-filter: blur(12px);
                    border-bottom: 1px solid var(--border-color);
                    display: flex;
                    justify-content: flex-start;
                    align-items: center;
                    gap: 24px;
                    padding: 0 24px !important; /* 使用 !important 确保不被*{}覆盖，因为规定了外部优先级比内部更高 */
                    z-index: 1002;
                }
                #logo-container {
                    flex: 0 0 auto;
                    min-width: 0;
                    display: flex;
                    align-items: center;
                    justify-content: flex-start;
                }
                .header-slot {
                    flex: 1 1 auto;
                    min-width: 0;
                    display: flex;
                    align-items: center;
                    justify-content: flex-end;
                }
                .logo {
                    font-weight: 700;
                    font-size: 18px;
                    letter-spacing: 1px;
                    color: var(--text-primary);
                    text-decoration: none; /* 去掉默认的下划线 */
                    cursor: pointer;
                }
                .logo .highlight {
                    color: var(--accent-color);
                }
                slot { /* 插槽 */
                    display: flex;
                    width: 100%;
                    min-width: 0;
                    align-items: center;
                    justify-content: flex-end;
                    gap: 32px;
                }
            </style>
            <div id="logo-container">
                <a href="/" class="logo">bench<span class="highlight">poll</span></a>
            </div>
            <div class="header-slot">
                <slot></slot>
            </div>
        `;
        shadow.appendChild(template.content.cloneNode(true));
    }
}

class globalDialog extends HTMLElement { // 定义全局对话框组件
    constructor() {
        super();
        const shadow = this.attachShadow({ mode: 'open' });
        const template = document.createElement('template');
        template.innerHTML = `
            <style>
                :host {
                    position: fixed;
                    inset: 0;
                    display: block;
                    z-index: var(--dialog-z-index);
                    pointer-events: none;
                }
                :host([hidden]) {
                    display: none;
                }
                .dialog-root {
                    width: 100%;
                    height: 100%;
                    position: relative;
                }
                .dialog-overlay {
                    position: absolute;
                    inset: 0;
                    display: var(--dialog-overlay-display);
                    background: color-mix(in srgb, var(--dialog-overlay-background) 68%, transparent);
                    backdrop-filter: blur(1px);
                    pointer-events: auto;
                }
                .dialog-stage {
                    position: absolute;
                    inset: 0;
                    display: flex;
                    align-items: center;
                    justify-content: center;
                    padding: 24px;
                    pointer-events: none;
                }
                .dialog-content {
                    width: fit-content;
                    min-width: min(var(--dialog-min-width, 240px), calc(100vw - 48px));
                    max-width: min(var(--dialog-width), calc(100vw - 48px));
                    max-height: min(100%, calc(100vh - 48px));
                    display: flex;
                    flex-direction: column;
                    gap: var(--dialog-gap);
                    padding: var(--dialog-padding);
                    background:
                        linear-gradient(180deg, rgba(59, 130, 246, 0.08) 0%, rgba(59, 130, 246, 0.02) 28%, transparent 100%),
                        color-mix(in srgb, var(--dialog-background) 88%, var(--accent-color));
                    border: 1px solid color-mix(in srgb, var(--dialog-border-color) 54%, var(--accent-color));
                    border-radius: 0;
                    box-shadow:
                        var(--dialog-shadow),
                        0 0 0 1px rgba(59, 130, 246, 0.14),
                        0 12px 32px rgba(37, 99, 235, 0.12);
                    color: var(--text-primary);
                    pointer-events: auto;
                    overflow: auto;
                }
                .dialog-title {
                    display: flex;
                    align-items: center;
                    justify-content: flex-start;
                    min-height: 24px;
                    text-align: left;
                    color: var(--text-primary);
                    font-size: var(--dialog-title-size);
                    font-weight: 600;
                    letter-spacing: 0.2px;
                }
                .dialog-body {
                    display: flex;
                    flex-direction: column;
                    gap: 12px;
                    color: var(--text-secondary);
                    font-size: var(--dialog-text-size);
                    line-height: 1.6;
                }
                .dialog-actions {
                    display: flex;
                    align-items: center;
                    justify-content: flex-end;
                    gap: 12px;
                    flex-wrap: wrap;
                }
                ::slotted([slot="title"]) {
                    margin: 0;
                    color: inherit;
                    font: inherit;
                    text-align: left;
                }
                ::slotted([slot="content"]) {
                    color: inherit;
                }
                ::slotted([slot="actions"]) {
                    flex: 0 0 auto;
                }
                @media (max-width: 640px) {
                    .dialog-stage {
                        padding: 16px;
                    }
                    .dialog-content {
                        width: fit-content;
                        min-width: min(var(--dialog-min-width, 220px), calc(100vw - 32px));
                        max-width: min(var(--dialog-width), calc(100vw - 32px));
                        max-height: calc(100vh - 32px);
                        padding: 16px;
                    }
                    .dialog-actions {
                        gap: 8px;
                    }
                }
            </style>
            <div class="dialog-root" part="root">
                <div class="dialog-overlay" part="overlay"></div>
                <div class="dialog-stage" part="stage">
                    <div class="dialog-content" part="content" role="dialog" aria-modal="true">
                        <div class="dialog-title" part="title">
                            <slot name="title"></slot>
                        </div>
                        <div class="dialog-body" part="body">
                            <slot name="body"></slot>
                        </div>
                        <div class="dialog-actions" part="actions">
                            <slot name="actions"></slot>
                        </div>
                    </div>
                </div>
            </div>
        `;
        shadow.appendChild(template.content.cloneNode(true));
    }
}

class globalDialogAction extends HTMLElement { // 定义全局对话框操作按钮组件
    static get observedAttributes() {
        return ['disabled'];
    }

    constructor() {
        super();
        const shadow = this.attachShadow({ mode: 'open' });
        const template = document.createElement('template');
        template.innerHTML = `
            <style>
                :host {
                    --button-color: var(--text-secondary);
                    --button-background: transparent;
                    --button-border-color: var(--border-color);
                    --button-hover-background: var(--bg-hover);
                    --button-hover-color: var(--text-primary);
                    --button-hover-border-color: var(--text-secondary);
                    display: inline-flex;
                }
                :host([accent]) {
                    --button-color: var(--accent-color);
                    --button-background: rgba(59, 130, 246, 0.12);
                    --button-border-color: rgba(59, 130, 246, 0.45);
                    --button-hover-background: rgba(59, 130, 246, 0.18);
                    --button-hover-color: #dbeafe;
                    --button-hover-border-color: var(--accent-color);
                }
                :host([danger]) {
                    --button-color: var(--text-danger);
                    --button-background: rgba(239, 68, 68, 0.1);
                    --button-border-color: rgba(239, 68, 68, 0.35);
                    --button-hover-background: rgba(239, 68, 68, 0.16);
                    --button-hover-color: #fecaca;
                    --button-hover-border-color: var(--text-danger);
                }
                :host([disabled]) {
                    opacity: 0.5;
                    pointer-events: none;
                }
                #button {
                    min-height: var(--dialog-button-height);
                    padding: 0 var(--dialog-button-padding-inline);
                    border: 1px solid var(--button-border-color);
                    border-radius: 0;
                    background-color: var(--button-background);
                    color: var(--button-color);
                    font-family: var(--font-sans);
                    font-size: 13px;
                    font-weight: 500;
                    line-height: 1;
                    display: inline-flex;
                    align-items: center;
                    justify-content: center;
                    gap: 8px;
                    cursor: pointer;
                    user-select: none;
                    transition: background-color 0.2s ease, border-color 0.2s ease, color 0.2s ease;
                }
                #button:disabled {
                    cursor: default;
                }
                #button:hover {
                    background-color: var(--button-hover-background);
                    color: var(--button-hover-color);
                    border-color: var(--button-hover-border-color);
                }
                #button:focus-visible {
                    outline: none;
                    border-color: var(--accent-color);
                    box-shadow: 0 0 0 1px var(--accent-color) inset;
                }
            </style>
            <button id="button" part="button" type="button"><slot></slot></button>
        `;
        shadow.appendChild(template.content.cloneNode(true));
        this.syncDisabledState();
    }

    connectedCallback() {
        this.syncDisabledState();
    }

    attributeChangedCallback(name, oldValue, newValue) {
        if (name === 'disabled' && oldValue !== newValue) {
            this.syncDisabledState();
        }
    }

    syncDisabledState() {
        const button = this.shadowRoot?.getElementById('button');
        if (!button) {
            return;
        }
        button.disabled = this.hasAttribute('disabled');
    }
}

customElements.define('global-header', globalHeader);
customElements.define('global-dialog', globalDialog);
customElements.define('global-dialog-action', globalDialogAction);
