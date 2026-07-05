# TRUSTBENCH

TRUSTBENCH is a Node.js/Express web app for browsing and voting on ranked benchmark objects. The app serves private HTML pages, public CSS/JS assets, GitHub OAuth login, session-backed user accounts, admin login, and ranking pages backed by a MySQL database.

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
- `POST /api/admin_login`

## Development Notes

- Keep `.env`, certificates, local credential notes, and generated folders out of Git.
- The frontend code is plain browser JavaScript under `public/js`.
- Shared browser constants/helpers live in `public/js/shared.js` and `public/js/global.js`.
- Server-side API errors are routed through the centralized Express error handler in `server.js`.
- `node --check server.js` and `node --check public/js/home.js` are useful quick syntax checks.
