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
    
    // Soft boundary steering
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
    const ang = (Math.random() - 0.5) * 2 * CFG.CHILD.SECTOR_HALF_ANGLE;
    const r = Math.max(CFG.CHILD.MIN_DISTANCE, CFG.CHILD.WANDER_RADIUS);
    let tx = anchor.x + Math.cos(ang) * r + CFG.CHILD.X_OFFSET;
    let ty = anchor.y + Math.sin(ang) * r;
    const c = clampToBounds(tx, ty, bounds);
    n.targetX = c.x;
    n.targetY = c.y;
  } else if (n.kind === "grandchild" && state.selectedCategoryIndex >= 0) {
    const anchor = state.nodes[state.selectedCategoryIndex];
    const ang = (Math.random() - 0.5) * 2 * CFG.GRANDCHILD.SECTOR_HALF_ANGLE;
    const r = CFG.GRANDCHILD.WANDER_RADIUS;
    let tx = anchor.x + Math.cos(ang) * r + CFG.GRANDCHILD.X_OFFSET;
    let ty = anchor.y + Math.sin(ang) * r;
    const c = clampToBounds(tx, ty, bounds);
    n.targetX = c.x;
    n.targetY = c.y;
  } else if (n.kind === "description" && state.mode === "project" && state.selectedProjectIndex >= 0) {
    // Description nodes stay fixed
  } else if (n.kind === "media" && state.mode === "project" && state.selectedProjectIndex >= 0) {
    const project = state.nodes[state.selectedProjectIndex];
    if (project && n._individualDistance) {
      const ang = CFG.MEDIA.SECTOR_ANGLE_MIN + Math.random() * (CFG.MEDIA.SECTOR_ANGLE_MAX - CFG.MEDIA.SECTOR_ANGLE_MIN);
      const distanceVariation = n._individualDistance * 0.1;
      const distance = n._individualDistance + (Math.random() - 0.5) * 2 * distanceVariation;
      let tx = project.x + Math.cos(ang) * distance;
      let ty = project.y + Math.sin(ang) * distance;
      const c = clampToBounds(tx, ty, bounds);
      n.targetX = c.x;
      n.targetY = c.y;
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
    const wrappedLines = wrapText(state.ctx, n.description, CFG.DESCRIPTION.TEXT_MAX_WIDTH);
    const boxSize = calculateTextBoxSize(state.ctx, wrappedLines, CFG.DESCRIPTION.LINE_HEIGHT, CFG.DESCRIPTION.PADDING);
    
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
    wrappedLines.forEach((line, i) => {
      state.ctx.fillText(line, dx + CFG.DESCRIPTION.PADDING, startY + i * CFG.DESCRIPTION.LINE_HEIGHT);
    });
  }
  state.ctx.restore();
}

function drawAboutDescriptionNode(n, i, nodeAlpha, dpr) {
  state.ctx.save();
  state.ctx.globalAlpha = nodeAlpha;
  state.ctx.fillStyle = CFG.COLOR;
  state.ctx.font = `${CFG.DESCRIPTION.FONT_SIZE * dpr}px StraightNarrow, sans-serif`;
  
  if (n.description) {
    const wrappedLines = wrapText(state.ctx, n.description, CFG.DESCRIPTION.TEXT_MAX_WIDTH);
    const boxSize = calculateTextBoxSize(state.ctx, wrappedLines, CFG.DESCRIPTION.LINE_HEIGHT, CFG.DESCRIPTION.PADDING);
    
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
    const startY = dy + CFG.DESCRIPTION.PADDING;
    wrappedLines.forEach((line, i) => {
      state.ctx.fillText(line, dx + CFG.DESCRIPTION.PADDING, startY + i * CFG.DESCRIPTION.LINE_HEIGHT);
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
      const rx = screenX - rectW / 2;
      const ry = n.y - rectH / 2;
      const w = rectW + 8 + labelWidth;
      const h = Math.max(rectH, fontSize * (window.devicePixelRatio || 1));
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

export function wrapText(context, text, maxWidth) {
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
  
  switch (CFG.DESCRIPTION.ANCHOR_POINT) {
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
  
  switch (CFG.DESCRIPTION.ANCHOR_POINT) {
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








