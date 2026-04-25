const { Octokit } = require('@octokit/rest');
const fs = require('fs');
const path = require('path');

require('dotenv').config({ path: path.join(__dirname, '..', '.env') });

const oc = new Octokit({ auth: process.env.GITHUB_TOKEN });
const [owner, repo] = (process.env.GITHUB_REPO || 'mogonlac/demo-slap-codebase').split('/');

const filePath = path.join(__dirname, 'prices.html');
const content = Buffer.from(fs.readFileSync(filePath, 'utf8')).toString('base64');

oc.repos.createOrUpdateFileContents({
  owner, repo,
  path: 'prices.html',
  message: 'Initial price list',
  content,
}).then(r => console.log('Pushed:', r.data.content.html_url))
  .catch(e => console.error('Error:', e.message));
