/**
 * Closed catalog of fine-grained artboard / campaign craft metrics (~100).
 * Spec: knowledge/graphic-craft-metrics.md
 */

export const GRAPHIC_CRAFT_METRICS_VERSION = "0.1.0" as const;

export type GraphicMetricKind = "score" | "enum" | "boolean" | "hex" | "text";

export type GraphicMetricDef = {
  id: string;
  group: string;
  kind: GraphicMetricKind;
  /** For enum metrics — closed vocab. */
  vocab?: readonly string[];
  /** Human label for prompts / UI. */
  label: string;
  /** score metrics are always 0..1 */
};

function score(id: string, group: string, label: string): GraphicMetricDef {
  return { id, group, kind: "score", label };
}
function bool(id: string, group: string, label: string): GraphicMetricDef {
  return { id, group, kind: "boolean", label };
}
function en(
  id: string,
  group: string,
  label: string,
  vocab: readonly string[]
): GraphicMetricDef {
  return { id, group, kind: "enum", label, vocab };
}
function hex(id: string, group: string, label: string): GraphicMetricDef {
  return { id, group, kind: "hex", label };
}
function text(id: string, group: string, label: string): GraphicMetricDef {
  return { id, group, kind: "text", label };
}

/** Canonical metric definitions — keep count near 100; IDs are stable SSOT. */
export const GRAPHIC_CRAFT_METRIC_DEFS: readonly GraphicMetricDef[] = [
  // —— format (8)
  en("format.orientation", "format", "Orientation", ["portrait", "landscape", "square"]),
  en("format.aspect_family", "format", "Aspect family", [
    "1:1",
    "4:5",
    "9:16",
    "16:9",
    "3:2",
    "2:3",
    "A-series",
    "other"
  ]),
  en("format.size_class", "format", "Size class", ["thumbnail", "social", "print", "ooh", "unknown"]),
  score("format.edge_to_edge", "format", "Edge-to-edge fill"),
  bool("format.bleed_intended", "format", "Bleed intended"),
  bool("format.safe_zone_respected", "format", "Safe zone respected"),
  score("format.crop_aggressiveness", "format", "Crop aggressiveness"),
  en("format.channel_fit", "format", "Channel fit", [
    "print_ad",
    "social_feed",
    "story",
    "key_visual",
    "ooh",
    "packaging",
    "mixed",
    "unclear"
  ]),

  // —— composition (16)
  en("comp.focal_zone", "composition", "Focal zone", [
    "center",
    "upper_third",
    "lower_third",
    "left",
    "right",
    "corner",
    "split",
    "diffuse"
  ]),
  en("comp.focal_role", "composition", "Focal role", [
    "product",
    "face",
    "claim",
    "brand",
    "scene",
    "number",
    "other"
  ]),
  score("comp.hierarchy_clarity", "composition", "Hierarchy clarity"),
  score("comp.balance", "composition", "Visual balance"),
  score("comp.symmetry", "composition", "Symmetry"),
  score("comp.asymmetry_tension", "composition", "Asymmetry tension"),
  score("comp.grid_discipline", "composition", "Grid discipline"),
  score("comp.margin_discipline", "composition", "Margin discipline"),
  score("comp.overlap_complexity", "composition", "Overlap complexity"),
  score("comp.layer_depth", "composition", "Layer depth"),
  score("comp.diagonal_energy", "composition", "Diagonal energy"),
  score("comp.centering_bias", "composition", "Centering bias"),
  score("comp.split_ratio_clarity", "composition", "Split ratio clarity"),
  score("comp.anchor_strength", "composition", "Anchor strength"),
  en("comp.layout_family", "composition", "Layout family", [
    "full-bleed-product",
    "centered-lockup",
    "split-claim-media",
    "editorial-column",
    "poster-stack",
    "collage",
    "other"
  ]),
  score("comp.reading_path_clarity", "composition", "Reading path clarity"),

  // —— negative space (6)
  score("space.overall", "space", "Negative space amount"),
  score("space.quiet_zone_brand", "space", "Quiet zone around brand"),
  score("space.quiet_zone_claim", "space", "Quiet zone around claim"),
  score("space.edge_breathing", "space", "Edge breathing room"),
  score("space.crowding_risk", "space", "Crowding risk"),
  en("space.feel", "space", "Space feel", ["tight", "balanced", "airy"]),

  // —— typography (18)
  score("type.display_dominance", "type", "Display type dominance"),
  score("type.scale_contrast", "type", "Type scale contrast"),
  score("type.weight_contrast", "type", "Weight contrast"),
  score("type.tracking_openness", "type", "Tracking openness"),
  score("type.leading_openness", "type", "Leading openness"),
  score("type.case_impact", "type", "Case impact (caps energy)"),
  score("type.italic_oblique_use", "type", "Italic/oblique use"),
  score("type.alignment_discipline", "type", "Alignment discipline"),
  score("type.line_length_comfort", "type", "Line length comfort"),
  score("type.legibility", "type", "Legibility"),
  score("type.on_image_contrast", "type", "Type-on-image contrast"),
  score("type.ornament_density", "type", "Type ornament density"),
  en("type.family_feel", "type", "Family feel", [
    "serif_editorial",
    "sans_geometric",
    "sans_grotesk",
    "display_expressive",
    "mono_tech",
    "script",
    "mixed",
    "unclear"
  ]),
  en("type.case_mode", "type", "Case mode", ["all_caps", "title", "sentence", "mixed", "none"]),
  bool("type.multiline_claim", "type", "Multiline claim"),
  bool("type.stacked_words", "type", "Stacked word lockup"),
  score("type.number_as_hero", "type", "Number-as-hero strength"),
  score("type.legal_micro_presence", "type", "Legal micro presence"),

  // —— color (15)
  en("color.value_key", "color", "Value key", ["light", "dark", "mixed"]),
  en("color.temperature", "color", "Temperature", ["warm", "cool", "neutral", "mixed"]),
  score("color.saturation", "color", "Saturation intensity"),
  score("color.contrast_punch", "color", "Contrast punch"),
  score("color.chroma_count_feel", "color", "Chroma count feel"),
  score("color.accent_clarity", "color", "Accent clarity"),
  score("color.ground_dominance", "color", "Ground dominance"),
  score("color.gradient_use", "color", "Gradient use"),
  score("color.duotone_feel", "color", "Duotone feel"),
  score("color.neon_signal", "color", "Neon / electric signal"),
  score("color.muted_editorial", "color", "Muted editorial feel"),
  hex("color.dominant_hex", "color", "Dominant hex"),
  hex("color.accent_hex", "color", "Accent hex"),
  hex("color.ground_hex", "color", "Ground hex"),
  text("color.mood_label", "color", "Mood label"),

  // —— imagery (12)
  en("image.media_mode", "image", "Media mode", [
    "photo",
    "illustration",
    "3d",
    "typography_only",
    "collage",
    "mixed"
  ]),
  score("image.product_presence", "image", "Product presence"),
  score("image.face_presence", "image", "Face / people presence"),
  score("image.texture_richness", "image", "Texture richness"),
  score("image.depth_of_field_feel", "image", "Depth-of-field feel"),
  score("image.overlay_strength", "image", "Overlay / scrim strength"),
  score("image.cutout_sharpness", "image", "Cutout sharpness"),
  score("image.realism", "image", "Realism"),
  score("image.abstractness", "image", "Abstractness"),
  score("image.background_busyness", "image", "Background busyness"),
  bool("image.full_bleed_photo", "image", "Full-bleed photo"),
  score("image.shadow_drama", "image", "Shadow drama"),

  // —— brand (8)
  score("brand.mark_presence", "brand", "Brand mark presence"),
  score("brand.mark_prominence", "brand", "Brand mark prominence"),
  en("brand.mark_placement", "brand", "Mark placement", [
    "top_left",
    "top_right",
    "bottom_left",
    "bottom_right",
    "center",
    "integrated",
    "absent",
    "unclear"
  ]),
  score("brand.lockup_discipline", "brand", "Lockup discipline"),
  score("brand.wordmark_clarity", "brand", "Wordmark clarity"),
  score("brand.foreign_mark_risk", "brand", "Foreign mark risk"),
  bool("brand.system_feel", "brand", "Brand-system feel"),
  score("brand.consistency_signal", "brand", "Consistency signal"),

  // —— tone / energy (12)
  score("tone.luxury", "tone", "Luxury"),
  score("tone.editorial", "tone", "Editorial"),
  score("tone.corporate", "tone", "Corporate"),
  score("tone.playful", "tone", "Playful"),
  score("tone.brutal", "tone", "Brutal / raw"),
  score("tone.minimal", "tone", "Minimal"),
  score("tone.urgency", "tone", "Urgency"),
  score("tone.warmth", "tone", "Warmth"),
  score("tone.tech", "tone", "Tech"),
  score("tone.heritage", "tone", "Heritage"),
  score("tone.youth", "tone", "Youth / street"),
  score("tone.calm", "tone", "Calm"),

  // —— craft risks (10) — higher = more risk
  score("risk.busy_center", "risk", "Busy center"),
  score("risk.tiny_legal_collision", "risk", "Tiny legal collision"),
  score("risk.low_contrast_type", "risk", "Low-contrast type"),
  score("risk.edge_collision", "risk", "Edge collision"),
  score("risk.watermark_spam", "risk", "Watermark spam"),
  score("risk.equal_three_icons", "risk", "Equal three-icon row"),
  score("risk.fake_web_hero_bands", "risk", "Fake web hero bands"),
  score("risk.generic_gradient", "risk", "Generic purple gradient"),
  score("risk.illegible_micro", "risk", "Illegible microcopy"),
  score("risk.craft_thin", "risk", "Craft-thin empty canvas"),

  // —— production / content (8)
  bool("prod.cta_present", "production", "CTA present"),
  bool("prod.legal_present", "production", "Legal present"),
  bool("prod.qr_or_code", "production", "QR / code present"),
  bool("prod.price_or_offer", "production", "Price / offer present"),
  bool("prod.date_or_issue", "production", "Date / issue present"),
  score("prod.claim_strength", "production", "Claim strength"),
  score("prod.support_line_clarity", "production", "Support line clarity"),
  text("prod.primary_claim_guess", "production", "Primary claim guess")
] as const;

export const GRAPHIC_CRAFT_METRIC_IDS = GRAPHIC_CRAFT_METRIC_DEFS.map((d) => d.id);

export const GRAPHIC_CRAFT_METRIC_BY_ID: ReadonlyMap<string, GraphicMetricDef> = new Map(
  GRAPHIC_CRAFT_METRIC_DEFS.map((d) => [d.id, d])
);

export function graphicCraftMetricCount(): number {
  return GRAPHIC_CRAFT_METRIC_DEFS.length;
}
