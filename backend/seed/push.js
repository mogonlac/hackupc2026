/**
 * Moves prices.html from root → demo/prices.html on GitHub,
 * then commits the demo/ folder into the local repo.
 */
const { Octokit } = require('@octokit/rest');
const fs = require('fs');
const path = require('path');

require('dotenv').config({ path: path.join(__dirname, '..', '.env') });

const oc = new Octokit({ auth: process.env.GITHUB_TOKEN });
const [owner, repo] = (process.env.GITHUB_REPO || 'mogonlac/hackupc2026').split('/');

async function run() {
  // 1 — get the old file's SHA so we can delete it
  let oldSha = null;
  try {
    const { data } = await oc.repos.getContent({ owner, repo, path: 'prices.html' });
    oldSha = data.sha;
  } catch { /* already gone */ }

  // 2 — create demo/prices.html
  const content = Buffer.from(fs.readFileSync(path.join(__dirname, 'prices.html'))).toString('base64');
  await oc.repos.createOrUpdateFileContents({
    owner, repo,
    path: 'demo/prices.html',
    message: 'Move prices.html → demo/prices.html',
    content,
  });
  console.log('Created demo/prices.html');

  // 3 — delete old root prices.html if it existed
  if (oldSha) {
    await oc.repos.deleteFile({
      owner, repo,
      path: 'prices.html',
      message: 'Remove prices.html from root (moved to demo/)',
      sha: oldSha,
    });
    console.log('Deleted root prices.html');
  }
}

run().catch(e => console.error(e.message));
