# DIG-011 challenge — value for LLM design generation

**Date:** 2026-08-15  
**Question:** Are DIG-011 flows (and related specs) consistent, and do they maximize **valuable knowledge for an LLM that should produce better, more individualized designs**?  
**Verdict (short):** Specs are internally mostly coherent on ownership/naming, but **DIG-011 is not the highest-leverage path to that LLM goal yet**. Risk: we built a Mobbin-*library* product spine while the differentiator for design agents is still under-connected (section look, measured recipes, retrieval → generation).

---

## 1. Stated north star vs what we optimized

| North star | What DIG-011 optimizes |
|------------|-------------------------|
| LLM gets dense, evidence-backed design knowledge → better / more individual layouts | Cross-screen journey graph, Interactive Mode, `flow_actions` facets, Library Flows tab |

Mobbin uses flows as a **human research browser**. DIG’s promise (README / DIG-007→008) is a **design agent graph → layout spec**. Those overlap, but they are not the same product.

**Challenge:** A perfect login→home Interactive Mode does little for an LLM asked to “design a pricing page in the voice of this brand” unless each screen already has rich, comparable **composition + look + token** knowledge and retrieval that feeds DIG-008 / prompts.

---

## 2. What actually helps an LLM design better (ranked)

Highest leverage for *individualized* generation (already partly in DIG):

1. **Measured composition** — section recipes, gaps, roles (DIG-003 / section-composition)  
2. **Section look & feel prose + structured fields** (DIG-010) — scrim, italic highlight, CTA alignment…  
3. **Visual language tokens** (DIG-004) — type/color/shape with evidence  
4. **Ontology facets** — patterns, UI elements, page archetype (DIG-002 + Mobbin stages)  
5. **Provenance** — node ids, confidence, L2 vs L3 (so the model doesn’t invent)  
6. **Retrieval across a corpus** — “find heroes like X but denser / more editorial” (embeddings + MCP; still thin)  
7. **Cross-screen flow topology** (DIG-011) — valuable for *multi-screen product UX* briefs, weaker for *single surface* visual design  

DIG-011 sits at **#7**. Useful later; easy to over-invest now.

---

## 3. Inconsistencies & tensions found

### 3.1 Naming: “Flows” means two things

| Doc | “Flow” meaning |
|-----|----------------|
| [`mobbin-parity.md`](mobbin-parity.md) | Ordered **page narrative of sections** (`page_flow`) |
| DIG-011 / UI IA | Multi-screen **User Flow Graph** |
| Library today `GET …/flows` | `page_flow` LLM items |
| Planned `GET …/flows` | DIG-011 graphs |

UI IA correctly demands “Page narrative” vs “Flows”, but **mobbin-parity.md is still wrong/outdated**. Agents reading knowledge will conflate them.

### 3.2 DIG-007 / DIG-008 ignore the new knowledge shapes

- `dig_recommend` = same taxonomy id on **one** graph — not “similar section looks”, not flow neighbors, not style distance.  
- DIG-008 generation = structural blocks from ontology — **does not consume** `section_look`, `visual_style` labels, or flow context.  

So even if DIG-011 ships, the **generation path that makes designs** won’t automatically get smarter. Spec suite grew “library + UI”; the **LLM→layout loop** stayed thin.

### 3.3 ADR-011 “Accepted” vs implementation policy

ADR says Accepted; parent DIG-011 says runtime deferred. Fine for process, but easy to misread as “build Flows UI next.” UI spec correctly blocks React until HTTP — good — yet Production roadmap item 6 lists DIG-011 implement without restating **goal ranking** above.

### 3.4 Seed dependency vs single-URL reality

DIG-011 B2 needs CHECKION domain URLs or AUDION steps. Current DIG happy path = **one URL capture**. Without seeds, Phase A candidates on one page rarely become multi-screen flows. Specs acknowledge this; **fixtures pretend a corpus**. Risk: implementing A→D against fixtures feels done while production stays empty.

### 3.5 `flow_actions` catalog ≠ design individuality

Closed actions (onboarding, checkout…) help **retrieval of journeys**. They do not encode *how* a checkout *looks* (that’s DIG-010 per screen). An LLM keyed only on `dig:flow.checkout` gets genre, not individuality.

### 3.6 CHECKION full-page SoT vs DIG multi-viewport design truth

CHECKION JPEG is Library/vision SoT; DIG still measures three viewports. Interactive Mode fixtures normalize hotspots to a **synthetic 1440×5000** document — fine for contract tests, dangerous if treated as calibrated design geometry for generation. Spec should keep Interactive boxes as **UX playback**, not as DIG-003 truth.

### 3.7 Capability map honesty lag

[`checkion-v3-capability-map.md`](checkion-v3-capability-map.md) still suggests preferring DIG full-page wiring *before* CHECKION in one section, while [`checkion-screenshots.md`](checkion-screenshots.md) already made CHECKION SoT. Mild doc drift.

### 3.8 “optionalHotspotFlow” naming in paths.json

Budget key still sounds like hotspot labeling; DIG-011 Phase C wants `flow_actions` stage. Rename debt.

---

## 4. What DIG-011 *does* get right

- Clear anti-duplication with AUDION/CHECKION (no journey agent fork).  
- L0–L3 discipline (don’t invent edges).  
- Separation `page_flow` vs Flow (once docs are fixed).  
- Schema + golden fixtures + projectors = good contract hygiene.  
- For **multi-screen product design** prompts (“show how fintech apps do onboarding”), flows are the right unit — *after* each screen is rich.

---

## 5. Reframe: knowledge packages an LLM should retrieve

Ideal retrieval unit for individualized design — now normative as **DIG-012**:

See [`docs/DIG-012-design-reference.md`](../docs/DIG-012-design-reference.md) and [`design-reference.md`](design-reference.md).

```text
DesignReference {
  screen_or_section_id
  measured: recipe, geometry, tokens          // L1/L2
  look: section_look / visual_style           // L3, evidence-cited
  brand_signals: typography/color personality
  optional: flow_context { action, prev, next }  // DIG-011, thin
}
```

MCP / prompts should prefer **DesignReference** bundles over raw graphs or bare `flow_actions`.

DIG-008 should eventually accept “generate in the style of references[]” using those bundles — today it cannot.

---

## 6. Recommended course correction (still spec-first OK)

1. **Fix doc inconsistency** — update `mobbin-parity.md`: Flows → “page narrative (`page_flow`)”; point multi-screen to DIG-011. *(done)*  
2. **Specify DesignReference (DIG-012)** as the agent retrieval unit. *(done — Wave 0)*  
3. **Implement DIG-012 emit + `dig_reference_*` before DIG-011 runtime.**  
4. **Prompt-pack / DIG-008 `look_conditioned`** so generation uses individuality.  
5. **DIG-011 later** as optional `flow_context` on references + library journeys.  
6. Clean remaining rename debt (`optionalHotspotFlow` kept as alias; prefer `flowActions` in `callsPerCaptureEstimate`).

---

## 7. Consistency scorecard

| Area | Score | Note |
|------|-------|------|
| CHECKION/AUDION ownership | Strong | Clear and aligned with CHECKION specs |
| page_flow vs Flow naming | Weak until parity doc fixed | Collision risk |
| Spec ↔ schema ↔ fixtures | Strong | Validated |
| Spec ↔ LLM generation goal | Weak | DIG-011 not wired to DIG-007/008 value loop |
| Spec ↔ production capture reality | Medium | Needs seeds; single-URL default |
| Individualized design knowledge | Strongest in DIG-010 + measured recipes | Under-exposed to agents |

---

## 8. Bottom line

DIG-011 is a **coherent library-feature spec**, not yet a **design-intelligence multiplier**. To serve “wertvolles Wissen für bessere, individuellere Designs,” prioritize **making existing L2/L3 screen/section knowledge retrievable and generative**, then attach flow topology as context — not the other way around.
