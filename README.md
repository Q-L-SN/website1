# benchpoll

benchpoll is a Node.js/Express web app for browsing and voting on ranked benchmark objects. The app serves private HTML pages, public CSS/JS assets, GitHub OAuth login, session-backed user accounts, admin login, and ranking pages backed by a MySQL database.

Users can submit benchmark reports or propose new benchmark objects through the contribution page. Admins review those submissions in the moderation queue before approved benchmark proposals are added to the `objects` table.

## Current Stack

- Node.js with ES modules
- Express 5
- MySQL via `mysql2`
- `express-session` with `express-mysql-session`
- GitHub OAuth login
- HTTPS local/server entry point on port `1337`

## Project Layout

```text
.
|-- server.js                 # Express app, routes, auth, ranking APIs
|-- db.js                     # MySQL pool setup
|-- package.json              # Runtime dependencies
|-- private/                  # HTML pages served by Express routes
|-- public/
|   |-- css/                  # Page styles
|   `-- js/                   # Browser-side logic
`-- README.md
```

## Required Local Files

These files are intentionally not committed:

```text
.env
server.key
server.crt
node_modules/
```

`server.js` starts an HTTPS server, so `server.key` and `server.crt` must exist locally before running the app.

## Environment Variables

The app loads environment variables through `dotenv`. Required names used by the current code:

```text
DB_PASSWORD
SESSION_SECRET
SESSION_CLEANUP_INTERVAL_MINUTES
SESSION_MAX_AGE_DAYS
RATE_LIMIT_WINDOW_MINUTES
RATE_LIMIT_MAX_REQUESTS
GITHUB_CLIENT_SECRET
GITHUB_MIN_ACCOUNT_AGE_DAYS
VOTES_PER_USER
```

Do not commit secrets. Keep real values in `.env` or another ignored local file.

## Database

The app connects to a local MySQL database named:

```text
benchmarks
```

Connection defaults are defined in `db.js`:

```text
host: localhost
user: root
database: benchmarks
```

The password is read from `DB_PASSWORD`.

Main table groups used by the code include:

- `categories`
- `category_templates`
- `objects`
- `votes`
- `users`
- `user_sessions`
- `admin`
- `moderation_logs`

Template rankings are represented as repeated `categories` structure in the database. The backend derives `templatesList` from `categories.template` and `category_templates`, then the frontend uses the selected template path to refresh the object list.

## Install

```powershell
npm install
```

## Run

There is no npm script yet. Start the server directly:

```powershell
node server.js
```

The app listens on:

```text
https://benchpoll.com:1337
```

Make sure local DNS/hosts and certificate setup match the domain you use in the browser.

## Main Pages

- `/`
- `/rankings/...`
- `/login`
- `/github_callback`
- `/contribute`
- `/adminlogin`
- `/censor`
- `/dialogPage`

## Main API Routes

- `POST /api/get_user_profile`
- `POST /api/get_page...`
- `POST /api/load_objects_and_subcategories`
- `POST /api/search_suggestions`
- `POST /api/logout`
- `POST /api/get_device_count`
- `POST /api/delete_account`
- `POST /api/submit_contribution`
- `POST /api/list_moderation_logs`
- `POST /api/review_moderation_log`
- `POST /api/admin_login`

## Development Notes

- Keep `.env`, certificates, local credential notes, and generated folders out of Git.
- The frontend code is plain browser JavaScript under `public/js`.
- Shared browser constants/helpers live in `public/js/shared.js` and `public/js/global.js`.
- Server-side API errors are routed through the centralized Express error handler in `server.js`.
- `node --check server.js` and `node --check public/js/home.js` are useful quick syntax checks.

# benchpoll 中文说明

benchpoll 是一个基于 Node.js/Express 的网页应用，用于浏览、投票和展示 benchmark 对象排行。项目包含私有 HTML 页面、公开 CSS/JS 静态资源、GitHub OAuth 登录、基于 session 的用户账号、管理员登录，以及由 MySQL 数据库驱动的排行页面。

用户可以通过共创页面上报 benchmark 信息问题，或提交新的 benchmark 对象提案。管理员在审核队列中处理这些提交，审核通过的新 benchmark 会写入 `objects` 表。

## 当前技术栈

- Node.js ES modules
- Express 5
- MySQL，使用 `mysql2`
- `express-session` 与 `express-mysql-session`
- GitHub OAuth 登录
- HTTPS 入口，监听端口 `1337`

## 项目结构

```text
.
|-- server.js                 # Express 应用、路由、认证、排行 API
|-- db.js                     # MySQL 连接池设置
|-- package.json              # 运行时依赖
|-- private/                  # 由 Express 路由返回的 HTML 页面
|-- public/
|   |-- css/                  # 页面样式
|   `-- js/                   # 浏览器端逻辑
`-- README.md
```

## 必需的本地文件

这些文件刻意不提交到 Git：

```text
.env
server.key
server.crt
node_modules/
```

`server.js` 会启动 HTTPS 服务，所以本地运行前必须准备好 `server.key` 和 `server.crt`。

## 环境变量

项目通过 `dotenv` 加载环境变量。当前代码使用的变量名如下：

```text
DB_PASSWORD
SESSION_SECRET
SESSION_CLEANUP_INTERVAL_MINUTES
SESSION_MAX_AGE_DAYS
RATE_LIMIT_WINDOW_MINUTES
RATE_LIMIT_MAX_REQUESTS
GITHUB_CLIENT_SECRET
GITHUB_MIN_ACCOUNT_AGE_DAYS
VOTES_PER_USER
```

不要提交密钥。真实值应放在 `.env` 或其他已忽略的本地文件中。

## 数据库

应用连接到本地 MySQL 数据库：

```text
benchmarks
```

连接默认值定义在 `db.js`：

```text
host: localhost
user: root
database: benchmarks
```

数据库密码从 `DB_PASSWORD` 读取。

当前代码涉及的主要表包括：

- `categories`
- `category_templates`
- `objects`
- `votes`
- `users`
- `user_sessions`
- `admin`
- `moderation_logs`

模板排行通过数据库中重复的 `categories` 结构表达。后端根据 `categories.template` 和 `category_templates` 派生出 `templatesList`，前端再用选中的模板路径刷新对象列表。

## 安装

```powershell
npm install
```

## 运行

项目目前还没有 npm script。直接启动服务器：

```powershell
node server.js
```

应用监听地址：

```text
https://benchpoll.com:1337
```

请确认本机 DNS/hosts 和证书配置与浏览器访问的域名一致。

## 主要页面

- `/`
- `/rankings/...`
- `/login`
- `/github_callback`
- `/contribute`
- `/adminlogin`
- `/censor`
- `/dialogPage`

## 主要 API 路由

- `POST /api/get_user_profile`
- `POST /api/get_page...`
- `POST /api/load_objects_and_subcategories`
- `POST /api/search_suggestions`
- `POST /api/logout`
- `POST /api/get_device_count`
- `POST /api/delete_account`
- `POST /api/submit_contribution`
- `POST /api/list_moderation_logs`
- `POST /api/review_moderation_log`
- `POST /api/admin_login`

## 开发注意事项

- 不要把 `.env`、证书、本地凭据说明和生成目录提交到 Git。
- 前端代码是普通浏览器 JavaScript，位于 `public/js`。
- 浏览器端共享常量和辅助函数位于 `public/js/shared.js` 和 `public/js/global.js`。
- 服务端 API 错误通过 `server.js` 中集中的 Express 错误处理中间件处理。
- `node --check server.js` 和 `node --check public/js/home.js` 可用于快速语法检查。
