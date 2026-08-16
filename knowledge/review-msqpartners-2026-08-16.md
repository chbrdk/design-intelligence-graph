# Review: MSQ partners scan (2026-08-16)

**Job:** `job_20260816202813_bdf6a94a`  
**Capture:** `cap_6c74829b55de4477b7264f97baa4f0a2`  
**URL:** `https://www.msqpartners.com/`  
**Model:** `qwen/qwen3.7-flash` · status complete · ~$0.0014

## Verdict

Usable directionally: page catalog + UX summary + 8 meaningful full-width bands with good labels. Not ship-quality on band edges yet.

## What works

- Correct page type / atmosphere / color mood / above-fold job
- UX flow + strengths/risks present (`vision_page_ux` complete; folded into summary)
- Bands: hero → intro → (ticker intent) → why MSQ → work → news → B Corp → footer
- Full-width (`x=0`, `width=1`); section VL looks strong for major bands
- Cost still Flash-friendly

## Improvements (priority)

1. **Thin-band / gap bug (ticker):** `band_3` crop is mostly lavender + blue edge; real ticker text sits in ~72px **gap** before `band_4`. Fix: expand short bands to color-change boundaries; snap/merge gaps; min meaningful height after snap.
2. **Nav gap:** hero starts at `y≈0.025` — include chrome in hero (`y=0`) or emit explicit `nav` band.
3. **Drop micro-bands:** `band_9` legal strip `h≈0.01` adds noise; merge into footer.
4. **Layout `notes`:** still last-tile prose (“The tile captures…”); strip tile notes from page layout doc.
5. **DOM `section_crops`:** still non-vision geometry (incl. width≈1px junk); either drive crops from vision bands only or hide from Library.
6. **Legacy DOM hypotheses:** Poppins / monochrome still pollute L3; prefer vision_page as SoT for style summary in UI.
