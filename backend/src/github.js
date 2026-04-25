/**
 * GitHub integration.
 * - readRepoFiles()         → returns all text files as { path, content }[]
 * - createPR(description)  → Gemini edits the file, opens a PR, returns PR url + diff
 * - mergePR(number)        → merges the PR
 * - closePR(number)        → closes without merging
 */

const { Octokit } = require('@octokit/rest');
const { GoogleGenAI } = require('@google/genai');

const oc = new Octokit({ auth: process.env.GITHUB_TOKEN });
const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });

const [OWNER, REPO] = (process.env.GITHUB_REPO || 'mogonlac/demo-slap-codebase').split('/');

// ── helpers ──────────────────────────────────────────────────────────────────

async function getDefaultBranch() {
  const { data } = await oc.repos.get({ owner: OWNER, repo: REPO });
  return data.default_branch;
}

async function readRepoFiles() {
  const base = await getDefaultBranch();
  const { data: tree } = await oc.git.getTree({
    owner: OWNER, repo: REPO,
    tree_sha: base,
    recursive: 'true',
  });

  const textFiles = tree.tree.filter(f =>
    f.type === 'blob' &&
    f.path.startsWith('demo/') &&
    /\.(html|css|js|json|md|txt)$/i.test(f.path),
  );

  const files = await Promise.all(textFiles.map(async (f) => {
    const { data } = await oc.git.getBlob({ owner: OWNER, repo: REPO, file_sha: f.sha });
    const content = Buffer.from(data.content, 'base64').toString('utf8');
    return { path: f.path, content, sha: f.sha };
  }));

  return files;
}

// ── LLM code editor ──────────────────────────────────────────────────────────

async function generateEdit(description, files) {
  const fileBlock = files.map(f =>
    `### FILE: ${f.path}\n\`\`\`\n${f.content}\n\`\`\``,
  ).join('\n\n');

  const SYSTEM = `You are a code editor. Given a task description and the current files in a repository,
produce ONLY the minimal change needed to fulfil the request.

Return ONLY valid JSON — no markdown wrapper, no explanation:
{
  "file": string,       // path of the file to edit (must match an existing file path)
  "content": string,    // complete new file content after the edit
  "summary": string     // one sentence describing what was changed
}`;

  const response = await ai.models.generateContent({
    model: 'gemini-2.5-flash',
    config: {
      thinkingConfig: { thinkingBudget: 2048 },
      responseMimeType: 'application/json',
      systemInstruction: SYSTEM,
    },
    contents: [{
      role: 'user',
      parts: [{ text: `Task: ${description}\n\nRepository files:\n\n${fileBlock}` }],
    }],
  });

  const raw = response.text.trim();
  console.log('[github] edit proposal:', raw.slice(0, 300));
  return JSON.parse(raw);
}

// ── PR creation ───────────────────────────────────────────────────────────────

async function createPR(description) {
  const base = await getDefaultBranch();
  const files = await readRepoFiles();
  const edit = await generateEdit(description, files);

  const targetFile = files.find(f => f.path === edit.file);
  if (!targetFile) throw new Error(`LLM proposed editing "${edit.file}" which doesn't exist`);

  // Get the current commit SHA for the base branch
  const { data: ref } = await oc.git.getRef({ owner: OWNER, repo: REPO, ref: `heads/${base}` });
  const baseSha = ref.object.sha;

  // Create a new blob with the edited content
  const { data: blob } = await oc.git.createBlob({
    owner: OWNER, repo: REPO,
    content: edit.content,
    encoding: 'utf-8',
  });

  // Get the base tree
  const { data: baseCommit } = await oc.git.getCommit({ owner: OWNER, repo: REPO, commit_sha: baseSha });

  // Create new tree with the changed file
  const { data: newTree } = await oc.git.createTree({
    owner: OWNER, repo: REPO,
    base_tree: baseCommit.tree.sha,
    tree: [{ path: edit.file, mode: '100644', type: 'blob', sha: blob.sha }],
  });

  // Create the commit
  const { data: newCommit } = await oc.git.createCommit({
    owner: OWNER, repo: REPO,
    message: `slap: ${edit.summary}`,
    tree: newTree.sha,
    parents: [baseSha],
  });

  // Create a branch
  const branch = `slap/${Date.now().toString(36)}`;
  await oc.git.createRef({
    owner: OWNER, repo: REPO,
    ref: `refs/heads/${branch}`,
    sha: newCommit.sha,
  });

  // Open the PR
  const { data: pr } = await oc.pulls.create({
    owner: OWNER, repo: REPO,
    title: description,
    body: `**Task:** ${description}\n\n**Change:** ${edit.summary}\n\n*Created by SLAP bot*`,
    head: branch,
    base,
  });

  return {
    number: pr.number,
    url: pr.html_url,
    branch,
    file: edit.file,
    summary: edit.summary,
    diff: `- (before) → ${edit.summary}`,
  };
}

async function mergePR(number) {
  await oc.pulls.merge({
    owner: OWNER, repo: REPO,
    pull_number: number,
    merge_method: 'squash',
  });
}

async function closePR(number) {
  await oc.pulls.update({
    owner: OWNER, repo: REPO,
    pull_number: number,
    state: 'closed',
  });
}

module.exports = { createPR, mergePR, closePR };
