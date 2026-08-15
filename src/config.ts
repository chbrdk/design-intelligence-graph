import type { ViewportDefinition } from "./types.js";

export const VERSION = "0.1.0";

export const CANONICAL_VIEWPORTS: ViewportDefinition[] = [
  { name: "mobile", width: 390, height: 844, deviceScaleFactor: 1 },
  { name: "tablet", width: 768, height: 1024, deviceScaleFactor: 1 },
  { name: "desktop", width: 1440, height: 1000, deviceScaleFactor: 1 }
];

export const STYLE_PROPERTIES = [
  "display", "position", "top", "right", "bottom", "left", "inset", "box-sizing", "width", "height", "min-width", "min-height",
  "max-width", "max-height", "margin-top", "margin-right", "margin-bottom", "margin-left",
  "padding-top", "padding-right", "padding-bottom", "padding-left", "gap", "row-gap",
  "column-gap", "overflow-x", "overflow-y", "z-index", "opacity", "visibility",
  "font-family", "font-size", "font-style", "font-weight", "font-stretch", "line-height",
  "letter-spacing", "text-align", "text-transform", "text-decoration-line", "white-space",
  "color", "background-color", "background-image", "border-top-width", "border-right-width",
  "border-bottom-width", "border-left-width", "border-top-color", "border-right-color",
  "border-bottom-color", "border-left-color", "border-top-left-radius", "border-top-right-radius",
  "border-bottom-right-radius", "border-bottom-left-radius", "box-shadow", "filter",
  "backdrop-filter", "object-fit", "object-position", "aspect-ratio", "flex-direction",
  "flex-wrap", "justify-content", "align-items", "align-content", "align-self", "flex-grow",
  "flex-shrink", "flex-basis", "order", "grid-template-columns", "grid-template-rows",
  "grid-auto-flow", "grid-column", "grid-row", "transform", "transform-origin", "cursor",
  "pointer-events", "user-select", "touch-action", "transition-property", "transition-duration",
  "transition-delay", "transition-timing-function", "animation-name", "animation-duration",
  "animation-delay", "animation-timing-function", "animation-iteration-count", "animation-direction",
  "animation-fill-mode", "animation-play-state"
] as const;
