import * as G from '/js/global.js';

const statusFilter = document.getElementById('status-filter');
const logList = document.getElementById('log-list');

function formatDate(value) {
    return new Intl.DateTimeFormat(navigator.language, {
        year: 'numeric',
        month: 'short',
        day: 'numeric',
        hour: '2-digit',
        minute: '2-digit'
    }).format(new Date(value));
}

function getHeading(log) {
    if (log.content.type === 'new_benchmark') {
        return log.content.name;
    }
    return log.content.targetName;
}

function createField(name, value) {
    if (value === null || value === undefined || value === '') {
        return [];
    }
    const fieldName = document.createElement('div');
    fieldName.className = 'field-name';
    fieldName.textContent = name;
    const fieldValue = document.createElement('div');
    fieldValue.className = 'field-value';
    if (typeof value === 'string' && /^https?:\/\//.test(value)) {
        const link = document.createElement('a');
        link.href = value;
        link.target = '_blank';
        link.rel = 'noreferrer';
        link.textContent = value;
        fieldValue.append(link);
    } else {
        fieldValue.textContent = String(value);
    }
    return [fieldName, fieldValue];
}

function createLogItem(log) {
    const item = document.createElement('article');
    item.className = 'log-item';

    const body = document.createElement('div');
    const title = document.createElement('div');
    title.className = 'log-title';
    const type = document.createElement('span');
    type.className = 'log-type';
    type.textContent = log.content.type === 'new_benchmark' ? 'NEW EVALUATION ITEM' : 'REPORT';
    const status = document.createElement('span');
    status.className = 'log-status ' + log.status;
    status.textContent = log.status.toUpperCase();
    const heading = document.createElement('span');
    heading.className = 'log-heading';
    heading.textContent = getHeading(log);
    title.append(type, status, heading);

    const meta = document.createElement('div');
    meta.className = 'log-meta';
    meta.textContent = `#${log.ID} by ${log.userName ?? log.user_id} · ${formatDate(log.created_at)}`;

    const fields = document.createElement('div');
    fields.className = 'field-grid';
    if (log.content.type === 'new_benchmark') {
        fields.append(
            ...createField('URL', log.content.url),
            ...createField('Input', log.content.inputModality),
            ...createField('Output', log.content.outputModality),
            ...createField('Realtime', log.content.isRealtime ? 'Yes' : 'No'),
            ...createField('Category Path', log.content.categoryPath),
            ...createField('Notes', log.content.details)
        );
    } else {
        fields.append(
            ...createField('Issue Type', log.content.issueType),
            ...createField('Page URL', log.content.pageURL),
            ...createField('Source URL', log.content.sourceURL),
            ...createField('Details', log.content.details)
        );
    }
    body.append(title, meta, fields);

    const actions = document.createElement('div');
    actions.className = 'log-actions';
    if (log.status === 'pending') {
        const approve = document.createElement('button');
        approve.className = 'action-button approve';
        approve.type = 'button';
        approve.textContent = 'Approve';
        approve.addEventListener('click', () => reviewLog(log.ID, 'approved'));
        const reject = document.createElement('button');
        reject.className = 'action-button reject';
        reject.type = 'button';
        reject.textContent = 'Reject';
        reject.addEventListener('click', () => reviewLog(log.ID, 'rejected'));
        actions.append(approve, reject);
    }
    item.append(body, actions);
    return item;
}

function renderLogs(logs) {
    logList.replaceChildren();
    if (logs.length === 0) {
        const empty = document.createElement('div');
        empty.className = 'empty-state';
        empty.textContent = 'No submissions in this queue.';
        logList.append(empty);
        return;
    }
    logs.forEach(log => logList.append(createLogItem(log)));
}

function loadLogs() {
    fetch('/api/list_moderation_logs', {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json'
        },
        body: JSON.stringify({ status: statusFilter.value })
    })
    .then(response => G.checkErrorCodeInURL(response))
    .then(data => renderLogs(data.logs));
}

function reviewLog(ID, status) {
    fetch('/api/review_moderation_log', {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json'
        },
        body: JSON.stringify({ ID, status })
    })
    .then(response => {
        if (response.status === 409) {
            window.alert('This submission could not be approved because it conflicts with existing data.');
            return;
        }
        return G.checkErrorCodeInURL(response);
    })
    .then(data => {
        if (data !== undefined) {
            loadLogs();
        }
    });
}

statusFilter.addEventListener('change', loadLogs);
loadLogs();
