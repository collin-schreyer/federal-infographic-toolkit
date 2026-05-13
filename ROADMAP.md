# Federal Infographic Toolkit — Roadmap

A developer-facing plan for evolving the toolkit from its current MVP into the best AI infographic generator for federal capture and proposal teams.

---

## 1. What we're building

A federal-grade infographic generator built for business capture and proposal teams. Unlike generic AI image tools that produce stock-photo slop, this app constrains every render to compliant typography (Times New Roman / Arial), agency-style palettes (auto-extracted from any image), Section 508 contrast modes, and USWDS iconography — then routes through state-of-the-art image models (OpenAI `gpt-image-2`, Google `nano-banana-pro-preview`) to produce variants suitable for proposal graphics and capture briefings in seconds, not days.

**Differentiators we are committing to:**
- Two best-in-class image models running in parallel — user picks the winner
- Federal-context inputs (agency, proposal section, win themes, acronyms) that no generic tool offers
- Optional RFP / supporting-doc upload that feeds GPT-5 reasoning into the image prompt
- Visual "style fingerprint" that locks consistency across every graphic in a proposal series
- True 300 DPI print-grade export

---

## 2. Current architecture (orient before you build)

Single-page Vite + React 19 + TypeScript + Tailwind app. No backend yet.

| Concern | Location |
|---|---|
| Entry point | `src/main.tsx` |
| Landing screen | `src/Landing.tsx` |
| Dashboard + auth gate + render orchestration | `src/App.tsx` |
| Gemini integration | `src/lib/gemini.ts` |
| OpenAI integration (gpt-image-2) | `src/lib/openai.ts` |
| Env (gitignored) | `.env` — `VITE_OPENAI_API_KEY`, `VITE_GOOGLE_GEMINI_API_KEY` |
| Deploy config | `render.yaml` |

Both engine libs export the same `generateInfographicImage` signature, making the router at `src/App.tsx:62` a drop-in switch. Logo upload and palette extraction live entirely client-side. There is no persistence layer.

---

## 3. Build phases

### Phase 1 — Speed & UX foundations (1–2 weeks)

The user-perceived wins. Ship these first.

**1.1 Streaming variant results**
- Refactor `handleGenerate` at `src/App.tsx:258` — drop the `Promise.all` at `src/App.tsx:289` and update `generatedImages` state per-promise as each resolves.
- Add skeleton placeholders in the right pane for pending slots.
- First variant should appear ~6–10s after submit instead of blocking until all four are ready.
- Recommended state shape: `useReducer` with per-slot status (`pending` | `rendering` | `done` | `error`) — clean for the 4-variant matrix.

**1.2 2 + 2 dual-model parallel**
- Same handler — fire two OpenAI requests and two Gemini requests simultaneously. **Total: 4 variants.**
- Replace the engine toggle (currently OpenAI vs Gemini) with three modes: **OpenAI only (4)**, **Gemini only (4)**, **Both (2+2, default)**.
- Each variant card gets a small badge: "GPT-Image" or "Nano Banana".
- Sticky in `localStorage`.

**1.3 UI refactor — prompt-on-top, drawer layout**
- Hero prompt textarea moves above all customization controls. 5–6 rows tall, larger font, more breathing room.
- Group everything else into collapsible accordion sections:
  - **Brand** (typography, palette, logo)
  - **Structure** (flow, orientation, density)
  - **Federal Context** (NEW — see Phase 3)
  - **Output** (transparency, accessibility, iconography)
- Default state: all collapsed except Brand for new users; remember last-opened state per session.

---

### Phase 2 — Output quality & print-grade export (1–2 weeks)

The bar for "not AI slop."

**2.1 Max-edge native generation**
- Update `orientationToSize` at `src/lib/openai.ts:20` to request near-max-edge sizes from `gpt-image-2`:
  - 11×8.5 Landscape → `3328x2560` (~302 DPI for letter)
  - 8.5×11 Portrait → `2560x3328` (~302 DPI for letter)
  - 11×17 Foldout → `2480x3840` (~226 DPI — needs upscale for full print spec)
- Verify Gemini's max native output and request the same. Note: Gemini typically returns 1024–1408 max edge, so it will always need an upscale pass for print.

**2.2 Real-ESRGAN upscale for 300 DPI export**
- Add an `Export Print (300 DPI)` button alongside the existing PNG/JPEG/WEBP buttons at `src/App.tsx:773`.
- Pipe selected variant through Replicate's Real-ESRGAN endpoint (~$0.001/image, photographic-quality, no hallucinated detail since source is vector-clean).
- Required for: any Gemini-generated image, any 11×17 foldout, anything the user explicitly flags for print.
- New env var: `VITE_REPLICATE_API_KEY`.

**2.3 Negative-prompt baseline**
- Bake into both engine libs at the top of the prompt template:
  > "NEVER include: stock-photo people, faux-3D gears, clipart, rainbow gradients, glow effects, emoji icons, generic AI floating-cube imagery, hand-drawn or sketch-look elements."
- One-line edit to both `src/lib/gemini.ts` and `src/lib/openai.ts`. Users cannot disable this — it is hard-coded.

**2.4 Structured revision categories**
- Replace the single free-text revision textarea (currently around `src/App.tsx:790`) with a row of pill buttons that prepend curated revision prompts:
  - **Simplify text** — "Reduce all node text to ≤6 words. Remove decorative phrases."
  - **Tighten typography** — "Reduce text size by 15%, increase line-height, ensure 4.5:1 contrast on every label."
  - **Re-color** — "Re-render strictly using the provided palette; do not invent shades."
  - **Adjust hierarchy** — "Make the primary message visually dominant; demote secondary nodes."
  - **Fix specific node** — opens the free-text fallback
- Free-text remains as the catch-all.

---

### Phase 3 — Federal context system (2–3 weeks)

The moat. None of this exists in generic AI tools.

**3.1 Agency selector**
- New dropdown in the Federal Context drawer: DoD / DHS / VA / HHS / GSA / Civilian Other.
- Each preset injects house-style hints into the prompt (DoD = utilitarian, blue-gray; VA = warmer civilian tones; civilian = USWDS-strict; etc.).
- Store presets as a const map in `src/lib/agency-presets.ts`.

**3.2 Proposal section selector**
- Dropdown: Technical Approach / Management Approach / Past Performance / Staffing Plan / Transition / Risk / Quality / Other.
- Each section maps to a distinct visual rhetoric prompt fragment (e.g., Staffing → org-chart hierarchy bias; Transition → before/after pipeline bias).
- Lives in `src/lib/section-presets.ts`.

**3.3 Win-themes field**
- New text field in the Federal Context drawer (3–5 short lines): "Win themes / discriminators."
- Injected into the prompt as: *"Visually emphasize these discriminators: [...]."*
- Persisted per-session in `localStorage`.

**3.4 Acronym glossary**
- Textarea where the user pastes a glossary (one per line, `ACRN — full meaning`), or accepts an auto-extracted list from RFP upload (Phase 4).
- Injected into the prompt as: *"Render these acronyms exactly as written, do not invent or expand them: [...]."*
- Fixes the #1 visible quality bug in current renders (image models routinely garble dense govcon acronyms).

**3.5 Brand-kits persistence**
- Save named brand kits (logo + palette + typography + default agency) to `localStorage` keyed by name.
- "Save current as brand kit" + "Load brand kit" buttons in the Brand drawer.
- Schema lives in `src/lib/brand-kit.ts`. Migration target: IndexedDB (and eventually backend in Phase 6).

---

### Phase 4 — RFP intelligence (CORE FEATURE) (2–3 weeks)

This is what makes the tool a serious procurement asset rather than a clever image generator. **Make sure all parts are optional — users without an RFP must be able to generate freely.**

**4.1 Document upload**
- Add a "Solicitation Context" drawer (top of the form, above Brand).
- Accept: PDF, DOCX, plain text, paste-text. Multiple files allowed (RFP + amendments + Q&A + supplementary research).
- Parse PDF client-side with `pdf.js`. Parse DOCX with `mammoth`.
- File-type icons + remove button per upload. Cumulative token counter visible to the user.

**4.2 GPT-5 two-pass extraction**
- New lib: `src/lib/gpt5.ts`.
- **Model:** `gpt-5` (snapshot `gpt-5-2025-08-07` recommended for pinning).
- **Pass 1 (extract):** `reasoning.effort: high`, structured-output mode. Pull:
  - Section L (proposal instructions) page-limit and format constraints
  - Section M (evaluation factors) ordered list with weights
  - PWS / SOW core themes and recurring keywords
  - Full acronym list (feeds Phase 3.4)
  - Any explicit color / branding / typography cues mentioned in the RFP
- Output schema enforced via JSON Schema. Cache the result in `sessionStorage` keyed by document hash.
- **Pass 2 (render-time):** feed `topic + win themes + cached Pass-1 JSON` into the image-prompt builder. User never sees the JSON unless they expand a "Show RFP context" toggle.

**4.3 Prompt caching**
- Use OpenAI prompt caching (`$0.125/M cached vs $1.25/M fresh`) on the RFP analysis blob — same blob is re-used across every render in a session.
- For a 50-page RFP (~30K tokens), drops re-render cost from ~$0.04 to ~$0.004 per call.

**4.4 Token budget guard**
- If combined uploads exceed ~350K tokens (gpt-5 context is 400K, leave 50K headroom for prompt + reasoning), warn the user and offer:
  - Keep the most recent N pages
  - Auto-summarize the older content first
  - Cancel and reduce manually

**4.5 Citation sidecar**
- After each render, output a small metadata block visible under the variant: *"This graphic emphasizes Section M.4.2 (Technical Approach) and PWS §3.1.4."*
- Export option: download sidecar as `.txt` alongside the image for the proposal audit trail.

**4.6 Plan-then-render (the "thinking" step)**
- Before each image call, route `topic + win themes + RFP context + style settings` through `gpt-5` (`reasoning.effort: medium`) to produce a structured infographic schema (nodes, edges, labels, hierarchy, recommended layout).
- Image model receives the schema as part of its prompt.
- **Single biggest quality lift in the entire roadmap** — it's what gets the output out of "AI-decorative" territory and into "actually legible diagrams."
- Optional per-render: a "Quick render (skip planning)" toggle for speed-critical iterations.

---

### Phase 5 — Style fingerprint, series mode (1–2 weeks)

The capture-team killer feature. Generic AI tools physically cannot do this.

**5.1 Fingerprint capture**
- On first successful render, snapshot a `StyleFingerprint`:
  - Active palette hexes (in order)
  - Typography family
  - Density / flow / orientation
  - Accessibility + iconography settings
  - The actual first-image base64 (for use as a `gpt-image-2` reference image)
- Persist in `sessionStorage`. Migrate to IndexedDB / backend in Phase 6.

**5.2 "+ Next Graphic" mode**
- New button in the right pane: "Add to series."
- Locks all style settings, clears only the prompt field, retains the fingerprint reference image.
- Subsequent renders pass the fingerprint image into `/v1/images/edits` (OpenAI) and `inlineData` (Gemini) so the output stays visually consistent across the series.

**5.3 Series library**
- Sidebar drawer showing thumbnails of every graphic in the current series, with editable names.
- Export the entire series as a numbered zip (`graphic-01.png`, `graphic-02.png`, ...).
- Persists for the session only until Phase 6.

---

### Phase 6 — Backend, auth, multi-user (BACKBURNER)

Flagged for visibility — not in the near-term build queue. Decide before starting whether v3 is single-user-per-org or full team-tier; the schema branches significantly.

- Replace the hardcoded admin gate at `src/App.tsx:324` with real auth. Recommended: **Clerk** (fastest to ship) or **Supabase Auth** (bundles with DB/storage).
- Per-user persistent storage of: render history, brand kits, series, RFP analyses, win themes, named templates.
- Cross-team brand-kit sharing.
- Per-user / per-org spend tracking (see Cost Risks below).
- Migrate `localStorage` / `sessionStorage` artifacts to backend.

---

## 4. Cost risks to instrument

| Per-render cost (max case) | Estimate |
|---|---|
| 4 image renders (2 OpenAI + 2 Gemini) | ~$0.16–$0.20 |
| 1 GPT-5 planning call (`reasoning.effort: medium`) | ~$0.005–$0.02 |
| 1 GPT-5 RFP analysis (cached, 30K input) | ~$0.004 cached, ~$0.04 first-pass |
| 1 Real-ESRGAN upscale on export | ~$0.001 |
| **Total per generate-then-export** | **~$0.20 typical, ~$0.30 first-render-with-RFP** |

- Add a per-session spend counter visible in the footer.
- Hard cap monthly spend per user once auth lands (Phase 6).

---

## 5. Open questions for the developer

1. **PDF parsing library** — `pdf.js` (proven, heavy) vs. `pdf-parse` (lighter, server-friendly). Recommend `pdf.js` since we're client-only for now.
2. **Upscaling vendor** — Replicate (Real-ESRGAN, easy API, ~$0.001/img) vs. self-hosted vs. native browser bicubic (free but lower quality). Recommend Replicate.
3. **Storage when backburner items move up** — Supabase (Postgres + Storage + Auth in one) vs. Firebase vs. roll-your-own. Recommend Supabase.
4. **Snapshot pinning** — pin to `gpt-image-2-2026-04-21` and `gpt-5-2025-08-07` in production, or always-latest aliases? Recommend pinning to avoid silent model drift on a customer-facing tool.
5. **Streaming UI pattern** — `useReducer` with per-slot status (`pending` / `rendering` / `done` / `error`) vs. simple array of nullable strings. Recommend the reducer pattern given the 4-variant × 2-engine matrix.
6. **Confirm Gemini max-edge output** — research current `nano-banana-pro-preview` max-resolution behavior, since the upscale path depends on its native ceiling.

---

## 6. Explicitly out of scope

Discussed and consciously cut. **Do not build:**

- Auto-quality scoring or ranked variants (decision: let the user judge)
- Word-doc / PowerPoint embed-preview
- Chat / conversational interface
- Multi-slide deck builder
- Storyboard / multi-panel narrative mode
- Annotation / markup-layer revisions
- Real-time collaboration
- Auto-rewriting the user's prompt before render
- CUI / classification warning copy (commercial API terms cover non-training; classification handling is a downstream compliance decision, not a UX concern)
- Local / on-prem LLM fallback

---

## 7. Suggested sprint order

| Sprint | Phase | Deliverable |
|---|---|---|
| 1–2 | Phase 1 | Streaming + 2+2 parallel + prompt-on-top UI |
| 3–4 | Phase 2 | Max-DPI native + Real-ESRGAN upscale + negative prompts + structured revisions |
| 5–7 | Phase 3 | Agency + section + win themes + acronyms + brand kits |
| 8–10 | Phase 4 | RFP upload + GPT-5 two-pass + plan-then-render + citations |
| 11–12 | Phase 5 | Style fingerprint + series mode |
| Later | Phase 6 | Backend + auth + multi-user (backburner) |

**Total: ~12 sprints (~3 months) to reach a defensible best-in-class state.**
