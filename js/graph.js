// Simple wandering graph for three labeled nodes connected by lines

let animationHandle = null;
let ctx = null;
let nodes = [];
let lastTimestamp = 0;
let hoveredNodeIndex = -1;
let mode = "home"; // 'home' | 'focus' | 'category' | 'project' | 'content'
let focusKey = null; // 'ABOUT' | 'PROJECTS' | 'CONTACTS'
let mainNodeIndexes = { ABOUT: -1, PROJECTS: -1, CONTACTS: -1 };
let selectedCategoryIndex = -1; // index in nodes[] when mode === 'category'
let selectedProjectIndex = -1; // index in nodes[] when mode === 'project'
let selectedContentIndex = -1; // index in nodes[] when mode === 'content' (ABOUT/CONTACTS text)
let mainAnchors = []; // anchor positions for main nodes
// Camera/transition state
let uiDepth = 0; // 0 home, 1 focus, 2 category, 3 project, 4 content
let uiDepthTarget = 0;
let cameraOffsetX = 0;
let cameraTargetOffsetX = 0;
// Drag state for description and media nodes
let draggedNodeIndex = -1;
let dragOffsetX = 0;
let dragOffsetY = 0;

// In 'focus' solo i figli possono riprendere a muoversi uscendo dall'hover
function canResume(index) {
  if (index < 0) return false;
  if (mode === "home") return true;
  const kind = nodes[index]?.kind;
  if (mode === "focus") return kind === "child"; // only categories resume
  if (mode === "category") return kind === "grandchild"; // only projects resume
  if (mode === "project") return kind === "media"; // only media nodes oscillate in project mode
  return false;
}

// Visual and motion parameters
// Main nodes wandering bounds (padding ratios from canvas edges)
const MAIN_BOUNDS = { xPad: 0.1, yPad: 0.1 };
const RECT = { w: 20, h: 36 }; // small vertical rectangle
const LINE_WIDTH = 2; // connection lines
// Separation to avoid clustering of main nodes
const MIN_SEPARATION = 300; // pixels
const REPULSION_STRENGTH = 0.00001; // strength of separation force
// Focus visuals and children behavior
const MAIN_DIM_ALPHA = 0.3; // alpha for non-focused mains when focused
const CHILD_RING_RADIUS = 400; // initial distance of children from focus node
const CHILD_WANDER_RADIUS = 400; // wander radius around focus node
const CHILD_SPEED_SCALE = 1;
const MIN_CHILD_DISTANCE = 260; // minimum distance focus->child
// Category (projects) level
const GRANDCHILD_WANDER_RADIUS = 400; // wander around category node
const GRANDCHILD_SPEED_SCALE = 1;
// Anchored wandering for mains
const MAIN_WANDER_RADIUS = 400;
const MAIN_RETURN_STRENGTH = 0.008; // spring back to anchor
// Transition visuals (scales when going deeper)
const MAIN_SHRINK_SCALE = 0.7; // scale for non-focused mains in focus mode
const CHILD_SHRINK_SCALE = 0.85; // scale for non-selected categories in category mode
const PROJECT_SHRINK_SCALE = 0.6; // scale for non-selected nodes in project mode
// Camera shift per depth level (fraction of screen width)
const CAMERA_SHIFT_PER_DEPTH = 0.03; // how much the view shifts left when going deeper (0.12 = 12% of screen width per level)
// Project level specific
const PROJECT_CONTENT_Y = 103; // Y position for project content (below header)1
const MEDIA_OSCILLATION_RADIUS = 300; // how far media nodes can wander from center
const MEDIA_OSCILLATION_SPEED = 0.8; // speed factor for media movement
const MEDIA_SIZE = 600; // size of media thumbnail in pixels
const MEDIA_MIN_DISTANCE = 200; // minimum distance from project node
const MEDIA_MAX_DISTANCE = 1600; // maximum distance from project node
const MEDIA_BORDER_WIDTH = 2; // border thickness for media thumbnails in pixels
const MEDIA_BRACKET_PADDING = 8; // extra padding for hover brackets around media (in CSS pixels)
const MEDIA_SCALE_MIN = 0.6; // minimum scale for media thumbnails (0.6 = 60% size)
const MEDIA_SCALE_MAX = 1.0; // maximum scale for media thumbnails (1.0 = 100% size)
// Media spawn sector - define the angular area directly with min/max angles
// 0 = east/right, π/2 = north/up, π = west/left, 3π/2 = south/down
const MEDIA_SECTOR_ANGLE_MIN = - Math.PI * 0.9; // start angle of sector
const MEDIA_SECTOR_ANGLE_MAX = - Math.PI * 1.3; // end angle of sector
// Description text formatting (box adapts automatically to content)
const DESC_TEXT_MAX_WIDTH = 1800; // max width for text wrapping
const DESC_TEXT_FONT_SIZE = 14; // font size for description text
const DESC_TEXT_LINE_HEIGHT = 36; // line height for description text
const DESC_TEXT_PADDING = 20; // space between text and corner brackets
const DESC_CORNER_SIZE = 40; // size of corner brackets (visual only)
// Description spawn area - ABSOLUTE position in viewport (not relative to project)
// These are ratios of canvas dimensions: 0 = left/top edge, 1 = right/bottom edge
const DESC_VIEWPORT_X_MIN =  0.93; // min horizontal position 
const DESC_VIEWPORT_X_MAX = 1; // max horizontal position 
const DESC_VIEWPORT_Y_MIN = 0.08; // min vertical position 
const DESC_VIEWPORT_Y_MAX = 0.22;  // max vertical position 
// Description anchor point - which part of the box uses the viewport position
// Options: "center", "top-left", "top-right", "bottom-left", "bottom-right"
const DESC_ANCHOR_POINT = "top-right"; // anchor point for positioning
// Hover animation speed for description (0 = instant, 1 = smooth)
const DESC_HOVER_ANIMATION_SPEED = 0.10; // interpolation factor for hover transition
// TextContent text formatting (for ABOUT/CONTACTS, box adapts automatically to content)
const TEXT_MAX_WIDTH = 1800; // max width for text wrapping
const TEXT_FONT_SIZE = 14; // font size for text content
const TEXT_LINE_HEIGHT = 14; // line height for text content
const TEXT_PADDING = 20; // space between text and corner brackets
const TEXT_CORNER_SIZE = 40; // size of corner brackets (visual only)
const TEXT_OFFSET_X = 300; // horizontal position from main node (positive = right)
const TEXT_OFFSET_Y = -100; // vertical position from main node (negative = up)
// Spawn/wander sectors (towards right side of the parent)
const CHILD_SECTOR_HALF_ANGLE = Math.PI / 6; // ±30° around east
const GRANDCHILD_SECTOR_HALF_ANGLE = Math.PI / 3; // ±22.5° around east
// Horizontal offset for spawning child nodes (positive = more to the right)
const CHILD_X_OFFSET = 0; // pixels added to child X position
const GRANDCHILD_X_OFFSET = 0; // pixels added to grandchild X position
// Typography
const FONT_SIZE_MAIN = 16; // px base (scaled by DPR)
const FONT_SIZE_MAIN_SMALL = 10; // px when mode === 'category' for non-selected mains
const FONT_SIZE_CHILD = 16;
const FONT_SIZE_GRANDCHILD = 16;
const COLOR = getComputedStyle(document.documentElement).getPropertyValue("--fg").trim() || "#00ff66";

export function startGraph(canvas) {
  stopGraph();
  ctx = canvas.getContext("2d");
  resizeCanvasToDisplaySize(canvas);
  window.addEventListener("resize", () => resizeCanvasToDisplaySize(canvas));

  // Initialize 3 nodes with different labels and routes
  const { width, height } = canvas;
  nodes = [];
  nodes.push(createNode("ABOUT", "#/about", 0, width, height));
  mainNodeIndexes.ABOUT = 0;
  nodes.push(createNode("PROJECTS", "#/projects", 1, width, height));
  mainNodeIndexes.PROJECTS = 1;
  nodes.push(createNode("CONTACTS", "#/contacts", 2, width, height));
  mainNodeIndexes.CONTACTS = 2;
   mode = "home";
   focusKey = null;
   selectedCategoryIndex = -1;
   selectedProjectIndex = -1;

  // Compute three stable anchors for mains and initialize near them
  mainAnchors = computeMainAnchors(width, height);
  for (let i = 0; i < 3; i++) {
    const a = mainAnchors[i];
    const jitter = () => (Math.random() - 0.5) * MAIN_WANDER_RADIUS * 0.3;
    nodes[i].x = clamp(a.x + jitter(), a.x - MAIN_WANDER_RADIUS, a.x + MAIN_WANDER_RADIUS);
    nodes[i].y = clamp(a.y + jitter(), a.y - MAIN_WANDER_RADIUS, a.y + MAIN_WANDER_RADIUS);
    nodes[i].targetX = nodes[i].x;
    nodes[i].targetY = nodes[i].y;
  }

  lastTimestamp = performance.now();
  animationHandle = requestAnimationFrame(tick);

  // Interactivity: click / focus
  canvas.onpointerdown = (e) => {
    const rect = canvas.getBoundingClientRect();
    const x = (e.clientX - rect.left) * (canvas.width / rect.width);
    const y = (e.clientY - rect.top) * (canvas.height / rect.height);
    const idx = hitTestAtScreen(x, y);
    const n = idx >= 0 ? nodes[idx] : null;
    
    // Click on empty space: go back one hierarchy level
    if (!n) {
      if (mode === "project") {
        // Go back from project to category
        nodes = nodes.filter(n => n.kind !== "description" && n.kind !== "media");
        mode = "category";
        selectedProjectIndex = -1;
        uiDepthTarget = 2;
        cameraTargetOffsetX = CAMERA_SHIFT_PER_DEPTH * ctx.canvas.width * uiDepthTarget;
        // Resume movement for all grandchild nodes (projects)
        for (let i = 0; i < nodes.length; i++) {
          if (nodes[i].kind === "grandchild") {
            nodes[i].targetTimer = 0.01;
          }
        }
      } else if (mode === "category") {
        // Go back from category to focus (main node view)
        // Re-enter focus mode to recreate child nodes
        if (focusKey) {
          enterFocus(focusKey);
        }
      } else if (mode === "focus") {
        // Go back from focus to home
        nodes = nodes.filter(n => n.kind !== "child");
        mode = "home";
        focusKey = null;
        selectedCategoryIndex = -1;
        uiDepthTarget = 0;
        // FIX: Reset camera AND depth immediately to avoid visual jump
        uiDepth = 0;
        cameraTargetOffsetX = 0;
        cameraOffsetX = 0;
        // FIX: Reset hoveredNodeIndex so hover is re-triggered
        hoveredNodeIndex = -1;
        // Resume movement for main nodes
        for (let i = 0; i < 3; i++) {
          nodes[i].targetTimer = 0.01;
        }
      } else if (mode === "content") {
        // Go back from content (ABOUT text) to home
        nodes = nodes.filter(n => n.kind !== "description" && n.kind !== "aboutDescription");
        mode = "home";
        focusKey = null;
        selectedContentIndex = -1;
        uiDepthTarget = 0;
        // FIX: Reset camera AND depth immediately to avoid visual jump
        uiDepth = 0;
        cameraTargetOffsetX = 0;
        cameraOffsetX = 0;
        // FIX: Reset hoveredNodeIndex so hover is re-triggered
        hoveredNodeIndex = -1;
        // Resume movement for main nodes
        for (let i = 0; i < 3; i++) {
          nodes[i].targetTimer = 0.01;
        }
      }
      return;
    }
    
    if (idx <= 2) {
      // main nodes
      if (n.label === "PROJECTS") {
        enterFocus("PROJECTS");
      } else if (n.label === "ABOUT") {
        // ABOUT: Show text description (single click)
        enterAboutMode(idx);
      } else if (n.label === "CONTACTS") {
        // CONTACTS: Just show contact nodes, no text content
        enterFocus("CONTACTS");
      } else {
        enterFocus(n.label);
      }
    } else if (n.kind === "child") {
      // Check if this is a contact node (has URL)
      if (n.url) {
        // Open link in new tab
        window.open(n.url, '_blank');
        return;
      }
      
      // If in project mode, clicking a category should go back to category mode
      if (mode === "project") {
        // Remove content nodes (description and media)
        nodes = nodes.filter(n => n.kind !== "description" && n.kind !== "media");
        mode = "category";
        selectedProjectIndex = -1;
        uiDepthTarget = 2; // back to category depth
        cameraTargetOffsetX = CAMERA_SHIFT_PER_DEPTH * ctx.canvas.width * uiDepthTarget;
        // Resume movement for all grandchild nodes (projects)
        for (let i = 0; i < nodes.length; i++) {
          if (nodes[i].kind === "grandchild") {
            nodes[i].targetTimer = 0.01; // allow new target immediately
          }
        }
      } else if (mode === "category" && selectedCategoryIndex === idx) {
        // refresh positions only if clicking same category
        refreshCategoryTargets();
      } else {
        // Enter category mode normally
        enterCategory(idx, n.labelRaw);
      }
    } else if (n.kind === "grandchild") {
      // Enter project mode for selected project - stays on canvas
      // If clicking the same project again, exit project mode and go back to category mode
      if (mode === "project" && selectedProjectIndex === idx) {
        // Remove content nodes (description and media)
        nodes = nodes.filter(n => n.kind !== "description" && n.kind !== "media");
        mode = "category";
        selectedProjectIndex = -1;
        uiDepthTarget = 2; // back to category depth
        cameraTargetOffsetX = CAMERA_SHIFT_PER_DEPTH * ctx.canvas.width * uiDepthTarget;
        // Resume movement for all grandchild nodes (projects)
        for (let i = 0; i < nodes.length; i++) {
          if (nodes[i].kind === "grandchild") {
            nodes[i].targetTimer = 0.01; // allow new target immediately
          }
        }
      } else {
        enterProjectMode(idx, n.category, n.slug);
      }
    }
    // Description, aboutDescription, and media nodes: start drag
    if (n.kind === "description" || n.kind === "aboutDescription" || n.kind === "media") {
      draggedNodeIndex = idx;
      // Calculate offset from node position to click position
      dragOffsetX = x - n.x;
      dragOffsetY = y - n.y;
      // Freeze the node while dragging
      n.vx = 0;
      n.vy = 0;
      n.targetTimer = 1e9;
      e.preventDefault();
    }
  };
  // Cursor feedback
  canvas.onpointermove = (e) => {
    const rect = canvas.getBoundingClientRect();
    const x = (e.clientX - rect.left) * (canvas.width / rect.width);
    const y = (e.clientY - rect.top) * (canvas.height / rect.height);
    
    // If dragging, update dragged node position
    if (draggedNodeIndex >= 0) {
      const draggedNode = nodes[draggedNodeIndex];
      if (draggedNode) {
        draggedNode.x = x - dragOffsetX;
        draggedNode.y = y - dragOffsetY;
        draggedNode.targetX = draggedNode.x;
        draggedNode.targetY = draggedNode.y;
        
        // PROBLEMA 3: Update hover box to follow dragged node in real-time
        const cssScaleX = rect.width / canvas.width;
        const cssScaleY = rect.height / canvas.height;
        
        if (draggedNode.kind === "description" || draggedNode.kind === "aboutDescription" || draggedNode.kind === "textContent") {
          if (draggedNode._boxWidth && draggedNode._boxHeight) {
            let centerX, centerY;
            if (draggedNode.kind === "description") {
              switch (DESC_ANCHOR_POINT) {
                case "top-left":
                  centerX = draggedNode.x + draggedNode._boxWidth / 2;
                  centerY = draggedNode.y + draggedNode._boxHeight / 2;
                  break;
                case "top-right":
                  centerX = draggedNode.x - draggedNode._boxWidth / 2;
                  centerY = draggedNode.y + draggedNode._boxHeight / 2;
                  break;
                case "bottom-left":
                  centerX = draggedNode.x + draggedNode._boxWidth / 2;
                  centerY = draggedNode.y - draggedNode._boxHeight / 2;
                  break;
                case "bottom-right":
                  centerX = draggedNode.x - draggedNode._boxWidth / 2;
                  centerY = draggedNode.y - draggedNode._boxHeight / 2;
                  break;
                case "center":
                default:
                  centerX = draggedNode.x;
                  centerY = draggedNode.y;
                  break;
              }
            } else if (draggedNode.kind === "aboutDescription") {
              // aboutDescription always uses CENTER anchor
              centerX = draggedNode.x;
              centerY = draggedNode.y;
            } else {
              // textContent
              centerX = draggedNode.x;
              centerY = draggedNode.y;
            }
            const rectX = centerX - draggedNode._boxWidth / 2;
            const rectY = centerY - draggedNode._boxHeight / 2;
            window.setHoverBox?.({
              x: rect.left + rectX * cssScaleX,
              y: rect.top + rectY * cssScaleY,
              w: draggedNode._boxWidth * cssScaleX,
              h: draggedNode._boxHeight * cssScaleY,
            });
          }
        } else if (draggedNode.kind === "media") {
          const baseWidth = draggedNode._imageWidth || MEDIA_SIZE;
          const baseHeight = draggedNode._imageHeight || MEDIA_SIZE;
          const scale = draggedNode._individualScale || 1;
          const imgWidth = baseWidth * scale;
          const imgHeight = baseHeight * scale;
          const rectX = draggedNode.x - imgWidth / 2 - MEDIA_BRACKET_PADDING;
          const rectY = draggedNode.y - imgHeight / 2 - MEDIA_BRACKET_PADDING;
          window.setHoverBox?.({
            x: rect.left + rectX * cssScaleX,
            y: rect.top + rectY * cssScaleY,
            w: (imgWidth + MEDIA_BRACKET_PADDING * 2) * cssScaleX,
            h: (imgHeight + MEDIA_BRACKET_PADDING * 2) * cssScaleY,
          });
        }
      }
      return; // Skip normal hover logic while dragging
    }
    
    const hitIndex = hitTestAtScreen(x, y);
    const n = hitIndex >= 0 ? nodes[hitIndex] : null;
    if (hitIndex !== hoveredNodeIndex) {
      if (hoveredNodeIndex >= 0 && canResume(hoveredNodeIndex)) {
        const prev = nodes[hoveredNodeIndex];
        prev.targetTimer = 0.01;
        prev.vx += (Math.random() - 0.5) * 0.1;
        prev.vy += (Math.random() - 0.5) * 0.1;
      }
      hoveredNodeIndex = hitIndex;
      if (hitIndex >= 0) {
        n.vx = 0; n.vy = 0; n.targetX = n.x; n.targetY = n.y; n.targetTimer = 1e9;
        // If media node, bring it to front (increase z-index)
        if (n.kind === "media") {
          // Find max z-index among media nodes
          let maxZ = 0;
          for (const node of nodes) {
            if (node.kind === "media" && node._zIndex > maxZ) {
              maxZ = node._zIndex;
            }
          }
          n._zIndex = maxZ + 1; // Put this one on top
        }
      }
    }
    // Update hover box for crosshair brackets
    if (n) {
      // Freeze node while hovered
      // (freeze already applied in enter logic)
      const cssScaleX = rect.width / canvas.width;
      const cssScaleY = rect.height / canvas.height;
      
      if (n.kind === "description" || n.kind === "aboutDescription" || n.kind === "textContent") {
        // For description/aboutDescription/textContent: use CENTER of the box for hover brackets
        if (n._boxWidth && n._boxHeight) {
          // Calculate center position based on anchor point
          let centerX, centerY;
          if (n.kind === "description") {
            // Description uses DESC_ANCHOR_POINT
            switch (DESC_ANCHOR_POINT) {
              case "top-left":
                centerX = n.x + n._boxWidth / 2;
                centerY = n.y + n._boxHeight / 2;
                break;
              case "top-right":
                centerX = n.x - n._boxWidth / 2;
                centerY = n.y + n._boxHeight / 2;
                break;
              case "bottom-left":
                centerX = n.x + n._boxWidth / 2;
                centerY = n.y - n._boxHeight / 2;
                break;
              case "bottom-right":
                centerX = n.x - n._boxWidth / 2;
                centerY = n.y - n._boxHeight / 2;
                break;
              case "center":
              default:
                centerX = n.x;
                centerY = n.y;
                break;
            }
          } else if (n.kind === "aboutDescription") {
            // aboutDescription always uses CENTER anchor
            centerX = n.x;
            centerY = n.y;
          } else {
            // textContent uses center by default
            const screenX = getScreenXForIndex(hitIndex);
            centerX = screenX;
            centerY = n.y;
          }
          
          // Hover box around the CENTER (not the anchor corner)
          const rectX = centerX - n._boxWidth / 2;
          const rectY = centerY - n._boxHeight / 2;
          window.setHoverBox?.({
            x: rect.left + rectX * cssScaleX,
            y: rect.top + rectY * cssScaleY,
            w: n._boxWidth * cssScaleX,
            h: n._boxHeight * cssScaleY,
          });
        }
      } else if (n.kind === "media") {
        // Media nodes: use actual image dimensions with individual scale + extra padding for brackets
        const baseWidth = n._imageWidth || MEDIA_SIZE;
        const baseHeight = n._imageHeight || MEDIA_SIZE;
        const scale = n._individualScale || 1;
        const imgWidth = baseWidth * scale;
        const imgHeight = baseHeight * scale;
        const rectX = n.x - imgWidth / 2 - MEDIA_BRACKET_PADDING;
        const rectY = n.y - imgHeight / 2 - MEDIA_BRACKET_PADDING;
        window.setHoverBox?.({
          x: rect.left + rectX * cssScaleX,
          y: rect.top + rectY * cssScaleY,
          w: (imgWidth + MEDIA_BRACKET_PADDING * 2) * cssScaleX,
          h: (imgHeight + MEDIA_BRACKET_PADDING * 2) * cssScaleY,
        });
      } else {
        // Regular nodes: rectangle + label
        const dpr = Math.max(1, window.devicePixelRatio || 1);
        const fontSize = getFontSizeForIndex(hitIndex);
        const isMain = hitIndex < 3;
        const scale = isMain ? fontSize / FONT_SIZE_MAIN : 1;
        const rectW = RECT.w * scale;
        const rectH = isMain ? RECT.h * scale : RECT.h;
        const screenX = getScreenXForIndex(hitIndex);
        const labelWidth = measureTextWidthWithFont(n.label, fontSize);
        const w = rectW + 8 + labelWidth;
        const h = Math.max(rectH, fontSize * dpr);
        const rectX = screenX - rectW / 2;
        const rectY = n.y - rectH / 2;
        window.setHoverBox?.({
          x: rect.left + rectX * cssScaleX,
          y: rect.top + rectY * cssScaleY,
          w: w * cssScaleX,
          h: h * cssScaleY,
        });
      }
    } else {
      window.clearHoverBox?.();
    }
  };

  canvas.onpointerup = () => {
    // End drag - node stays where it was released
    if (draggedNodeIndex >= 0) {
      const draggedNode = nodes[draggedNodeIndex];
      if (draggedNode) {
        // Keep node frozen at released position
        draggedNode.targetX = draggedNode.x;
        draggedNode.targetY = draggedNode.y;
        draggedNode.vx = 0;
        draggedNode.vy = 0;
        draggedNode.targetTimer = 1e9; // keep frozen
      }
      draggedNodeIndex = -1;
      dragOffsetX = 0;
      dragOffsetY = 0;
    }
  };

  canvas.onpointerleave = () => {
    // End drag if pointer leaves canvas
    if (draggedNodeIndex >= 0) {
      draggedNodeIndex = -1;
      dragOffsetX = 0;
      dragOffsetY = 0;
    }
    // resume movement for all nodes when pointer leaves canvas
    for (let i = 0; i < nodes.length; i++) {
      const n = nodes[i];
      if (!canResume(i)) continue;
      if (n.targetTimer > 1e8) n.targetTimer = 0.1; // allow new target next step
    }
    hoveredNodeIndex = -1;
    window.clearHoverBox?.();
  };
}

export function stopGraph() {
  if (animationHandle) cancelAnimationFrame(animationHandle);
  animationHandle = null;
  if (ctx) {
    const { canvas } = ctx;
    ctx.clearRect(0, 0, canvas.width, canvas.height);
  }
}

function resizeCanvasToDisplaySize(canvas) {
  const dpr = Math.max(1, window.devicePixelRatio || 1);
  const { clientWidth, clientHeight } = canvas;
  canvas.width = Math.floor(clientWidth * dpr);
  canvas.height = Math.floor(clientHeight * dpr);
}

function createNode(label, hash, index, width, height) {
  const bounds = centralBounds(width, height);
  const x = lerp(bounds.left, bounds.right, Math.random());
  const y = lerp(bounds.top, bounds.bottom, Math.random());
  const sign = index % 2 === 0 ? 1 : -1;
  return {
    label,
    hash,
    x,
    y,
    vx: (Math.random() * 0.12 + 0.06) * sign,
    vy: (Math.random() * 0.12 + 0.06) * -sign,
    targetTimer: 0,
    targetX: x,
    targetY: y,
  };
}

function centralBounds(width, height) {
  const xPad = width * MAIN_BOUNDS.xPad;
  const yPad = height * MAIN_BOUNDS.yPad;
  return { left: xPad, right: width - xPad, top: yPad, bottom: height - yPad };
}

function tick(ts) {
  const dt = Math.min(0.05, (ts - lastTimestamp) / 500); //speed
  lastTimestamp = ts;
  // Animate UI depth and camera offset
  // NOTE: uiDepth animates towards uiDepthTarget
  uiDepth += (uiDepthTarget - uiDepth) * 0.2;
  // cameraTargetOffsetX is RECALCULATED every frame based on uiDepth
  const width = ctx?.canvas?.width || 0;
  cameraTargetOffsetX = -width * CAMERA_SHIFT_PER_DEPTH * uiDepth;
  // cameraOffsetX animates towards cameraTargetOffsetX
  cameraOffsetX += (cameraTargetOffsetX - cameraOffsetX) * 0.2;
  step(dt);
  draw();
  animationHandle = requestAnimationFrame(tick);
}

function step(dt) {
  const { width, height } = ctx.canvas;
  const bounds = centralBounds(width, height);
  for (const n of nodes) {
    // If node is explicitly frozen (very large timer), keep it perfectly still
    if (n.targetTimer > 1e8) {
      n.vx = 0; n.vy = 0;
      continue;
    }
    // Repulsion among main nodes to avoid clustering
    const idx = nodes.indexOf(n);
    if (idx >= 0 && idx < 3) {
      // spring to anchor to prevent long-term drift
      const anchor = mainAnchors[idx];
      if (anchor) {
        n.vx += (anchor.x - n.x) * MAIN_RETURN_STRENGTH;
        n.vy += (anchor.y - n.y) * MAIN_RETURN_STRENGTH;
      }
      for (let j = 0; j < 3; j++) {
        if (j === idx) continue;
        const m = nodes[j];
        const dx = n.x - m.x;
        const dy = n.y - m.y;
        const dist = Math.hypot(dx, dy) || 0.0001;
        if (dist < MIN_SEPARATION) {
          const force = (MIN_SEPARATION - dist) * REPULSION_STRENGTH;
          n.vx += (dx / dist) * force;
          n.vy += (dy / dist) * force;
        }
      }
    }
    const speedScale = n.kind === "child" ? CHILD_SPEED_SCALE : n.kind === "grandchild" ? GRANDCHILD_SPEED_SCALE : n.kind === "media" ? MEDIA_OSCILLATION_SPEED : 1;
    // Occasionally pick a new random target within bounds
    n.targetTimer -= dt;
    if (n.targetTimer <= 0) {
      n.targetTimer = 2 + Math.random() * 2.5; // seconds
      if (idx >= 0 && idx < 3) {
        // main: pick a new target near its anchor, clamped to bounds
        const a = mainAnchors[idx] || { x: (bounds.left + bounds.right) / 2, y: (bounds.top + bounds.bottom) / 2 };
        const ang = Math.random() * Math.PI * 2;
        const r = MAIN_WANDER_RADIUS * (0.4 + Math.random() * 0.6);
        let tx = a.x + Math.cos(ang) * r;
        let ty = a.y + Math.sin(ang) * r;
        const c = clampToBounds(tx, ty, bounds);
        n.targetX = c.x; n.targetY = c.y;
      } else if (n.kind === "child" && n.parentKey && mainNodeIndexes[n.parentKey] >= 0) {
        const anchor = nodes[mainNodeIndexes[n.parentKey]];
        const ang = (Math.random() - 0.5) * 2 * CHILD_SECTOR_HALF_ANGLE; // around east
        const r = Math.max(MIN_CHILD_DISTANCE, CHILD_WANDER_RADIUS);
        let tx = anchor.x + Math.cos(ang) * r + CHILD_X_OFFSET;
        let ty = anchor.y + Math.sin(ang) * r;
        const c = clampToBounds(tx, ty, bounds);
        n.targetX = c.x; n.targetY = c.y;
      } else if (n.kind === "grandchild" && selectedCategoryIndex >= 0) {
        const anchor = nodes[selectedCategoryIndex];
        const ang = (Math.random() - 0.5) * 2 * GRANDCHILD_SECTOR_HALF_ANGLE; // around east
        const r = GRANDCHILD_WANDER_RADIUS;
        let tx = anchor.x + Math.cos(ang) * r + GRANDCHILD_X_OFFSET;
        let ty = anchor.y + Math.sin(ang) * r;
        const c = clampToBounds(tx, ty, bounds);
        n.targetX = c.x; n.targetY = c.y;
      } else if (n.kind === "description" && mode === "project" && selectedProjectIndex >= 0) {
        // Description nodes stay fixed at their spawn position
        // No new target - they remain where they were created
      } else if (n.kind === "media" && mode === "project" && selectedProjectIndex >= 0) {
        // Media nodes oscillate within their defined angular sector
        // Each media uses its individual distance (not randomized each time)
        const project = nodes[selectedProjectIndex];
        if (project && n._individualDistance) {
          const ang = MEDIA_SECTOR_ANGLE_MIN + Math.random() * (MEDIA_SECTOR_ANGLE_MAX - MEDIA_SECTOR_ANGLE_MIN);
          // Use the media's individual distance with slight variation for oscillation
          const distanceVariation = n._individualDistance * 0.1; // ±10% variation
          const distance = n._individualDistance + (Math.random() - 0.5) * 2 * distanceVariation;
          let tx = project.x + Math.cos(ang) * distance;
          let ty = project.y + Math.sin(ang) * distance;
          const c = clampToBounds(tx, ty, bounds);
          n.targetX = c.x; n.targetY = c.y;
        }
      } else {
        n.targetX = lerp(bounds.left, bounds.right, Math.random());
        n.targetY = lerp(bounds.top, bounds.bottom, Math.random());
      }
    }
    
    // Description and aboutDescription nodes remain completely static - skip all movement logic
    if (n.kind === "description" || n.kind === "aboutDescription") {
      continue;
    }
    
    // Ease velocity toward target
    const ax = (n.targetX - n.x) * 0.0025;
    const ay = (n.targetY - n.y) * 0.0025;
    n.vx = clamp(n.vx + ax, -0.2 * speedScale, 0.2 * speedScale);
    n.vy = clamp(n.vy + ay, -0.2 * speedScale, 0.2 * speedScale);
    n.x += n.vx * 40 * dt;
    n.y += n.vy * 40 * dt;

    // Soft boundary steering to keep within central bounds
    const margin = 30;
    if (n.x < bounds.left + margin) n.vx += 0.01;
    if (n.x > bounds.right - margin) n.vx -= 0.01;
    if (n.y < bounds.top + margin) n.vy += 0.01;
    if (n.y > bounds.bottom - margin) n.vy -= 0.01;
  }
}

function draw() {
  const { canvas } = ctx;
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  ctx.save();
  ctx.strokeStyle = COLOR;
  ctx.fillStyle = COLOR;
  ctx.lineWidth = LINE_WIDTH;

  if (mode === "home") {
    // Lines between mains only
    for (let i = 0; i < 3; i++) {
      for (let j = i + 1; j < 3; j++) {
        ctx.globalAlpha = 1;
        ctx.beginPath();
        ctx.moveTo(getScreenXForIndex(i), nodes[i].y);
        ctx.lineTo(getScreenXForIndex(j), nodes[j].y);
        ctx.stroke();
      }
    }
  } else if (mode === "focus") {
    // Dim all links among mains
    const fIdx = mainNodeIndexes[focusKey];
    for (let i = 0; i < 3; i++) {
      for (let j = i + 1; j < 3; j++) {
        ctx.globalAlpha = MAIN_DIM_ALPHA;
        ctx.beginPath();
        ctx.moveTo(getScreenXForIndex(i), nodes[i].y);
        ctx.lineTo(getScreenXForIndex(j), nodes[j].y);
        ctx.stroke();
      }
    }
    // Lines from each child to its parent main node
    ctx.globalAlpha = 1;
    for (let k = 3; k < nodes.length; k++) {
      const c = nodes[k];
      if (c.kind !== "child") continue;
      // Find the parent main node index for this child
      const parentIdx = c.parentKey ? mainNodeIndexes[c.parentKey] : fIdx;
      ctx.beginPath();
      ctx.moveTo(getScreenXForIndex(parentIdx), nodes[parentIdx].y);
      ctx.lineTo(getScreenXForIndex(k), nodes[k].y);
      ctx.stroke();
    }
  } else if (mode === "category") {
    // Dim all links among mains
    for (let i = 0; i < 3; i++) {
      for (let j = i + 1; j < 3; j++) {
        ctx.globalAlpha = MAIN_DIM_ALPHA;
        ctx.beginPath();
        ctx.moveTo(getScreenXForIndex(i), nodes[i].y);
        ctx.lineTo(getScreenXForIndex(j), nodes[j].y);
        ctx.stroke();
      }
    }
    // Links from PROJECTS to categories: only selected at 100%
    const pIdx = mainNodeIndexes.PROJECTS;
    for (let k = 3; k < nodes.length; k++) {
      const c = nodes[k];
      if (c.kind !== "child") continue;
      ctx.globalAlpha = k === selectedCategoryIndex ? 1 : MAIN_DIM_ALPHA;
      ctx.beginPath();
      ctx.moveTo(getScreenXForIndex(pIdx), nodes[pIdx].y);
      ctx.lineTo(getScreenXForIndex(k), nodes[k].y);
      ctx.stroke();
    }
    // Links from selected category to its projects
    if (selectedCategoryIndex >= 0) {
      ctx.globalAlpha = 1;
      for (let k = 3; k < nodes.length; k++) {
        const c = nodes[k];
        if (c.kind !== "grandchild" || c.parentIndex !== selectedCategoryIndex) continue;
        ctx.beginPath();
        ctx.moveTo(getScreenXForIndex(selectedCategoryIndex), nodes[selectedCategoryIndex].y);
        ctx.lineTo(getScreenXForIndex(k), nodes[k].y);
        ctx.stroke();
      }
    }
  } else if (mode === "project") {
    // In project mode, show the full hierarchy with appropriate opacity
    // Links between mains are very dim
    for (let i = 0; i < 3; i++) {
      for (let j = i + 1; j < 3; j++) {
        ctx.globalAlpha = 0.1;
        ctx.beginPath();
        ctx.moveTo(getScreenXForIndex(i), nodes[i].y);
        ctx.lineTo(getScreenXForIndex(j), nodes[j].y);
        ctx.stroke();
      }
    }
    // Link from PROJECTS to selected category (100% opacity)
    const pIdx = mainNodeIndexes.PROJECTS;
    if (selectedCategoryIndex >= 0) {
      ctx.globalAlpha = 1;
      ctx.beginPath();
      ctx.moveTo(getScreenXForIndex(pIdx), nodes[pIdx].y);
      ctx.lineTo(getScreenXForIndex(selectedCategoryIndex), nodes[selectedCategoryIndex].y);
      ctx.stroke();
    }
    // Links from PROJECTS to non-selected categories (dim)
    for (let k = 3; k < nodes.length; k++) {
      const c = nodes[k];
      if (c.kind !== "child") continue;
      if (k === selectedCategoryIndex) continue; // already drawn above at 100%
      ctx.globalAlpha = 0.1;
      ctx.beginPath();
      ctx.moveTo(getScreenXForIndex(pIdx), nodes[pIdx].y);
      ctx.lineTo(getScreenXForIndex(k), nodes[k].y);
      ctx.stroke();
    }
    // Link from selected category to selected project (100% opacity)
    if (selectedProjectIndex >= 0 && selectedCategoryIndex >= 0) {
      ctx.globalAlpha = 1;
      ctx.beginPath();
      ctx.moveTo(getScreenXForIndex(selectedCategoryIndex), nodes[selectedCategoryIndex].y);
      ctx.lineTo(getScreenXForIndex(selectedProjectIndex), nodes[selectedProjectIndex].y);
      ctx.stroke();
    }
    // Links from selected category to non-selected projects (dim)
    for (let k = 3; k < nodes.length; k++) {
      const g = nodes[k];
      if (g.kind !== "grandchild" || g.parentIndex !== selectedCategoryIndex) continue;
      if (k === selectedProjectIndex) continue; // already drawn above at 100%
      ctx.globalAlpha = 0.1;
      ctx.beginPath();
      ctx.moveTo(getScreenXForIndex(selectedCategoryIndex), nodes[selectedCategoryIndex].y);
      ctx.lineTo(getScreenXForIndex(k), nodes[k].y);
      ctx.stroke();
    }
    // Links from selected project to its content nodes (description and media)
    if (selectedProjectIndex >= 0) {
      ctx.globalAlpha = 1;
      for (let k = 3; k < nodes.length; k++) {
        const m = nodes[k];
        if ((m.kind !== "media" && m.kind !== "description") || m.projectIndex !== selectedProjectIndex) continue;
        
        // Skip drawing line to description if box dimensions not yet calculated (first frame)
        if (m.kind === "description" && !nodes[k]._boxWidth) continue;
        
        ctx.beginPath();
        ctx.moveTo(getScreenXForIndex(selectedProjectIndex), nodes[selectedProjectIndex].y);
        // Description/media use absolute viewport position (not camera-shifted)
        // Line connects to the CENTER of the description/media box
        if (m.kind === "description") {
          // For description, calculate CENTER based on anchor point
          // nodes[k].x/y is the anchor position, we need to find the center
          let descCenterX, descCenterY;
          if (nodes[k]._boxWidth && nodes[k]._boxHeight) {
            switch (DESC_ANCHOR_POINT) {
              case "top-left":
                descCenterX = nodes[k].x + nodes[k]._boxWidth / 2;
                descCenterY = nodes[k].y + nodes[k]._boxHeight / 2;
                break;
              case "top-right":
                descCenterX = nodes[k].x - nodes[k]._boxWidth / 2;
                descCenterY = nodes[k].y + nodes[k]._boxHeight / 2;
                break;
              case "bottom-left":
                descCenterX = nodes[k].x + nodes[k]._boxWidth / 2;
                descCenterY = nodes[k].y - nodes[k]._boxHeight / 2;
                break;
              case "bottom-right":
                descCenterX = nodes[k].x - nodes[k]._boxWidth / 2;
                descCenterY = nodes[k].y - nodes[k]._boxHeight / 2;
                break;
              case "center":
              default:
                descCenterX = nodes[k].x;
                descCenterY = nodes[k].y;
                break;
            }
          } else {
            // Fallback if box size not yet calculated
            descCenterX = nodes[k].x;
            descCenterY = nodes[k].y;
          }
          ctx.lineTo(descCenterX, descCenterY);
        } else {
          // Media nodes already use their center
          ctx.lineTo(nodes[k].x, nodes[k].y);
        }
        ctx.stroke();
      }
    }
  } else if (mode === "content") {
    // In content mode (ABOUT/CONTACTS), dim non-selected mains
    for (let i = 0; i < 3; i++) {
      for (let j = i + 1; j < 3; j++) {
        ctx.globalAlpha = MAIN_DIM_ALPHA;
        ctx.beginPath();
        ctx.moveTo(getScreenXForIndex(i), nodes[i].y);
        ctx.lineTo(getScreenXForIndex(j), nodes[j].y);
        ctx.stroke();
      }
    }
    // Link from selected main node to its textContent node
    if (selectedContentIndex >= 0) {
      ctx.globalAlpha = 1;
      for (let k = 3; k < nodes.length; k++) {
        const m = nodes[k];
        if (m.kind !== "textContent" || m.parentIndex !== selectedContentIndex) continue;
        ctx.beginPath();
        ctx.moveTo(getScreenXForIndex(selectedContentIndex), nodes[selectedContentIndex].y);
        ctx.lineTo(getScreenXForIndex(k), nodes[k].y);
        ctx.stroke();
      }
    }
    // PROBLEMA 3: Link from ABOUT main node to its aboutDescription
    if (selectedContentIndex >= 0 && focusKey === "ABOUT") {
      ctx.globalAlpha = 1;
      for (let k = 3; k < nodes.length; k++) {
        const m = nodes[k];
        if (m.kind !== "aboutDescription" || m.mainIndex !== selectedContentIndex) continue;
        
        // Skip if box not yet calculated (prevents flash)
        if (!m._boxWidth) continue;
        
        // Calculate center of the aboutDescription box (always centered anchor)
        const descCenterX = m.x;
        const descCenterY = m.y;
        
        ctx.beginPath();
        ctx.moveTo(getScreenXForIndex(selectedContentIndex), nodes[selectedContentIndex].y);
        ctx.lineTo(descCenterX, descCenterY);
        ctx.stroke();
      }
    }
  }

  // Nodes (vertical rectangle + label on the right)
  // Sort nodes by z-index for proper layering (media with higher z-index drawn last = on top)
  const sortedIndices = Array.from({ length: nodes.length }, (_, i) => i);
  sortedIndices.sort((a, b) => {
    const nodeA = nodes[a];
    const nodeB = nodes[b];
    // Media nodes use z-index, others use their original order
    const zIndexA = nodeA.kind === "media" ? (nodeA._zIndex || 0) : -1000 - a;
    const zIndexB = nodeB.kind === "media" ? (nodeB._zIndex || 0) : -1000 - b;
    return zIndexA - zIndexB;
  });
  
  ctx.textBaseline = "middle";
  const dpr = Math.max(1, window.devicePixelRatio || 1);
  ctx.font = `${16 * dpr}px StraightNarrow, sans-serif`;
  for (const i of sortedIndices) {
    const n = nodes[i];
    const isMain = i < 3;
    // Compute node alpha for labels/rectangles
    let nodeAlpha = 1;
    if (mode === "focus") {
      nodeAlpha = isMain && i !== mainNodeIndexes[focusKey] ? MAIN_DIM_ALPHA : 1;
    } else if (mode === "category") {
      if (isMain) nodeAlpha = i === mainNodeIndexes.PROJECTS ? 1 : MAIN_DIM_ALPHA;
      else if (n.kind === "child") nodeAlpha = i === selectedCategoryIndex ? 1 : MAIN_DIM_ALPHA;
      else if (n.kind === "grandchild") nodeAlpha = n.parentIndex === selectedCategoryIndex ? 1 : MAIN_DIM_ALPHA;
    } else if (mode === "project") {
      if (isMain) nodeAlpha = i === mainNodeIndexes.PROJECTS ? 1 : 0.1;
      else if (n.kind === "child") nodeAlpha = i === selectedCategoryIndex ? 1 : 0.1;
      else if (n.kind === "grandchild") nodeAlpha = i === selectedProjectIndex ? 1 : 0.1;
      else if (n.kind === "description") nodeAlpha = n.projectIndex === selectedProjectIndex ? 1 : 0.1;
      else if (n.kind === "media") nodeAlpha = n.projectIndex === selectedProjectIndex ? 1 : 0.1;
    } else if (mode === "content") {
      if (isMain) nodeAlpha = i === selectedContentIndex ? 1 : MAIN_DIM_ALPHA;
      else if (n.kind === "textContent") nodeAlpha = n.parentIndex === selectedContentIndex ? 1 : MAIN_DIM_ALPHA;
      else if (n.kind === "aboutDescription") nodeAlpha = n.mainIndex === selectedContentIndex ? 1 : MAIN_DIM_ALPHA;
    }

    // Font size per hierarchy/mode
    let fontSize = FONT_SIZE_MAIN;
    if (mode === "category" && isMain && i !== mainNodeIndexes.PROJECTS) fontSize = FONT_SIZE_MAIN_SMALL;
    if (n.kind === "child") fontSize = FONT_SIZE_CHILD;
    if (n.kind === "grandchild") fontSize = FONT_SIZE_GRANDCHILD;
    if (n.kind === "media") fontSize = 12; // small font for media labels

    // Transition shrink for multiple levels
    const focusT = Math.min(1, uiDepth);
    const catT = Math.max(0, Math.min(1, uiDepth - 1));
    const projectT = Math.max(0, Math.min(1, uiDepth - 2));

    if (isMain && (mode === "focus" || mode === "category" || mode === "project")) {
      if (i !== mainNodeIndexes[focusKey]) {
        fontSize *= (1 - (1 - MAIN_SHRINK_SCALE) * focusT);
        if (mode === "category" || mode === "project") {
          fontSize *= (1 - (1 - CHILD_SHRINK_SCALE) * catT);
        }
        if (mode === "project") {
          fontSize *= (1 - (1 - PROJECT_SHRINK_SCALE) * projectT);
        }
      }
    }
    if (n.kind === "child" && (mode === "category" || mode === "project")) {
      if (i !== selectedCategoryIndex) {
        fontSize *= (1 - (1 - CHILD_SHRINK_SCALE) * catT);
        if (mode === "project") {
          fontSize *= (1 - (1 - PROJECT_SHRINK_SCALE) * projectT);
        }
      }
    }
    if (n.kind === "grandchild" && mode === "project") {
      if (i !== selectedProjectIndex) {
        fontSize *= (1 - (1 - PROJECT_SHRINK_SCALE) * projectT);
      }
    }
    ctx.font = `${fontSize * dpr}px StraightNarrow, sans-serif`;

    // Scale rectangle with font size for mains
    const scale = isMain ? fontSize / FONT_SIZE_MAIN : 1;
    const rectW = RECT.w * scale;
    const rectH = RECT.h * scale;

    // Rectangle centered at (x,y) using screen-space X with camera shift except for selected
    const screenX = getScreenXForIndex(i);

    if (n.kind === "description") {
      // Description nodes: text with adaptive box, positioned ABSOLUTELY in viewport
      ctx.save();
      ctx.globalAlpha = nodeAlpha;
      ctx.fillStyle = getComputedStyle(document.documentElement).getPropertyValue("--fg").trim();
      ctx.font = `${DESC_TEXT_FONT_SIZE * dpr}px StraightNarrow, sans-serif`;
      
      if (n.description) {
        // Wrap text and calculate box size based on actual content
        const wrappedLines = wrapText(ctx, n.description, DESC_TEXT_MAX_WIDTH);
        const boxSize = calculateTextBoxSize(ctx, wrappedLines, DESC_TEXT_LINE_HEIGHT, DESC_TEXT_PADDING);
        
        // Cache box dimensions on node for hit testing
        const isFirstFrame = !n._boxWidth;
        if (!n._boxWidth || n._boxWidth !== boxSize.width) {
          n._boxWidth = boxSize.width;
          n._boxHeight = boxSize.height;
        }
        
        // Skip rendering on first frame to avoid flash with incorrect position
        if (isFirstFrame) {
          ctx.restore();
          continue;
        }
        
        // Calculate box position based on anchor point
        // Use n.x (absolute viewport position), NOT screenX (camera-shifted)
        // The anchor point is used for POSITIONING, but the node CENTER (n.x, n.y) is where the line connects
        let dx, dy;
        switch (DESC_ANCHOR_POINT) {
          case "top-left":
            dx = n.x;
            dy = n.y;
            break;
          case "top-right":
            dx = n.x - n._boxWidth;
            dy = n.y;
            break;
          case "bottom-left":
            dx = n.x;
            dy = n.y - n._boxHeight;
            break;
          case "bottom-right":
            dx = n.x - n._boxWidth;
            dy = n.y - n._boxHeight;
            break;
          case "center":
          default:
            dx = n.x - n._boxWidth / 2;
            dy = n.y - n._boxHeight / 2;
            break;
        }
        
        // No permanent corner brackets - they will appear on hover via cursor
        // (Draw only the text, no border)
        
        // Draw text with proper baseline
        ctx.fillStyle = getComputedStyle(document.documentElement).getPropertyValue("--fg").trim();
        ctx.textBaseline = "top"; // Use top baseline for consistent padding
        const startY = dy + DESC_TEXT_PADDING;
        wrappedLines.forEach((line, i) => {
          ctx.fillText(line, dx + DESC_TEXT_PADDING, startY + i * DESC_TEXT_LINE_HEIGHT);
        });
      }
      ctx.restore();
    } else if (n.kind === "aboutDescription") {
      // About Description nodes: text with adaptive box, CENTERED on screen
      ctx.save();
      ctx.globalAlpha = nodeAlpha;
      ctx.fillStyle = getComputedStyle(document.documentElement).getPropertyValue("--fg").trim();
      ctx.font = `${DESC_TEXT_FONT_SIZE * dpr}px StraightNarrow, sans-serif`;
      
      if (n.description) {
        // Wrap text and calculate box size based on actual content
        const wrappedLines = wrapText(ctx, n.description, DESC_TEXT_MAX_WIDTH);
        const boxSize = calculateTextBoxSize(ctx, wrappedLines, DESC_TEXT_LINE_HEIGHT, DESC_TEXT_PADDING);
        
        // Cache box dimensions on node for hit testing
        const isFirstFrame = !n._boxWidth;
        if (!n._boxWidth || n._boxWidth !== boxSize.width) {
          n._boxWidth = boxSize.width;
          n._boxHeight = boxSize.height;
        }
        
        // Skip rendering on first frame to avoid flash
        if (isFirstFrame) {
          ctx.restore();
          continue;
        }
        
        // PROBLEMA 2: Always use CENTER anchor for aboutDescription
        const dx = n.x - n._boxWidth / 2;
        const dy = n.y - n._boxHeight / 2;
        
        // Draw text with proper baseline
        ctx.fillStyle = getComputedStyle(document.documentElement).getPropertyValue("--fg").trim();
        ctx.textBaseline = "top";
        const startY = dy + DESC_TEXT_PADDING;
        wrappedLines.forEach((line, i) => {
          ctx.fillText(line, dx + DESC_TEXT_PADDING, startY + i * DESC_TEXT_LINE_HEIGHT);
        });
      }
      ctx.restore();
    } else if (n.kind === "textContent") {
      // TextContent nodes: text with adaptive box (for ABOUT/CONTACTS)
      ctx.save();
      ctx.globalAlpha = nodeAlpha;
      ctx.fillStyle = getComputedStyle(document.documentElement).getPropertyValue("--fg").trim();
      ctx.font = `${TEXT_FONT_SIZE * dpr}px StraightNarrow, sans-serif`;
      
      if (n.text) {
        // Wrap text and calculate box size based on actual content
        const wrappedLines = wrapText(ctx, n.text, TEXT_MAX_WIDTH);
        const boxSize = calculateTextBoxSize(ctx, wrappedLines, TEXT_LINE_HEIGHT, TEXT_PADDING);
        
        // Cache box dimensions on node for hit testing
        if (!n._boxWidth || n._boxWidth !== boxSize.width) {
          n._boxWidth = boxSize.width;
          n._boxHeight = boxSize.height;
        }
        
        const tx = screenX - n._boxWidth / 2;
        const ty = n.y - n._boxHeight / 2;
        
        // No permanent corner brackets - they will appear on hover via cursor
        // (Draw only the text, no border)
        
        // Draw text with proper baseline
        ctx.fillStyle = getComputedStyle(document.documentElement).getPropertyValue("--fg").trim();
        ctx.textBaseline = "top"; // Use top baseline for consistent padding
        const startY = ty + TEXT_PADDING;
        wrappedLines.forEach((line, i) => {
          ctx.fillText(line, tx + TEXT_PADDING, startY + i * TEXT_LINE_HEIGHT);
        });
      }
      ctx.restore();
    } else if (n.kind === "media") {
      // Media nodes: show image with preserved aspect ratio
      ctx.save();
      ctx.globalAlpha = nodeAlpha;
      
      // Draw media thumbnail
      if (n.mediaType === 'image' && n.mediaSrc) {
        // Check if image is already cached
        if (!n._imageCache) {
          n._imageCache = new Image();
          n._imageCache.onload = () => {
            // Calculate dimensions preserving aspect ratio when image loads
            const imgWidth = n._imageCache.naturalWidth;
            const imgHeight = n._imageCache.naturalHeight;
            const aspectRatio = imgWidth / imgHeight;
            
            if (aspectRatio > 1) {
              // Landscape: width is MEDIA_SIZE
              n._imageWidth = MEDIA_SIZE;
              n._imageHeight = MEDIA_SIZE / aspectRatio;
            } else {
              // Portrait or square: height is MEDIA_SIZE
              n._imageHeight = MEDIA_SIZE;
              n._imageWidth = MEDIA_SIZE * aspectRatio;
            }
          };
          n._imageCache.onerror = () => {
            n._imageFailed = true;
            n._imageWidth = MEDIA_SIZE;
            n._imageHeight = MEDIA_SIZE;
          };
          n._imageCache.src = n.mediaSrc;
        }
        
        // Use calculated dimensions or default square, apply individual scale
        const baseWidth = n._imageWidth || MEDIA_SIZE;
        const baseHeight = n._imageHeight || MEDIA_SIZE;
        const scale = n._individualScale || 1;
        const imgWidth = baseWidth * scale;
        const imgHeight = baseHeight * scale;
        const mx = screenX - imgWidth / 2;
        const my = n.y - imgHeight / 2;
        
        // Draw border with configurable width (scaled by DPR for consistent appearance)
        ctx.save();
        ctx.lineWidth = MEDIA_BORDER_WIDTH * dpr;
        ctx.strokeRect(mx, my, imgWidth, imgHeight);
        ctx.restore();
        
        // Draw image if loaded
        if (n._imageCache.complete && !n._imageFailed) {
          ctx.drawImage(n._imageCache, mx, my, imgWidth, imgHeight);
        } else if (n._imageFailed) {
          // Show fallback for failed loads
          ctx.fillStyle = COLOR;
          ctx.font = `${12 * (window.devicePixelRatio || 1)}px StraightNarrow, sans-serif`;
          ctx.fillText('Image', mx + 5, my + imgHeight / 2);
          ctx.fillText('Error', mx + 5, my + imgHeight / 2 + 15);
        } else {
          // Loading state
          ctx.fillStyle = COLOR;
          ctx.font = `${12 * (window.devicePixelRatio || 1)}px StraightNarrow, sans-serif`;
          ctx.fillText('Loading...', mx + 5, my + imgHeight / 2);
        }
      } else {
        // Fallback for non-image media, apply individual scale
        const scale = n._individualScale || 1;
        const imgWidth = MEDIA_SIZE * scale;
        const imgHeight = MEDIA_SIZE * scale;
        const mx = screenX - imgWidth / 2;
        const my = n.y - imgHeight / 2;
        // Draw border with configurable width (scaled by DPR for consistent appearance)
        ctx.save();
        ctx.lineWidth = MEDIA_BORDER_WIDTH * dpr;
        ctx.strokeRect(mx, my, imgWidth, imgHeight);
        ctx.restore();
        ctx.fillRect(mx, my, imgWidth, imgHeight);
      }
      
      ctx.restore();
    } else {
      // Regular nodes: rectangle + label
      const rx = screenX - rectW / 2;
      const ry = n.y - rectH / 2;
      if (nodeAlpha < 1) {
        ctx.save();
        ctx.globalCompositeOperation = "destination-out";
        ctx.fillRect(rx - 1, ry - 1, rectW + 2, rectH + 2);
        ctx.restore();
      }
      ctx.save();
      ctx.globalAlpha = nodeAlpha;
      ctx.fillRect(rx, ry, rectW, rectH);
      ctx.restore();

      // Label
      const labelX = screenX + rectW / 2 + 8;
      ctx.save();
      ctx.globalAlpha = nodeAlpha;
      ctx.fillText(n.label, labelX, n.y);
      ctx.restore();
    }
  }
  ctx.restore();
}

// Compute the effective on-screen X position for node index i,
// so that the selected focus main stays anchored while others shift with camera.
function getScreenXForIndex(i) {
  // In home: everyone moves together (no camera shift already applied in nodes)
  if (mode === "home") return nodes[i].x + cameraOffsetX;
  // In focus: keep the focused main anchored; shift others
  if (mode === "focus") {
    const focusIdx = mainNodeIndexes[focusKey];
    // Anchor the focus main and its children so they appear to the right of the focus
    if (i === focusIdx || nodes[i]?.kind === "child") return nodes[i].x; // no shift
    return nodes[i].x + cameraOffsetX;
  }
  // In category: keep selected category anchored as well
  if (mode === "category") {
    const n = nodes[i];
    if (i === selectedCategoryIndex) return nodes[i].x; // anchor category
    // also anchor its grandchildren so they spawn and stay on the right side
    if (n?.kind === "grandchild" && n.parentIndex === selectedCategoryIndex) return nodes[i].x;
    return nodes[i].x + cameraOffsetX;
  }
  // In project: anchor the selected project and its content nodes
  if (mode === "project") {
    const n = nodes[i];
    if (i === selectedProjectIndex) return nodes[i].x; // anchor project
    // also anchor its content nodes so they stay with the project
    if ((n?.kind === "media" || n?.kind === "description") && n.projectIndex === selectedProjectIndex) return nodes[i].x;
    return nodes[i].x + cameraOffsetX;
  }
  // In content: anchor the selected main and its textContent/aboutDescription node
  if (mode === "content") {
    const n = nodes[i];
    if (i === selectedContentIndex) return nodes[i].x; // anchor selected main
    // also anchor its textContent/aboutDescription node so it stays with the main
    if (n?.kind === "textContent" && n.parentIndex === selectedContentIndex) return nodes[i].x;
    if (n?.kind === "aboutDescription" && n.mainIndex === selectedContentIndex) return nodes[i].x;
    return nodes[i].x + cameraOffsetX;
  }
  return nodes[i].x + cameraOffsetX;
}

function hitTestNode(n, px, py) {
  // Expand hit area to include label width
  const rectX = n.x - RECT.w / 2;
  const rectY = n.y - RECT.h / 2;
  const labelWidth = measureTextWidth(n.label);
  const w = RECT.w + 8 + labelWidth;
  const h = Math.max(RECT.h, 18);
  return px >= rectX && px <= rectX + w && py >= rectY && py <= rectY + h;
}

function measureTextWidth(text) {
  ctx.save();
  ctx.font = `${16 * (window.devicePixelRatio || 1)}px StraightNarrow, sans-serif`;
  const w = ctx.measureText(text).width;
  ctx.restore();
  return w;
}

// Helper function to wrap text to fit within maxWidth
function wrapText(context, text, maxWidth) {
  const paragraphs = text.split('\n');
  const lines = [];
  
  for (const paragraph of paragraphs) {
    if (paragraph.trim() === '') {
      lines.push('');
      continue;
    }
    
    const words = paragraph.split(' ');
    let currentLine = '';
    
    for (const word of words) {
      const testLine = currentLine ? `${currentLine} ${word}` : word;
      const metrics = context.measureText(testLine);
      
      if (metrics.width > maxWidth && currentLine) {
        lines.push(currentLine);
        currentLine = word;
      } else {
        currentLine = testLine;
      }
    }
    
    if (currentLine) {
      lines.push(currentLine);
    }
  }
  
  return lines;
}

// Calculate box dimensions based on wrapped text (adapts to actual content)
function calculateTextBoxSize(context, lines, lineHeight, padding) {
  // Calculate actual width based on longest line
  let maxLineWidth = 0;
  for (const line of lines) {
    const metrics = context.measureText(line);
    if (metrics.width > maxLineWidth) {
      maxLineWidth = metrics.width;
    }
  }
  
  const width = maxLineWidth + padding * 2;
  const height = lines.length * lineHeight + padding * 2;
  return { width, height };
}

// Draw corner brackets instead of full border
function drawCorners(ctx, x, y, width, height, cornerSize) {
  ctx.beginPath();
  // Top-left corner
  ctx.moveTo(x, y + cornerSize);
  ctx.lineTo(x, y);
  ctx.lineTo(x + cornerSize, y);
  // Top-right corner
  ctx.moveTo(x + width - cornerSize, y);
  ctx.lineTo(x + width, y);
  ctx.lineTo(x + width, y + cornerSize);
  // Bottom-right corner
  ctx.moveTo(x + width, y + height - cornerSize);
  ctx.lineTo(x + width, y + height);
  ctx.lineTo(x + width - cornerSize, y + height);
  // Bottom-left corner
  ctx.moveTo(x + cornerSize, y + height);
  ctx.lineTo(x, y + height);
  ctx.lineTo(x, y + height - cornerSize);
  ctx.stroke();
}

// Hit test using on-screen X with camera offset so cursor attachment matches shifted positions
function hitTestAtScreen(px, py) {
  for (let i = nodes.length - 1; i >= 0; i--) {
    const n = nodes[i];
    const screenX = getScreenXForIndex(i);

    if (n.kind === "description") {
      // Description nodes hit area (use cached dimensions from actual content)
      // Use ABSOLUTE position (n.x), not camera-shifted screenX
      if (n._boxWidth && n._boxHeight) {
        // Use same anchor point logic as in draw()
        let dx, dy;
        switch (DESC_ANCHOR_POINT) {
          case "top-left":
            dx = n.x;
            dy = n.y;
            break;
          case "top-right":
            dx = n.x - n._boxWidth;
            dy = n.y;
            break;
          case "bottom-left":
            dx = n.x;
            dy = n.y - n._boxHeight;
            break;
          case "bottom-right":
            dx = n.x - n._boxWidth;
            dy = n.y - n._boxHeight;
            break;
          case "center":
          default:
            dx = n.x - n._boxWidth / 2;
            dy = n.y - n._boxHeight / 2;
            break;
        }
        if (px >= dx && px <= dx + n._boxWidth && py >= dy && py <= dy + n._boxHeight) return i;
      }
    } else if (n.kind === "aboutDescription") {
      // aboutDescription nodes hit area - always CENTER anchor
      if (n._boxWidth && n._boxHeight) {
        const dx = n.x - n._boxWidth / 2;
        const dy = n.y - n._boxHeight / 2;
        if (px >= dx && px <= dx + n._boxWidth && py >= dy && py <= dy + n._boxHeight) return i;
      }
    } else if (n.kind === "textContent") {
      // TextContent nodes hit area (use cached dimensions from actual content)
      if (n._boxWidth && n._boxHeight) {
        const tx = screenX - n._boxWidth / 2;
        const ty = n.y - n._boxHeight / 2;
        if (px >= tx && px <= tx + n._boxWidth && py >= ty && py <= ty + n._boxHeight) return i;
      }
    } else if (n.kind === "media") {
      // Media nodes hit area (use actual dimensions with aspect ratio and individual scale)
      const baseWidth = n._imageWidth || MEDIA_SIZE;
      const baseHeight = n._imageHeight || MEDIA_SIZE;
      const scale = n._individualScale || 1;
      const imgWidth = baseWidth * scale;
      const imgHeight = baseHeight * scale;
      const mx = screenX - imgWidth / 2;
      const my = n.y - imgHeight / 2;
      if (px >= mx && px <= mx + imgWidth && py >= my && py <= my + imgHeight) return i;
    } else {
      // Regular nodes: rectangle + label
      const fontSize = getFontSizeForIndex(i);
      const isMain = i < 3;
      const scale = isMain ? fontSize / FONT_SIZE_MAIN : 1;
      const rectW = RECT.w * scale;
      const rectH = isMain ? RECT.h * scale : RECT.h;
      const labelWidth = measureTextWidthWithFont(n.label, fontSize);
      const rx = screenX - rectW / 2;
      const ry = n.y - rectH / 2;
      const w = rectW + 8 + labelWidth;
      const h = Math.max(rectH, fontSize * (window.devicePixelRatio || 1));
      if (px >= rx && px <= rx + w && py >= ry && py <= ry + h) return i;
    }
  }
  return -1;
}

function getFontSizeForIndex(i) {
  const isMain = i < 3;
  let fontSize = FONT_SIZE_MAIN;
  if (mode === "category" && isMain && i !== mainNodeIndexes.PROJECTS) fontSize = FONT_SIZE_MAIN_SMALL;
  const n = nodes[i];
  if (n?.kind === "child") fontSize = FONT_SIZE_CHILD;
  if (n?.kind === "grandchild") fontSize = FONT_SIZE_GRANDCHILD;
  if (n?.kind === "description") fontSize = 14; // readable font for description text
  // apply shrink from transitions
  const focusT = Math.min(1, uiDepth);
  const catT = Math.max(0, Math.min(1, uiDepth - 1));
  const projectT = Math.max(0, Math.min(1, uiDepth - 2));

  if (isMain && (mode === "focus" || mode === "category" || mode === "project")) {
    if (i !== mainNodeIndexes[focusKey]) {
      fontSize *= (1 - (1 - MAIN_SHRINK_SCALE) * focusT);
      if (mode === "category" || mode === "project") {
        fontSize *= (1 - (1 - CHILD_SHRINK_SCALE) * catT);
      }
      if (mode === "project") {
        fontSize *= (1 - (1 - PROJECT_SHRINK_SCALE) * projectT);
      }
    }
  }
  if (n?.kind === "child" && (mode === "category" || mode === "project")) {
    if (i !== selectedCategoryIndex) {
      fontSize *= (1 - (1 - CHILD_SHRINK_SCALE) * catT);
      if (mode === "project") {
        fontSize *= (1 - (1 - PROJECT_SHRINK_SCALE) * projectT);
      }
    }
  }
  if (n?.kind === "grandchild" && mode === "project") {
    if (i !== selectedProjectIndex) {
      fontSize *= (1 - (1 - PROJECT_SHRINK_SCALE) * projectT);
    }
  }
  if (n?.kind === "media" && mode === "project") {
    fontSize = 12; // small font for media labels
  }
  if (n?.kind === "description" && mode === "project") {
    fontSize = 14; // readable font for description text
  }
  return fontSize;
}

function measureTextWidthWithFont(text, fontSize) {
  ctx.save();
  ctx.font = `${fontSize * (window.devicePixelRatio || 1)}px StraightNarrow, sans-serif`;
  const w = ctx.measureText(text).width;
  ctx.restore();
  return w;
}

function clamp(v, lo, hi) { return Math.max(lo, Math.min(hi, v)); }
function lerp(a, b, t) { return a + (b - a) * t; }

async function enterFocus(which) {
  // TOGGLE: If already in focus mode with the same key, close it
  if (mode === "focus" && focusKey === which) {
    // Close focus and return to home
    nodes = nodes.slice(0, 3); // Remove all child nodes
    mode = "home";
    focusKey = null;
    selectedCategoryIndex = -1;
    selectedProjectIndex = -1;
    uiDepthTarget = 0;
    // FIX: Reset camera AND depth immediately to avoid visual jump
    uiDepth = 0;
    cameraTargetOffsetX = 0;
    cameraOffsetX = 0;
    // FIX: Reset hoveredNodeIndex so hover is re-triggered on the node we just clicked
    hoveredNodeIndex = -1;
    // Resume movement for main nodes
    for (let i = 0; i < 3; i++) {
      nodes[i].targetTimer = 0.01;
    }
    return;
  }

  mode = "focus";
  focusKey = which;
  selectedCategoryIndex = -1;
  selectedProjectIndex = -1;
  uiDepthTarget = 1; // camera shift to depth 1
  // freeze main nodes
  for (let i = 0; i < 3; i++) {
    const n = nodes[i];
    n.vx = 0; n.vy = 0; n.targetX = n.x; n.targetY = n.y; n.targetTimer = 1e9;
  }
  // remove any previous children
  nodes = nodes.slice(0, 3);

  if (which === "PROJECTS") {
    const cats = await loadProjectCategories();
    const anchor = nodes[mainNodeIndexes.PROJECTS];
    const step = (2 * CHILD_SECTOR_HALF_ANGLE) / Math.max(1, (cats.length - 1) || 1);
    const r = CHILD_RING_RADIUS;
    for (let i = 0; i < cats.length; i++) {
      // distribute in a small fan around the east direction
      const ang = -CHILD_SECTOR_HALF_ANGLE + i * step;
      let x = anchor.x + Math.cos(ang) * r + CHILD_X_OFFSET;
      let y = anchor.y + Math.sin(ang) * r;
      const c = clampToBounds(x, y, centralBounds(ctx.canvas.width, ctx.canvas.height));
      nodes.push(createChildNode(cats[i].toUpperCase(), `#/projects/${cats[i]}`, c.x, c.y, "PROJECTS"));
    }
  } else if (which === "CONTACTS") {
    // Load contact method nodes from JSON
    const contacts = await loadContacts();
    const anchor = nodes[mainNodeIndexes.CONTACTS];
    const step = (2 * CHILD_SECTOR_HALF_ANGLE) / Math.max(1, (contacts.length - 1) || 1);
    const r = CHILD_RING_RADIUS;
    for (let i = 0; i < contacts.length; i++) {
      // distribute in a small fan around the east direction
      const ang = -CHILD_SECTOR_HALF_ANGLE + i * step;
      let x = anchor.x + Math.cos(ang) * r + CHILD_X_OFFSET;
      let y = anchor.y + Math.sin(ang) * r;
      const c = clampToBounds(x, y, centralBounds(ctx.canvas.width, ctx.canvas.height));
      // Create child node with URL for opening links
      const contactNode = createChildNode(contacts[i].name.toUpperCase(), `#/contacts/${contacts[i].slug}`, c.x, c.y, "CONTACTS");
      contactNode.url = contacts[i].url; // Add URL for link opening
      nodes.push(contactNode);
    }
  }
}

function createChildNode(label, hash, x, y, parentKey = null) {
  return {
    kind: "child",
    label,
    labelRaw: label.toLowerCase(),
    hash,
    parentKey, // which main node is the parent (PROJECTS, CONTACTS, etc.)
    x,
    y,
    vx: 0,
    vy: 0,
    targetTimer: 0,
    targetX: x,
    targetY: y,
  };
}

function createGrandchildNode(label, hash, x, y, parentIndex, category = null, slug = null) {
  return {
    kind: "grandchild",
    label,
    hash,
    parentIndex,
    category, // category slug for project mode
    slug, // project slug for project mode
    x,
    y,
    vx: 0,
    vy: 0,
    targetTimer: 0,
    targetX: x,
    targetY: y,
  };
}

function createMediaNode(mediaItem, projectIndex, mediaIndex) {
  const projectNode = nodes[projectIndex];
  // Spawn media within the defined angular sector
  // Random angle between MEDIA_SECTOR_ANGLE_MIN and MEDIA_SECTOR_ANGLE_MAX
  const angle = MEDIA_SECTOR_ANGLE_MIN + Math.random() * (MEDIA_SECTOR_ANGLE_MAX - MEDIA_SECTOR_ANGLE_MIN);
  // Each media gets its own individual distance (saved for oscillation)
  const individualDistance = MEDIA_MIN_DISTANCE + Math.random() * (MEDIA_MAX_DISTANCE - MEDIA_MIN_DISTANCE);
  // Each media gets its own individual scale
  const individualScale = MEDIA_SCALE_MIN + Math.random() * (MEDIA_SCALE_MAX - MEDIA_SCALE_MIN);
  const baseX = projectNode.x + Math.cos(angle) * individualDistance;
  const baseY = projectNode.y + Math.sin(angle) * individualDistance;
  
  return {
    kind: "media",
    mediaType: mediaItem.type,
    mediaSrc: mediaItem.src,
    mediaAlt: mediaItem.alt,
    projectIndex,
    mediaIndex, // track which media this is
    x: baseX,
    y: baseY,
    vx: 0,
    vy: 0,
    targetTimer: 0,
    targetX: baseX,
    targetY: baseY,
    // Individual distance from project node (for consistent oscillation)
    _individualDistance: individualDistance,
    // Individual scale for this media (stays consistent)
    _individualScale: individualScale,
    // Z-index for layering (higher = on top)
    _zIndex: 0,
    // Will be set when image loads
    _imageWidth: null,
    _imageHeight: null,
  };
}

function createDescriptionNode(project, projectIndex) {
  // Spawn description at absolute viewport position (not relative to project)
  // Use FULL canvas dimensions (not bounds with padding) for absolute positioning
  const canvasWidth = ctx.canvas.width;
  const canvasHeight = ctx.canvas.height;
  
  // Calculate ANCHOR position within FULL canvas using ratios
  // This is the position of the anchor point (e.g., top-right corner)
  const randomX = DESC_VIEWPORT_X_MIN + Math.random() * (DESC_VIEWPORT_X_MAX - DESC_VIEWPORT_X_MIN);
  const randomY = DESC_VIEWPORT_Y_MIN + Math.random() * (DESC_VIEWPORT_Y_MAX - DESC_VIEWPORT_Y_MIN);
  
  // Use FULL canvas dimensions (0 to canvasWidth/Height)
  let anchorX = randomX * canvasWidth;
  let anchorY = randomY * canvasHeight;
  
  // Clamp to ensure it stays within visible canvas (minimal margin)
  const margin = 50; // reduced safety margin
  anchorX = clamp(anchorX, margin, canvasWidth - margin);
  anchorY = clamp(anchorY, margin, canvasHeight - margin);
  
  // Store the anchor position - we'll calculate the center later when we know box size
  // For now, use the anchor as the node position (will be adjusted in draw())
  return {
    kind: "description",
    description: project.description,
    projectIndex,
    x: anchorX, // This will be interpreted based on DESC_ANCHOR_POINT in draw()
    y: anchorY,
    vx: 0,
    vy: 0,
    targetTimer: 0,
    targetX: anchorX,
    targetY: anchorY,
  };
}

let cachedCategories = null;
async function loadProjectCategories() {
  if (cachedCategories) return cachedCategories;
  try {
    const res = await fetch("/data/projects.json", { cache: "no-store" });
    const data = await res.json();
    const set = new Set();
    data.forEach((p) => p.category && set.add(p.category));
    cachedCategories = Array.from(set);
    return cachedCategories;
  } catch (e) {
    return ["visuals", "algolab", "installations"];
  }
}

async function enterCategory(categoryIndex, categoryLabelRaw) {
  mode = "category";
  selectedCategoryIndex = categoryIndex;
  selectedProjectIndex = -1;
  uiDepthTarget = 2; // camera shift deeper
  // keep mains frozen
  for (let i = 0; i < 3; i++) {
    const n = nodes[i];
    n.vx = 0; n.vy = 0; n.targetX = n.x; n.targetY = n.y; n.targetTimer = 1e9;
  }
  // freeze all category nodes as well (they will not resume on hover)
  for (let i = 3; i < nodes.length; i++) {
    const c = nodes[i];
    if (c.kind !== "child") continue;
    c.vx = 0; c.vy = 0; c.targetX = c.x; c.targetY = c.y; c.targetTimer = 1e9;
  }
  // freeze all category nodes except selected
  for (let i = 3; i < nodes.length; i++) {
    const c = nodes[i];
    if (c.kind !== "child") continue;
    // all three stay frozen in category mode; selected will still be frozen but at 100% opacity
    c.vx = 0; c.vy = 0; c.targetX = c.x; c.targetY = c.y; c.targetTimer = 1e9;
  }
  // remove previous grand-children
  nodes = nodes.filter((n, idx) => n.kind !== "grandchild" || n.parentIndex === selectedCategoryIndex);
  // load projects for selected category
  const projects = await loadProjectsByCategory(categoryLabelRaw);
  const anchor = nodes[selectedCategoryIndex];
  const step = (2 * GRANDCHILD_SECTOR_HALF_ANGLE) / Math.max(1, projects.length - 1 || 1);
  const r = Math.max(MIN_CHILD_DISTANCE, GRANDCHILD_WANDER_RADIUS);
  // remove previous grand-children
  nodes = nodes.filter((n, idx) => n.kind !== "grandchild");
  for (let i = 0; i < projects.length; i++) {
    // distribute to the right of the category
    const ang = -GRANDCHILD_SECTOR_HALF_ANGLE + i * step; // centered on east
    let x = anchor.x + Math.cos(ang) * r + GRANDCHILD_X_OFFSET;
    let y = anchor.y + Math.sin(ang) * r;
    const c = clampToBounds(x, y, centralBounds(ctx.canvas.width, ctx.canvas.height));
    nodes.push(createGrandchildNode(projects[i].title.toUpperCase(), `#/projects/${categoryLabelRaw}/${projects[i].slug}`, c.x, c.y, selectedCategoryIndex, categoryLabelRaw, projects[i].slug));
  }
}

function refreshCategoryTargets() {
  if (mode !== "category" || selectedCategoryIndex < 0) return;
  // Nudge the selected category to keep frozen
  const selected = nodes[selectedCategoryIndex];
  selected.vx = 0; selected.vy = 0; selected.targetX = selected.x; selected.targetY = selected.y; selected.targetTimer = 1e9;
  // Update targets for existing grand-children around the selected category
  const anchor = nodes[selectedCategoryIndex];
  for (let i = 3; i < nodes.length; i++) {
    const c = nodes[i];
    if (c.kind !== "grandchild" || c.parentIndex !== selectedCategoryIndex) continue;
    const ang = (Math.random() - 0.5) * 2 * GRANDCHILD_SECTOR_HALF_ANGLE; // around east
    let tx = anchor.x + Math.cos(ang) * GRANDCHILD_WANDER_RADIUS + GRANDCHILD_X_OFFSET;
    let ty = anchor.y + Math.sin(ang) * GRANDCHILD_WANDER_RADIUS;
    const bounds = centralBounds(ctx?.canvas?.width || 800, ctx?.canvas?.height || 600);
    const clamped = clampToBounds(tx, ty, bounds);
    c.targetX = clamped.x; c.targetY = clamped.y;
    c.targetTimer = 0.01;
  }
}

async function enterProjectMode(projectIndex, categorySlug, projectSlug) {
  mode = "project";
  selectedProjectIndex = projectIndex;
  uiDepthTarget = 3; // deepest level

  // freeze all nodes
  for (let i = 0; i < nodes.length; i++) {
    const n = nodes[i];
    n.vx = 0; n.vy = 0; n.targetX = n.x; n.targetY = n.y; n.targetTimer = 1e9;
  }

  // remove any existing content nodes (media and description)
  nodes = nodes.filter(n => n.kind !== "media" && n.kind !== "description");

  // load project data and create content nodes
  try {
    const projects = await loadProjects();
    const project = projects.find(p => p.category === categorySlug && p.slug === projectSlug);
    if (project) {
      // Create description text node
      const descNode = createDescriptionNode(project, projectIndex);
      nodes.push(descNode);

      // Create media nodes (filter out empty media objects)
      if (project.media) {
        const validMedia = project.media.filter(m => m.type && m.src);
        for (let i = 0; i < validMedia.length; i++) {
          const mediaNode = createMediaNode(validMedia[i], projectIndex, i);
          nodes.push(mediaNode);
        }
      }
    }
  } catch (e) {
    console.error('Error loading project data:', e);
  }
}

async function enterAboutMode(mainIndex) {
  // PROBLEMA 2: If already in about mode, TOGGLE (close it)
  if (mode === "content" && focusKey === "ABOUT") {
    // Close about and return to home
    nodes = nodes.filter(n => n.kind !== "aboutDescription");
    mode = "home";
    focusKey = null;
    selectedContentIndex = -1;
    uiDepthTarget = 0;
    // FIX: Reset camera AND depth immediately to avoid visual jump
    uiDepth = 0;
    cameraTargetOffsetX = 0;
    cameraOffsetX = 0;
    // FIX: Reset hoveredNodeIndex so hover is re-triggered on the node we just clicked
    hoveredNodeIndex = -1;
    // Resume movement for main nodes
    for (let i = 0; i < 3; i++) {
      nodes[i].targetTimer = 0.01;
    }
    return;
  }

  mode = "content";
  focusKey = "ABOUT";
  selectedContentIndex = mainIndex;
  uiDepthTarget = 1; // similar to focus depth
  cameraTargetOffsetX = CAMERA_SHIFT_PER_DEPTH * ctx.canvas.width * uiDepthTarget;

  // PROBLEMA 1: Remove ANY previous child nodes (from CONTACTS/PROJECTS)
  nodes = nodes.slice(0, 3);

  // freeze main nodes
  for (let i = 0; i < 3; i++) {
    const n = nodes[i];
    n.vx = 0; n.vy = 0; n.targetX = n.x; n.targetY = n.y; n.targetTimer = 1e9;
  }

  // load about text from JSON
  try {
    const aboutData = await loadAbout();
    // Create description node (same as project description)
    const aboutNode = createAboutDescriptionNode(aboutData.text, mainIndex);
    nodes.push(aboutNode);
  } catch (e) {
    console.error('Error loading about data:', e);
  }
}

function createAboutDescriptionNode(text, mainIndex) {
  // PROBLEMA 2: Position centered on screen instead of using DESC_VIEWPORT ratios
  const canvasWidth = ctx.canvas.width;
  const canvasHeight = ctx.canvas.height;
  
  // Center position (will be adjusted based on anchor point in draw())
  let anchorX = canvasWidth / 2;
  let anchorY = canvasHeight / 2;
  
  return {
    kind: "aboutDescription", // PROBLEMA 3: Different kind to render with center anchor
    description: text,
    mainIndex: mainIndex, // Link to ABOUT main node (not projectIndex)
    x: anchorX,
    y: anchorY,
    vx: 0,
    vy: 0,
    targetTimer: 1e9, // frozen
    targetX: anchorX,
    targetY: anchorY,
  };
}

async function enterContentMode(mainIndex, label) {
  mode = "content";
  selectedContentIndex = mainIndex;
  uiDepthTarget = 2; // similar depth to category mode
  cameraTargetOffsetX = CAMERA_SHIFT_PER_DEPTH * ctx.canvas.width * uiDepthTarget;

  // freeze all existing nodes
  for (let i = 0; i < nodes.length; i++) {
    const n = nodes[i];
    n.vx = 0; n.vy = 0; n.targetX = n.x; n.targetY = n.y; n.targetTimer = 1e9;
  }

  // remove any existing child/content nodes
  nodes = nodes.filter(n => n.kind !== "child" && n.kind !== "textContent");

  // create a text content node for ABOUT or CONTACTS
  const mainNode = nodes[mainIndex];
  const dummyText = label === "ABOUT" 
    ? "This is dummy text for the ABOUT section.\n\nHere you would include information about yourself, your work, your philosophy, and anything else relevant to your portfolio.\n\nThis text can span multiple lines and will be displayed in a text box anchored to the right of the ABOUT node."
    : "This is dummy text for the CONTACTS section.\n\nYou can include:\n- Email: your@email.com\n- Instagram: @yourhandle\n- Other social links\n\nThis content will be displayed in a text box anchored to the right of the CONTACTS node.";
  
  const textNode = {
    kind: "textContent",
    text: dummyText,
    parentIndex: mainIndex,
    x: mainNode.x + TEXT_OFFSET_X,
    y: mainNode.y + TEXT_OFFSET_Y,
    vx: 0,
    vy: 0,
    targetTimer: 1e9, // frozen
    targetX: mainNode.x + TEXT_OFFSET_X,
    targetY: mainNode.y + TEXT_OFFSET_Y,
  };
  nodes.push(textNode);
}

let cachedProjects = null;
async function loadProjects() {
  if (!cachedProjects) {
    const res = await fetch("/data/projects.json", { cache: "no-store" });
    cachedProjects = await res.json();
  }
  return cachedProjects;
}

async function loadProjectsByCategory(cat) {
  const projects = await loadProjects();
  return projects.filter((p) => p.category === cat);
}

let cachedContacts = null;
async function loadContacts() {
  if (!cachedContacts) {
    const res = await fetch("/data/contacts.json", { cache: "no-store" });
    cachedContacts = await res.json();
  }
  return cachedContacts;
}

let cachedAbout = null;
async function loadAbout() {
  if (!cachedAbout) {
    const res = await fetch("/data/about.json", { cache: "no-store" });
    cachedAbout = await res.json();
  }
  return cachedAbout;
}

// --- helpers for anchors and bounds ---
function computeMainAnchors(width, height) {
  const b = centralBounds(width, height);
  const cx = (b.left + b.right) / 2;
  const cy = (b.top + b.bottom) / 2;
  const r = Math.min(b.right - b.left, b.bottom - b.top) * 0.35;
  const angles = [-Math.PI / 2, (3 * Math.PI) / 4, -Math.PI / 6];
  return angles.map((ang) => ({ x: cx + Math.cos(ang) * r, y: cy + Math.sin(ang) * r }));
}

function clampToBounds(x, y, bounds) {
  return {
    x: clamp(x, bounds.left + 10, bounds.right - 10),
    y: clamp(y, bounds.top + 10, bounds.bottom - 10),
  };
}

