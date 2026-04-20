// Space Manager constants
// Rule: only true constants live here — values that are design decisions
// independent of any specific diagram's content.
// Gap sizes, component sizes, and label dimensions are computed dynamically
// by the Space Manager from diagram content and plugin size guides.

// Canvas
export const CANVAS_INITIAL_WIDTH = 1000  // default starting width; extends if content requires

// Spacing minimums — breathing room that must always exist regardless of content
export const MIN_PADDING = 40  // canvas-edge to nearest component
export const MIN_GAP     = 24  // minimum space between any two adjacent components

// Swim-lane layout
export const LANE_HEADER  = 40  // width of the lane header strip
export const LANE_PADDING = 20  // padding between lane edge and its children

// Font metrics for system-ui (used to estimate text dimensions without a DOM measurement)
// These are properties of the font, not layout decisions.
export const BODY_FONT_SIZE    = 12    // px — component label font
export const LABEL_FONT_SIZE   = 10    // px — arrow label font
export const AVG_CHAR_WIDTH    = 0.58  // average character width as a fraction of font size
export const TEXT_PADDING_H    = 16    // total horizontal padding inside a component box (left + right)
export const TEXT_PADDING_V    = 12    // total vertical padding inside a component box (top + bottom)
export const LABEL_CLEARANCE   = 8     // breathing room on each side of an arrow label background
