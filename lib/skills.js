// Built-in professional skill library for Relay Coder.
// These are task-specific engineering playbooks, not claims that unavailable tools exist.
const SKILLS = [
  { id:"web-development", name:"Website Development", tags:["website","web app","web application","landing page","e-commerce","dashboard","next.js","react","html","css"], instructions:`WEBSITE DEVELOPMENT
- First inspect the existing framework, routing, package scripts, styles, components, and deployment target. Extend the current architecture; do not replace it without a reason.
- Build complete, responsive pages for mobile, tablet, and desktop. Include loading, empty, error, success, and form-validation states.
- Use semantic HTML, reusable components, accessible labels, keyboard navigation, and appropriate metadata/SEO.
- Keep design tokens and components consistent. Avoid placeholder buttons, dead links, fake data presented as real, and unfinished sections.
- Integrate APIs and persistence through the project's existing patterns. Validate inputs on client and server where applicable.
- Check dependency compatibility and inspect available scripts/CI. Never claim a build or test passed unless it was actually executed.` },
  { id:"mobile-development", name:"Mobile App Development", tags:["mobile","android","ios","react native","flutter","expo","apk","app store"], instructions:`MOBILE APP DEVELOPMENT
- Identify whether the project uses native Android/iOS, React Native, Expo, Flutter, or a web wrapper before choosing implementation.
- Design touch-first screens, safe-area support, adaptive layouts, accessible controls, offline/loading/error states, and sensible navigation.
- Handle permissions, secure token storage, deep links, push notifications, and platform differences deliberately.
- Use maintainable state management and typed API/data models where supported.
- Do not claim emulator/device testing, APK/IPA generation, signing, or store publication unless the required tooling and credentials were actually used.` },
  { id:"ui-ux-design", name:"UI/UX & Design Systems", tags:["ui","ux","design","figma","interface","wireframe","prototype","visual"], instructions:`UI/UX & DESIGN SYSTEMS
- Establish user goals, audience, key journeys, information architecture, and content hierarchy before styling.
- Define coherent design tokens for color, typography, spacing, radius, elevation, breakpoints, and motion.
- Create reusable components with clear variants and interaction states. Prioritize responsive layouts and visual consistency.
- Follow WCAG-oriented contrast, focus visibility, keyboard support, semantic structure, and reduced-motion preferences.
- Avoid arbitrary gradients, excessive cards, cramped spacing, inconsistent iconography, and decorative elements that reduce clarity.
- If no design tool integration exists, implement the design in the repository and describe the limits; do not claim to have edited a Figma file.` },
  { id:"backend-api", name:"Backend & API Engineering", tags:["backend","api","server","node","express","python","rest","graphql","websocket"], instructions:`BACKEND & API ENGINEERING
- Trace request flow, runtime, routes, middleware, data models, and error handling before editing.
- Design stable API contracts, validate and normalize inputs, return appropriate status codes, and avoid leaking internal errors.
- Use pagination, filtering, idempotency, rate limits, and structured logging where appropriate.
- Keep secrets in environment variables; never hardcode credentials or expose them to browser bundles.
- Preserve backwards compatibility or explicitly document breaking changes.` },
  { id:"database", name:"Database & Data Engineering", tags:["database","sql","postgres","supabase","firebase","mongodb","schema","migration","storage"], instructions:`DATABASE & DATA ENGINEERING
- Inspect current schema, migrations, data access patterns, and authorization rules before changing data structures.
- Use migrations for schema changes; consider indexes, constraints, transactions, backups, and rollback paths.
- Enforce authorization at the data/API layer, not only in the UI. Apply row-level security when supported.
- Avoid destructive migrations or data deletion without explicit approval and a recovery plan.
- Never expose service-role keys or database credentials to client code.` },
  { id:"debugging-testing", name:"Debugging & Testing", tags:["bug","debug","error","fix","test","testing","jest","vitest","playwright","cypress"], instructions:`DEBUGGING & TESTING
- Reproduce or isolate the reported failure. Read the full stack trace and trace the root cause rather than hiding symptoms.
- Add focused regression coverage where the project's test framework supports it.
- Check edge cases, invalid inputs, async failures, race conditions, and responsive behavior.
- Run only commands available in the environment. Report exact commands and outcomes; distinguish executed checks from suggested checks.
- Never claim tests pass when no terminal/test runner is available.` },
  { id:"devops-deployment", name:"DevOps & Deployment", tags:["deploy","deployment","vercel","netlify","docker","ci","cd","github actions","hosting"], instructions:`DEVOPS & DEPLOYMENT
- Inspect deployment configuration, build output settings, environment variable names, CI workflows, and runtime versions.
- Keep secrets out of source control and logs. Document required environment variables without revealing values.
- Prefer reproducible builds, pinned/compatible dependencies, health checks, and safe rollout/rollback practices.
- Treat deployment as complete only after an actual deployment result or provider status confirms it. A successful CI check is not proof of a live manual smoke test.` },
  { id:"security", name:"Application Security", tags:["security","auth","authentication","authorization","oauth","jwt","vulnerability","privacy"], instructions:`APPLICATION SECURITY
- Apply least privilege, server-side authorization, secure session handling, CSRF protections where relevant, and safe CORS policy.
- Validate untrusted input, escape output, prevent injection/path traversal/SSRF, and avoid unsafe deserialization.
- Protect secrets, personal data, logs, file uploads, and account recovery flows.
- Review dependencies and security-sensitive changes. Never weaken authentication or access controls just to make a flow work.
- Flag high-risk changes and request explicit approval before destructive or privilege-expanding actions.` },
  { id:"performance-seo", name:"Performance & SEO", tags:["performance","speed","seo","optimization","lighthouse","core web vitals","accessibility"], instructions:`PERFORMANCE & SEO
- Measure or inspect before optimizing. Identify bundle, rendering, network, image, caching, and database bottlenecks.
- Use responsive image sizing, lazy loading where appropriate, code splitting, caching, and efficient queries.
- Provide meaningful titles, descriptions, canonical URLs, sitemap/robots configuration, structured data where appropriate, and crawlable navigation.
- Preserve accessibility and correctness; do not trade away usability for superficial performance scores.
- Report measured metrics only when a real measurement was run.` },
  { id:"architecture-project", name:"Software Architecture & Project Planning", tags:["architecture","plan","planning","project","refactor","structure","requirements","scaffold"], instructions:`SOFTWARE ARCHITECTURE & PROJECT PLANNING
- Translate the request into explicit requirements, user stories, constraints, and acceptance criteria.
- Inspect the repository and propose a minimal architecture that fits the existing stack and project scale.
- Break large tasks into ordered milestones; identify dependencies, risks, and decisions that require user input.
- Preserve existing behavior and project conventions. Avoid unnecessary rewrites and speculative abstractions.
- Ask concise questions when choices materially affect product direction, cost, data, security, or compatibility.` }
];
function getSkillsForTask(task) {
  const q = String(task || "").toLowerCase();
  const ranked = SKILLS.map(s => ({ skill:s, score:s.tags.reduce((n,t) => n + (q.includes(t) ? (t.includes(" ") ? 3 : 1) : 0), 0) }));
  let selected = ranked.filter(x => x.score > 0).sort((a,b) => b.score-a.score).slice(0, 5).map(x => x.skill);
  if (!selected.length) selected = SKILLS.filter(s => ["architecture-project","debugging-testing","ui-ux-design"].includes(s.id));
  return selected;
}
module.exports = { SKILLS, getSkillsForTask };
