# SLAP Backend

Simple Node.js backend that receives work requests from Slack and exposes them to the dashboard via a REST API.

---

## Quick start (no Slack yet)

```bash
cd backend
npm install
npm run dev          # starts on http://localhost:3001
```

The API starts immediately. The Slack bot is silently skipped until you add credentials.

---

## Setting up the Slack bot

### 1 — Create a Slack app

1. Go to https://api.slack.com/apps → **Create New App** → **From scratch**
2. Name it `SLAP`, pick your workspace.

### 2 — Enable Socket Mode (recommended for local dev — no public URL needed)

1. In your app settings → **Socket Mode** → Enable it.
2. Generate an **App-Level Token** with the scope `connections:write`.  
   Copy it — this is your `SLACK_APP_TOKEN` (`xapp-…`).

### 3 — Add a slash command

1. **Slash Commands** → **Create New Command**
   - Command: `/slap`
   - Short description: `Log and resolve work requests`
   - Usage hint: `request @person description [complexity:N] [in|out]`
2. Save.

### 4 — Set OAuth scopes

Go to **OAuth & Permissions** → **Bot Token Scopes** and add:

| Scope | Why |
|---|---|
| `commands` | Slash commands |
| `chat:write` | Bot can reply |
| `channels:history` | Read channel messages (optional) |
| `im:history` | Read DMs (optional) |

### 5 — Install the app to your workspace

**OAuth & Permissions** → **Install to Workspace** → Authorise.  
Copy the **Bot User OAuth Token** (`xoxb-…`).

### 6 — Get the signing secret

**Basic Information** → **App Credentials** → **Signing Secret**. Copy it.

### 7 — Create your .env

```bash
cp .env.example .env
```

Fill in:

```
SLACK_BOT_TOKEN=xoxb-...
SLACK_SIGNING_SECRET=...
SLACK_APP_TOKEN=xapp-...   # only if using Socket Mode
PORT=3001
SLACK_CHANNEL_ID=          # optional: channel to listen in
```

### 8 — Register your team members

The bot needs to know which Slack user maps to which internal member.  
Call this endpoint for each person once:

```bash
curl -X POST http://localhost:3001/api/members \
  -H "Content-Type: application/json" \
  -d '{
    "slackUserId": "U0123456",
    "memberId": "m_sal_1",
    "memberName": "David Reyes",
    "deptId": "sal",
    "deptName": "Sales",
    "role": "Sales Engineer"
  }'
```

Find a user's Slack ID by clicking their profile → **⋮** → **Copy member ID**.

### 9 — Run

```bash
npm run dev
```

---

## Using the bot in Slack

### Log a new request

```
/slap request @alice Close the Acme contract  complexity:8  out
```

- `@alice` — the person receiving the work  
- `complexity:8` — how heavy the task is (1–10)  
- `out` or `in` — outbound (you're sending) or inbound (you're receiving)

### Mark a request as resolved

```
/slap resolve r_abc123  hours:2.5
```

`hours` is optional but improves the "avg hours per item" metric on the dashboard.

---

## REST API

| Method | Path | Description |
|---|---|---|
| `GET` | `/api/snapshot` | Full data tree — same shape as `db.json` |
| `GET` | `/api/members` | List all Slack→member mappings |
| `POST` | `/api/members` | Register a new mapping |
| `POST` | `/api/requests` | Create a request without Slack |
| `POST` | `/api/requests/:id/resolve` | Resolve a request |

---

## Wiring the dashboard to the backend

In `frontend/src/App.jsx`, replace the static `db.json` import with a fetch:

```js
// instead of: import db from './data/db.json'
const [db, setDb] = useState({ departments: [] });

useEffect(() => {
  fetch('http://localhost:3001/api/snapshot')
    .then(r => r.json())
    .then(setDb);

  // optional: poll every 30s
  const id = setInterval(() => {
    fetch('http://localhost:3001/api/snapshot')
      .then(r => r.json())
      .then(setDb);
  }, 30_000);
  return () => clearInterval(id);
}, []);
```
