<!-- SoT also on package derived/rebuild-brief.md for cap_3f48fbb23e074fd6ae68540760f01b92 -->
# Rebuild brief — https://www.porsche.com/germany/

Capture: `cap_3f48fbb23e074fd6ae68540760f01b92` · generated 2026-08-16T07:49:20.459Z

## Page reading

The page employs a luxury automotive archetype characterized by a dominant, full-bleed Brand Hero that immediately captures attention with high-contrast monochrome visuals. Below the fold, the layout transitions into a structured Product Inventory system using rounded card grids to showcase vehicle ranges, supported by minimalist flat design principles. The visual style leverages the proprietary Porsche Next sans-serif typeface to maintain brand consistency and readability across all sections. Conversion patterns are driven by clear Primary Action buttons embedded within the hero and inventory components, guiding users toward configuration or purchase flows.

## Direction

- Patterns: Brand Hero, Product Inventory, Standard Layout
- Style labels: Porsche Next sans-serif, high-contrast monochrome, rounded card UI, minimalist flat design
- Flow: hero

## Hero / media bands

### hero · `media` · sec_b6779bbfe282c974e5dc

This above-fold hero section is defined by a tall, full-bleed media element that occupies the entire 1778x1000px viewport area. The composition relies on an absolute positioning strategy where the media_large role covers the background completely using object-fit: contain to preserve aspect ratio while centering the co
- Media role: hero (contain)
- Align: text=left cta=left

## Hypotheses

- **page_archetype**: Luxury Brand Showcase with Commerce Integration (0.95) — The combination of a cinematic Brand Hero and a detailed Product Inventory section indicates a dual purpose of brand storytelling and direct sales enablement.
- **visual_style**: High-Contrast Monochrome with Rounded UI Elements (0.92) — Visual style labels confirm the use of #000000ff/#fafbffff contrast and 12px/24px border radii, creating a modern yet premium aesthetic.
- **layout_system**: Full-Bleed Media Above Fold with Grid-Based Content Below (0.90) — The hero occupies the entire viewport (1778x1000px), while subsequent sections utilize a Card Grid for inventory status, establishing a clear vertical hierarchy.
- **component_pattern**: Media-Centric Hero with Overlay Actions (0.88) — The hero section is defined by tall, full-bleed media elements, likely containing overlay text and Primary Action buttons for immediate engagement.
- **hierarchy**: Typographic Hierarchy via Proprietary Sans-Serif (0.95) — The consistent use of 'Porsche Next' font family ensures strong typographic identity and legibility across the high-contrast background.
- **responsive_strategy**: Fluid Media Containers with Fixed Aspect Ratios (0.85) — The specific viewport dimensions mentioned for the hero suggest a fixed aspect ratio strategy to preserve image integrity on different screen sizes.

## Rebuild constraints

1. One composition first viewport: brand/media hero, one headline, one short line, one CTA group.
2. Prefer full-bleed photography with dark scrim; avoid card grids in the hero.
3. Reuse measured signatures as stack recipes; do not invent off-evidence chrome.
4. Skip cookie/CMP chrome.

