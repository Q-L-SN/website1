import * as S from '/js/shared.js';
import * as G from '/js/global.js';

const loginButton = document.getElementById('login-button');
const logoutButton = document.getElementById('logout-button');
const deleteAccountButton = document.getElementById('delete-account-button');
const loginSuccessDialog = document.getElementById('login-success-dialog');
const logoutDialog = document.getElementById('logout-dialog');
const logoutSuccessDialog = document.getElementById('logout-success-dialog');
const deleteAccountDialog = document.getElementById('delete-account-dialog');
const deleteAccountSuccessDialog = document.getElementById('delete-account-success-dialog');
const voteQuotaDialog = document.getElementById('vote-quota-dialog');
const dialogLogoutThisDeviceButton = logoutDialog.querySelector('.dialog-logout-this-device-button');
const dialogLogoutAllDevicesButton = logoutDialog.querySelector('.dialog-logout-all-devices-button');
const dialogDeleteAccountButton = deleteAccountDialog.querySelector('.dialog-delete-account-button');
const revokeGitHubAuthLink = document.getElementById('revoke-github-auth-link');
const voteBudgetContainer = document.getElementById('vote-budget-container');
const budgetTrack = document.getElementById('budget-track');
const budgetCount = document.getElementById('budget-count');
const userProfile = document.getElementById('user-profile');
const userProfilePicture = document.getElementById('user-profile-picture');
const userProfileName = document.getElementById('user-profile-name');
const userControls = document.getElementById('user-controls');
const templates = document.querySelector('.templates');
const objectList = document.getElementById('object-list');
const globalSearch = document.getElementById('global-search');
const suggestions = document.getElementById('suggestions');
const treeContent = document.getElementById('tree-content');
const modalitySelects = document.querySelectorAll('.custom-select');

let currentCategoryID;
let currentVoteTargetCategoryID;
let currentUserProfile;
let currentObjects = [];
const activeFilters = {
    inputModality: '',
    outputModality: ''
};

function isTemplateSet(templateID) {
    return templateID !== null && templateID !== undefined;
}

function normalizeURLPart(value) {
    return String(value).toLowerCase();
}

function normalizeModality(value) {
    return String(value ?? '').toLowerCase();
}

function objectMatchesActiveFilters(obj) {
    return (!activeFilters.inputModality || normalizeModality(obj.input_modality) === activeFilters.inputModality)
        && (!activeFilters.outputModality || normalizeModality(obj.output_modality) === activeFilters.outputModality);
}

function createNoResultsMessage(text) {
    const noResults = document.createElement('div');
    noResults.className = 'no-results';
    noResults.textContent = text;
    return noResults;
}

function updateUserProfileDisplay(newProfile) {
    currentUserProfile = {
        ...(currentUserProfile ?? {}),
        ...newProfile
    };
    voteBudgetContainer.hidden = false;
    loginButton.hidden = true;
    userProfile.hidden = false;
    if (currentUserProfile.userProfilePictureURL !== undefined) {
        userProfilePicture.style.backgroundImage = `url(${currentUserProfile.userProfilePictureURL})`;
    }
    if (currentUserProfile.userName !== undefined) {
        userProfileName.textContent = currentUserProfile.userName;
    }
    budgetTrack.replaceChildren();
    budgetCount.textContent = `${currentUserProfile.votesPerUser - currentUserProfile.userVoteUsed}/${currentUserProfile.votesPerUser}`;
    for (let i = 0; i < currentUserProfile.votesPerUser; i++) {
        const dot = document.createElement('div');
        dot.classList.add('budget-dot');
        if (i < currentUserProfile.votesPerUser - currentUserProfile.userVoteUsed) {
            dot.classList.add('active');
        } else {
            dot.classList.add('empty');
        }
        budgetTrack.appendChild(dot);
    }
    document.querySelectorAll('.my-vote-status').forEach(voteStatus => {
        voteStatus.replaceChildren();
        //
    });
}

function updateVoteDisplay(objItem, myVote, voteSum) {
    const upButton = objItem.querySelector('.btn-vote.up');
    const downButton = objItem.querySelector('.btn-vote.down');
    const voteSumElement = objItem.querySelector('.vote-sum');
    const voteStatus = objItem.querySelector('.my-vote-status');
    upButton.classList.toggle('voted', myVote === 1);
    downButton.classList.toggle('voted-down', myVote === -1);
    voteSumElement.textContent = voteSum;
    voteSumElement.classList.toggle('negative', voteSum < 0);
    voteStatus.replaceChildren();
    if (myVote !== 1 && myVote !== -1) {
        return;
    }
    const dot = document.createElement('div');
    dot.className = 'my-vote-dot';
    if (myVote === 1) {
        dot.classList.add('filled-up');
    } else {
        dot.classList.add('filled-down');
    }
    voteStatus.append(dot);
}

function submitVote(objItem, targetObjectID, value) {
    objItem.querySelectorAll('.btn-vote').forEach(button => {
        button.style.pointerEvents = 'none';
    });
    fetch('/api/submit_vote', {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json'
        },
        body: JSON.stringify({
            targetObjectID: targetObjectID,
            targetCategoryID: currentVoteTargetCategoryID ?? null,
            value: value
        })
    })
    .then(response => {
        if (response.status === 409) {
            voteQuotaDialog.hidden = false;
            S.breakInThen();
        }
        return G.checkErrorCodeInURL(response);
    })
    .then(data => {
        updateVoteDisplay(objItem, data.object.my_vote, data.object.vote_sum);
        updateUserProfileDisplay(data.profile);
    })
    .finally(() => {
        objItem.querySelectorAll('.btn-vote').forEach(button => {
            button.style.pointerEvents = '';
        });
    });
}

G.listenStorageChange('user-profile-update', newProfile => {
    if (newProfile !== null) {
        loginSuccessDialog.hidden = false; // 显示登录成功对话框
    } else {
        logoutSuccessDialog.hidden = false; // 显示登出成功对话框
    }
});

fetch('/api/get_user_profile', {
    method: 'POST',
    headers: {
        'Content-Type': 'application/json'
    }
})
.then(response => {
    if (response.status === 204) {
        S.breakInThen() //在这里直接用return会传给下一个then，所以不能用
    }
    return G.checkErrorCodeInURL(response);
})
.then(data => updateUserProfileDisplay(data));

function createListItem(obj) {
    const objItem = document.createElement('div');
    objItem.className = 'list-item';
    objItem.innerHTML = `
            <div class="col-rank">${obj.rank}</div>
            <div class="col-info">
                <div class="item-name"></div>
                <div class="item-modality">
                    <span class="realtime-indicator" hidden>Realtime</span>
                    <span class="modality">${obj.input_modality}</span>
                    <i class="fa-solid fa-arrow-right-long"></i>
                    <span class="modality">${obj.output_modality}</span>
                </div>
            </div>
            <div class="col-vote-actions">
                <div class="my-vote-status"></div>
                <div class="vote-control">
                    <div class="btn-vote up"><i class="fa-solid fa-caret-up"></i></div>
                    <div class="vote-sum">${obj.vote_sum}</div>
                    <div class="btn-vote down"><i class="fa-solid fa-caret-down"></i></div>
                </div>
            </div>`;
    objItem.querySelector('.item-name').textContent = obj.name; // 不直接拼接，防止注入攻击
    if (obj.is_realtime) {
        objItem.querySelector('.realtime-indicator').hidden = false;
    }
    updateVoteDisplay(objItem, obj.my_vote, obj.vote_sum);
    objItem.querySelector('.btn-vote.up').addEventListener('click', () => {
        submitVote(objItem, obj.ID, 1);
    });
    objItem.querySelector('.btn-vote.down').addEventListener('click', () => {
        submitVote(objItem, obj.ID, -1);
    });
    switch (obj.rank) {
    case 1:
        objItem.querySelector('.col-rank').classList.add('rank-first');
        break;
    case 2:
        objItem.querySelector('.col-rank').classList.add('rank-second');
        break;
    case 3:
        objItem.querySelector('.col-rank').classList.add('rank-third');
        break;
    default:
        objItem.querySelector('.col-rank').classList.add('rank-other');
        break;
    }
    return objItem;
}

function renderObjectList(objects) {
    const filteredObjects = objects.filter(objectMatchesActiveFilters);
    objectList.replaceChildren(suggestions);
    if (filteredObjects.length === 0) {
        objectList.append(createNoResultsMessage('No benchmarks match the selected filters'));
        return;
    }
    for (const obj of filteredObjects) {
        objectList.append(createListItem(obj));
    }
}

function refreshObjectDisplay() {
    if (globalSearch.value.trim() !== '') {
        searchInCurrentCategory(globalSearch.value);
        return;
    }
    renderObjectList(currentObjects);
}

function closeModalitySelects(exceptSelect = null) {
    modalitySelects.forEach(select => {
        if (select !== exceptSelect) {
            select.classList.remove('open');
        }
    });
}

function syncFilterFromSelect(select) {
    const selectedOption = select.querySelector('.option.selected');
    const value = selectedOption?.dataset.value ?? '';
    select.querySelector('.selected-value').textContent = selectedOption?.textContent ?? 'Any';
    if (select.id === 'select-input-modality') {
        activeFilters.inputModality = value;
    } else if (select.id === 'select-output-modality') {
        activeFilters.outputModality = value;
    }
}

modalitySelects.forEach(select => {
    syncFilterFromSelect(select);
    select.querySelector('.select-trigger').addEventListener('click', event => {
        event.stopPropagation();
        const shouldOpen = !select.classList.contains('open');
        closeModalitySelects();
        select.classList.toggle('open', shouldOpen);
    });
    select.querySelectorAll('.option').forEach(option => {
        option.addEventListener('click', event => {
            event.stopPropagation();
            select.querySelector('.option.selected')?.classList.remove('selected');
            option.classList.add('selected');
            syncFilterFromSelect(select);
            closeModalitySelects();
            refreshObjectDisplay();
        });
    });
});

document.addEventListener('click', () => closeModalitySelects());

fetch(`/api/get_page${window.location.pathname}`, {
    method: 'POST',
    headers: {
        'Content-Type': 'application/json'
    }
})
.then(response => G.checkErrorCodeInURL(response))
.then(async data => {
    currentCategoryID = data.currentCategoryID;
    currentVoteTargetCategoryID = data.voteTargetCategoryID;
    if (data.jump === true) {
        G.editURL('/', false, true);
        S.breakInThen();
    }
    function generateObjectList(objects) {
        currentObjects = objects;
        renderObjectList(currentObjects);
    }
    async function generateFolderTree(location, point) {

        async function setChildrenAndObjectList(category, selectedTemplatePath = []) {
            const doNotGetChildren = !category.is_folder || category.children !== undefined;
            const getTemplatesList = isTemplateSet(category.template) && category.templatesList === undefined;
            await fetch('/api/load_objects_and_subcategories', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({
                    targetCategory: category,
                    doNotGetChildren: doNotGetChildren,
                    getTemplatesList: getTemplatesList,
                    selectedTemplatePath: selectedTemplatePath
                })
            })
            .then(response => G.checkErrorCodeInURL(response))
            .then(data => {
                currentVoteTargetCategoryID = data.voteTargetCategoryID;
                if (data.subcategories !== undefined) {
                    category.children = data.subcategories;
                }
                if (data.templatesList !== undefined) {
                    S.initProperty(category, 'templatesList', data.templatesList);
                }
                generateObjectList(data.objectList);
            });
        }
        function toggleCurrentCategoryInTree(categoryTree, path, editURL = true) {
            templates.replaceChildren();
            const previouslySelected = document.querySelector('#tree-content .selected');
            if (previouslySelected !== null) { //如果原来已经选了
                previouslySelected.classList.remove('selected'); //取消选中原来的
            }
            if (categoryTree !== previouslySelected) { //如果点的不是原来那个
                categoryTree.classList.add('selected'); //选中现在这个
                if (editURL) {
                    G.editURL('/rankings/' + path, true, false);
                }
            } else {
                G.editURL('/', true, false);
            }
        }
        function toggleOptionInTemplates(templateBox, option) {
            const currentlySelectedOption = templateBox.querySelector('.template-option.selected');
            if (currentlySelectedOption === option) { //如果点的已经选了
                option.classList.remove('selected'); //取消选中
            } else {
                if (currentlySelectedOption !== null) { //如果原来已经选了
                    currentlySelectedOption.classList.remove('selected'); //取消选中原来的
                    option.classList.add('selected'); //选中现在的
                } else {
                    option.classList.add('selected'); //选中现在的
                }
            }
        }
        function updateTemplatesDisplay(categoryPath) {
            const templatesArray = Array.from(templates.children);
            let selectedTemplates =
                templatesArray.findIndex(item => item.querySelector('.template-option.selected') === null);
            let newDisplayTheFirstN;
            if (selectedTemplates === -1) {
                selectedTemplates = templatesArray.length;
                newDisplayTheFirstN = templatesArray.length; //如果都选了，就全显示
            } else {
                newDisplayTheFirstN = selectedTemplates + 1;
            }
            templatesArray.forEach((item, index) => { 
                if (index < newDisplayTheFirstN) {
                    item.hidden = false;
                } else {
                    item.hidden = true;
                }
            });
            return newDisplayTheFirstN;
        }

        function getSelectedTemplatePath() {
            const templatesArray = Array.from(templates.children);
            let selectedTemplates =
                templatesArray.findIndex(item => item.querySelector('.template-option.selected') === null);
            if (selectedTemplates === -1) {
                selectedTemplates = templatesArray.length;
            }
            return templatesArray.slice(0, selectedTemplates).map(item =>
                normalizeURLPart(item.querySelector('.template-option.selected').textContent));
        }

        function updateTemplatesURL(categoryPath) {
            const templatePath = getSelectedTemplatePath().join('/');
            G.editURL('/rankings/' + categoryPath + (templatePath ? '/' + templatePath : ''), true, false);
        }

        function generateTemplates(leafNode, category, selectedTemplatePath = []) {
            if (category.displayTheFirstN === undefined) {
                S.initProperty(category, 'displayTheFirstN', 1);
            }
            category.templatesList.forEach((template, index) => {
                const templateBox = document.createElement('div');
                templateBox.className = 'template-box';
                const templateName = document.createElement('div');
                templateName.className = 'template-name';
                templateName.textContent = template.name;
                const templateOptions = document.createElement('div');
                templateOptions.className = 'template-options';
                template.optionsList.forEach(optionName => {
                    const option = document.createElement('div');
                    option.className = 'template-option';
                    option.textContent = optionName;
                    if (normalizeURLPart(optionName) === selectedTemplatePath[index]) {
                        option.classList.add('selected');
                    }
                    option.addEventListener('click', async function(event) {
                        toggleOptionInTemplates(templateBox, option); //必须写在updateTemplatesDisplay前面
                        category.displayTheFirstN =
                            updateTemplatesDisplay(leafNode.dataset.path);
                        updateTemplatesURL(leafNode.dataset.path);
                        await setChildrenAndObjectList(category, getSelectedTemplatePath());
                    });
                    templateOptions.append(option);
                });
                templateBox.hidden = true; //默认先隐藏，等updateTemplatesDisplay根据option选择情况决定显示几个
                templateBox.append(templateName, templateOptions);
                templates.append(templateBox);
            });
            updateTemplatesDisplay(leafNode.dataset.path);
        }

        for (const child of point) {
            if (child.is_folder && !isTemplateSet(child.template)) {
                const categoryTree = document.createElement('div');
                categoryTree.className = 'tree-group';
                const treeRootItem = document.createElement('div');
                treeRootItem.className = 'tree-root-item';
                const folderIcon = document.createElement('i');
                folderIcon.className = 'fa-solid icon-folder';
                if (child.expanded) {
                    categoryTree.classList.add('expanded');
                    folderIcon.classList.add('fa-folder-open');
                } else {
                    folderIcon.classList.add('fa-folder-closed');
                }
                if (child.ID === data.currentCategoryID) {
                    categoryTree.classList.add('selected');
                }
                const categoryNameSpan = document.createElement('span');
                categoryNameSpan.textContent = child.name;
                const treeChildren = document.createElement('div');
                treeChildren.className = 'tree-children';
                if (location.dataset.path !== undefined) {
                    S.initProperty(treeChildren.dataset, 'path', location.dataset.path + '/' + child.name.toLowerCase());
                } else {
                    S.initProperty(treeChildren.dataset, 'path', child.name.toLowerCase());
                }
                if (child.expanded) {
                    await generateFolderTree(treeChildren, child.children);
                }
                treeRootItem.append(folderIcon, categoryNameSpan); //是appendChild()的升级版，一次可传多个元素，支持文本节点
                categoryTree.append(treeRootItem, treeChildren);
                treeRootItem.addEventListener('click', async function() {
                    if (child.expanded) {
                        toggleCurrentCategoryInTree(categoryTree, treeChildren.dataset.path);
                        if (currentCategoryID !== child.ID) {
                            currentCategoryID = child.ID;
                            await setChildrenAndObjectList(child);
                        } else {
                            currentCategoryID = null;
                            await setChildrenAndObjectList({ ID: null });
                        }
                    } else {
                        if (currentCategoryID !== child.ID) {
                            currentCategoryID = child.ID;
                            child.expanded = true;
                            toggleCurrentCategoryInTree(categoryTree, treeChildren.dataset.path);
                            await setChildrenAndObjectList(child);
                            await generateFolderTree(treeChildren, child.children);
                            folderIcon.classList.replace('fa-folder-closed', 'fa-folder-open');
                            categoryTree.classList.add('expanded');
                        } else {
                            currentCategoryID = null;
                            await setChildrenAndObjectList({ ID: null });
                        }
                    }
                });
                location.append(categoryTree);
            } else {
                const leafCategory = document.createElement('div');
                leafCategory.className = 'tree-leaf';
                const categoryNameSpan = document.createElement('span');
                categoryNameSpan.textContent = child.name;
                leafCategory.append(categoryNameSpan);
                if (location.dataset.path !== undefined) {
                    S.initProperty(leafCategory.dataset, 'path', location.dataset.path + '/' + child.name.toLowerCase());
                } else {
                    S.initProperty(leafCategory.dataset, 'path', child.name.toLowerCase());
                }
                if (child.ID == data.currentCategoryID) {
                    leafCategory.classList.add('selected');
                    if (isTemplateSet(child.template)) {
                        await setChildrenAndObjectList(child, data.selectedTemplatePath ?? []);
                        generateTemplates(leafCategory, child, data.selectedTemplatePath ?? []);
                    }
                }
                leafCategory.addEventListener('click', async function() {
                    if (currentCategoryID !== child.ID) {
                        currentCategoryID = child.ID;
                        await setChildrenAndObjectList(child);
                        toggleCurrentCategoryInTree(leafCategory, leafCategory.dataset.path, !isTemplateSet(child.template));
                        if (isTemplateSet(child.template)) {
                            generateTemplates(leafCategory, child);
                            updateTemplatesURL(leafCategory.dataset.path);
                        }
                    } else {
                        currentCategoryID = null;
                        await setChildrenAndObjectList({ ID: null });
                        toggleCurrentCategoryInTree(leafCategory, leafCategory.dataset.path);
                    }
                });
                location.append(leafCategory);
            }
        }
    }
    await generateFolderTree(treeContent, data.categoryTree); //写tree-content
    generateObjectList(data.objectList); //写object-list
});

let requestTimer; // 用于存储定时器 ID

globalSearch.addEventListener('compositionend', (event) => {
    globalSearch.dispatchEvent(new Event('input')); // 选词结束，触发 input 事件重新尝试搜索
});

async function searchInCurrentCategory(query) {
    if (query.trim() === '') {
        suggestions.replaceChildren();
        suggestions.style.display = 'none';
        return;
    }
    query = query.toLowerCase();
    suggestions.style.display = 'flex';
    await fetch(`/api/search_suggestions`, {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json'
        },
        body: JSON.stringify({ query: query, categoryID: currentCategoryID})
    })
    .then(response => G.checkErrorCodeInURL(response))
    .then(data => {
        suggestions.replaceChildren();
        const filteredResults = data.filter(objectMatchesActiveFilters);
        if (filteredResults.length == 0) {
            suggestions.append(createNoResultsMessage('No results found'));
        }
        for (const suggestion of filteredResults) {
            suggestions.append(createListItem(suggestion));
        }
    });
}

globalSearch.addEventListener('input', (event) => {
    clearTimeout(requestTimer); // 每次输入时清除之前的定时器
    requestTimer = setTimeout(() => {
        if (event.isComposing || currentCategoryID === undefined) {
            return;
        }
        searchInCurrentCategory(globalSearch.value);
    }, 300); // 加防抖延迟
});

globalSearch.addEventListener('focus', (event) => {
    if (suggestions.children.length > 0) {
        searchInCurrentCategory(globalSearch.value);
    }
});

document.addEventListener('click', (event) => {
    if (!suggestions.contains(event.target) && event.target !== globalSearch) {
        clearTimeout(requestTimer);
        suggestions.style.display = 'none'; // 点击其他地方时隐藏建议列表
    }
});

loginButton.addEventListener('click', () => {
    G.loginWithGitHub();
});
logoutButton.addEventListener('click', () => {
    logoutDialog.hidden = false;
    fetch('/api/get_device_count', {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json'
        }
    })
    .then(response => G.checkErrorCodeInURL(response))
    .then(data => {
        const actionsContainer = logoutDialog.querySelector('[slot="actions"]');
        if (data.deviceCount === 1) {
            dialogLogoutThisDeviceButton.textContent = 'Log out';
            dialogLogoutAllDevicesButton.hidden = true;
        } else {
            dialogLogoutThisDeviceButton.textContent = 'Log out on this device only';
            dialogLogoutAllDevicesButton.textContent = `Log out on all ${data.deviceCount} devices`;
        }
        actionsContainer.hidden = false;
    });
});

revokeGitHubAuthLink.href = 'https://github.com/settings/apps/authorizations/' + S.CLIENT_ID;
revokeGitHubAuthLink.textContent = revokeGitHubAuthLink.href;
deleteAccountButton.addEventListener('click', () => {
    deleteAccountDialog.hidden = false;
});

document.querySelectorAll('.dialog-close-button').forEach(button => {
    button.addEventListener('click', () => {
        document.querySelector('global-dialog:not([hidden])').hidden = true;
    });
});
[loginSuccessDialog, logoutSuccessDialog, deleteAccountSuccessDialog].forEach(dialog => {
    dialog.querySelector('.dialog-close-button').addEventListener('click', () => {
        window.location.reload(); // 关闭登录成功对话框时刷新页面以更新状态
    });
});

dialogLogoutThisDeviceButton.addEventListener('click', () => {
    const actionsContainer = logoutDialog.querySelector('[slot="actions"]');
    actionsContainer.hidden = true;
    fetch('/api/logout', {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json'
        }
    })
    .then(response => {
        if (!response.ok) {
            actionsContainer.hidden = false;
        }
        return G.checkErrorCodeInURL(response);
    })
    .then(() => {
        logoutDialog.hidden = true;
        logoutSuccessDialog.hidden = false;
    });
});
dialogLogoutAllDevicesButton.addEventListener('click', () => {
    const actionsContainer = logoutDialog.querySelector('[slot="actions"]');
    actionsContainer.hidden = true;
    fetch('/api/logout?all', {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json'
        }
    })
    .then(response => {
        if (!response.ok) {
            actionsContainer.hidden = false;
        }
        return G.checkErrorCodeInURL(response);
    })
    .then(() => {
        logoutDialog.hidden = true;
        logoutSuccessDialog.hidden = false;
    });
});
dialogDeleteAccountButton.addEventListener('click', () => {
    const actionsContainer = deleteAccountDialog.querySelector('[slot="actions"]');
    actionsContainer.hidden = true;
    fetch('/api/delete_account', {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json'
        }
    })
    .then(response => {
        if (!response.ok) {
            actionsContainer.hidden = false;
        }
        return G.checkErrorCodeInURL(response);
    })
    .then(() => {
        deleteAccountDialog.hidden = true;
        deleteAccountSuccessDialog.hidden = false;
    });
});
