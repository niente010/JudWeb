// Configuration constants for the graph visualization

// Main nodes wandering bounds (padding ratios from canvas edges)
export const MAIN_BOUNDS = { xPad: 0.1, yPad: 0.1 };

// Visual elements
export const RECT = { w: 20, h: 36 }; // small vertical rectangle
export const LINE_WIDTH = 2; // connection lines

// Main nodes behavior
export const MAIN = {
  SEPARATION: 300, // pixels - minimum distance between main nodes
  REPULSION_STRENGTH: 0.00001, // strength of separation force
  WANDER_RADIUS: 400, // how far mains wander from anchor
  RETURN_STRENGTH: 0.008, // spring force back to anchor
  SHRINK_SCALE: 0.7, // scale for non-focused mains in focus mode
  DIM_ALPHA: 0.3 // alpha for non-focused mains when focused
};

// Child nodes (categories/contacts)
export const CHILD = {
  RING_RADIUS: 400, // initial distance of children from focus node
  WANDER_RADIUS: 400, // wander radius around focus node
  SPEED_SCALE: 1,
  MIN_DISTANCE: 260, // minimum distance focus->child
  SECTOR_HALF_ANGLE: Math.PI / 6, // ±30° around east
  SHRINK_SCALE: 0.85, // scale for non-selected categories in category mode
  X_OFFSET: 0 // pixels added to child X position
};

// Grandchild nodes (projects)
export const GRANDCHILD = {
  WANDER_RADIUS: 400, // wander around category node
  SPEED_SCALE: 1,
  SECTOR_HALF_ANGLE: Math.PI / 3, // ±60° around east
  X_OFFSET: 0 // pixels added to grandchild X position
};

// Media nodes (project images/videos)
export const MEDIA = {
  SIZE: 600, // size of media thumbnail in pixels
  MIN_DISTANCE: 200, // minimum distance from project node
  MAX_DISTANCE: 1600, // maximum distance from project node
  OSCILLATION_SPEED: 0.8, // speed factor for media movement
  SCALE_MIN: 0.6, // minimum scale for media thumbnails (0.6 = 60% size)
  SCALE_MAX: 1.0, // maximum scale for media thumbnails (1.0 = 100% size)
  SECTOR_ANGLE_MIN: -Math.PI * 0.9, // start angle of sector
  SECTOR_ANGLE_MAX: -Math.PI * 1.3, // end angle of sector
  BORDER_WIDTH: 2, // border thickness for media thumbnails in pixels
  BRACKET_PADDING: 8 // extra padding for hover brackets around media (in CSS pixels)
};

// Description text formatting (project descriptions)
export const DESCRIPTION = {
  TEXT_MAX_WIDTH: 1800, // max width for text wrapping
  FONT_SIZE: 14, // font size for description text
  LINE_HEIGHT: 36, // line height for description text
  PADDING: 20, // space between text and corner brackets
  VIEWPORT_X_MIN: 0.93, // min horizontal position (ratio of canvas width)
  VIEWPORT_X_MAX: 1, // max horizontal position
  VIEWPORT_Y_MIN: 0.08, // min vertical position (ratio of canvas height)
  VIEWPORT_Y_MAX: 0.22, // max vertical position
  ANCHOR_POINT: "top-right" // anchor point for positioning: "center", "top-left", "top-right", "bottom-left", "bottom-right"
};

// Text content formatting (for ABOUT/CONTACTS text)
export const TEXT = {
  MAX_WIDTH: 1800, // max width for text wrapping
  FONT_SIZE: 14, // font size for text content
  LINE_HEIGHT: 14, // line height for text content
  PADDING: 20 // space between text and corner brackets
};

// Typography
export const FONTS = {
  MAIN: 16, // px base (scaled by DPR)
  MAIN_SMALL: 10, // px when mode === 'category' for non-selected mains
  CHILD: 16,
  GRANDCHILD: 16,
  MEDIA: 12 // small font for media labels
};

// Camera system
export const CAMERA = {
  SHIFT_PER_DEPTH: 0.03 // how much the view shifts left when going deeper (0.03 = 3% of screen width per level)
};

// Project level specific
export const PROJECT = {
  SHRINK_SCALE: 0.6 // scale for non-selected nodes in project mode
};

// Colors (read from CSS custom properties)
export const COLOR = getComputedStyle(document.documentElement).getPropertyValue("--fg").trim() || "#00ff66";

// Cursor style
export const CURSOR = {
  LINE_WIDTH: 2.0, // stroke width
  SIZE: 10, // px length of each line (base, scaled by DPR)
  GAP: 3, // px empty zone at center
  BOTTOM_ANGLE: 100, // degrees between the two bottom lines
  BRACKET_LENGTH: 16, // px corner bracket length (base, scaled by DPR)
  BRACKET_OFFSET: 4, // px distance from box edges
  TRANSITION_MS: 120 // crosshair <-> brackets animation duration
};








