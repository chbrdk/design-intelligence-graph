/**
 * Closed catalog of fine-grained artboard / campaign craft metrics (~300).
 * Spec: knowledge/graphic-craft-metrics.md
 */

export const GRAPHIC_CRAFT_METRICS_VERSION = "0.3.0" as const;

export type GraphicMetricKind = "score" | "enum" | "boolean" | "hex" | "text";

export type GraphicMetricDef = {
  id: string;
  group: string;
  kind: GraphicMetricKind;
  /** For enum metrics — closed vocab. */
  vocab?: readonly string[];
  /** Human label for prompts / UI. */
  label: string;
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

/** Canonical metric definitions — keep count near 300; IDs are stable SSOT. */
export const GRAPHIC_CRAFT_METRIC_DEFS: readonly GraphicMetricDef[] = [
  // —— format (18)
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
  score("format.trim_mark_feel", "format", "Trim / crop-mark feel"),
  score("format.gutter_awareness", "format", "Gutter / fold awareness"),
  bool("format.multi_panel", "format", "Multi-panel / diptych feel"),
  en("format.print_finish_hint", "format", "Print finish hint", [
    "matte",
    "gloss",
    "uncoated",
    "metallic",
    "screen",
    "unclear"
  ]),
  score("format.corner_radius_feel", "format", "Corner radius / soft-edge feel"),
  bool("format.device_frame", "format", "Device / bezel frame present"),
  score("format.canvas_utilization", "format", "Canvas utilization"),
  en("format.ratio_lock", "format", "Ratio lock intent", [
    "strict",
    "loose",
    "crop_flexible",
    "unclear"
  ]),
  score("format.dpi_print_feel", "format", "Print DPI / resolution feel"),
  score("format.safe_margin_symmetry", "format", "Safe-margin symmetry"),

  // —— composition (31)
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
  score("comp.rule_of_thirds", "composition", "Rule-of-thirds adherence"),
  score("comp.frame_within_frame", "composition", "Frame-within-frame"),
  score("comp.leading_lines", "composition", "Leading lines strength"),
  score("comp.vanishing_point", "composition", "Vanishing-point clarity"),
  score("comp.mass_vs_void", "composition", "Mass-vs-void contrast"),
  score("comp.peripheral_anchors", "composition", "Peripheral anchors"),
  score("comp.z_axis_stacking", "composition", "Z-axis stacking clarity"),
  score("comp.golden_ratio_hint", "composition", "Golden-ratio hint"),
  score("comp.radial_focus", "composition", "Radial focus strength"),
  score("comp.triadic_anchors", "composition", "Triadic anchor layout"),
  score("comp.horizon_line", "composition", "Horizon-line discipline"),
  score("comp.entry_exit_flow", "composition", "Entry / exit visual flow"),
  score("comp.occlusion_control", "composition", "Occlusion control"),
  score("comp.scale_jump", "composition", "Scale-jump drama"),
  score("comp.negative_shape", "composition", "Negative-shape intentionality"),

  // —— space (18)
  score("space.overall", "space", "Negative space amount"),
  score("space.quiet_zone_brand", "space", "Quiet zone around brand"),
  score("space.quiet_zone_claim", "space", "Quiet zone around claim"),
  score("space.edge_breathing", "space", "Edge breathing room"),
  score("space.crowding_risk", "space", "Crowding risk"),
  en("space.feel", "space", "Space feel", ["tight", "balanced", "airy"]),
  score("space.inter_object_gap", "space", "Inter-object gap consistency"),
  score("space.optical_padding", "space", "Optical padding quality"),
  score("space.island_isolation", "space", "Island isolation of hero"),
  score("space.cluster_tightness", "space", "Cluster tightness"),
  score("space.white_space_shape", "space", "White-space shape intentionality"),
  score("space.bottom_weight", "space", "Bottom-heavy weight"),
  score("space.top_weight", "space", "Top-heavy weight"),
  score("space.gutter_rhythm", "space", "Gutter rhythm consistency"),
  score("space.column_breathing", "space", "Column breathing"),
  score("space.micro_macro_gap", "space", "Micro vs macro gap contrast"),
  score("space.corner_relief", "space", "Corner relief"),
  score("space.overlap_void", "space", "Overlap-void clarity"),

  // —— typography (34)
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
  score("type.kerning_craft", "type", "Kerning craft"),
  score("type.optical_margin", "type", "Optical margin alignment"),
  score("type.outline_stroke", "type", "Outline / stroke type"),
  score("type.fill_vs_knockout", "type", "Fill vs knockout type"),
  score("type.drop_cap", "type", "Drop-cap / initial strength"),
  score("type.hyphenation_mess", "type", "Hyphenation mess risk"),
  score("type.baseline_grid", "type", "Baseline-grid discipline"),
  en("type.alignment_mode", "type", "Alignment mode", [
    "left",
    "center",
    "right",
    "justified",
    "mixed",
    "none"
  ]),
  score("type.xheight_feel", "type", "X-height feel"),
  score("type.condensed_pressure", "type", "Condensed pressure"),
  score("type.expanded_display", "type", "Expanded display width"),
  score("type.variable_axis_play", "type", "Variable-axis play"),
  score("type.super_sub_script", "type", "Super/subscript craft"),
  score("type.ligature_craft", "type", "Ligature craft"),
  score("type.rivers_orphans", "type", "Rivers / orphans risk"),
  score("type.color_fill_type", "type", "Colored fill type strength"),

  // —— color (30)
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
  score("color.analogous_harmony", "color", "Analogous harmony"),
  score("color.bw_plus_one", "color", "B/W + one accent"),
  score("color.skin_tone_care", "color", "Skin-tone care"),
  score("color.brand_tint_lock", "color", "Brand tint lock"),
  score("color.halftone_feel", "color", "Halftone / print-screen feel"),
  score("color.transparency_layers", "color", "Transparency layering"),
  hex("color.secondary_hex", "color", "Secondary hex"),
  score("color.complementary_clash", "color", "Complementary clash energy"),
  score("color.triadic_spread", "color", "Triadic spread"),
  score("color.pastel_wash", "color", "Pastel wash"),
  score("color.earth_tone", "color", "Earth-tone grounding"),
  score("color.fluorescent_pop", "color", "Fluorescent pop"),
  score("color.sepia_vintage", "color", "Sepia / vintage cast"),
  score("color.invert_knockout", "color", "Invert / knockout color play"),
  hex("color.highlight_hex", "color", "Highlight hex"),

  // —— imagery / photo (26)
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
  score("image.grain_film", "image", "Grain / film texture"),
  score("image.motion_blur", "image", "Motion blur"),
  score("image.reflection_use", "image", "Reflection use"),
  score("image.prop_storytelling", "image", "Prop storytelling"),
  score("image.environment_context", "image", "Environment context"),
  score("image.silhouette_strength", "image", "Silhouette strength"),
  score("image.lens_flare", "image", "Lens flare / light leak"),
  score("image.color_grade_strength", "image", "Color-grade strength"),
  score("image.macro_detail", "image", "Macro detail feel"),
  score("image.wide_angle_distortion", "image", "Wide-angle distortion"),
  score("image.dutch_tilt", "image", "Dutch tilt energy"),
  score("image.backlight_rim", "image", "Backlight / rim light"),
  score("image.studio_vs_location", "image", "Studio vs location feel"),
  bool("image.multi_shot_collage", "image", "Multi-shot collage"),

  // —— illustration / graphic marks (18)
  score("illu.line_weight_drama", "illustration", "Line-weight drama"),
  score("illu.flat_vs_shaded", "illustration", "Flat vs shaded"),
  score("illu.vector_cleanliness", "illustration", "Vector cleanliness"),
  score("illu.hand_drawn_feel", "illustration", "Hand-drawn feel"),
  score("illu.icon_density", "illustration", "Icon density"),
  score("illu.pattern_repeat", "illustration", "Pattern repeat"),
  score("illu.geometric_rigor", "illustration", "Geometric rigor"),
  score("illu.organic_forms", "illustration", "Organic forms"),
  score("illu.sticker_cutout", "illustration", "Sticker / die-cut feel"),
  bool("illu.has_icons", "illustration", "Has icons / pictograms"),
  bool("illu.has_diagram", "illustration", "Has diagram / chart"),
  score("illu.isometric_depth", "illustration", "Isometric depth"),
  score("illu.pixel_art_feel", "illustration", "Pixel-art feel"),
  score("illu.ink_wash", "illustration", "Ink wash / brush"),
  score("illu.comic_panel", "illustration", "Comic panel rhythm"),
  score("illu.glyph_ornament", "illustration", "Glyph / ornament density"),
  score("illu.map_infographic", "illustration", "Map / infographic feel"),
  bool("illu.has_mascot", "illustration", "Has mascot / character"),

  // —— brand (20)
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
  score("brand.clear_space_ok", "brand", "Clear-space respect"),
  score("brand.monochrome_adapt", "brand", "Mono mark adaptation"),
  score("brand.partner_lockup", "brand", "Partner / co-brand lockup"),
  score("brand.campaign_extension", "brand", "Campaign system extension"),
  bool("brand.has_tagline", "brand", "Tagline present"),
  score("brand.equity_signal", "brand", "Brand equity signal"),
  score("brand.endorsement_mark", "brand", "Endorsement / seal mark"),
  score("brand.subbrand_clarity", "brand", "Sub-brand clarity"),
  score("brand.retailer_lockup", "brand", "Retailer / channel lockup"),
  score("brand.anniversary_mark", "brand", "Anniversary / badge mark"),
  bool("brand.has_claim_device", "brand", "Claim device / mnemonic"),
  score("brand.voice_match", "brand", "Visual voice match to brand"),

  // —— tone / energy (23)
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
  score("tone.clinical", "tone", "Clinical / medical"),
  score("tone.nostalgic", "tone", "Nostalgic"),
  score("tone.avant_garde", "tone", "Avant-garde"),
  score("tone.sensual", "tone", "Sensual / intimate"),
  score("tone.sporty", "tone", "Sporty / kinetic"),
  score("tone.eco", "tone", "Eco / natural"),
  score("tone.festive", "tone", "Festive / celebratory"),
  score("tone.authoritative", "tone", "Authoritative"),
  score("tone.whimsical", "tone", "Whimsical"),
  score("tone.industrial", "tone", "Industrial"),
  score("tone.poetic", "tone", "Poetic / lyrical"),

  // —— material / finish (16)
  score("mat.paper_texture", "material", "Paper texture feel"),
  score("mat.metallic_ink", "material", "Metallic ink feel"),
  score("mat.soft_touch", "material", "Soft-touch feel"),
  score("mat.glass_reflect", "material", "Glass / specular reflect"),
  score("mat.fabric_drape", "material", "Fabric / drape"),
  score("mat.stone_mineral", "material", "Stone / mineral"),
  score("mat.plastic_product", "material", "Plastic product sheen"),
  score("mat.digital_glow", "material", "Digital screen glow"),
  score("mat.foil_stamp", "material", "Foil stamp feel"),
  score("mat.emboss_deboss", "material", "Emboss / deboss feel"),
  score("mat.wood_grain", "material", "Wood grain"),
  score("mat.concrete_brutal", "material", "Concrete / brutal material"),
  score("mat.liquid_chrome", "material", "Liquid chrome"),
  score("mat.frosted_glass", "material", "Frosted glass"),
  score("mat.velvet_matte", "material", "Velvet matte"),
  score("mat.carbon_tech", "material", "Carbon / tech weave"),

  // —— narrative / campaign (18)
  score("narr.story_beat_clarity", "narrative", "Story beat clarity"),
  score("narr.tension_arc", "narrative", "Tension / conflict arc"),
  score("narr.benefit_clarity", "narrative", "Benefit clarity"),
  score("narr.proof_signal", "narrative", "Proof / evidence signal"),
  score("narr.emotion_hook", "narrative", "Emotion hook"),
  score("narr.curiosity_gap", "narrative", "Curiosity gap"),
  score("narr.cultural_code", "narrative", "Cultural code density"),
  en("narr.pov", "narrative", "Point of view", [
    "brand",
    "customer",
    "product",
    "scene",
    "abstract",
    "unclear"
  ]),
  text("narr.theme_guess", "narrative", "Theme guess"),
  text("narr.audience_guess", "narrative", "Audience guess"),
  score("narr.before_after", "narrative", "Before/after implication"),
  score("narr.problem_agitation", "narrative", "Problem agitation"),
  score("narr.social_proof", "narrative", "Social-proof signal"),
  score("narr.seasonal_hook", "narrative", "Seasonal hook"),
  score("narr.local_relevance", "narrative", "Local / geo relevance"),
  score("narr.aspiration_gap", "narrative", "Aspiration gap"),
  text("narr.hero_object", "narrative", "Hero object guess"),
  text("narr.conflict_label", "narrative", "Conflict label guess"),

  // —— craft risks (25) — higher = more risk
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
  score("risk.clipping", "risk", "Clipping / cut-off content"),
  score("risk.stock_cliche", "risk", "Stock cliché"),
  score("risk.ai_artifact", "risk", "AI artifact tell"),
  score("risk.over_sharpen", "risk", "Over-sharpen / halos"),
  score("risk.dead_space_waste", "risk", "Dead-space waste"),
  score("risk.logo_stretch", "risk", "Logo stretch / warp"),
  score("risk.moire", "risk", "Moire / pattern clash"),
  score("risk.banding", "risk", "Gradient banding"),
  score("risk.compression_blockies", "risk", "Compression blockies"),
  score("risk.uneven_bleed", "risk", "Uneven bleed crop"),
  score("risk.orphan_cta", "risk", "Orphan / floating CTA"),
  score("risk.color_clash", "risk", "Harsh color clash"),
  score("risk.too_many_fonts", "risk", "Too many typefaces"),
  score("risk.center_everything", "risk", "Center-everything laziness"),
  score("risk.lorem_placeholder", "risk", "Lorem / placeholder tell"),

  // —— production / content (23)
  bool("prod.cta_present", "production", "CTA present"),
  bool("prod.legal_present", "production", "Legal present"),
  bool("prod.qr_or_code", "production", "QR / code present"),
  bool("prod.price_or_offer", "production", "Price / offer present"),
  bool("prod.date_or_issue", "production", "Date / issue present"),
  score("prod.claim_strength", "production", "Claim strength"),
  score("prod.support_line_clarity", "production", "Support line clarity"),
  text("prod.primary_claim_guess", "production", "Primary claim guess"),
  bool("prod.has_url", "production", "URL / handle present"),
  bool("prod.has_phone", "production", "Phone present"),
  bool("prod.has_rating_stars", "production", "Rating / stars present"),
  score("prod.offer_urgency", "production", "Offer urgency"),
  score("prod.disclaimer_weight", "production", "Disclaimer weight"),
  text("prod.cta_label_guess", "production", "CTA label guess"),
  bool("prod.has_app_store_badge", "production", "App-store badge present"),
  bool("prod.has_social_handles", "production", "Social handles present"),
  bool("prod.has_barcode", "production", "Barcode present"),
  bool("prod.has_coupon", "production", "Coupon / code present"),
  score("prod.sku_specificity", "production", "SKU / product specificity"),
  score("prod.locale_clarity", "production", "Locale / language clarity"),
  score("prod.multi_language", "production", "Multi-language density"),
  text("prod.offer_guess", "production", "Offer / promo guess"),
  text("prod.secondary_claim_guess", "production", "Secondary claim guess")
] as const;

export const GRAPHIC_CRAFT_METRIC_IDS = GRAPHIC_CRAFT_METRIC_DEFS.map((d) => d.id);

export const GRAPHIC_CRAFT_METRIC_BY_ID: ReadonlyMap<string, GraphicMetricDef> = new Map(
  GRAPHIC_CRAFT_METRIC_DEFS.map((d) => [d.id, d])
);

export function graphicCraftMetricCount(): number {
  return GRAPHIC_CRAFT_METRIC_DEFS.length;
}
