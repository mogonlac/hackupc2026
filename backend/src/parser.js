const { GoogleGenAI } = require('@google/genai');

const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });

const TEAMS = ['Sales', 'Engineering', 'Operations', 'Data Science', 'Marketing', 'Product'];

const SYSTEM = `You are a work-request router for a company's internal request tracking tool.

Given a Slack message (with any @mentions already resolved to real names), produce a structured request.

Return ONLY valid JSON — no markdown, no explanation.

{
  "description": string,   // a clear, imperative instruction for the receiving team — e.g. "Update bagel cost to 50 in the pricing sheet"
  "team": string,          // which team should handle this — must be one of: ${TEAMS.join(', ')}
  "complexity": number,    // integer 1–10
  "assignee_name": string  // specific person if @mentioned, otherwise ""
}

Team routing guide:
- Sales       → deals, contracts, pricing, clients, revenue, outreach
- Engineering → bugs, code, infrastructure, integrations, technical changes
- Operations  → processes, logistics, procurement, facilities, costs (like bagel pricing)
- Data Science → reports, analytics, dashboards, data, metrics
- Marketing   → campaigns, content, brand, social media, events
- Product     → features, roadmap, design, UX, product decisions

Complexity scale:
1–2  trivial (< 15 min)
3–4  simple (< 1 hour)
5–6  moderate (half-day)
7–8  significant (multi-day, cross-team)
9–10 major (weeks)

Examples:
"i want the number for bagel cost to change to 50"
→ { "description": "Update bagel cost to 50 in the budget", "team": "Operations", "complexity": 2, "assignee_name": "" }

"can @alice fix the login bug"
→ { "description": "Fix the login bug", "team": "Engineering", "complexity": 5, "assignee_name": "Alice" }

"need a slide deck for the Q3 campaign launch"
→ { "description": "Create slide deck for Q3 campaign launch", "team": "Marketing", "complexity": 5, "assignee_name": "" }`;

async function parseRequest(messageText) {
  const response = await ai.models.generateContent({
    model: 'gemini-2.5-flash',
    config: {
      thinkingConfig: { thinkingBudget: 1024 },
      responseMimeType: 'application/json',
      systemInstruction: SYSTEM,
    },
    contents: [{ role: 'user', parts: [{ text: messageText }] }],
  });

  const raw = response.text.trim();
  console.log('[parser] raw:', raw);

  const data = JSON.parse(raw);
  return {
    description:   data.description  || messageText,
    team:          TEAMS.includes(data.team) ? data.team : 'Operations',
    complexity:    Math.min(10, Math.max(1, Number(data.complexity) || 5)),
    assignee_name: data.assignee_name || '',
  };
}

module.exports = { parseRequest, TEAMS };
