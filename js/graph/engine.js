// Graph engine: state management, physics, and rendering
import * as CFG from './config.js';

// ============= STATE MANAGEMENT =============

export const state = {
  // Canvas & animation
  ctx: null,
  animationHandle: null,
  lastTimestamp: 0,
  
  // Nodes
  nodes: [],
  mainNodeIndexes: { ABOUT: -1, PROJECTS: -1, CONTACTS: -1 },
  mainAnchors: [],
  
  // Mode & selection
  mode: "home", // 'home' | 'focus' | 'category' | 'project' | 'content'
  focusKey: null, // 'ABOUT' | 'PROJECTS' | 'CONTACTS'
  selectedCategoryIndex: -1,
  selectedProjectIndex: -1,
  selectedContentIndex: -1,
  
  // Camera
  uiDepth: 0, // 0 home, 1 focus, 2 category, 3 project, 4 content
  uiDepthTarget: 0,
  cameraOffsetX: 0,
  cameraTargetOffsetX: 0,
  
  // Interaction
  hoveredNodeIndex: -1,
  draggedNodeIndex: -1,
  dragOffsetX: 0,
  dragOffsetY: 0
};

// Helper to check if a node can resume movement after hover
export function canResume(index) {
  if (index < 0) return false;
  if (state.mode === "home") return true;
  const kind = state.nodes[index]?.kind;
  if (state.mode === "focus") return kind === "child";
  if (state.mode === "category") return kind === "grandchild";
  if (state.mode === "project") return kind === "media";
  return false;
}

// ============= PHYSICS ENGINE =============

export function step(dt) {
  const { width, height } = state.ctx.canvas;
  const bounds = getBounds(width, height);
  
  for (const n of state.nodes) {
    // If node is explicitly frozen (very large timer), keep it perfectly still
    if (n.targetTimer > 1e8) {
      n.vx = 0;
      n.vy = 0;
      continue;
    }
    
    const idx = state.nodes.indexOf(n);
    
    // Repulsion among main nodes to avoid clustering
    if (idx >= 0 && idx < 3) {
      applyAnchorSpring(n, idx);
      applyRepulsion(n, idx);
    }
    
    // Repulsion among media nodes to keep them spread out
    if (n.kind === "media" && state.mode === "project") {
      applyMediaRepulsion(n, idx);
    }
    
    // Repulsion among child nodes (categories/contacts)
    if (n.kind === "child" && (state.mode === "focus" || state.mode === "category" || state.mode === "project")) {
      applyChildRepulsion(n, idx);
    }
    
    // Repulsion among grandchild nodes (projects)
    if (n.kind === "grandchild" && (state.mode === "category" || state.mode === "project")) {
      applyGrandchildRepulsion(n, idx);
    }
    
    const speedScale = getSpeedScale(n);
    
    // Occasionally pick a new random target within bounds
    n.targetTimer -= dt;
    if (n.targetTimer <= 0) {
      n.targetTimer = 2 + Math.random() * 2.5;
      assignNewTarget(n, idx, bounds);
    }
    
    // Description and aboutDescription nodes remain completely static
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
    
    // Hard boundary clamping for media nodes (stay inside spawn area)
    // Skip if media was manually dragged by user
    if (n.kind === "media" && state.mode === "project" && !n._manuallyMoved) {
      const isMobileView = window.innerWidth <= CFG.MEDIA.MOBILE_BREAKPOINT;
      const area = isMobileView ? CFG.MEDIA.MOBILE : CFG.MEDIA.DESKTOP;
      const scale = n._individualScale || 1;
      const imgWidth = n._imageWidth || CFG.MEDIA.SIZE;
      const imgHeight = n._imageHeight || CFG.MEDIA.SIZE;
      const marginX = imgWidth * scale / 2;
      const marginY = imgHeight * scale / 2;
      
      const minX = area.X_MIN * width + marginX;
      const maxX = area.X_MAX * width - marginX;
      const minY = area.Y_MIN * height + marginY;
      const maxY = area.Y_MAX * height - marginY;
      
      // Clamp position
      if (n.x < minX) { n.x = minX; n.vx = Math.abs(n.vx) * 0.5; }
      if (n.x > maxX) { n.x = maxX; n.vx = -Math.abs(n.vx) * 0.5; }
      if (n.y < minY) { n.y = minY; n.vy = Math.abs(n.vy) * 0.5; }
      if (n.y > maxY) { n.y = maxY; n.vy = -Math.abs(n.vy) * 0.5; }
    }
    
    // Soft boundary steering for other nodes
    const margin = 30;
    if (n.x < bounds.left + margin) n.vx += 0.01;
    if (n.x > bounds.right - margin) n.vx -= 0.01;
    if (n.y < bounds.top + margin) n.vy += 0.01;
    if (n.y > bounds.bottom - margin) n.vy -= 0.01;
  }
}

function applyAnchorSpring(n, idx) {
  const anchor = state.mainAnchors[idx];
  if (anchor) {
    n.vx += (anchor.x - n.x) * CFG.MAIN.RETURN_STRENGTH;
    n.vy += (anchor.y - n.y) * CFG.MAIN.RETURN_STRENGTH;
  }
}

function applyRepulsion(n, idx) {
  for (let j = 0; j < 3; j++) {
    if (j === idx) continue;
    const m = state.nodes[j];
    const dx = n.x - m.x;
    const dy = n.y - m.y;
    const dist = Math.hypot(dx, dy) || 0.0001;
    if (dist < CFG.MAIN.SEPARATION) {
      const force = (CFG.MAIN.SEPARATION - dist) * CFG.MAIN.REPULSION_STRENGTH;
      n.vx += (dx / dist) * force;
      n.vy += (dy / dist) * force;
    }
  }
}

function applyMediaRepulsion(n, idx) {
  // Repel from other media nodes to keep them spread out
  for (let j = 0; j < state.nodes.length; j++) {
    if (j === idx) continue;
    const m = state.nodes[j];
    if (m.kind !== "media") continue;
    
    const dx = n.x - m.x;
    const dy = n.y - m.y;
    const dist = Math.hypot(dx, dy) || 0.0001;
    
    if (dist < CFG.MEDIA.SEPARATION) {
      const force = (CFG.MEDIA.SEPARATION - dist) * CFG.MEDIA.REPULSION_STRENGTH;
      n.vx += (dx / dist) * force;
      n.vy += (dy / dist) * force;
    }
  }
}

function applyChildRepulsion(n, idx) {
  // Repel from other child nodes to avoid overlap
  for (let j = 0; j < state.nodes.length; j++) {
    if (j === idx) continue;
    const m = state.nodes[j];
    if (m.kind !== "child") continue;
    
    const dx = n.x - m.x;
    const dy = n.y - m.y;
    const dist = Math.hypot(dx, dy) || 0.0001;
    
    if (dist < CFG.CHILD.SEPARATION) {
      const force = (CFG.CHILD.SEPARATION - dist) * CFG.CHILD.REPULSION_STRENGTH;
      n.vx += (dx / dist) * force;
      n.vy += (dy / dist) * force;
    }
  }
}

function applyGrandchildRepulsion(n, idx) {
  // Repel from other grandchild nodes to avoid overlap
  for (let j = 0; j < state.nodes.length; j++) {
    if (j === idx) continue;
    const m = state.nodes[j];
    if (m.kind !== "grandchild") continue;
    
    const dx = n.x - m.x;
    const dy = n.y - m.y;
    const dist = Math.hypot(dx, dy) || 0.0001;
    
    if (dist < CFG.GRANDCHILD.SEPARATION) {
      const force = (CFG.GRANDCHILD.SEPARATION - dist) * CFG.GRANDCHILD.REPULSION_STRENGTH;
      n.vx += (dx / dist) * force;
      n.vy += (dy / dist) * force;
    }
  }
}

function getSpeedScale(n) {
  if (n.kind === "child") return CFG.CHILD.SPEED_SCALE;
  if (n.kind === "grandchild") return CFG.GRANDCHILD.SPEED_SCALE;
  if (n.kind === "media") return CFG.MEDIA.OSCILLATION_SPEED;
  return 1;
}

function assignNewTarget(n, idx, bounds) {
  if (idx >= 0 && idx < 3) {
    // Main: pick target near anchor
    const a = state.mainAnchors[idx] || { x: (bounds.left + bounds.right) / 2, y: (bounds.top + bounds.bottom) / 2 };
    const ang = Math.random() * Math.PI * 2;
    const r = CFG.MAIN.WANDER_RADIUS * (0.4 + Math.random() * 0.6);
    let tx = a.x + Math.cos(ang) * r;
    let ty = a.y + Math.sin(ang) * r;
    const c = clampToBounds(tx, ty, bounds);
    n.targetX = c.x;
    n.targetY = c.y;
  } else if (n.kind === "child" && n.parentKey && state.mainNodeIndexes[n.parentKey] >= 0) {
    const anchor = state.nodes[state.mainNodeIndexes[n.parentKey]];
    const r = Math.max(CFG.CHILD.MIN_DISTANCE, CFG.CHILD.WANDER_RADIUS);
    
    // Try to find a target that's not too close to other child nodes
    let bestTarget = null;
    let bestMinDist = 0;
    const maxAttempts = 10;
    
    for (let attempt = 0; attempt < maxAttempts; attempt++) {
      const ang = (Math.random() - 0.5) * 2 * CFG.CHILD.SECTOR_HALF_ANGLE;
      let tx = anchor.x + Math.cos(ang) * r + CFG.CHILD.X_OFFSET;
      let ty = anchor.y + Math.sin(ang) * r;
      const c = clampToBounds(tx, ty, bounds);
      
      // Find minimum distance to other child nodes
      let minDistToOthers = Infinity;
      for (const other of state.nodes) {
        if (other === n || other.kind !== "child") continue;
        const dist = Math.hypot(c.x - other.x, c.y - other.y);
        minDistToOthers = Math.min(minDistToOthers, dist);
      }
      
      // Keep the target with the best (largest) minimum distance
      if (minDistToOthers > bestMinDist) {
        bestMinDist = minDistToOthers;
        bestTarget = c;
      }
      
      // If we found a good enough target, stop early
      if (minDistToOthers >= CFG.CHILD.SEPARATION) break;
    }
    
    if (bestTarget) {
      n.targetX = bestTarget.x;
      n.targetY = bestTarget.y;
    }
  } else if (n.kind === "grandchild" && state.selectedCategoryIndex >= 0) {
    const anchor = state.nodes[state.selectedCategoryIndex];
    const r = CFG.GRANDCHILD.WANDER_RADIUS;
    
    // Try to find a target that's not too close to other grandchild nodes
    let bestTarget = null;
    let bestMinDist = 0;
    const maxAttempts = 10;
    
    for (let attempt = 0; attempt < maxAttempts; attempt++) {
      const ang = (Math.random() - 0.5) * 2 * CFG.GRANDCHILD.SECTOR_HALF_ANGLE;
      let tx = anchor.x + Math.cos(ang) * r + CFG.GRANDCHILD.X_OFFSET;
      let ty = anchor.y + Math.sin(ang) * r;
      const c = clampToBounds(tx, ty, bounds);
      
      // Find minimum distance to other grandchild nodes
      let minDistToOthers = Infinity;
      for (const other of state.nodes) {
        if (other === n || other.kind !== "grandchild") continue;
        const dist = Math.hypot(c.x - other.x, c.y - other.y);
        minDistToOthers = Math.min(minDistToOthers, dist);
      }
      
      // Keep the target with the best (largest) minimum distance
      if (minDistToOthers > bestMinDist) {
        bestMinDist = minDistToOthers;
        bestTarget = c;
      }
      
      // If we found a good enough target, stop early
      if (minDistToOthers >= CFG.GRANDCHILD.SEPARATION) break;
    }
    
    if (bestTarget) {
      n.targetX = bestTarget.x;
      n.targetY = bestTarget.y;
    }
  } else if (n.kind === "description" && state.mode === "project" && state.selectedProjectIndex >= 0) {
    // Description nodes stay fixed
  } else if (n.kind === "media" && state.mode === "project" && state.selectedProjectIndex >= 0) {
    const canvasWidth = state.ctx.canvas.width;
    const canvasHeight = state.ctx.canvas.height;
    const scale = n._individualScale || 1;
    const imgWidth = n._imageWidth || CFG.MEDIA.SIZE;
    const margin = imgWidth * scale / 2;
    
    // If manually moved, oscillate around current position
    if (n._manuallyMoved) {
      const wanderRadius = 50; // small oscillation around dropped position
      const ang = Math.random() * Math.PI * 2;
      const r = Math.random() * wanderRadius;
      n.targetX = n.x + Math.cos(ang) * r;
      n.targetY = n.y + Math.sin(ang) * r;
      
      // Keep within canvas bounds (but not the restricted area)
      n.targetX = clamp(n.targetX, margin, canvasWidth - margin);
      n.targetY = clamp(n.targetY, margin, canvasHeight - margin);
    } else {
      // Normal behavior: oscillate within defined spawn area
      const isMobileView = window.innerWidth <= CFG.MEDIA.MOBILE_BREAKPOINT;
      const area = isMobileView ? CFG.MEDIA.MOBILE : CFG.MEDIA.DESKTOP;
      
      const minX = area.X_MIN * canvasWidth + margin;
      const maxX = area.X_MAX * canvasWidth - margin;
      const minY = area.Y_MIN * canvasHeight + margin;
      const maxY = area.Y_MAX * canvasHeight - margin;
      
      n.targetX = minX + Math.random() * Math.max(0, maxX - minX);
      n.targetY = minY + Math.random() * Math.max(0, maxY - minY);
    }
  } else {
    n.targetX = lerp(bounds.left, bounds.right, Math.random());
    n.targetY = lerp(bounds.top, bounds.bottom, Math.random());
  }
}

// ============= RENDERING ENGINE =============

export function draw() {
  const { canvas } = state.ctx;
  state.ctx.clearRect(0, 0, canvas.width, canvas.height);
  state.ctx.save();
  state.ctx.strokeStyle = CFG.COLOR;
  state.ctx.fillStyle = CFG.COLOR;
  state.ctx.lineWidth = CFG.LINE_WIDTH;
  
  if (state.mode === "project") {
    drawProjectModeLayered();
  } else if (state.mode === "category") {
    drawCategoryModeLayered();
  } else {
    drawConnections();
    drawNodes();
  }
  
  state.ctx.restore();
}

function drawConnections() {
  const drawers = {
    home: drawHomeConnections,
    focus: drawFocusConnections,
    category: drawCategoryConnections,
    content: drawContentConnections
    // project mode uses drawProjectModeLayered() instead
  };
  drawers[state.mode]?.();
}

function drawHomeConnections() {
  for (let i = 0; i < 3; i++) {
    for (let j = i + 1; j < 3; j++) {
      state.ctx.globalAlpha = 1;
      state.ctx.beginPath();
      state.ctx.moveTo(getScreenXForIndex(i), state.nodes[i].y);
      state.ctx.lineTo(getScreenXForIndex(j), state.nodes[j].y);
      state.ctx.stroke();
    }
  }
}

function drawFocusConnections() {
  const fIdx = state.mainNodeIndexes[state.focusKey];
  // Dim all links among mains
  for (let i = 0; i < 3; i++) {
    for (let j = i + 1; j < 3; j++) {
      state.ctx.globalAlpha = CFG.MAIN.DIM_ALPHA;
      state.ctx.beginPath();
      state.ctx.moveTo(getScreenXForIndex(i), state.nodes[i].y);
      state.ctx.lineTo(getScreenXForIndex(j), state.nodes[j].y);
      state.ctx.stroke();
    }
  }
  // Lines from each child to its parent
  state.ctx.globalAlpha = 1;
  for (let k = 3; k < state.nodes.length; k++) {
    const c = state.nodes[k];
    if (c.kind !== "child") continue;
    const parentIdx = c.parentKey ? state.mainNodeIndexes[c.parentKey] : fIdx;
    state.ctx.beginPath();
    state.ctx.moveTo(getScreenXForIndex(parentIdx), state.nodes[parentIdx].y);
    state.ctx.lineTo(getScreenXForIndex(k), state.nodes[k].y);
    state.ctx.stroke();
  }
}

function drawCategoryConnections() {
  // Dim all links among mains
  for (let i = 0; i < 3; i++) {
    for (let j = i + 1; j < 3; j++) {
      state.ctx.globalAlpha = CFG.MAIN.DIM_ALPHA;
      state.ctx.beginPath();
      state.ctx.moveTo(getScreenXForIndex(i), state.nodes[i].y);
      state.ctx.lineTo(getScreenXForIndex(j), state.nodes[j].y);
      state.ctx.stroke();
    }
  }
  // Links from PROJECTS to categories
  const pIdx = state.mainNodeIndexes.PROJECTS;
  for (let k = 3; k < state.nodes.length; k++) {
    const c = state.nodes[k];
    if (c.kind !== "child") continue;
    state.ctx.globalAlpha = k === state.selectedCategoryIndex ? 1 : CFG.MAIN.DIM_ALPHA;
    state.ctx.beginPath();
    state.ctx.moveTo(getScreenXForIndex(pIdx), state.nodes[pIdx].y);
    state.ctx.lineTo(getScreenXForIndex(k), state.nodes[k].y);
    state.ctx.stroke();
  }
  // Links from selected category to its projects
  if (state.selectedCategoryIndex >= 0) {
    state.ctx.globalAlpha = 1;
    for (let k = 3; k < state.nodes.length; k++) {
      const c = state.nodes[k];
      if (c.kind !== "grandchild" || c.parentIndex !== state.selectedCategoryIndex) continue;
      state.ctx.beginPath();
      state.ctx.moveTo(getScreenXForIndex(state.selectedCategoryIndex), state.nodes[state.selectedCategoryIndex].y);
      state.ctx.lineTo(getScreenXForIndex(k), state.nodes[k].y);
      state.ctx.stroke();
    }
  }
}

function drawCategoryModeLayered() {
  // Layered drawing: grandchild lines drawn AFTER child nodes
  const dpr = Math.max(1, window.devicePixelRatio || 1);
  const pIdx = state.mainNodeIndexes.PROJECTS;
  const catIdx = state.selectedCategoryIndex;
  state.ctx.textBaseline = "middle";
  
  // Helper: draw line between two node indices
  const line = (i, j, alpha = 1) => {
    state.ctx.globalAlpha = alpha;
    state.ctx.beginPath();
    state.ctx.moveTo(getScreenXForIndex(i), state.nodes[i].y);
    state.ctx.lineTo(getScreenXForIndex(j), state.nodes[j].y);
    state.ctx.stroke();
  };
  
  // Helper: draw node with proper font
  const node = (i, alpha) => {
    const n = state.nodes[i], isMain = i < 3;
    let fontSize = applyTransitionShrink(getFontSizeForNode(n, i, isMain), n, i, isMain);
    state.ctx.font = `${fontSize * dpr}px StraightNarrow, sans-serif`;
    drawRegularNode(n, i, isMain, alpha, fontSize, dpr);
  };
  
  // Dim connections between mains
  for (let i = 0; i < 3; i++) for (let j = i + 1; j < 3; j++) line(i, j, CFG.MAIN.DIM_ALPHA);
  
  // Connections & nodes: PROJECTS → categories
  for (let k = 3; k < state.nodes.length; k++) {
    if (state.nodes[k].kind !== "child") continue;
    line(pIdx, k, k === catIdx ? 1 : CFG.MAIN.DIM_ALPHA);
  }
  
  // Main nodes + child nodes
  for (let i = 0; i < 3; i++) node(i, i === pIdx ? 1 : CFG.MAIN.DIM_ALPHA);
  for (let k = 3; k < state.nodes.length; k++) {
    if (state.nodes[k].kind === "child") node(k, k === catIdx ? 1 : CFG.MAIN.DIM_ALPHA);
  }
  
  // Grandchild connections (ON TOP of child nodes)
  if (catIdx >= 0) {
    for (let k = 3; k < state.nodes.length; k++) {
      const c = state.nodes[k];
      if (c.kind === "grandchild" && c.parentIndex === catIdx) line(catIdx, k, 1);
    }
  }
  
  // Grandchild nodes
  for (let k = 3; k < state.nodes.length; k++) {
    const n = state.nodes[k];
    if (n.kind === "grandchild") node(k, n.parentIndex === catIdx ? 1 : CFG.MAIN.DIM_ALPHA);
  }
}

function drawContentConnections() {
  // Dim non-selected mains
  for (let i = 0; i < 3; i++) {
    for (let j = i + 1; j < 3; j++) {
      state.ctx.globalAlpha = CFG.MAIN.DIM_ALPHA;
      state.ctx.beginPath();
      state.ctx.moveTo(getScreenXForIndex(i), state.nodes[i].y);
      state.ctx.lineTo(getScreenXForIndex(j), state.nodes[j].y);
      state.ctx.stroke();
    }
  }
  // Link from selected main to textContent
  if (state.selectedContentIndex >= 0) {
    state.ctx.globalAlpha = 1;
    for (let k = 3; k < state.nodes.length; k++) {
      const m = state.nodes[k];
      if (m.kind !== "textContent" || m.parentIndex !== state.selectedContentIndex) continue;
      state.ctx.beginPath();
      state.ctx.moveTo(getScreenXForIndex(state.selectedContentIndex), state.nodes[state.selectedContentIndex].y);
      state.ctx.lineTo(getScreenXForIndex(k), state.nodes[k].y);
      state.ctx.stroke();
    }
  }
  // Link from ABOUT to aboutDescription
  if (state.selectedContentIndex >= 0 && state.focusKey === "ABOUT") {
    state.ctx.globalAlpha = 1;
    for (let k = 3; k < state.nodes.length; k++) {
      const m = state.nodes[k];
      if (m.kind !== "aboutDescription" || m.mainIndex !== state.selectedContentIndex || !m._boxWidth) continue;
      
      state.ctx.beginPath();
      state.ctx.moveTo(getScreenXForIndex(state.selectedContentIndex), state.nodes[state.selectedContentIndex].y);
      state.ctx.lineTo(m.x, m.y);
      state.ctx.stroke();
    }
  }
}

function drawNodes() {
  const sortedIndices = sortNodesByZIndex();
  state.ctx.textBaseline = "middle";
  const dpr = Math.max(1, window.devicePixelRatio || 1);
  state.ctx.font = `${16 * dpr}px StraightNarrow, sans-serif`;
  
  for (const i of sortedIndices) {
    drawNode(state.nodes[i], i, dpr);
  }
}

function drawProjectModeLayered() {
  // Draw layer by layer with active connections drawn AFTER dim nodes
  const dpr = Math.max(1, window.devicePixelRatio || 1);
  const pIdx = state.mainNodeIndexes.PROJECTS;
  
  // === PHASE 1: Draw all DIM elements (connections and nodes) ===
  
  // Dim lines between mains
  for (let i = 0; i < 3; i++) {
    for (let j = i + 1; j < 3; j++) {
      state.ctx.globalAlpha = 0.1;
      state.ctx.beginPath();
      state.ctx.moveTo(getScreenXForIndex(i), state.nodes[i].y);
      state.ctx.lineTo(getScreenXForIndex(j), state.nodes[j].y);
      state.ctx.stroke();
    }
  }
  
  // Dim lines from PROJECTS to non-selected categories
  for (let k = 3; k < state.nodes.length; k++) {
    const c = state.nodes[k];
    if (c.kind !== "child" || k === state.selectedCategoryIndex) continue;
    state.ctx.globalAlpha = 0.1;
    state.ctx.beginPath();
    state.ctx.moveTo(getScreenXForIndex(pIdx), state.nodes[pIdx].y);
    state.ctx.lineTo(getScreenXForIndex(k), state.nodes[k].y);
    state.ctx.stroke();
  }
  
  // Dim lines from selected category to non-selected projects
  if (state.selectedCategoryIndex >= 0) {
    for (let k = 3; k < state.nodes.length; k++) {
      const g = state.nodes[k];
      if (g.kind !== "grandchild" || g.parentIndex !== state.selectedCategoryIndex) continue;
      if (k === state.selectedProjectIndex) continue;
      state.ctx.globalAlpha = 0.1;
      state.ctx.beginPath();
      state.ctx.moveTo(getScreenXForIndex(state.selectedCategoryIndex), state.nodes[state.selectedCategoryIndex].y);
      state.ctx.lineTo(getScreenXForIndex(k), state.nodes[k].y);
      state.ctx.stroke();
    }
  }
  
  // Draw dim main nodes (non-PROJECTS)
  state.ctx.textBaseline = "middle";
  for (let i = 0; i < 3; i++) {
    if (i === pIdx) continue;
    const n = state.nodes[i];
    const nodeAlpha = getNodeAlpha(n, i, true);
    let fontSize = getFontSizeForNode(n, i, true);
    fontSize = applyTransitionShrink(fontSize, n, i, true);
    state.ctx.font = `${fontSize * dpr}px StraightNarrow, sans-serif`;
    drawRegularNode(n, i, true, nodeAlpha, fontSize, dpr);
  }
  
  // Draw dim child nodes (non-selected categories)
  for (let k = 3; k < state.nodes.length; k++) {
    const n = state.nodes[k];
    if (n.kind !== "child" || k === state.selectedCategoryIndex) continue;
    const nodeAlpha = getNodeAlpha(n, k, false);
    let fontSize = getFontSizeForNode(n, k, false);
    fontSize = applyTransitionShrink(fontSize, n, k, false);
    state.ctx.font = `${fontSize * dpr}px StraightNarrow, sans-serif`;
    drawRegularNode(n, k, false, nodeAlpha, fontSize, dpr);
  }
  
  // Draw dim grandchild nodes (non-selected projects)
  for (let k = 3; k < state.nodes.length; k++) {
    const n = state.nodes[k];
    if (n.kind !== "grandchild" || k === state.selectedProjectIndex) continue;
    const nodeAlpha = getNodeAlpha(n, k, false);
    let fontSize = getFontSizeForNode(n, k, false);
    fontSize = applyTransitionShrink(fontSize, n, k, false);
    state.ctx.font = `${fontSize * dpr}px StraightNarrow, sans-serif`;
    drawRegularNode(n, k, false, nodeAlpha, fontSize, dpr);
  }
  
  // === PHASE 2: Draw ACTIVE path (connections and nodes) on top ===
  
  // Active line: PROJECTS to selected category
  if (state.selectedCategoryIndex >= 0) {
    state.ctx.globalAlpha = 1;
    state.ctx.beginPath();
    state.ctx.moveTo(getScreenXForIndex(pIdx), state.nodes[pIdx].y);
    state.ctx.lineTo(getScreenXForIndex(state.selectedCategoryIndex), state.nodes[state.selectedCategoryIndex].y);
    state.ctx.stroke();
  }
  
  // Active line: selected category to selected project
  if (state.selectedCategoryIndex >= 0 && state.selectedProjectIndex >= 0) {
    state.ctx.globalAlpha = 1;
    state.ctx.beginPath();
    state.ctx.moveTo(getScreenXForIndex(state.selectedCategoryIndex), state.nodes[state.selectedCategoryIndex].y);
    state.ctx.lineTo(getScreenXForIndex(state.selectedProjectIndex), state.nodes[state.selectedProjectIndex].y);
    state.ctx.stroke();
  }
  
  // Draw PROJECTS node (active)
  {
    const n = state.nodes[pIdx];
    const nodeAlpha = getNodeAlpha(n, pIdx, true);
    let fontSize = getFontSizeForNode(n, pIdx, true);
    fontSize = applyTransitionShrink(fontSize, n, pIdx, true);
    state.ctx.font = `${fontSize * dpr}px StraightNarrow, sans-serif`;
    drawRegularNode(n, pIdx, true, nodeAlpha, fontSize, dpr);
  }
  
  // Draw selected category node (active)
  if (state.selectedCategoryIndex >= 0) {
    const n = state.nodes[state.selectedCategoryIndex];
    const nodeAlpha = getNodeAlpha(n, state.selectedCategoryIndex, false);
    let fontSize = getFontSizeForNode(n, state.selectedCategoryIndex, false);
    fontSize = applyTransitionShrink(fontSize, n, state.selectedCategoryIndex, false);
    state.ctx.font = `${fontSize * dpr}px StraightNarrow, sans-serif`;
    drawRegularNode(n, state.selectedCategoryIndex, false, nodeAlpha, fontSize, dpr);
  }
  
  // Draw selected project node (active)
  if (state.selectedProjectIndex >= 0) {
    const n = state.nodes[state.selectedProjectIndex];
    const nodeAlpha = getNodeAlpha(n, state.selectedProjectIndex, false);
    let fontSize = getFontSizeForNode(n, state.selectedProjectIndex, false);
    fontSize = applyTransitionShrink(fontSize, n, state.selectedProjectIndex, false);
    state.ctx.font = `${fontSize * dpr}px StraightNarrow, sans-serif`;
    drawRegularNode(n, state.selectedProjectIndex, false, nodeAlpha, fontSize, dpr);
  }
  
  // === PHASE 3: Media and description nodes ===
  // Lines from selected project to content
  if (state.selectedProjectIndex >= 0) {
    state.ctx.globalAlpha = 1;
    for (let k = 3; k < state.nodes.length; k++) {
      const m = state.nodes[k];
      if ((m.kind !== "media" && m.kind !== "description") || m.projectIndex !== state.selectedProjectIndex) continue;
      if (m.kind === "description" && !state.nodes[k]._boxWidth) continue;
      
      state.ctx.beginPath();
      state.ctx.moveTo(getScreenXForIndex(state.selectedProjectIndex), state.nodes[state.selectedProjectIndex].y);
      const center = m.kind === "description" 
        ? getDescriptionBoxCenter(state.nodes[k])
        : { x: state.nodes[k].x, y: state.nodes[k].y };
      state.ctx.lineTo(center.x, center.y);
      state.ctx.stroke();
    }
  }
  // Draw description nodes
  for (let k = 3; k < state.nodes.length; k++) {
    const n = state.nodes[k];
    if (n.kind !== "description") continue;
    const nodeAlpha = getNodeAlpha(n, k, false);
    drawDescriptionNode(n, k, nodeAlpha, dpr);
  }
  // Draw media nodes (always on top)
  const sortedIndices = sortNodesByZIndex();
  for (const k of sortedIndices) {
    const n = state.nodes[k];
    if (n.kind !== "media") continue;
    const nodeAlpha = getNodeAlpha(n, k, false);
    drawMediaNode(n, k, nodeAlpha, dpr);
  }
}

function drawNode(n, i, dpr) {
  const isMain = i < 3;
  const nodeAlpha = getNodeAlpha(n, i, isMain);
  let fontSize = getFontSizeForNode(n, i, isMain);
  
  // Apply transition shrink
  fontSize = applyTransitionShrink(fontSize, n, i, isMain);
  state.ctx.font = `${fontSize * dpr}px StraightNarrow, sans-serif`;
  
  const renderers = {
    description: () => drawDescriptionNode(n, i, nodeAlpha, dpr),
    aboutDescription: () => drawAboutDescriptionNode(n, i, nodeAlpha, dpr),
    textContent: () => drawTextContentNode(n, i, nodeAlpha, dpr),
    media: () => drawMediaNode(n, i, nodeAlpha, dpr)
  };
  
  const renderer = renderers[n.kind] || (() => drawRegularNode(n, i, isMain, nodeAlpha, fontSize, dpr));
  renderer();
}

function getNodeAlpha(n, i, isMain) {
  let alpha = 1;
  if (state.mode === "focus") {
    alpha = isMain && i !== state.mainNodeIndexes[state.focusKey] ? CFG.MAIN.DIM_ALPHA : 1;
  } else if (state.mode === "category") {
    if (isMain) alpha = i === state.mainNodeIndexes.PROJECTS ? 1 : CFG.MAIN.DIM_ALPHA;
    else if (n.kind === "child") alpha = i === state.selectedCategoryIndex ? 1 : CFG.MAIN.DIM_ALPHA;
    else if (n.kind === "grandchild") alpha = n.parentIndex === state.selectedCategoryIndex ? 1 : CFG.MAIN.DIM_ALPHA;
  } else if (state.mode === "project") {
    if (isMain) alpha = i === state.mainNodeIndexes.PROJECTS ? 1 : 0.1;
    else if (n.kind === "child") alpha = i === state.selectedCategoryIndex ? 1 : 0.1;
    else if (n.kind === "grandchild") alpha = i === state.selectedProjectIndex ? 1 : 0.1;
    else if (n.kind === "description" || n.kind === "media") alpha = n.projectIndex === state.selectedProjectIndex ? 1 : 0.1;
  } else if (state.mode === "content") {
    if (isMain) alpha = i === state.selectedContentIndex ? 1 : CFG.MAIN.DIM_ALPHA;
    else if (n.kind === "textContent") alpha = n.parentIndex === state.selectedContentIndex ? 1 : CFG.MAIN.DIM_ALPHA;
    else if (n.kind === "aboutDescription") alpha = n.mainIndex === state.selectedContentIndex ? 1 : CFG.MAIN.DIM_ALPHA;
  }
  return alpha;
}

function getFontSizeForNode(n, i, isMain) {
  let fontSize = CFG.FONTS.MAIN;
  if (state.mode === "category" && isMain && i !== state.mainNodeIndexes.PROJECTS) fontSize = CFG.FONTS.MAIN_SMALL;
  if (n.kind === "child") fontSize = CFG.FONTS.CHILD;
  if (n.kind === "grandchild") fontSize = CFG.FONTS.GRANDCHILD;
  if (n.kind === "media") fontSize = CFG.FONTS.MEDIA;
  return fontSize;
}

function applyTransitionShrink(fontSize, n, i, isMain) {
  const focusT = Math.min(1, state.uiDepth);
  const catT = Math.max(0, Math.min(1, state.uiDepth - 1));
  const projectT = Math.max(0, Math.min(1, state.uiDepth - 2));
  
  if (isMain && (state.mode === "focus" || state.mode === "category" || state.mode === "project")) {
    if (i !== state.mainNodeIndexes[state.focusKey]) {
      fontSize *= (1 - (1 - CFG.MAIN.SHRINK_SCALE) * focusT);
      if (state.mode === "category" || state.mode === "project") {
        fontSize *= (1 - (1 - CFG.CHILD.SHRINK_SCALE) * catT);
      }
      if (state.mode === "project") {
        fontSize *= (1 - (1 - CFG.PROJECT.SHRINK_SCALE) * projectT);
      }
    }
  }
  if (n.kind === "child" && (state.mode === "category" || state.mode === "project")) {
    if (i !== state.selectedCategoryIndex) {
      fontSize *= (1 - (1 - CFG.CHILD.SHRINK_SCALE) * catT);
      if (state.mode === "project") {
        fontSize *= (1 - (1 - CFG.PROJECT.SHRINK_SCALE) * projectT);
      }
    }
  }
  if (n.kind === "grandchild" && state.mode === "project") {
    if (i !== state.selectedProjectIndex) {
      fontSize *= (1 - (1 - CFG.PROJECT.SHRINK_SCALE) * projectT);
    }
  }
  return fontSize;
}

function drawDescriptionNode(n, i, nodeAlpha, dpr) {
  state.ctx.save();
  state.ctx.globalAlpha = nodeAlpha;
  state.ctx.fillStyle = CFG.COLOR;
  state.ctx.font = `${CFG.DESCRIPTION.FONT_SIZE * dpr}px StraightNarrow, sans-serif`;
  
  if (n.description) {
    // Calculate responsive max width based on canvas size
    const maxWidth = state.ctx.canvas.width * CFG.DESCRIPTION.TEXT_MAX_WIDTH_RATIO;
    // Strip markers for consistent line wrapping
    const cleanText = stripHighlightMarkers(n.description);
    // Get tokenized lines for rendering with highlights
    const tokenizedLines = wrapTextWithHighlightTokens(state.ctx, n.description, maxWidth);
    // Use clean text for box size calculation
    const cleanLines = wrapText(state.ctx, cleanText, maxWidth);
    const boxSize = calculateTextBoxSize(state.ctx, cleanLines, CFG.DESCRIPTION.LINE_HEIGHT, CFG.DESCRIPTION.PADDING);
    
    const isFirstFrame = !n._boxWidth;
    if (!n._boxWidth || n._boxWidth !== boxSize.width) {
      n._boxWidth = boxSize.width;
      n._boxHeight = boxSize.height;
    }
    
    if (isFirstFrame) {
      state.ctx.restore();
      return;
    }
    
    const { dx, dy } = getDescriptionBoxPosition(n);
    state.ctx.textBaseline = "top";
    const startY = dy + CFG.DESCRIPTION.PADDING;
    tokenizedLines.forEach((tokens, idx) => {
      drawHighlightedTokens(state.ctx, tokens, dx + CFG.DESCRIPTION.PADDING, startY + idx * CFG.DESCRIPTION.LINE_HEIGHT, dpr);
    });
  }
  state.ctx.restore();
}

function drawAboutDescriptionNode(n, i, nodeAlpha, dpr) {
  state.ctx.save();
  state.ctx.globalAlpha = nodeAlpha;
  state.ctx.fillStyle = CFG.COLOR;
  state.ctx.font = `${CFG.ABOUT.FONT_SIZE * dpr}px StraightNarrow, sans-serif`;
  
  if (n.description) {
    // Calculate responsive max width based on canvas size - use ABOUT config
    const maxWidth = state.ctx.canvas.width * CFG.ABOUT.TEXT_MAX_WIDTH_RATIO;
    // Strip markers for consistent line wrapping
    const cleanText = stripHighlightMarkers(n.description);
    // Get tokenized lines for rendering with highlights
    const tokenizedLines = wrapTextWithHighlightTokens(state.ctx, n.description, maxWidth);
    // Use clean text for box size calculation
    const cleanLines = wrapText(state.ctx, cleanText, maxWidth);
    
    // DEBUG: verify line counts match
    if (!n._debugLogged) {
      console.log('ABOUT DEBUG:', {
        tokenizedLinesCount: tokenizedLines.length,
        cleanLinesCount: cleanLines.length,
        maxWidth,
        canvasWidth: state.ctx.canvas.width,
        dpr
      });
      n._debugLogged = true;
    }
    
    const boxSize = calculateTextBoxSize(state.ctx, cleanLines, CFG.ABOUT.LINE_HEIGHT, CFG.ABOUT.PADDING);
    
    const isFirstFrame = !n._boxWidth;
    if (!n._boxWidth || n._boxWidth !== boxSize.width) {
      n._boxWidth = boxSize.width;
      n._boxHeight = boxSize.height;
    }
    
    if (isFirstFrame) {
      state.ctx.restore();
      return;
    }
    
    const dx = n.x - n._boxWidth / 2;
    const dy = n.y - n._boxHeight / 2;
    
    state.ctx.textBaseline = "top";
    const startY = dy + CFG.ABOUT.PADDING;
    tokenizedLines.forEach((tokens, idx) => {
      drawHighlightedTokens(state.ctx, tokens, dx + CFG.ABOUT.PADDING, startY + idx * CFG.ABOUT.LINE_HEIGHT, dpr, CFG.ABOUT.FONT_SIZE);
    });
  }
  state.ctx.restore();
}

function drawTextContentNode(n, i, nodeAlpha, dpr) {
  state.ctx.save();
  state.ctx.globalAlpha = nodeAlpha;
  state.ctx.fillStyle = CFG.COLOR;
  state.ctx.font = `${CFG.TEXT.FONT_SIZE * dpr}px StraightNarrow, sans-serif`;
  
  if (n.text) {
    const wrappedLines = wrapText(state.ctx, n.text, CFG.TEXT.MAX_WIDTH);
    const boxSize = calculateTextBoxSize(state.ctx, wrappedLines, CFG.TEXT.LINE_HEIGHT, CFG.TEXT.PADDING);
    
    if (!n._boxWidth || n._boxWidth !== boxSize.width) {
      n._boxWidth = boxSize.width;
      n._boxHeight = boxSize.height;
    }
    
    const screenX = getScreenXForIndex(i);
    const tx = screenX - n._boxWidth / 2;
    const ty = n.y - n._boxHeight / 2;
    
    state.ctx.textBaseline = "top";
    const startY = ty + CFG.TEXT.PADDING;
    wrappedLines.forEach((line, i) => {
      state.ctx.fillText(line, tx + CFG.TEXT.PADDING, startY + i * CFG.TEXT.LINE_HEIGHT);
    });
  }
  state.ctx.restore();
}

function drawMediaNode(n, i, nodeAlpha, dpr) {
  if (n.mediaType === 'image' && n.mediaSrc) {
    // Create HTML img element for ALL images (allows proper z-index ordering)
    if (!n._imgElement) {
      const overlay = document.getElementById('gif-overlay');
      if (overlay) {
        n._imgElement = document.createElement('img');
        n._imgElement.src = n.mediaSrc;
        n._imgElement.alt = n.label || 'Media';
        n._imgElement.draggable = false;
        // Hide until dimensions are calculated
        n._imgElement.style.display = 'none';
        n._imageLoaded = false;
        n._imgElement.onload = () => {
          const imgWidth = n._imgElement.naturalWidth;
          const imgHeight = n._imgElement.naturalHeight;
          const aspectRatio = imgWidth / imgHeight;
          
          if (aspectRatio > 1) {
            n._imageWidth = CFG.MEDIA.SIZE;
            n._imageHeight = CFG.MEDIA.SIZE / aspectRatio;
          } else {
            n._imageHeight = CFG.MEDIA.SIZE;
            n._imageWidth = CFG.MEDIA.SIZE * aspectRatio;
          }
          n._imageLoaded = true;
        };
        n._imgElement.onerror = () => {
          n._imageFailed = true;
          n._imageWidth = CFG.MEDIA.SIZE;
          n._imageHeight = CFG.MEDIA.SIZE;
          n._imageLoaded = true;
        };
        overlay.appendChild(n._imgElement);
      }
    }
    
    // Don't render until image is loaded with correct dimensions
    if (!n._imageLoaded) return;
    
    const baseWidth = n._imageWidth || CFG.MEDIA.SIZE;
    const baseHeight = n._imageHeight || CFG.MEDIA.SIZE;
    const scale = n._individualScale || 1;
    const imgWidth = baseWidth * scale;
    const imgHeight = baseHeight * scale;
    const screenX = getScreenXForIndex(i);
    const mx = screenX - imgWidth / 2;
    const my = n.y - imgHeight / 2;
    
    // Update img element position and visibility
    // Convert canvas coordinates to CSS coordinates (divide by DPR)
    if (n._imgElement) {
      const cssX = mx / dpr;
      const cssY = my / dpr;
      const cssWidth = imgWidth / dpr;
      const cssHeight = imgHeight / dpr;
      n._imgElement.style.left = `${cssX}px`;
      n._imgElement.style.top = `${cssY}px`;
      n._imgElement.style.width = `${cssWidth}px`;
      n._imgElement.style.height = `${cssHeight}px`;
      n._imgElement.style.opacity = nodeAlpha;
      n._imgElement.style.display = nodeAlpha > 0.1 ? 'block' : 'none';
      // Update z-index to match hover ordering
      n._imgElement.style.zIndex = n._zIndex || 0;
    }
  } else {
    // Fallback for non-image media: draw placeholder on canvas
    state.ctx.save();
    state.ctx.globalAlpha = nodeAlpha;
    const scale = n._individualScale || 1;
    const imgWidth = CFG.MEDIA.SIZE * scale;
    const imgHeight = CFG.MEDIA.SIZE * scale;
    const screenX = getScreenXForIndex(i);
    const mx = screenX - imgWidth / 2;
    const my = n.y - imgHeight / 2;
    state.ctx.lineWidth = CFG.MEDIA.BORDER_WIDTH * dpr;
    state.ctx.strokeRect(mx, my, imgWidth, imgHeight);
    state.ctx.fillRect(mx, my, imgWidth, imgHeight);
    state.ctx.restore();
  }
}

function drawRegularNode(n, i, isMain, nodeAlpha, fontSize, dpr) {
  const scale = isMain ? fontSize / CFG.FONTS.MAIN : 1;
  const rectW = CFG.RECT.w * scale;
  const rectH = CFG.RECT.h * scale;
  const screenX = getScreenXForIndex(i);
  const rx = screenX - rectW / 2;
  const ry = n.y - rectH / 2;
  const labelX = screenX + rectW / 2 + 8;
  
  if (nodeAlpha < 1) {
    // Calculate label width to include in the erased area
    const labelWidth = state.ctx.measureText(n.label).width;
    const labelHeight = fontSize * dpr;
    
    state.ctx.save();
    state.ctx.globalAlpha = 1;
    state.ctx.globalCompositeOperation = "destination-out";
    // Erase rectangle area
    state.ctx.fillRect(rx - 1, ry - 1, rectW + 2, rectH + 2);
    // Erase label area
    state.ctx.fillRect(labelX - 2, n.y - labelHeight / 2 - 2, labelWidth + 4, labelHeight + 4);
    state.ctx.restore();
  }
  
  state.ctx.save();
  state.ctx.globalAlpha = nodeAlpha;
  state.ctx.fillRect(rx, ry, rectW, rectH);
  state.ctx.restore();
  
  state.ctx.save();
  state.ctx.globalAlpha = nodeAlpha;
  state.ctx.fillText(n.label, labelX, n.y);
  state.ctx.restore();
}

function sortNodesByZIndex() {
  const sortedIndices = Array.from({ length: state.nodes.length }, (_, i) => i);
  sortedIndices.sort((a, b) => {
    const nodeA = state.nodes[a];
    const nodeB = state.nodes[b];
    // aboutDescription should be drawn last (highest z-index)
    const zIndexA = nodeA.kind === "aboutDescription" ? 10000 : 
                    nodeA.kind === "media" ? (nodeA._zIndex || 0) : -1000 - a;
    const zIndexB = nodeB.kind === "aboutDescription" ? 10000 : 
                    nodeB.kind === "media" ? (nodeB._zIndex || 0) : -1000 - b;
    return zIndexA - zIndexB;
  });
  return sortedIndices;
}

// ============= UTILITY FUNCTIONS =============

export function getScreenXForIndex(i) {
  if (state.mode === "home") return state.nodes[i].x + state.cameraOffsetX;
  if (state.mode === "focus") {
    const focusIdx = state.mainNodeIndexes[state.focusKey];
    if (i === focusIdx || state.nodes[i]?.kind === "child") return state.nodes[i].x;
    return state.nodes[i].x + state.cameraOffsetX;
  }
  if (state.mode === "category") {
    const n = state.nodes[i];
    if (i === state.selectedCategoryIndex) return state.nodes[i].x;
    if (n?.kind === "grandchild" && n.parentIndex === state.selectedCategoryIndex) return state.nodes[i].x;
    return state.nodes[i].x + state.cameraOffsetX;
  }
  if (state.mode === "project") {
    const n = state.nodes[i];
    if (i === state.selectedProjectIndex) return state.nodes[i].x;
    if ((n?.kind === "media" || n?.kind === "description") && n.projectIndex === state.selectedProjectIndex) return state.nodes[i].x;
    return state.nodes[i].x + state.cameraOffsetX;
  }
  if (state.mode === "content") {
    const n = state.nodes[i];
    if (i === state.selectedContentIndex) return state.nodes[i].x;
    if (n?.kind === "textContent" && n.parentIndex === state.selectedContentIndex) return state.nodes[i].x;
    if (n?.kind === "aboutDescription" && n.mainIndex === state.selectedContentIndex) return state.nodes[i].x;
    return state.nodes[i].x + state.cameraOffsetX;
  }
  return state.nodes[i].x + state.cameraOffsetX;
}

export function hitTestAtScreen(px, py) {
  for (let i = state.nodes.length - 1; i >= 0; i--) {
    const n = state.nodes[i];
    const screenX = getScreenXForIndex(i);
    
    if (n.kind === "description") {
      if (n._boxWidth && n._boxHeight) {
        const { dx, dy } = getDescriptionBoxPosition(n);
        if (px >= dx && px <= dx + n._boxWidth && py >= dy && py <= dy + n._boxHeight) return i;
      }
    } else if (n.kind === "aboutDescription") {
      if (n._boxWidth && n._boxHeight) {
        const dx = n.x - n._boxWidth / 2;
        const dy = n.y - n._boxHeight / 2;
        if (px >= dx && px <= dx + n._boxWidth && py >= dy && py <= dy + n._boxHeight) return i;
      }
    } else if (n.kind === "textContent") {
      if (n._boxWidth && n._boxHeight) {
        const tx = screenX - n._boxWidth / 2;
        const ty = n.y - n._boxHeight / 2;
        if (px >= tx && px <= tx + n._boxWidth && py >= ty && py <= ty + n._boxHeight) return i;
      }
    } else if (n.kind === "media") {
      const baseWidth = n._imageWidth || CFG.MEDIA.SIZE;
      const baseHeight = n._imageHeight || CFG.MEDIA.SIZE;
      const scale = n._individualScale || 1;
      const imgWidth = baseWidth * scale;
      const imgHeight = baseHeight * scale;
      const mx = screenX - imgWidth / 2;
      const my = n.y - imgHeight / 2;
      if (px >= mx && px <= mx + imgWidth && py >= my && py <= my + imgHeight) return i;
    } else {
      const fontSize = getFontSizeForNode(n, i, i < 3);
      const isMain = i < 3;
      const scale = isMain ? fontSize / CFG.FONTS.MAIN : 1;
      const rectW = CFG.RECT.w * scale;
      const rectH = isMain ? CFG.RECT.h * scale : CFG.RECT.h;
      const labelWidth = measureTextWidth(n.label, fontSize);
      const dpr = window.devicePixelRatio || 1;
      const pad = (CFG.SLUG?.HOVER_PADDING || 0) * dpr;
      const rx = screenX - rectW / 2 - pad;
      const ry = n.y - rectH / 2 - pad;
      const w = rectW + 8 + labelWidth + pad * 2;
      const h = Math.max(rectH, fontSize * dpr) + pad * 2;
      if (px >= rx && px <= rx + w && py >= ry && py <= ry + h) return i;
    }
  }
  return -1;
}

export function measureTextWidth(text, fontSize = 16) {
  state.ctx.save();
  state.ctx.font = `${fontSize * (window.devicePixelRatio || 1)}px StraightNarrow, sans-serif`;
  const w = state.ctx.measureText(text).width;
  state.ctx.restore();
  return w;
}

// Parse text into word tokens with highlight info
// Returns array of { word: string, highlighted: boolean }
export function tokenizeWithHighlights(text) {
  const tokens = [];
  let inHighlight = false;
  let currentWord = '';
  
  for (let i = 0; i < text.length; i++) {
    // Check for == marker
    if (text[i] === '=' && text[i + 1] === '=') {
      // Save current word if any
      if (currentWord) {
        tokens.push({ word: currentWord, highlighted: inHighlight });
        currentWord = '';
      }
      inHighlight = !inHighlight;
      i++; // Skip second =
      continue;
    }
    
    // Check for space or newline (word boundary)
    if (text[i] === ' ' || text[i] === '\n') {
      if (currentWord) {
        tokens.push({ word: currentWord, highlighted: inHighlight });
        currentWord = '';
      }
      tokens.push({ word: ' ', highlighted: false, isSpace: true });
      continue;
    }
    
    currentWord += text[i];
  }
  
  // Don't forget last word
  if (currentWord) {
    tokens.push({ word: currentWord, highlighted: inHighlight });
  }
  
  return tokens;
}

// Get plain text without highlight markers (for measuring)
export function stripHighlightMarkers(text) {
  return text.replace(/==([^=]+)==/g, '$1');
}

export function wrapText(context, text, maxWidth) {
  // Strip highlight markers for proper word wrapping measurement
  const cleanText = stripHighlightMarkers(text);
  const paragraphs = cleanText.split('\n');
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

// Wrap text into lines, each line is array of tokens with highlight info
// Uses wrapText for consistent line breaks, then tokenizes each line
export function wrapTextWithHighlightTokens(context, text, maxWidth) {
  // Use clean text (without markers) for wrapping to match box calculation
  const cleanText = stripHighlightMarkers(text);
  const cleanLines = wrapText(context, cleanText, maxWidth);
  
  // Tokenize the entire original text to get words with highlight info
  const allTokens = tokenizeWithHighlights(text);
  // Filter out spaces and newline-related tokens, keep only actual words
  const allWords = allTokens.filter(t => !t.isSpace && t.word.trim() !== '');
  
  const result = [];
  let wordIndex = 0;
  
  for (const cleanLine of cleanLines) {
    if (cleanLine === '') {
      // Empty line (paragraph break)
      result.push([]);
      continue;
    }
    
    // Count words in this clean line
    const cleanWords = cleanLine.split(' ').filter(w => w !== '');
    const lineTokens = [];
    
    for (let i = 0; i < cleanWords.length && wordIndex < allWords.length; i++) {
      if (i > 0) {
        lineTokens.push({ word: ' ', highlighted: false, isSpace: true });
      }
      lineTokens.push(allWords[wordIndex]);
      wordIndex++;
    }
    
    result.push(lineTokens);
  }
  
  return result;
}

// Draw a line of tokens with highlight support
export function drawHighlightedTokens(ctx, tokens, x, y, dpr, fontSizeBase = CFG.DESCRIPTION.FONT_SIZE) {
  let currentX = x;
  const fontSize = fontSizeBase * dpr;
  const padding = 3 * dpr;
  
  for (const token of tokens) {
    const textWidth = ctx.measureText(token.word).width;
    
    if (token.highlighted && !token.isSpace) {
      // Draw highlight background (green bg, black text)
      ctx.fillStyle = CFG.COLOR; // green background
      ctx.fillRect(
        currentX - padding/2, 
        y - padding/2, 
        textWidth + padding, 
        fontSize + padding
      );
      ctx.fillStyle = '#000000'; // black text
      ctx.fillText(token.word, currentX, y);
      ctx.fillStyle = CFG.COLOR; // restore green for next tokens
    } else {
      ctx.fillText(token.word, currentX, y);
    }
    
    currentX += textWidth;
  }
}

export function calculateTextBoxSize(context, lines, lineHeight, padding) {
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

export function getDescriptionBoxPosition(node) {
  if (!node._boxWidth || !node._boxHeight) {
    return { dx: node.x, dy: node.y };
  }
  
  // Use node's anchor point if defined, otherwise fallback to desktop default
  const anchorPoint = node.anchorPoint || CFG.DESCRIPTION.DESKTOP.ANCHOR_POINT;
  
  switch (anchorPoint) {
    case "top-left":
      return { dx: node.x, dy: node.y };
    case "top-right":
      return { dx: node.x - node._boxWidth, dy: node.y };
    case "bottom-left":
      return { dx: node.x, dy: node.y - node._boxHeight };
    case "bottom-right":
      return { dx: node.x - node._boxWidth, dy: node.y - node._boxHeight };
    case "center":
    default:
      return { dx: node.x - node._boxWidth / 2, dy: node.y - node._boxHeight / 2 };
  }
}

export function getDescriptionBoxCenter(node) {
  if (!node._boxWidth || !node._boxHeight) {
    return { x: node.x, y: node.y };
  }
  
  // Use node's anchor point if defined, otherwise fallback to desktop default
  const anchorPoint = node.anchorPoint || CFG.DESCRIPTION.DESKTOP.ANCHOR_POINT;
  
  switch (anchorPoint) {
    case "top-left":
      return { x: node.x + node._boxWidth / 2, y: node.y + node._boxHeight / 2 };
    case "top-right":
      return { x: node.x - node._boxWidth / 2, y: node.y + node._boxHeight / 2 };
    case "bottom-left":
      return { x: node.x + node._boxWidth / 2, y: node.y - node._boxHeight / 2 };
    case "bottom-right":
      return { x: node.x - node._boxWidth / 2, y: node.y - node._boxHeight / 2 };
    case "center":
    default:
      return { x: node.x, y: node.y };
  }
}

export function getBounds(width, height) {
  const xPad = width * CFG.MAIN_BOUNDS.xPad;
  const yPad = height * CFG.MAIN_BOUNDS.yPad;
  return { left: xPad, right: width - xPad, top: yPad, bottom: height - yPad };
}

export function clamp(v, lo, hi) {
  return Math.max(lo, Math.min(hi, v));
}

export function lerp(a, b, t) {
  return a + (b - a) * t;
}

export function freezeNode(n) {
  n.vx = 0;
  n.vy = 0;
  n.targetX = n.x;
  n.targetY = n.y;
  n.targetTimer = 1e9;
}

// Remove image overlay elements for media nodes that will be removed
export function cleanupGifElements() {
  for (const n of state.nodes) {
    if (n._imgElement) {
      n._imgElement.remove();
      n._imgElement = null;
    }
  }
}

export function clampToBounds(x, y, bounds) {
  return {
    x: clamp(x, bounds.left + 10, bounds.right - 10),
    y: clamp(y, bounds.top + 10, bounds.bottom - 10)
  };
}

export function computeMainAnchors(width, height) {
  const b = getBounds(width, height);
  const cx = (b.left + b.right) / 2;
  const cy = (b.top + b.bottom) / 2;
  const r = Math.min(b.right - b.left, b.bottom - b.top) * 0.35;
  const angles = [-Math.PI / 2, (3 * Math.PI) / 4, -Math.PI / 6];
  return angles.map((ang) => ({ x: cx + Math.cos(ang) * r, y: cy + Math.sin(ang) * r }));
}








