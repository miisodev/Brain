// ─────────────────────────────────────────────────────────────────────────────
// Trilium Brain — structured note content generators
// Each function returns HTML suitable for a Trilium text note.
// ─────────────────────────────────────────────────────────────────────────────

export function threadContent(context: string, date: string): string {
  return `<h2>Context</h2>
<p>${esc(context) || 'Why this thread exists.'}</p>
<h2>Log</h2>
<h3>${esc(date)}</h3>
<p>Thread opened.</p>
<h2>Resolution</h2>
<p><em>— pending —</em></p>`;
}

export function decisionContent(context: string): string {
  return `<h2>Context</h2>
<p>${esc(context) || 'Describe the situation requiring a decision.'}</p>
<h2>Options</h2>
<h3>Option A — </h3>
<p><strong>Pros:</strong> </p>
<p><strong>Cons:</strong> </p>
<h3>Option B — </h3>
<p><strong>Pros:</strong> </p>
<p><strong>Cons:</strong> </p>
<h2>Decision</h2>
<p><em>— pending —</em></p>
<h2>Rationale</h2>
<p></p>
<h2>Consequences</h2>
<p></p>`;
}

export function conceptContent(domain: string): string {
  return `<p><em>Domain: ${esc(domain) || 'general'}</em></p>
<h2>Definition</h2>
<p>One atomic, precise definition.</p>
<h2>Properties</h2>
<ul>
  <li></li>
</ul>
<h2>Examples</h2>
<ul>
  <li></li>
</ul>
<h2>See Also</h2>
<p><em>Managed via ~relatesTo, ~extends, ~contradicts relations.</em></p>`;
}

export function personContent(role: string, org: string): string {
  return `<p><strong>Role:</strong> ${esc(role) || '—'} &nbsp;|&nbsp; <strong>Organization:</strong> ${esc(org) || '—'}</p>
<h2>Context</h2>
<p>How I know them and why they matter.</p>
<h2>Key Facts</h2>
<ul>
  <li></li>
</ul>
<h2>Interactions</h2>
<p><em>Linked sessions and threads via ~worksWith, ~mentors relations.</em></p>`;
}

export function projectContent(goal: string, date: string): string {
  return `<p><strong>Goal:</strong> ${esc(goal) || '—'} &nbsp;|&nbsp; <strong>Started:</strong> ${esc(date)}</p>
<p><strong>Status:</strong> active</p>
<h2>Overview</h2>
<p></p>
<h2>Stakeholders</h2>
<ul>
  <li></li>
</ul>
<h2>Key Decisions</h2>
<p><em>Linked via ~partOf relation on decision notes.</em></p>
<h2>Notes</h2>
<p></p>`;
}

export function opinionContent(date: string, mood: string): string {
  return `<p><em>${esc(date)} · ${esc(mood) || 'contemplative'}</em></p>
<hr>
<p></p>
<hr>
<p><em>Tags: </em></p>`;
}

export function domainContent(name: string): string {
  return `<p>Knowledge domain: <strong>${esc(name)}</strong></p>
<p>This subtree contains concepts, references, and notes scoped to this domain. Subdirectories are created on demand.</p>`;
}

export function sessionContent(date: string): string {
  return `<p><strong>Date:</strong> ${esc(date)}</p>
<h2>Summary</h2>
<p></p>
<h2>Decisions Made</h2>
<ul>
  <li></li>
</ul>
<h2>Notes Created / Modified</h2>
<ul>
  <li></li>
</ul>
<h2>Open Questions Remaining</h2>
<ul>
  <li></li>
</ul>`;
}

// ── Structural node descriptions (shown in tree but not editable by LLM) ─────

export function sectionDescription(title: string, description: string): string {
  return `<p><em>${esc(description)}</em></p>`;
}

// ── HTML escape helper ────────────────────────────────────────────────────────

function esc(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}
