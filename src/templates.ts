// ─────────────────────────────────────────────────────────────────────────────
// Trilium Brain — structured note content generators
//
// Uniform layout contract:
//   • every typed note opens with one italic meta line
//   • every ephemeral note (question / decision / thread / capture) carries a
//     single `<h2>Resolution</h2>` section — the one anchor resolve() edits
//   • templates wrap the model's (already normalized) body HTML; they never
//     emit empty skeleton sections for the model to forget to fill
// ─────────────────────────────────────────────────────────────────────────────

import { escapeHtml } from "./normalize.js";
import type { AnyKind } from "./types.js";

export const RESOLUTION_ANCHOR = "<h2>Resolution</h2>";
export const OPEN_RESOLUTION = `${RESOLUTION_ANCHOR}\n<p><em>— open —</em></p>`;

function metaLine(parts: Array<string | undefined>): string {
  const cleaned = parts.filter((p): p is string => !!p && p.trim().length > 0);
  return `<p><em>${cleaned.map(escapeHtml).join(" · ")}</em></p>\n<hr>`;
}

export interface TemplateOpts {
  date: string;          // ISO YYYY-MM-DD
  body: string;          // normalized HTML body (may be empty)
  domain?: string;       // display name, concept/reference
  mood?: string;         // opinion
  role?: string;         // person
  org?: string;          // person
  goal?: string;         // project
}

// ── Kind content builders ─────────────────────────────────────────────────────

export function threadContent(o: TemplateOpts): string {
  return [
    metaLine(["thread", `opened ${o.date}`]),
    "<h2>Context</h2>",
    o.body || "<p></p>",
    "<h2>Log</h2>",
    `<h3>${escapeHtml(o.date)}</h3><p>Thread opened.</p>`,
    OPEN_RESOLUTION,
  ].join("\n");
}

export function decisionContent(o: TemplateOpts): string {
  return [
    metaLine(["decision", `opened ${o.date}`]),
    "<h2>Context</h2>",
    o.body || "<p></p>",
    OPEN_RESOLUTION,
  ].join("\n");
}

export function questionContent(o: TemplateOpts): string {
  return [
    metaLine(["question", `asked ${o.date}`]),
    o.body || "<p></p>",
    OPEN_RESOLUTION,
  ].join("\n");
}

export function captureContent(o: TemplateOpts): string {
  return [metaLine(["capture", o.date]), o.body || "<p></p>"].join("\n");
}

export function conceptContent(o: TemplateOpts): string {
  return [
    metaLine(["concept", o.domain ? `domain: ${o.domain}` : undefined]),
    "<h2>Definition</h2>",
    o.body || "<p></p>",
  ].join("\n");
}

export function referenceContent(o: TemplateOpts): string {
  return [
    metaLine(["reference", o.domain ? `domain: ${o.domain}` : undefined, o.date]),
    o.body || "<p></p>",
  ].join("\n");
}

export function personContent(o: TemplateOpts): string {
  return [
    metaLine(["person", o.role, o.org ? `@ ${o.org}` : undefined]),
    o.body || "<p></p>",
  ].join("\n");
}

export function organizationContent(o: TemplateOpts): string {
  return [metaLine(["organization", o.date]), o.body || "<p></p>"].join("\n");
}

export function projectContent(o: TemplateOpts): string {
  return [
    metaLine(["project", `started ${o.date}`, o.goal ? `goal: ${o.goal}` : undefined]),
    o.body || "<p></p>",
  ].join("\n");
}

export function opinionContent(o: TemplateOpts): string {
  return [
    metaLine(["opinion", o.date, o.mood]),
    o.body || "<p></p>",
  ].join("\n");
}

export function identityContent(o: TemplateOpts): string {
  return o.body || "<p></p>";
}

export function sessionContent(o: TemplateOpts): string {
  return [metaLine(["session", o.date]), o.body || "<p></p>"].join("\n");
}

export function domainContent(name: string): string {
  return `<p><em>Knowledge domain: <strong>${escapeHtml(name)}</strong> — concepts and references live directly in this folder.</em></p>`;
}

export function contentFor(kind: AnyKind, o: TemplateOpts): string {
  switch (kind) {
    case "thread":       return threadContent(o);
    case "decision":     return decisionContent(o);
    case "question":     return questionContent(o);
    case "capture":      return captureContent(o);
    case "concept":      return conceptContent(o);
    case "reference":    return referenceContent(o);
    case "person":       return personContent(o);
    case "organization": return organizationContent(o);
    case "project":      return projectContent(o);
    case "opinion":      return opinionContent(o);
    case "identity":     return identityContent(o);
    case "session":      return sessionContent(o);
    case "domain":       return domainContent(o.domain ?? "");
  }
}

// ── Structural node description (init/bootstrap) ─────────────────────────────

export function sectionDescription(description: string): string {
  return `<p><em>${escapeHtml(description)}</em></p>`;
}
