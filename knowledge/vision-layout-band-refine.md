# Vision layout band refine (gap snap)

**Date:** 2026-08-16  
**Code:** `refineVisionLayoutBands` / `sanitizeVisionLayoutNotes` in `src/vision-layout.ts` (v0.2.0)  
**Triggered by:** MSQ scan `cap_6c74829b…` — ticker crop missed blue bar sitting in a ~72px gap.

## Pipeline order

`mergeVisionLayoutBands` → **`refineVisionLayoutBands`** → `renumberVisionBands`

## What refine does

1. **Top chrome:** if first band starts within `y ≤ 0.08`, pull to `y=0` (nav over hero).
2. **Gap snap:** gaps `≤ 0.045` go to the thinner neighbor (undershot tickers/dividers).
3. **Tail:** small uncovered bottom absorbed into last band.
4. **Micro merge:** height `< 0.025` (e.g. legal strip) merges into previous.
5. **Min height:** prefer `≥ 0.04` by borrowing from a larger neighbor (better VL crops).

## Notes

Last-tile prose (`The tile captures…`) is stripped via `sanitizeVisionLayoutNotes` before persist.
