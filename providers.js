// Shared provider logic for the Vercel functions (api/*) and the local server (server.js).
const PROV = {
  openai:    { base: "https://api.openai.com/v1", env: "OPENAI_API_KEY" },
  nvidia:    { base: "https://integrate.api.nvidia.com/v1", env: "NVIDIA_API_KEY" },
  alibaba:   { base: process.env.DASHSCOPE_BASE_URL || "https://dashscope-intl.aliyuncs.com/compatible-mode/v1", env: "DASHSCOPE_API_KEY" },
  anthropic: { base: "https://api.anthropic.com/v1", env: "ANTHROPIC_API_KEY" }
};
// Server-side env keys are used only when ALLOW_SERVER_KEYS=true, so a public deployment
// never spends your keys unless you opt in. Otherwise each user brings their own key.
const allowEnv = () => process.env.ALLOW_SERVER_KEYS === "true";
const keyFor = (id, body) => body.key || (allowEnv() ? process.env[PROV[id].env] : undefined);
const hdr = (id, key) => id === "anthropic"
  ? { "x-api-key": key, "anthropic-version": "2023-06-01", "content-type": "application/json" }
  : { authorization: "Bearer " + key, "content-type": "application/json" };
async function upstream(url, opt) {
  const r = await fetch(url, opt), t = await r.text();
  let j; try { j = JSON.parse(t); } catch (e) { j = { raw: t }; }
  if (!r.ok) throw new Error((j.error && (j.error.message || j.error)) || j.message || ("HTTP " + r.status));
  return j;
}
function health() {
  return { ok: true, keys: Object.fromEntries(Object.entries(PROV).map(([k, v]) => [k, allowEnv() && !!process.env[v.env]])) };
}
async function chat(b) {
  const p = PROV[b.provider]; if (!p) return [400, { error: "Unknown provider" }];
  const key = keyFor(b.provider, b);
  if (!key) return [401, { error: "No API key for " + b.provider + ". Add it on the Providers page." }];
  if (!Array.isArray(b.messages) || !b.model) return [400, { error: "model and messages are required" }];
  let text;
  if (b.provider === "anthropic") {
    const j = await upstream(p.base + "/messages", { method: "POST", headers: hdr("anthropic", key),
      body: JSON.stringify({ model: b.model, max_tokens: 4096, system: b.system, messages: b.messages }) });
    text = j.content.map(c => c.text || "").join("");
  } else {
    const j = await upstream(p.base + "/chat/completions", { method: "POST", headers: hdr(b.provider, key),
      body: JSON.stringify({ model: b.model, messages: [{ role: "system", content: b.system || "" }, ...b.messages] }) });
    text = j.choices[0].message.content;
  }
  return [200, { text }];
}
async function models(b) {
  const p = PROV[b.provider]; if (!p) return [400, { error: "Unknown provider" }];
  const key = keyFor(b.provider, b);
  if (!key) return [401, { error: "No API key for " + b.provider + ". Add it on the Providers page." }];
  const j = await upstream(p.base + "/models", { headers: hdr(b.provider, key) });
  return [200, { models: (j.data || []).map(m => m.id) }];
}
module.exports = { health, chat, models };
