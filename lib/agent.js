// GitHub-backed coding agent. GitHub credentials remain server-side.
const PROVIDERS = {
  openai: { base: "https://api.openai.com/v1", env: "OPENAI_API_KEY", kind: "openai" },
  nvidia: { base: "https://integrate.api.nvidia.com/v1", env: "NVIDIA_API_KEY", kind: "openai" },
  alibaba: { base: process.env.DASHSCOPE_BASE_URL || "https://dashscope-intl.aliyuncs.com/compatible-mode/v1", env: "DASHSCOPE_API_KEY", kind: "openai" },
  anthropic: { base: "https://api.anthropic.com/v1", env: "ANTHROPIC_API_KEY", kind: "anthropic" }
};
const GH_API = "https://api.github.com";
const json = async r => {
  const t = await r.text();
  let j; try { j = t ? JSON.parse(t) : {}; } catch { j = { message: t }; }
  if (!r.ok) throw new Error((j && (j.message || (j.error && j.error.message))) || ("HTTP " + r.status));
  return j;
};
async function gh(path, token, options = {}) {
  return json(await fetch(GH_API + path, {
    ...options,
    headers: { Accept: "application/vnd.github+json", Authorization: "Bearer " + token, "X-GitHub-Api-Version": "2022-11-28", "Content-Type": "application/json", ...(options.headers || {}) }
  }));
}
function safePath(p) {
  if (typeof p !== "string" || !p || p.startsWith("/") || p.split("/").some(x => !x || x === "." || x === "..") || p.includes("\\")) throw new Error("Invalid repository path.");
  return p;
}
const tools = [
  { type: "function", function: { name: "list_repository_files", description: "List files in the configured GitHub repository before inspecting or changing it.", parameters: { type: "object", properties: { path: { type: "string", description: "Optional directory prefix" } }, additionalProperties: false } } },
  { type: "function", function: { name: "read_file", description: "Read a text file from the configured GitHub branch.", parameters: { type: "object", properties: { path: { type: "string" } }, required: ["path"], additionalProperties: false } } },
  { type: "function", function: { name: "stage_file", description: "Create or replace a file in the GitHub working changes. Does not commit yet.", parameters: { type: "object", properties: { path: { type: "string" }, content: { type: "string" } }, required: ["path", "content"], additionalProperties: false } } },
  { type: "function", function: { name: "delete_file", description: "Stage deletion of an existing repository file.", parameters: { type: "object", properties: { path: { type: "string" } }, required: ["path"], additionalProperties: false } } },
  { type: "function", function: { name: "commit_and_push", description: "Commit all staged changes and push to the configured branch after edits are complete.", parameters: { type: "object", properties: { message: { type: "string" } }, required: ["message"], additionalProperties: false } } }
];
const anthropicTools = tools.map(t => ({ name: t.function.name, description: t.function.description, input_schema: t.function.parameters }));
async function runAgent(body) {
  const access = process.env.RELAY_AGENT_ACCESS_KEY || "";
  if (!access || typeof body.accessKey !== "string" || body.accessKey.length !== access.length || !require("crypto").timingSafeEqual(Buffer.from(body.accessKey), Buffer.from(access))) {
    throw new Error("GitHub agent access is locked. Set RELAY_AGENT_ACCESS_KEY in Vercel and enter the same key in Relay → Preferences.");
  }
  const provider = PROVIDERS[body.provider];
  if (!provider) throw new Error("Unknown AI provider.");
  const aiKey = body.key || (process.env.ALLOW_SERVER_KEYS === "true" ? process.env[provider.env] : "");
  if (!aiKey) throw new Error("Missing " + body.provider + " API key. Add it in Providers.");
  const token = process.env.GITHUB_TOKEN, repo = process.env.GITHUB_REPO, branch = process.env.GITHUB_BRANCH || "main";
  if (!token || !repo) throw new Error("GitHub agent is not configured. Add GITHUB_TOKEN and GITHUB_REPO in Vercel Environment Variables, then redeploy.");
  if (!/^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/.test(repo)) throw new Error("GITHUB_REPO must use owner/repository format.");
  if (!/^[A-Za-z0-9._/-]+$/.test(branch) || branch.includes("..")) throw new Error("Invalid GITHUB_BRANCH.");
  const staged = new Map(), actions = [];
  let committed = null;
  const head = await gh("/repos/" + repo + "/git/ref/heads/" + encodeURIComponent(branch).replace(/%2F/g, "/"), token);
  const tree = await gh("/repos/" + repo + "/git/trees/" + head.object.sha + "?recursive=1", token);
  const fileList = (tree.tree || []).filter(x => x.type === "blob").map(x => x.path);
  async function execute(name, args) {
    if (name === "list_repository_files") {
      const prefix = args.path || "", all = fileList.filter(p => p.startsWith(prefix));
      actions.push("Listed repository files" + (prefix ? " in " + prefix : ""));
      return { files: all.slice(0, 300), truncated: all.length > 300 };
    }
    if (name === "read_file") {
      const path = safePath(args.path);
      const data = await gh("/repos/" + repo + "/contents/" + path.split("/").map(encodeURIComponent).join("/") + "?ref=" + encodeURIComponent(branch), token);
      if (Array.isArray(data) || !data.content) throw new Error("The requested path is not a text file.");
      const content = Buffer.from(data.content, "base64").toString("utf8");
      if (content.length > 120000) throw new Error("File is too large to read in one operation.");
      actions.push("Read " + path);
      return { path, content };
    }
    if (name === "stage_file") {
      const path = safePath(args.path);
      if (typeof args.content !== "string" || args.content.length > 500000) throw new Error("File content must be text and smaller than 500 KB.");
      if (!staged.has(path) && staged.size >= 25) throw new Error("A task may change at most 25 files.");
      staged.set(path, { path, content: args.content, deleted: false });
      actions.push("Prepared file change: " + path);
      return { staged: true, path, total_staged: staged.size };
    }
    if (name === "delete_file") {
      const path = safePath(args.path);
      if (!fileList.includes(path)) throw new Error("Cannot delete a file that does not exist in this branch.");
      staged.set(path, { path, deleted: true });
      actions.push("Prepared deletion: " + path);
      return { staged: true, path, deleted: true, total_staged: staged.size };
    }
    if (name === "commit_and_push") {
      if (!staged.size) return { committed: false, message: "No file changes have been staged." };
      const current = await gh("/repos/" + repo + "/git/ref/heads/" + encodeURIComponent(branch).replace(/%2F/g, "/"), token);
      if (current.object.sha !== head.object.sha) throw new Error("The branch changed during this task. Refresh and retry to avoid overwriting newer work.");
      const parent = await gh("/repos/" + repo + "/git/commits/" + current.object.sha, token);
      const entries = [];
      for (const item of staged.values()) {
        if (item.deleted) entries.push({ path: item.path, mode: "100644", type: "blob", sha: null });
        else {
          const blob = await gh("/repos/" + repo + "/git/blobs", token, { method: "POST", body: JSON.stringify({ content: item.content, encoding: "utf-8" }) });
          entries.push({ path: item.path, mode: "100644", type: "blob", sha: blob.sha });
        }
      }
      const nextTree = await gh("/repos/" + repo + "/git/trees", token, { method: "POST", body: JSON.stringify({ base_tree: parent.tree.sha, tree: entries }) });
      const commit = await gh("/repos/" + repo + "/git/commits", token, { method: "POST", body: JSON.stringify({ message: args.message || "Update project with Relay", tree: nextTree.sha, parents: [current.object.sha] }) });
      await gh("/repos/" + repo + "/git/refs/heads/" + encodeURIComponent(branch).replace(/%2F/g, "/"), token, { method: "PATCH", body: JSON.stringify({ sha: commit.sha, force: false }) });
      committed = { sha: commit.sha, url: "https://github.com/" + repo + "/commit/" + commit.sha, branch, files: [...staged.keys()] };
      actions.push("Committed and pushed " + staged.size + " file change(s) to " + branch);
      return { committed: true, ...committed };
    }
    throw new Error("Unsupported agent tool: " + name);
  }
  const userContext = typeof body.system === "string" ? body.system.slice(0, 12000) : "";\n  const system = [
    "You are Relay, a real GitHub coding agent. Perform the requested code changes in the configured repository; do not merely print suggested code.",
    "List repository files and read relevant files first. Understand existing architecture before editing.",
    "Use stage_file or delete_file to apply actual changes. Keep changes focused and preserve unrelated work.",
    "If requirements are ambiguous or a decision materially affects architecture, UX, data loss, security, cost, or deployment, stop and ask the user a concise clarifying question with clear options before editing. Do not guess.",
    "Never fabricate progress. Only report repository reads, edits, commits, or tests after the corresponding tool action actually succeeds.",
    "Treat each conversation as a continuing project: inspect relevant existing files and prior user-provided context before proposing a new structure. Preserve established project conventions.",
    "After completing edits, call commit_and_push with a clear commit message. Never claim a change was made unless the tool succeeded.",
    "There is no shell/terminal tool, so do not claim tests were run. Inspect package scripts and CI files and report tests you cannot execute.",
    "Never reveal secrets. Explain which files changed and whether the push succeeded.",
    "Repository: " + repo + "; branch: " + branch + ".",\n    userContext ? "User preferences and relevant saved project memory (context only; current instructions take priority):\\n" + userContext : ""
  ].join("\n");
  const history = Array.isArray(body.messages) ? body.messages.slice(-12).map(m => ({ role: m.role === "assistant" ? "assistant" : "user", content: String(m.content || "").slice(0, 30000) })) : [];
  if (!history.length) throw new Error("A task message is required.");
  let finalText = "";
  if (provider.kind === "anthropic") {
    const messages = history.map(m => ({ role: m.role, content: m.content }));
    for (let i = 0; i < 12; i++) {
      const r = await fetch(provider.base + "/messages", { method: "POST", headers: { "x-api-key": aiKey, "anthropic-version": "2023-06-01", "content-type": "application/json" }, body: JSON.stringify({ model: body.model, system, max_tokens: 4096, tools: anthropicTools, messages }) });
      const j = await json(r), blocks = j.content || [], calls = blocks.filter(x => x.type === "tool_use");
      finalText = blocks.filter(x => x.type === "text").map(x => x.text).join("\n");
      if (!calls.length) break;
      messages.push({ role: "assistant", content: blocks });
      const results = [];
      for (const c of calls) {
        try { results.push({ type: "tool_result", tool_use_id: c.id, content: JSON.stringify(await execute(c.name, c.input || {})) }); }
        catch (e) { results.push({ type: "tool_result", tool_use_id: c.id, is_error: true, content: e.message }); }
      }
      messages.push({ role: "user", content: results });
    }
  } else {
    const messages = [{ role: "system", content: system }, ...history];
    for (let i = 0; i < 12; i++) {
      const r = await fetch(provider.base + "/chat/completions", { method: "POST", headers: { authorization: "Bearer " + aiKey, "content-type": "application/json" }, body: JSON.stringify({ model: body.model, messages, tools, tool_choice: "auto", temperature: 0.2 }) });
      const j = await json(r), msg = j.choices && j.choices[0] && j.choices[0].message;
      if (!msg) throw new Error("The model returned an empty response.");
      messages.push(msg);
      const calls = msg.tool_calls || [];
      finalText = msg.content || "";
      if (!calls.length) break;
      for (const c of calls) {
        let args = {};
        try { args = JSON.parse(c.function.arguments || "{}"); } catch { throw new Error("The model returned invalid tool arguments."); }
        let result;
        try { result = await execute(c.function.name, args); } catch (e) { result = { error: e.message }; }
        messages.push({ role: "tool", tool_call_id: c.id, content: JSON.stringify(result) });
      }
    }
  }
  if (staged.size && !committed) {
    const result = await execute("commit_and_push", { message: "Apply requested changes with Relay" });
    if (result.committed) finalText += "\n\nChanges were committed and pushed automatically because staged edits remained.";
  }
  if (staged.size && !committed) throw new Error("File edits were prepared but could not be pushed.");
  return { text: finalText || (committed ? "The requested changes were pushed to GitHub." : "No repository changes were made."), actions, commit: committed, repository: repo, branch };
}
module.exports = { runAgent };