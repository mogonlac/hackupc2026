require('dotenv').config();
const { createSlackApp } = require('./src/slack');
const { createApiApp } = require('./src/api');

const PORT = process.env.PORT || 3001;

async function main() {
  // ── REST API (always on) ────────────────────────────────────────────────
  const api = createApiApp();
  api.listen(PORT, () => {
    console.log(`API listening on http://localhost:${PORT}`);
    console.log(`  GET  http://localhost:${PORT}/api/snapshot`);
    console.log(`  POST http://localhost:${PORT}/api/members`);
    console.log(`  POST http://localhost:${PORT}/api/requests`);
  });

  // ── Slack bot (only when credentials are provided) ─────────────────────
  const hasCreds =
    process.env.SLACK_BOT_TOKEN &&
    process.env.SLACK_SIGNING_SECRET;

  if (!hasCreds) {
    console.warn(
      '\n⚠  Slack credentials not set — bot is disabled.\n' +
      '   Copy .env.example → .env and fill in your tokens to enable it.\n',
    );
    return;
  }

  const slackApp = createSlackApp();
  await slackApp.start();
  console.log('⚡ Slack bot running');
}

main().catch(err => {
  console.error('Startup error:', err);
  process.exit(1);
});
