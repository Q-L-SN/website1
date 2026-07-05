import * as S from './public/js/shared.js';
import fs from 'fs';
import https from 'https';
import express from 'express'; //v5.2.1
import bcrypt from 'bcryptjs';
import rateLimit from 'express-rate-limit';
import crypto from 'crypto';
import cookieParser from 'cookie-parser';
import session from 'express-session';
import MySQLStoreFactory from 'express-mysql-session';
import levenshtein from 'fast-levenshtein';
import { ProxyAgent, setGlobalDispatcher } from 'undici';
import 'dotenv/config'; //利用副作用来代替config()调用 读取env

const currentDir = import.meta.dirname;
setGlobalDispatcher(new ProxyAgent('http://127.0.0.1:12342')); // 设置全局代理，解决服务器无法访问GitHub API的问题
const MySQLStore = MySQLStoreFactory(session);

const dbPassword = process.env.DB_PASSWORD; // 数据库密码
const sessionSecret = process.env.SESSION_SECRET; // Session密钥
const sessionCleanupIntervalMs = Number(process.env.SESSION_CLEANUP_INTERVAL_MINUTES) * 60 * 1000; // 会话清理间隔时间，单位为毫秒
const sessionMaxAgeMs = Number(process.env.SESSION_MAX_AGE_DAYS) * 24 * 60 * 60 * 1000; // 会话过期时间，单位为毫秒
const rateLimitWindowMs = Number(process.env.RATE_LIMIT_WINDOW_MINUTES) * 60 * 1000; // 速率限制窗口时间，单位为毫秒
const rateLimitMaxRequests = process.env.RATE_LIMIT_MAX_REQUESTS; // 最大请求次数
const githubClientID = S.CLIENT_ID;
const githubClientSecret = process.env.GITHUB_CLIENT_SECRET;
const githubMinAccountAgeDays = Number(process.env.GITHUB_MIN_ACCOUNT_AGE_DAYS);
const votesPerUser = Number(process.env.VOTES_PER_USER);

import { initPool, pool as db } from './db.js'; //import语法引入的本地模块需要加上扩展名
import { breakInThen } from './public/js/shared.js';
initPool(dbPassword); // 初始化数据库连接池
const app = express();

// 配置速率限制器
const limiter = rateLimit({
	windowMs: rateLimitWindowMs, // 时间窗口，单位为毫秒
	limit: rateLimitMaxRequests, // 在上述时间窗口内，最大请求次数
	standardHeaders: false, // 禁用标准head返回速率限制信息
	legacyHeaders: false, // 禁用旧版head返回速率限制信息
    handler: function (req, _res, next, _options) {
        switch (req.method) {
        case 'GET':
            //对所有callback都返回错误status而不是错误page
            if (req.path.toLowerCase() === '/github_callback') {
                return next({ status: 429, body: { dialogCode: 5 }});
            }
            if (req.path.toLowerCase() === '/dialogpage' && req.query.dialogCode === '5') {
                return next(); //放行
            }
            return next({ status: 429, body: { dialogCode: 5, displayURL: req.originalUrl }});
        case 'POST':
            return next({ status: 429 });
        }
    }
});

const API = express.Router();
const page = express.Router();

const markErrorFrom = from => (req, res, next) => {
  req.errorFrom = from;
  next();
};
API.use(markErrorFrom('API'));
page.use(markErrorFrom('page'));

// 实例化 Store
const sessionStore = new MySQLStore({
    clearExpired: true, // 自动清理过期会话
    checkExpirationInterval: sessionCleanupIntervalMs,
    expiration: sessionMaxAgeMs,
    createDatabaseTable: true
}, db);

app.use(session({
    key: 'sid', // 存储在客户端Cookie中的名称
    secret: sessionSecret, // 用于加密会话ID的密钥
    store: sessionStore,
    resave: false, // 只有在会话数据发生变化时才保存会话，这样可以减少不必要的数据库写入
    saveUninitialized: false, // 只有对会话写入数据时才存储会话，这样可以避免存储大量未使用的会话
    cookie: { maxAge: sessionMaxAgeMs }
}));
app.use(express.static('public'));
app.use(express.json());
app.use(cookieParser());
app.use(limiter); // 除了static资源，所有请求都经过速率限制器

app.use('/api', API);
app.use(page);
//这里之后就不应该有任何app下的中间件和route了，否则就可能绕过错误处理机制

const requireAuthForAPI = async (req, res, next) => {
    if (!req.session.userID) {
        return next({ status: 401, body: { isAdmin: false } });
    }
    next();
};
const requireAuthForPages = async (req, res, next) => {
    if (!req.session.userID) {
        // 因为不是直接拼接URL而是后面会用URLSearchParams处理，所以不能用encodeURIComponent，否则就二次编码了
        return next({ status: 401, body: { dialogCode: 2, displayURL: req.originalUrl, oldURL: req.headers.referer }});
    }
    next();
};
const requireAdminAuthForAPI = (req, res, next) => {
    if (!req.session.adminID) {
        return next({ status: 401, body: { isAdmin: true } });
    }
    next();
};
const requireAdminAuthForPages = (req, res, next) => {
    if (!req.session.adminID) {
        return next({ status: 401, body: { dialogCode: 3, displayURL: req.originalUrl, oldURL: req.headers.referer }});
    }
    next();
};

page.get(['/', '/rankings{/*path}'], async (req, res) => {
    res.sendFile(currentDir + '/private/home.html')
})

API.post('/get_user_profile', async (req, res, next) => {
    if (!req.session.userID) {
        return next({ status: 204 }); // 没有登录，成功响应但没有内容
    }
    const [rows] = await db.execute(
        `SELECT
        name AS userName,
        profile_picture_URL AS userProfilePictureURL,
        vote_quota AS votesPerUser,
        vote_used AS userVoteUsed
        FROM users WHERE ID = ?`
        , [req.session.userID]);
    res.json(rows[0]);
});

async function getAllSubCategoriesIDs(categoryID, arr = []) {
    const [subCategories] = await db.execute('SELECT ID FROM categories WHERE parent_ID <=> ?'
            , [categoryID]);
    arr.push(...subCategories.map(row => row.ID));
    for (const subCategory of subCategories) {
        await getAllSubCategoriesIDs(subCategory.ID, arr);
    }
    return arr;
}

async function getAllObjects(categoryIDs, { removeObjectsWithZeroVotes = false, objectList = null, userID = null} = {}) {
    const [objects] = await db.execute('SELECT * FROM objects');
    for (let objectIndex = 0; objectIndex < objects.length; objectIndex++) {
        const object = objects[objectIndex];
        const [votes] = await db.execute(`
            SELECT
            SUM(value) AS vote_sum FROM votes
            WHERE
            target_object_ID = ?
            AND ((target_category_ID IN (${categoryIDs.map(() => '?').join(', ')}) OR target_category_ID IS NULL)
            AND TIMESTAMPDIFF(MONTH, date, NOW()) < 3)`
            , [object.ID, ...categoryIDs]);
        object.vote_sum = object.vote_sum != undefined ? (object.vote_sum + (votes[0].vote_sum || 0))
            : (votes[0].vote_sum || 0);
        if (removeObjectsWithZeroVotes && object.vote_sum === 0) {
            objects.splice(objectIndex, 1); // 移除零票对象
            objectIndex--; // 调整索引以避免跳过下一个对象
            continue;
        }
        if (userID) {
            const [myVotes] = await db.execute(`
                SELECT value FROM votes
                WHERE user_ID = ?
                AND target_object_ID = ?
                AND ((target_category_ID IN (${categoryIDs.map(() => '?').join(', ')}) OR target_category_ID IS NULL)
                AND TIMESTAMPDIFF(MONTH, date, NOW()) < 3)
                ORDER BY date DESC, ID DESC
                LIMIT 1`
                , [userID, object.ID, ...categoryIDs]);
            object.my_vote = myVotes[0]?.value ?? null;
        } else {
            object.my_vote = null;
        }
    }
    objects.sort((a, b) => (b.vote_sum - a.vote_sum) || (a.ID - b.ID));
    objects.forEach((obj, index) => {
        if (index > 0 && obj.vote_sum === objects[index - 1].vote_sum) {
            obj.rank = objects[index - 1].rank;
        } else {
            obj.rank = index + 1;
        }
    });
    let data;
    if (objectList) {
        data = objectList.map(obj => objects.find(item => item.ID === obj.ID));
    } else {
        data = objects;
    }
    return data;
}

function isTemplateSet(templateID) {
    return templateID !== null && templateID !== undefined;
}

function normalizeURLPart(value) {
    return String(value).toLowerCase();
}

async function getCategoryByID(categoryID) {
    if (categoryID === null || categoryID === undefined) {
        return { ID: null, is_folder: true, template: null };
    }
    const [categories] = await db.execute('SELECT * FROM categories WHERE ID = ?', [categoryID]);
    return categories[0];
}

async function getSubCategories(parentID) {
    const [subCategories] = await db.execute('SELECT * FROM categories WHERE parent_ID <=> ? ORDER BY ID', [parentID]);
    return subCategories;
}

async function getSubCategoriesForParents(parentIDs) {
    if (parentIDs.length === 0) {
        return [];
    }
    const [subCategories] = await db.execute(
        `SELECT * FROM categories WHERE parent_ID IN (${parentIDs.map(() => '?').join(', ')}) ORDER BY parent_ID, ID`,
        parentIDs
    );
    return subCategories;
}

async function buildTemplatesList(rootCategoryID) {
    let currentLayer = [await getCategoryByID(rootCategoryID)];
    if (currentLayer[0] === undefined) {
        throw { status: 404 };
    }
    const templatesList = [];
    while (currentLayer.length > 0) {
        const templateID = currentLayer[0].template;
        if (!isTemplateSet(templateID)) {
            break;
        }
        if (currentLayer.some(category => category.template !== templateID)) {
            throw { status: 409 };
        }
        const [templateRows] = await db.execute('SELECT name FROM category_templates WHERE ID = ?', [templateID]);
        if (templateRows.length === 0) {
            throw { status: 409 };
        }
        const subCategories = await getSubCategoriesForParents(currentLayer.map(category => category.ID));
        if (subCategories.length === 0) {
            break;
        }
        const optionNames = [];
        const optionNameSet = new Set();
        for (const subCategory of subCategories) {
            const key = normalizeURLPart(subCategory.name);
            if (!optionNameSet.has(key)) {
                optionNameSet.add(key);
                optionNames.push(subCategory.name);
            }
        }
        templatesList.push({
            name: templateRows[0].name,
            optionsList: optionNames
        });
        currentLayer = subCategories;
    }
    return templatesList;
}

async function resolveTemplateCategory(rootCategoryID, selectedTemplatePath = []) {
    let currentCategory = await getCategoryByID(rootCategoryID);
    if (currentCategory === undefined) {
        throw { status: 404 };
    }
    for (const pathPart of selectedTemplatePath) {
        const subCategories = await getSubCategories(currentCategory.ID);
        const normalizedPathPart = normalizeURLPart(pathPart);
        const nextCategory = subCategories.find(category => normalizeURLPart(category.name) === normalizedPathPart);
        if (nextCategory === undefined) {
            throw { status: 404 };
        }
        currentCategory = nextCategory;
    }
    return currentCategory;
}

API.post('/get_page{/*path}', async (req, res, next) => {
    const path = (req.params.path ?? []).filter(item => item !== '').map(item => item.toLowerCase());
    if (path.length === 1) { // 'rankings'
        res.json({ jump: true });
        return;
    }
    if (path.length > 0) {
        path.shift(); // 去掉第一个元素rankings
    }
    const data = {
        categoryTree: [],
        objectList: [],
        currentCategoryID: null,
        selectedTemplatePath: []
    };
    let parentID = null;
    let effectiveCategoryID = null;
    let point = data.categoryTree; // 从根开始构建分类树
    let child = null;
    for (const [index, item] of path.entries()) {
        const categories = await getSubCategories(parentID);
        point.push(...categories);
        child = point.find(obj => obj.name.toLowerCase() === item);
        if (!child) {
            return next({ status: 404 });
        }
        parentID = child.ID;
        data.currentCategoryID = parentID;
        effectiveCategoryID = parentID;
        if (isTemplateSet(child.template)) {
            data.selectedTemplatePath = path.slice(index + 1);
            if (data.selectedTemplatePath.length > 0) {
                effectiveCategoryID = (await resolveTemplateCategory(child.ID, data.selectedTemplatePath)).ID;
            }
            break;
        }
        if (child.is_folder) {
            S.initProperty(child, 'expanded', true);
            S.initProperty(child, 'children', []);
            point = child.children; // 准备存放下一层级的数据
        } else {
            if (index !== path.length - 1) { // 如果不是最后一个元素但却是个文件夹，说明路径错误
                return next({ status: 404 });
            }
        }
    }
    data.currentCategoryID = parentID;
    if (child === null || (child.is_folder && !isTemplateSet(child.template))) {
        const subCategories = await getSubCategories(parentID);
        point.push(...subCategories);
    }
    const categoryIDs = [effectiveCategoryID];
    categoryIDs.push(...await getAllSubCategoriesIDs(effectiveCategoryID));
    data.voteTargetCategoryID = effectiveCategoryID;
    data.objectList = await getAllObjects(categoryIDs, {
        removeObjectsWithZeroVotes: true,
        userID: req.session.userID
    }); // 只保留有投票的对象
    res.json(data);
});

API.post('/load_objects_and_subcategories', async (req, res, next) => {
    const targetCategory = await getCategoryByID(req.body.targetCategory?.ID ?? null);
    if (targetCategory === undefined) {
        return next({ status: 404 });
    }
    const doNotGetChildren = req.body.doNotGetChildren;
    const selectedTemplatePath = req.body.selectedTemplatePath ?? [];
    const effectiveCategory = await resolveTemplateCategory(targetCategory.ID, selectedTemplatePath);
    const data = {
        subcategories: undefined,
        objectList: [],
        templatesList: undefined
    };
    if (req.body.getTemplatesList && isTemplateSet(targetCategory.template)) {
        data.templatesList = await buildTemplatesList(targetCategory.ID);
    }
    if (targetCategory.is_folder && !doNotGetChildren && !isTemplateSet(targetCategory.template)) {
        data.subcategories = await getSubCategories(targetCategory.ID);
    }
    const categoryIDs = [effectiveCategory.ID];
    categoryIDs.push(...await getAllSubCategoriesIDs(effectiveCategory.ID));
    data.voteTargetCategoryID = effectiveCategory.ID;
    data.objectList = await getAllObjects(categoryIDs, {
        removeObjectsWithZeroVotes: true,
        userID: req.session.userID
    }); // 只保留有投票的对象
    res.json(data);
});

API.post('/search_suggestions', async (req, res, next) => {
    const query = req.body.query;
    const categoryID = req.body.categoryID;
    let [objects] = await db.execute(`
        SELECT * FROM objects WHERE MATCH(name) 
        AGAINST(? IN NATURAL LANGUAGE MODE) 
        LIMIT 100`, [query]);
    objects.forEach((obj) => {
        obj.dist = levenshtein.get(obj.name.toLowerCase(), query.toLowerCase());
    });
    //编辑距离排序
    objects.sort((a, b) => {
        if (a.dist === b.dist) {
            return a.ID - b.ID; // 距离相同则按ID排序
        }
        return a.dist - b.dist; // 距离更小的排在前面
    });
    objects.splice(10); // 只保留前10个结果
    for(let index = 0; index < objects.length; index++) {
        const obj = objects[index];
        const maxLength = Math.max(obj.name.length, query.length);
        if ((maxLength - obj.dist) / maxLength < 0.2) {
            objects.splice(index, 1); // 如果相似度低于一定值，则认为不相关
            index--; // 调整索引以避免跳过下一个对象
        }
        delete obj.dist; // 删除临时属性
    };
    const categoryIDs = [categoryID];
    categoryIDs.push(...await getAllSubCategoriesIDs(categoryID));
    objects = await getAllObjects(categoryIDs, {
        objectList: objects,
        userID: req.session.userID
    }); // 计算这些对象的票数
    res.json(objects);
});

API.post('/submit_vote', requireAuthForAPI, async (req, res, next) => {
    const targetObjectID = Number(req.body.targetObjectID);
    const targetCategoryID = req.body.targetCategoryID === null || req.body.targetCategoryID === undefined
        ? null
        : Number(req.body.targetCategoryID);
    const value = Number(req.body.value);
    if (!Number.isInteger(targetObjectID) || targetObjectID <= 0 ||
        (targetCategoryID !== null && (!Number.isInteger(targetCategoryID) || targetCategoryID <= 0)) ||
        ![1, -1].includes(value)) {
        return next({ status: 400 });
    }
    const [objectRows] = await db.execute('SELECT ID FROM objects WHERE ID = ?', [targetObjectID]);
    if (objectRows.length === 0) {
        return next({ status: 404 });
    }
    if (targetCategoryID !== null) {
        const [categoryRows] = await db.execute('SELECT ID FROM categories WHERE ID = ?', [targetCategoryID]);
        if (categoryRows.length === 0) {
            return next({ status: 404 });
        }
    }

    const connection = await db.getConnection();
    try {
        await connection.beginTransaction();
        const [userRows] = await connection.execute(
            'SELECT vote_quota, vote_used FROM users WHERE ID = ? FOR UPDATE',
            [req.session.userID]
        );
        if (userRows.length === 0) {
            throw { status: 401, body: { isAdmin: false } };
        }
        const [existingVotes] = await connection.execute(`
            SELECT ID, value FROM votes
            WHERE user_ID = ?
            AND target_object_ID = ?
            AND target_category_ID <=> ?
            AND TIMESTAMPDIFF(MONTH, date, NOW()) < 3
            ORDER BY date DESC, ID DESC
            FOR UPDATE`,
            [req.session.userID, targetObjectID, targetCategoryID]
        );
        if (existingVotes.length === 0) {
            if (userRows[0].vote_used >= userRows[0].vote_quota) {
                throw { status: 409, body: { error: 'vote_quota_exceeded' } };
            }
            await connection.execute(
                `INSERT INTO votes (user_ID, target_object_ID, target_category_ID, value)
                VALUES (?, ?, ?, ?)`,
                [req.session.userID, targetObjectID, targetCategoryID, value]
            );
            await connection.execute('UPDATE users SET vote_used = vote_used + 1 WHERE ID = ?', [req.session.userID]);
        } else if (existingVotes[0].value === value) {
            await connection.execute(`
                DELETE FROM votes
                WHERE user_ID = ?
                AND target_object_ID = ?
                AND target_category_ID <=> ?
                AND TIMESTAMPDIFF(MONTH, date, NOW()) < 3`,
                [req.session.userID, targetObjectID, targetCategoryID]
            );
            await connection.execute(
                'UPDATE users SET vote_used = IF(vote_used > 0, vote_used - 1, 0) WHERE ID = ?',
                [req.session.userID]
            );
        } else {
            await connection.execute(`
                UPDATE votes SET value = ?, date = NOW()
                WHERE user_ID = ?
                AND target_object_ID = ?
                AND target_category_ID <=> ?
                AND TIMESTAMPDIFF(MONTH, date, NOW()) < 3`,
                [value, req.session.userID, targetObjectID, targetCategoryID]
            );
        }
        await connection.commit();
    } catch (err) {
        await connection.rollback();
        throw err;
    } finally {
        connection.release();
    }

    const categoryIDs = [targetCategoryID];
    categoryIDs.push(...await getAllSubCategoriesIDs(targetCategoryID));
    const [updatedObject] = await getAllObjects(categoryIDs, {
        objectList: [{ ID: targetObjectID }],
        userID: req.session.userID
    });
    const [profileRows] = await db.execute(
        'SELECT vote_quota AS votesPerUser, vote_used AS userVoteUsed FROM users WHERE ID = ?',
        [req.session.userID]
    );
    res.json({
        object: {
            ID: updatedObject.ID,
            vote_sum: updatedObject.vote_sum,
            my_vote: updatedObject.my_vote
        },
        profile: profileRows[0]
    });
});

page.get('/login', async (req, res) => {
    res.sendFile(currentDir + '/private/loginCallback.html');
});

page.get('/github_callback', markErrorFrom('callback-page'), async (req, res, next) => {
    const code = req.query.code;
    if (!code) {
        return next({ status: 400, body: { dialogCode: 6 } });
    }
    // 下一个then会等待return的promise完成后再开始执行，变相await
    return fetch('https://github.com/login/oauth/access_token', { // express 5.x处理里面的异步错误需要手动返回。
        method: 'POST',
        headers: {
            'Content-Type': 'application/json', // 必须手动指定发送的是 JSON
            'Accept': 'application/json'        // 告诉 GitHub 返回 JSON 格式
        },
        body: JSON.stringify({
            client_id: githubClientID,
            client_secret: githubClientSecret,
            code: code
        })
    })
    .then(response => {
        if (response.status !== 200) {
            next({ status: 502, body: { dialogCode: 6 } }); // GitHub请求失败
            S.breakInThen();
        }
        return response.json();
    })
    .then(data => {
        if (data.error) {
            next({ status: 401, body: { dialogCode: 6 } }); // GitHub授权失败
            S.breakInThen();
        }
        return fetch('https://api.github.com/user', { // 里面也返回一次，为了正常的错误捕获
            method: 'GET',
            headers: {
                'Authorization': `Bearer ${data.access_token}`,
                'Accept': 'application/vnd.github+json',
            }
        })
        .then(response => {
            if (response.status !== 200) {
                next({ status: 502, body: { dialogCode: 6 } }); // GitHub请求失败
                S.breakInThen();
            }
            return response.json();
        })
        .then(userData => {
            const userID = userData.id;
            const userName = userData.name || userData.login;
            const userFollowersCount = userData.followers;
            const userProfilePictureURL = userData.avatar_url;
            // 注册时长计算逻辑
            const createdAt = new Date(userData.created_at);
            const now = new Date();
            const diffDays = Math.floor((now - createdAt) / (1000 * 60 * 60 * 24));
            if (diffDays < githubMinAccountAgeDays) {
                next({ status: 403, body: { // 注册时间不足
                    dialogCode: 4,
                    minAge: githubMinAccountAgeDays,
                    actualAge: diffDays
                } });
                breakInThen();
            }
            return db.execute(`
                INSERT INTO users (ID, name, followers_count, profile_picture_URL, vote_quota, vote_used)
                VALUES (?, ?, ?, ?, ?, ?) AS new_user
                ON DUPLICATE KEY UPDATE
                name = new_user.name,
                followers_count = new_user.followers_count,
                profile_picture_URL = new_user.profile_picture_URL,
                vote_quota = new_user.vote_quota
            `, [userID, userName, userFollowersCount, userProfilePictureURL, votesPerUser, 0])
            .then(() => {
                return db.execute('SELECT deleted_at, banned_at, banned_until, vote_used FROM users WHERE ID = ?', [userID])
            })
            .then(async ([userRows]) => {
                const deletedAt = userRows[0].deleted_at;
                const bannedAt = userRows[0].banned_at;
                const bannedUntil = userRows[0].banned_until;
                const userVoteUsed = userRows[0].vote_used;
                if (deletedAt) {
                    await db.execute('UPDATE users SET deleted_at = NULL, vote_used = 0 WHERE ID = ?', [userID]); // 如果之前被删除过，重新激活账号
                } else {
                    await db.execute('UPDATE votes SET date = NOW() WHERE user_ID = ?', [userID]); // 如果之前没有被删除过，更新投票日期以保留投票但重置过期时间
                }
                if (bannedAt) {
                    if (new Date() < bannedUntil) {
                        next({ status: 403, body: { // 账号被封禁
                            dialogCode: 7,
                            bannedUntil: bannedUntil
                        } });
                        breakInThen();
                    } else {
                        await db.execute('UPDATE users SET banned_at = NULL, banned_until = NULL, banned_reason = NULL WHERE ID = ?'
                            , [userID]); // 如果之前被封禁过但现在解封了，清除封禁信息
                    }
                }
                return db.execute('INSERT IGNORE INTO user_sessions (session_ID, user_ID) VALUES (?, ?)'
                    , [req.sessionID, userID]) // IGNORE的作用是如果已经有这条记录了就啥都不干，避免主键冲突
                .then(() => {
                    S.initProperty(req.session, 'userID', userID); // 登录成功，存储用户ID到会话
                    res.redirect('/login');
                });
            });
        });
    });
});

API.post('/logout', requireAuthForAPI, async (req, res, next) => {
    const userID = req.session.userID;
    if (req.query.all !== undefined) {
        const [rows] = await db.execute(
            'SELECT session_ID FROM user_sessions WHERE user_ID = ?', [userID]);
        await db.execute('DELETE FROM user_sessions WHERE user_ID = ?', [userID]);
        await Promise.all(rows.map(row => sessionStore.destroy(row.session_ID)));
    } else {
        await db.execute('DELETE FROM user_sessions WHERE session_ID = ?', [req.sessionID]);
        await sessionStore.destroy(req.sessionID);
    }
    res.clearCookie('sid');
    return next({ status: 204 });
});

API.post('/get_device_count', requireAuthForAPI, async (req, res, next) => {
    const userID = req.session.userID;
    const [rows] = await db.execute(
        'SELECT COUNT(*) AS deviceCount FROM user_sessions WHERE user_ID = ?', [userID]);
    res.json({ deviceCount: rows[0].deviceCount });
});

API.post('/delete_account', requireAuthForAPI, async (req, res, next) => {
    const userID = req.session.userID;
    await db.execute('UPDATE users SET deleted_at = NOW() WHERE ID = ?', [userID]);
    const [rows] = await db.execute(
            'SELECT session_ID FROM user_sessions WHERE user_ID = ?', [userID]);
    await db.execute('DELETE FROM user_sessions WHERE user_ID = ?', [userID]);
    await Promise.all(rows.map(row => sessionStore.destroy(row.session_ID)));
    res.clearCookie('sid');
    return next({ status: 204 });
});

page.get('/contribute', requireAuthForPages, async (req, res) => {
    res.sendFile(currentDir + '/private/contribute.html');
});

page.get('/adminlogin', async (req, res) => {
    res.sendFile(currentDir + '/private/adminlogin.html');
});

function normalizeString(value, maxLength, required = false) {
    if (typeof value !== 'string') {
        value = '';
    }
    value = value.trim();
    if (required && value === '') {
        throw { status: 400 };
    }
    if (value.length > maxLength) {
        throw { status: 400 };
    }
    return value;
}

function normalizeOptionalURL(value) {
    value = normalizeString(value, 512);
    if (value === '') {
        return '';
    }
    let url;
    try {
        url = new URL(value);
    } catch {
        throw { status: 400 };
    }
    if (!['http:', 'https:'].includes(url.protocol)) {
        throw { status: 400 };
    }
    return url.toString();
}

function buildContributionContent(body) {
    const type = body.type;
    if (type === 'report_issue') {
        const allowedIssueTypes = new Set(['incorrect_info', 'missing_source', 'broken_link', 'duplicate', 'other']);
        if (!allowedIssueTypes.has(body.issueType)) {
            throw { status: 400 };
        }
        return {
            schemaVersion: 1,
            type: type,
            issueType: body.issueType,
            targetName: normalizeString(body.targetName, 128, true),
            pageURL: normalizeOptionalURL(body.pageURL),
            sourceURL: normalizeOptionalURL(body.sourceURL),
            details: normalizeString(body.details, 2000, true)
        };
    }
    if (type === 'new_benchmark') {
        const allowedModalities = new Set(['', 'text', 'image', 'audio', 'video', 'mixed', 'other', 'action']);
        if (!allowedModalities.has(body.inputModality) || !allowedModalities.has(body.outputModality)) {
            throw { status: 400 };
        }
        return {
            schemaVersion: 1,
            type: type,
            name: normalizeString(body.name, 128, true),
            url: normalizeOptionalURL(body.url),
            inputModality: body.inputModality || null,
            outputModality: body.outputModality || null,
            isRealtime: Boolean(body.isRealtime),
            categoryPath: normalizeString(body.categoryPath, 512),
            details: normalizeString(body.details, 2000, true)
        };
    }
    throw { status: 400 };
}

API.post('/submit_contribution', requireAuthForAPI, async (req, res) => {
    const content = buildContributionContent(req.body);
    await db.execute(
        'INSERT INTO moderation_logs (content, report_count, user_id) VALUES (?, ?, ?)',
        [JSON.stringify(content), 1, req.session.userID]
    );
    res.status(204).end();
});

API.post('/admin_login', async (req, res, next) => {
    if (req.session.adminID) {
        return next({ status: 403 }); // 已登录管理员不允许再次登录
    }
    const { ID, password } = req.body;
    const [rows] = await db.execute('SELECT * FROM admin WHERE ID = ?', [ID]);
    if (rows.length > 0) {
        const user = rows[0];
        const isMatch = await bcrypt.compare(password, user.password);
        if (isMatch) {
            S.initProperty(req.session, 'adminID', ID);
            return next({ status: 204 });
        } else {
            return next({ status: 401 }); //用户名或密码错误
        }
    } else {
        return next({ status: 401 }); //用户名或密码错误
    }
});

page.get('/censor', requireAdminAuthForPages, async (req, res) => {
    res.sendFile(currentDir + '/private/censor.html');
});

API.post('/*any_path', (req, res, next) => { // 包括/dialogPage
    next({ status: 404 });
});
page.get('/*any_path', (req, res) => {
    res.sendFile(currentDir + '/private/dialogPage.html');
});

app.use((err, req, res, _next) => {
    // HTTP状态码语义：
    // 200：请求成功
    // 202：我收到了你的请求，但还没开始处理
    // 204：请求成功，但没有内容可以返回
    // 301：资源已被永久移动到新地址，响应中应包含新地址（308比301更严格，不允许改变请求方法）
    // 302：临时移动到新地址，响应中应包含新地址
    // 400：请求无效
    // 401：你必须进行身份验证
    // 403：你没有权限
    // 404：未找到资源
    // 405：请求方法错误
    // 408：请求超时
    // 409：你的请求与我的状态冲突
    // 410：资源已被永久删除
    // 424：依赖失败，通常是指请求失败是因为之前的请求失败了
    // 429：请求过于频繁
    // 500：服务器内部错误
    // 502：从上游接收无效响应
    // 503：服务器过载或正在维护
    // 504：上游没有及时响应
    // dialogCode语义：
    // 1：找不到页面
    // 2：用户需要登录
    // 3：管理员需要登录
    // 4：登录失败，GitHub账号注册时长不足
    // 5：触发速率限制
    // 6：其他错误
    // 7：登录失败，账号被封禁
    if (err === 'ImNotAnError') {
        return;
    }
    if (String(err.status).startsWith('2')) {
        res.status(err.status).json(err.body);
        return;
    }
    if (err.status === undefined) {
        err.status = 500;
    }
    console.log('[ERROR] FROM:', req.errorFrom, ' OBJECT:', err);
    switch (req.errorFrom) {
    case 'API':
        res.status(err.status).json(err.body);
        break;
    case 'page':
        res.redirect('/dialogPage?errorCode=' + err.status + '&side=server&' + new URLSearchParams(err.body).toString());
        break;
    case 'callback-page':
        res.redirect('/dialogPage?errorCode=' + err.status + '&side=callback&' + new URLSearchParams(err.body).toString());
        break;
    }
});

const options = {
    key: fs.readFileSync('server.key'),
    cert: fs.readFileSync('server.crt')
};

https.createServer(options, app).listen(1337, () => {
    console.log('服务器启动成功，请打开：https://benchpoll.com'); //localhost和127.0.0.1是不同oragin，cookie不共享
});
