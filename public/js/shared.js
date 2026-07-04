export function breakInThen() {
    throw 'ImNotAnError'; // 捕获错误时要做好相应的处理哦
}

export function initProperty(obj, prop, value) {
    obj[prop] = value;
}

export const CLIENT_ID = 'Iv23lifuVW3WKaD8K8wP';