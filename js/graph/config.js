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
  X_OFFSET: 0, // pixels added to child X position
  SEPARATION: 280, // minimum distance between child nodes (pixels)
  REPULSION_STRENGTH: 0.4  // strength of separation force
};

// Grandchild nodes (projects)
export const GRANDCHILD = {
  WANDER_RADIUS: 400, // wander around category node
  SPEED_SCALE: 1,
  SECTOR_HALF_ANGLE: Math.PI / 3, // ±60° around east
  X_OFFSET: 0, // pixels added to grandchild X position
  SEPARATION: 200, // minimum distance between grandchild nodes (pixels)
  REPULSION_STRENGTH: 0.3 // strength of separation force
};

// Media nodes (project images/videos)
export const MEDIA = {
  SIZE: 1000, // base size of media thumbnail in pixels
  OSCILLATION_SPEED: 0.8, // speed factor for media movement
  BORDER_WIDTH: 2, // border thickness for media thumbnails in pixels
  BRACKET_PADDING: 8, // extra padding for hover brackets around media (in CSS pixels)
  
  // Repulsion between media (keeps them spread out)
  SEPARATION: 600, // minimum distance between media centers (pixels)
  REPULSION_STRENGTH: 0.5, // strength of separation force
  
  // Dynamic scale based on media count
  SCALE_MIN: 0.5, // minimum scale (used when many media)
  SCALE_MAX: 1.0, // maximum scale (used when few media)
  SCALE_THRESHOLD_MIN: 1, // 1 media = max scale
  SCALE_THRESHOLD_MAX: 6, // 6+ media = min scale
  SCALE_VARIATION: 0.1, // random variation (±10%)
  
  // Breakpoint for mobile detection
  MOBILE_BREAKPOINT: 480,
  
  // Spawn area DESKTOP (media on left side)
  DESKTOP: {
    X_MIN: 0.03, // 3% from left edge
    X_MAX: 0.45, // up to 45%
    Y_MIN: 0.10, // 10% from top
    Y_MAX: 0.90  // up to 90%
  },
  
  // Spawn area MOBILE (media on top)
  MOBILE: {
    X_MIN: 0.05,
    X_MAX: 0.95,
    Y_MIN: 0.08,
    Y_MAX: 0.45
  }
};

// Description text formatting (project descriptions)
export const DESCRIPTION = {
  TEXT_MAX_WIDTH_RATIO: 0.45, // max width as ratio of canvas width (responsive)
  FONT_SIZE: 14, // font size for description text
  LINE_HEIGHT: 40, // line height for description text
  PADDING: 18, // space between text and corner brackets
  
  // Spawn area DESKTOP (description in top-right corner)
  DESKTOP: {
    X_FIXED: 0.98, // fixed horizontal position (far right)
    Y_MIN: 0.05, // from top
    Y_MAX: 0.11, // 
    ANCHOR_POINT: "top-right"
  },
  
  // Spawn area MOBILE (description on bottom)
  MOBILE: {
    X_FIXED: 0.95, // slightly scaled from desktop
    Y_MIN: 0.55,
    Y_MAX: 0.85,
    ANCHOR_POINT: "top-right"
  }
};

// Text content formatting (for ABOUT/CONTACTS text)
export const TEXT = {
  MAX_WIDTH: 1800, // max width for text wrapping
  FONT_SIZE: 14, // font size for text content
  LINE_HEIGHT: 14, // line height for text content
  PADDING: 20 // space between text and corner brackets
};

// About section specific formatting
export const ABOUT = {
  TEXT_MAX_WIDTH_RATIO: 0.52, // wider than project descriptions (0.45)
  FONT_SIZE: 14,
  LINE_HEIGHT: 40,
  PADDING: 18,
  // Position offset from center (as ratio of canvas height)
  Y_OFFSET: 0.12 // positive = lower on screen
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

// Slug (title) hover detection
export const SLUG = {
  HOVER_PADDING: 16 // extra pixels around slug for easier hover detection
};








