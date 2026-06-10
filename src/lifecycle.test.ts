import { describe, expect, test } from "bun:test";
import { planCanon, applyResolution } from "./lifecycle.js";
import { labelPlan } from "./router.js";
import { RESOLUTION_ANCHOR } from "./templates.js";
import type { Attribute } from "./trilium.js";

let nextId = 0;
const attr = (name: string, value = "", type: "label" | "relation" = "label"): Attribute => ({
  attributeId: `attr${nextId++}`,
  noteId: "n1",
  type,
  name,
  value,
  position: 0,
  isInheritable: false,
});

const note = (title: string, attributes: Attribute[]) => ({
  noteId: "n1",
  title,
  attributes,
  dateCreated: "2026-06-08 08:00:00.000+0200",
});

const ops = (plan: ReturnType<typeof planCanon>) => plan.actions.map((a) => JSON.stringify(a));

describe("planCanon — the v3 strays observed live", () => {
  test("naked question with RESOLVED title suffix", () => {
    const plan = planCanon(note("SaaS projects status — RESOLVED", []), "question");
    const all = ops(plan).join("\n");
    expect(all).toContain('"op":"patchTitle"');
    expect(all).toContain('"title":"SaaS projects status"');
    expect(all).toContain('"name":"noteType","value":"question"');
    expect(all).toContain('"name":"status","value":"resolved"');
    expect(all).toContain('"name":"archived"');
    expect(all).toContain('"name":"created","value":"2026-06-08"');
  });

  test("'partially resolved' question stays active and unarchived", () => {
    const plan = planCanon(note("Firebase vs Supabase — partially resolved", []), "question");
    const all = ops(plan).join("\n");
    expect(all).toContain('"name":"status","value":"active"');
    expect(all).not.toContain('"name":"archived"');
  });

  test("legacy noteType=knowledge becomes reference", () => {
    const plan = planCanon(note("myClerkBook — Full Product + Stack Reference", [attr("noteType", "knowledge")]));
    expect(ops(plan).join("\n")).toContain('"op":"setLabel","name":"noteType","value":"reference"');
  });

  test("legacy date labels migrate to #created and are removed", () => {
    const stored = attr("dateStored", "2026-06-08");
    const plan = planCanon(note("Some fact", [attr("noteType", "identity"), stored]));
    const all = ops(plan).join("\n");
    expect(all).toContain('"op":"addLabel","name":"created","value":"2026-06-08"');
    expect(all).toContain(`"attributeId":"${stored.attributeId}"`);
  });

  test("duplicate single-value labels are deduped", () => {
    const first = attr("status", "active");
    const second = attr("status", "pending");
    const plan = planCanon(note("Thread", [attr("noteType", "thread"), first, second]));
    const all = ops(plan).join("\n");
    expect(all).toContain(`"attributeId":"${second.attributeId}"`);
    expect(all).not.toContain(`"deleteAttr","attributeId":"${first.attributeId}"`);
  });

  test("legacy status vocabulary canonicalizes", () => {
    const plan = planCanon(note("Decide hosting", [attr("noteType", "decision"), attr("status", "pending")]));
    expect(ops(plan).join("\n")).toContain('"op":"setLabel","name":"status","value":"active"');
  });

  test("title entity leak is repaired", () => {
    const plan = planCanon(note("Miiso — Active Ventures &amp; Platforms", [attr("noteType", "identity"), attr("created", "2026-06-08")]));
    expect(ops(plan).join("\n")).toContain('"title":"Miiso — Active Ventures & Platforms"');
  });

  test("clean canonical note needs nothing", () => {
    const plan = planCanon(
      note("Clean concept", [attr("noteType", "concept"), attr("created", "2026-06-01"), attr("domain", "technology")])
    );
    expect(plan.actions).toHaveLength(0);
  });

  test("multi-value topic labels are not deduped unless exact repeats", () => {
    const t1 = attr("topic", "ai");
    const t2 = attr("topic", "tooling");
    const t3 = attr("topic", "ai");
    const plan = planCanon(note("Note", [attr("noteType", "reference"), attr("created", "2026-06-01"), t1, t2, t3]));
    const all = ops(plan).join("\n");
    expect(all).toContain(`"attributeId":"${t3.attributeId}"`);
    expect(all).not.toContain(`"attributeId":"${t2.attributeId}"`);
  });
});

describe("applyResolution", () => {
  test("replaces the anchor tail", () => {
    const html = `<p>intro</p>\n${RESOLUTION_ANCHOR}\n<p><em>— open —</em></p>`;
    const out = applyResolution(html, "<p>We chose Supabase.</p>", "2026-06-10");
    expect(out).toContain("<p>intro</p>");
    expect(out).toContain("We chose Supabase.");
    expect(out).toContain("Closed 2026-06-10");
    expect(out).not.toContain("— open —");
  });
  test("appends when no anchor exists", () => {
    const out = applyResolution("<p>legacy note</p>", "<p>answer</p>", "2026-06-10");
    expect(out).toContain("<p>legacy note</p>");
    expect(out).toContain(RESOLUTION_ANCHOR);
    expect(out).toContain("<p>answer</p>");
  });
});

describe("labelPlan", () => {
  test("question gets kind, created, status", () => {
    const labels = labelPlan("question", "Why X?", {}, "2026-06-10");
    const flat = labels.map((l) => `${l.name}=${l.value}`);
    expect(flat).toContain("noteType=question");
    expect(flat).toContain("status=active");
    expect(flat).toContain("created=2026-06-10");
  });
  test("project carries its own slug", () => {
    const flat = labelPlan("project", "My ClerkBook", {}, "2026-06-10").map((l) => `${l.name}=${l.value}`);
    expect(flat).toContain("project=my-clerkbook");
    expect(flat).toContain("status=active");
  });
  test("identity defaults to context facet", () => {
    const flat = labelPlan("identity", "Fact", {}, "2026-06-10").map((l) => `${l.name}=${l.value}`);
    expect(flat).toContain("facet=context");
  });
  test("topics are slugged and deduped", () => {
    const flat = labelPlan("reference", "Doc", { topics: ["AI Tooling", "ai-tooling", "Infra"] }, "2026-06-10")
      .map((l) => `${l.name}=${l.value}`);
    expect(flat.filter((f) => f === "topic=ai-tooling")).toHaveLength(1);
    expect(flat).toContain("topic=infra");
  });
  test("concept gets a slugged domain label", () => {
    const flat = labelPlan("concept", "CRDT", { domain: "Distributed Systems" }, "2026-06-10")
      .map((l) => `${l.name}=${l.value}`);
    expect(flat).toContain("domain=distributed-systems");
    expect(flat.some((f) => f.startsWith("status="))).toBe(false);
  });
  test("opinion mood is slugged", () => {
    const flat = labelPlan("opinion", "Hot take", { mood: "Analytical" }, "2026-06-10").map((l) => `${l.name}=${l.value}`);
    expect(flat).toContain("mood=analytical");
  });
});
