import * as G from '/js/global.js';

const modeTabs = document.querySelectorAll('.mode-tab');
const contributionForms = document.querySelectorAll('.contribution-form');
const successDialog = document.getElementById('submit-success-dialog');
const errorDialog = document.getElementById('submit-error-dialog');

function setActiveForm(targetID) {
    modeTabs.forEach(tab => {
        tab.classList.toggle('selected', tab.dataset.formTarget === targetID);
    });
    contributionForms.forEach(form => {
        form.hidden = form.id !== targetID;
    });
}

function trimFormValues(form) {
    form.querySelectorAll('input[type="text"], input[type="url"], textarea').forEach(field => {
        field.value = field.value.trim();
    });
}

function getPayload(form) {
    const formData = new FormData(form);
    const contributionType = form.dataset.contributionType;
    if (contributionType === 'report_issue') {
        return {
            type: contributionType,
            issueType: formData.get('issueType'),
            targetName: formData.get('targetName'),
            pageURL: formData.get('pageURL'),
            sourceURL: formData.get('sourceURL'),
            details: formData.get('details')
        };
    }
    return {
        type: contributionType,
        name: formData.get('name'),
        url: formData.get('url'),
        inputModality: formData.get('inputModality'),
        outputModality: formData.get('outputModality'),
        isRealtime: formData.get('isRealtime') === 'on',
        categoryPath: formData.get('categoryPath'),
        details: formData.get('details')
    };
}

function markInvalidFields(form) {
    let isValid = true;
    form.querySelectorAll('.field').forEach(field => {
        const input = field.querySelector('input, select, textarea');
        if (!input) {
            return;
        }
        const valid = input.checkValidity();
        field.classList.toggle('invalid', !valid);
        if (!valid) {
            isValid = false;
        }
    });
    return isValid;
}

modeTabs.forEach(tab => {
    tab.addEventListener('click', () => setActiveForm(tab.dataset.formTarget));
});

contributionForms.forEach(form => {
    form.addEventListener('input', event => {
        event.target.closest('.field')?.classList.remove('invalid');
    });
    form.addEventListener('submit', event => {
        event.preventDefault();
        trimFormValues(form);
        if (!markInvalidFields(form)) {
            errorDialog.hidden = false;
            return;
        }
        const submitButton = form.querySelector('.submit-button');
        submitButton.disabled = true;
        fetch('/api/submit_contribution', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify(getPayload(form))
        })
        .then(response => {
            if (!response.ok) {
                errorDialog.hidden = false;
            }
            return G.checkErrorCodeInURL(response);
        })
        .then(() => {
            form.reset();
            successDialog.hidden = false;
        })
        .finally(() => {
            submitButton.disabled = false;
        });
    });
});

document.querySelectorAll('.dialog-close-button').forEach(button => {
    button.addEventListener('click', () => {
        document.querySelector('global-dialog:not([hidden])').hidden = true;
    });
});
