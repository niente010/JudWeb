// Navigation, interaction and data loading
import { state, freezeNode, hitTestAtScreen, getScreenXForIndex, getBounds, clampToBounds, getDescriptionBoxCenter, measureTextWidth, canResume, cleanupGifElements } from './engine.js';
import * as CFG from './config.js';

// ============= DATA LOADING WITH CACHE =============

const cache = {
  projects: null,
  categories: null,
  contacts: null,
  about: null
};

export async function loadProjects() {
  if (!cache.projects) {
    const res = await fetch("data/projects/_index.json", { cache: "no-store" });
    cache.projects = await res.json();
  }
  return cache.projects;
}

export async function loadCategories() {
  if (cache.categories) return cache.categories;
  try {
    const res = await fetch("data/projects/_index.json", { cache: "no-store" });
    const data = await res.json();
    const set = new Set();
    data.forEach((p) => p.category && set.add(p.category));
    cache.categories = Array.from(set);
    return cache.categories;
  } catch (e) {
    return ["visuals", "algolab", "installations"];
  }
}

export async function loadProjectsByCategory(cat) {
  const projects = await loadProjects();
  return projects.filter((p) => p.category === cat);
}

export async function loadContacts() {
  if (!cache.contacts) {
    const res = await fetch("data/contacts.json", { cache: "no-store" });
    const data = await res.json();
    cache.contacts = data.items;
  }
  return cache.contacts;
}

export async function loadAbout() {
  if (!cache.about) {
    const res = await fetch("data/about.json", { cache: "no-store" });
    cache.about = await res.json();
  }
  return cache.about;
}

// ============= HELPER FUNCTIONS =============

// Check if current viewport is mobile
export function isMobile() {
  return window.innerWidth <= CFG.MEDIA.MOBILE_BREAKPOINT;
}

// Calculate media scale based on total media count
// More media = smaller scale (inverse relationship)
export function calculateMediaScale(mediaCount) {
  const minCount = CFG.MEDIA.SCALE_THRESHOLD_MIN;
  const maxCount = CFG.MEDIA.SCALE_THRESHOLD_MAX;
  
  // Clamp count between thresholds
  const clampedCount = Math.max(minCount, Math.min(maxCount, mediaCount));
  
  // Linear interpolation: 1 media = SCALE_MAX, 6+ media = SCALE_MIN
  const t = (clampedCount - minCount) / (maxCount - minCount);
  const baseScale = CFG.MEDIA.SCALE_MAX - t * (CFG.MEDIA.SCALE_MAX - CFG.MEDIA.SCALE_MIN);
  
  // Add small random variation
  const variation = (Math.random() - 0.5) * 2 * CFG.MEDIA.SCALE_VARIATION;
  return Math.max(CFG.MEDIA.SCALE_MIN, Math.min(CFG.MEDIA.SCALE_MAX, baseScale + variation));
}

// Get media spawn area based on device type
export function getMediaSpawnArea() {
  return isMobile() ? CFG.MEDIA.MOBILE : CFG.MEDIA.DESKTOP;
}

// Get description spawn area based on device type
export function getDescriptionSpawnArea() {
  return isMobile() ? CFG.DESCRIPTION.MOBILE : CFG.DESCRIPTION.DESKTOP;
}

// ============= NODE FACTORY FUNCTIONS =============

export function createMainNode(label, hash, index, width, height) {
  const bounds = getBounds(width, height);
  const x = CFG.MAIN_BOUNDS.xPad * width + Math.random() * (width - 2 * CFG.MAIN_BOUNDS.xPad * width);
  const y = CFG.MAIN_BOUNDS.yPad * height + Math.random() * (height - 2 * CFG.MAIN_BOUNDS.yPad * height);
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

export function createChildNode(label, hash, x, y, parentKey = null) {
  return {
    kind: "child",
    label,
    labelRaw: label.toLowerCase(),
    hash,
    parentKey,
    x,
    y,
    vx: 0,
    vy: 0,
    targetTimer: 0,
    targetX: x,
    targetY: y,
  };
}

export function createGrandchildNode(label, hash, x, y, parentIndex, category = null, slug = null) {
  return {
    kind: "grandchild",
    label,
    hash,
    parentIndex,
    category,
    slug,
    x,
    y,
    vx: 0,
    vy: 0,
    targetTimer: 0,
    targetX: x,
    targetY: y,
  };
}

export function createMediaNode(mediaItem, projectIndex, mediaIndex, totalMediaCount) {
  const canvasWidth = state.ctx.canvas.width;
  const canvasHeight = state.ctx.canvas.height;
  
  // Get spawn area based on device type
  const area = getMediaSpawnArea();
  
  // Calculate scale based on total media count
  const individualScale = calculateMediaScale(totalMediaCount);
  
  // Calculate margin to keep media inside bounds (half of scaled size)
  const margin = CFG.MEDIA.SIZE * individualScale / 2;
  
  // Calculate spawn bounds
  const minX = area.X_MIN * canvasWidth + margin;
  const maxX = area.X_MAX * canvasWidth - margin;
  const minY = area.Y_MIN * canvasHeight + margin;
  const maxY = area.Y_MAX * canvasHeight - margin;
  
  // Random position within the area
  const baseX = minX + Math.random() * Math.max(0, maxX - minX);
  const baseY = minY + Math.random() * Math.max(0, maxY - minY);
  
  return {
    kind: "media",
    mediaType: mediaItem.type,
    mediaSrc: mediaItem.src,
    mediaAlt: mediaItem.alt,
    projectIndex,
    mediaIndex,
    x: baseX,
    y: baseY,
    vx: 0,
    vy: 0,
    targetTimer: 0,
    targetX: baseX,
    targetY: baseY,
    _individualScale: individualScale,
    _zIndex: Math.floor(Math.random() * 1000), // Random initial z-order
    _imageWidth: null,
    _imageHeight: null,
  };
}

export function createDescriptionNode(project, projectIndex) {
  const canvasWidth = state.ctx.canvas.width;
  const canvasHeight = state.ctx.canvas.height;
  
  // Get spawn area based on device type
  const area = getDescriptionSpawnArea();
  
  // X is fixed, Y is random within range
  const fixedX = area.X_FIXED;
  const randomY = area.Y_MIN + Math.random() * (area.Y_MAX - area.Y_MIN);
  
  let anchorX = fixedX * canvasWidth;
  let anchorY = randomY * canvasHeight;
  
  const margin = 50;
  anchorX = Math.max(margin, Math.min(canvasWidth - margin, anchorX));
  anchorY = Math.max(margin, Math.min(canvasHeight - margin, anchorY));
  
  // Convert description array to string with paragraph breaks
  const descriptionText = Array.isArray(project.description) 
    ? project.description.join('\n\n') 
    : project.description;
  
  return {
    kind: "description",
    description: descriptionText,
    projectIndex,
    anchorPoint: area.ANCHOR_POINT,
    x: anchorX,
    y: anchorY,
    vx: 0,
    vy: 0,
    targetTimer: 0,
    targetX: anchorX,
    targetY: anchorY,
  };
}

export function createAboutDescriptionNode(text, mainIndex) {
  const canvasWidth = state.ctx.canvas.width;
  const canvasHeight = state.ctx.canvas.height;
  
  let anchorX = canvasWidth / 2;
  let anchorY = canvasHeight / 2;
  
  return {
    kind: "aboutDescription",
    description: text,
    mainIndex: mainIndex,
    x: anchorX,
    y: anchorY,
    vx: 0,
    vy: 0,
    targetTimer: 1e9,
    targetX: anchorX,
    targetY: anchorY,
  };
}

// ============= NAVIGATION FUNCTIONS =============

export function resetToHome() {
  cleanupGifElements();
  state.nodes = state.nodes.slice(0, 3);
  state.mode = "home";
  state.focusKey = null;
  state.selectedCategoryIndex = -1;
  state.selectedProjectIndex = -1;
  state.selectedContentIndex = -1;
  state.uiDepthTarget = 0;
  state.uiDepth = 0;
  state.cameraTargetOffsetX = 0;
  state.cameraOffsetX = 0;
  state.hoveredNodeIndex = -1;
  
  for (let i = 0; i < 3; i++) {
    state.nodes[i].targetTimer = 0.01;
  }
}

export async function enterFocus(which) {
  if (state.mode === "focus" && state.focusKey === which) {
    resetToHome();
    return;
  }
  
  state.mode = "focus";
  state.focusKey = which;
  state.selectedCategoryIndex = -1;
  state.selectedProjectIndex = -1;
  state.uiDepthTarget = 1;
  
  for (let i = 0; i < 3; i++) freezeNode(state.nodes[i]);
  cleanupGifElements();
  state.nodes = state.nodes.slice(0, 3);
  
  if (which === "PROJECTS") {
    const cats = await loadCategories();
    const anchor = state.nodes[state.mainNodeIndexes.PROJECTS];
    const step = (2 * CFG.CHILD.SECTOR_HALF_ANGLE) / Math.max(1, (cats.length - 1) || 1);
    const r = CFG.CHILD.RING_RADIUS;
    for (let i = 0; i < cats.length; i++) {
      const ang = -CFG.CHILD.SECTOR_HALF_ANGLE + i * step;
      let x = anchor.x + Math.cos(ang) * r + CFG.CHILD.X_OFFSET;
      let y = anchor.y + Math.sin(ang) * r;
      const c = clampToBounds(x, y, getBounds(state.ctx.canvas.width, state.ctx.canvas.height));
      state.nodes.push(createChildNode(cats[i].toUpperCase(), `#/projects/${cats[i]}`, c.x, c.y, "PROJECTS"));
    }
  } else if (which === "CONTACTS") {
    const contacts = await loadContacts();
    const anchor = state.nodes[state.mainNodeIndexes.CONTACTS];
    const step = (2 * CFG.CHILD.SECTOR_HALF_ANGLE) / Math.max(1, (contacts.length - 1) || 1);
    const r = CFG.CHILD.RING_RADIUS;
    for (let i = 0; i < contacts.length; i++) {
      const ang = -CFG.CHILD.SECTOR_HALF_ANGLE + i * step;
      let x = anchor.x + Math.cos(ang) * r + CFG.CHILD.X_OFFSET;
      let y = anchor.y + Math.sin(ang) * r;
      const c = clampToBounds(x, y, getBounds(state.ctx.canvas.width, state.ctx.canvas.height));
      const contactNode = createChildNode(contacts[i].name.toUpperCase(), `#/contacts/${contacts[i].slug}`, c.x, c.y, "CONTACTS");
      contactNode.url = contacts[i].url;
      state.nodes.push(contactNode);
    }
  }
}

export async function enterCategory(categoryIndex, categoryLabelRaw) {
  state.mode = "category";
  state.selectedCategoryIndex = categoryIndex;
  state.selectedProjectIndex = -1;
  state.uiDepthTarget = 2;
  
  for (let i = 0; i < 3; i++) freezeNode(state.nodes[i]);
  for (let i = 3; i < state.nodes.length; i++) {
    if (state.nodes[i].kind === "child") freezeNode(state.nodes[i]);
  }
  
  state.nodes = state.nodes.filter(n => n.kind !== "grandchild");
  const projects = await loadProjectsByCategory(categoryLabelRaw);
  const anchor = state.nodes[state.selectedCategoryIndex];
  const step = (2 * CFG.GRANDCHILD.SECTOR_HALF_ANGLE) / Math.max(1, projects.length - 1 || 1);
  const r = Math.max(CFG.CHILD.MIN_DISTANCE, CFG.GRANDCHILD.WANDER_RADIUS);
  
  for (let i = 0; i < projects.length; i++) {
    const ang = -CFG.GRANDCHILD.SECTOR_HALF_ANGLE + i * step;
    let x = anchor.x + Math.cos(ang) * r + CFG.GRANDCHILD.X_OFFSET;
    let y = anchor.y + Math.sin(ang) * r;
    const c = clampToBounds(x, y, getBounds(state.ctx.canvas.width, state.ctx.canvas.height));
    state.nodes.push(createGrandchildNode(projects[i].title.toUpperCase(), `#/projects/${categoryLabelRaw}/${projects[i].slug}`, c.x, c.y, state.selectedCategoryIndex, categoryLabelRaw, projects[i].slug));
  }
}

export function refreshCategoryTargets() {
  if (state.mode !== "category" || state.selectedCategoryIndex < 0) return;
  const selected = state.nodes[state.selectedCategoryIndex];
  selected.vx = 0;
  selected.vy = 0;
  selected.targetX = selected.x;
  selected.targetY = selected.y;
  selected.targetTimer = 1e9;
  
  const anchor = state.nodes[state.selectedCategoryIndex];
  for (let i = 3; i < state.nodes.length; i++) {
    const c = state.nodes[i];
    if (c.kind !== "grandchild" || c.parentIndex !== state.selectedCategoryIndex) continue;
    const ang = (Math.random() - 0.5) * 2 * CFG.GRANDCHILD.SECTOR_HALF_ANGLE;
    let tx = anchor.x + Math.cos(ang) * CFG.GRANDCHILD.WANDER_RADIUS + CFG.GRANDCHILD.X_OFFSET;
    let ty = anchor.y + Math.sin(ang) * CFG.GRANDCHILD.WANDER_RADIUS;
    const bounds = getBounds(state.ctx?.canvas?.width || 800, state.ctx?.canvas?.height || 600);
    const clamped = clampToBounds(tx, ty, bounds);
    c.targetX = clamped.x;
    c.targetY = clamped.y;
    c.targetTimer = 0.01;
  }
}

export async function enterProjectMode(projectIndex, categorySlug, projectSlug) {
  state.mode = "project";
  state.selectedProjectIndex = projectIndex;
  state.uiDepthTarget = 3;
  
  state.nodes.forEach(freezeNode);
  cleanupGifElements();
  state.nodes = state.nodes.filter(n => n.kind !== "media" && n.kind !== "description");
  
  try {
    const projects = await loadProjects();
    const project = projects.find(p => p.category === categorySlug && p.slug === projectSlug);
    if (project) {
      const descNode = createDescriptionNode(project, projectIndex);
      state.nodes.push(descNode);
      
      if (project.media) {
        const validMedia = project.media.filter(m => m.type && m.src);
        const totalMediaCount = validMedia.length;
        for (let i = 0; i < validMedia.length; i++) {
          const mediaNode = createMediaNode(validMedia[i], projectIndex, i, totalMediaCount);
          state.nodes.push(mediaNode);
        }
      }
    }
  } catch (e) {
    console.error('Error loading project data:', e);
  }
}

export async function enterAboutMode(mainIndex) {
  if (state.mode === "content" && state.focusKey === "ABOUT") {
    resetToHome();
    return;
  }
  
  state.mode = "content";
  state.focusKey = "ABOUT";
  state.selectedContentIndex = mainIndex;
  state.uiDepthTarget = 1;
  state.cameraTargetOffsetX = CFG.CAMERA.SHIFT_PER_DEPTH * state.ctx.canvas.width * state.uiDepthTarget;
  
  cleanupGifElements();
  state.nodes = state.nodes.slice(0, 3);
  for (let i = 0; i < 3; i++) freezeNode(state.nodes[i]);
  
  try {
    const aboutData = await loadAbout();
    const aboutNode = createAboutDescriptionNode(aboutData.text, mainIndex);
    state.nodes.push(aboutNode);
  } catch (e) {
    console.error('Error loading about data:', e);
  }
}

// ============= MOBILE DETECTION =============

function isMobileDevice() {
  return window.matchMedia('(max-width: 768px), (pointer: coarse)').matches;
}

// ============= INTERACTION CONTROLLER =============

// Check if a node is part of the active path in project mode
function isNodeInteractiveInProjectMode(idx) {
  if (state.mode !== "project") return true;
  
  const n = state.nodes[idx];
  if (!n) return false;
  
  // PROJECTS node is always interactive
  if (idx === state.mainNodeIndexes.PROJECTS) return true;
  
  // Selected category is interactive
  if (idx === state.selectedCategoryIndex) return true;
  
  // Selected project is interactive
  if (idx === state.selectedProjectIndex) return true;
  
  // Media and description of selected project are interactive
  if ((n.kind === "media" || n.kind === "description") && n.projectIndex === state.selectedProjectIndex) return true;
  
  // Everything else is not interactive in project mode
  return false;
}

export function setupInteraction(canvas) {
  canvas.onpointerdown = (e) => handlePointerDown(e, canvas);
  canvas.onpointermove = (e) => handlePointerMove(e, canvas);
  canvas.onpointerup = () => handlePointerUp();
  canvas.onpointerleave = () => handlePointerLeave();
  
  // Disable scrolling on mobile devices
  if (isMobileDevice()) {
    // Prevent touch scrolling on the canvas
    canvas.addEventListener('touchmove', (e) => {
      e.preventDefault();
    }, { passive: false });
    
    // Prevent wheel/scroll events
    canvas.addEventListener('wheel', (e) => {
      e.preventDefault();
    }, { passive: false });
    
    // Prevent document-level scrolling
    document.body.addEventListener('touchmove', (e) => {
      e.preventDefault();
    }, { passive: false });
  }
}

function handlePointerDown(e, canvas) {
  const rect = canvas.getBoundingClientRect();
  const x = (e.clientX - rect.left) * (canvas.width / rect.width);
  const y = (e.clientY - rect.top) * (canvas.height / rect.height);
  const idx = hitTestAtScreen(x, y);
  const n = idx >= 0 ? state.nodes[idx] : null;
  
  // Check if node is interactive in current mode
  if (!n || !isNodeInteractiveInProjectMode(idx)) {
    handleEmptySpaceClick();
    return;
  }
  
  if (idx <= 2) {
    handleMainNodeClick(n, idx);
  } else if (n.kind === "child") {
    handleChildClick(n, idx);
  } else if (n.kind === "grandchild") {
    handleGrandchildClick(n, idx);
  }
  
  if (n.kind === "description" || n.kind === "aboutDescription" || n.kind === "media") {
    startDrag(idx, x, y);
    e.preventDefault();
  }
}

function handleEmptySpaceClick() {
  if (state.mode === "project") {
    cleanupGifElements();
    state.nodes = state.nodes.filter(n => n.kind !== "description" && n.kind !== "media");
    state.mode = "category";
    state.selectedProjectIndex = -1;
    state.uiDepthTarget = 2;
    state.cameraTargetOffsetX = CFG.CAMERA.SHIFT_PER_DEPTH * state.ctx.canvas.width * state.uiDepthTarget;
    for (let i = 0; i < state.nodes.length; i++) {
      if (state.nodes[i].kind === "grandchild") {
        state.nodes[i].targetTimer = 0.01;
      }
    }
  } else if (state.mode === "category") {
    if (state.focusKey) {
      enterFocus(state.focusKey);
    }
  } else if (state.mode === "focus" || state.mode === "content") {
    resetToHome();
  }
}

function handleMainNodeClick(node, idx) {
  if (node.label === "PROJECTS") {
    enterFocus("PROJECTS");
  } else if (node.label === "ABOUT") {
    enterAboutMode(idx);
  } else if (node.label === "CONTACTS") {
    enterFocus("CONTACTS");
  } else {
    enterFocus(node.label);
  }
}

function handleChildClick(node, idx) {
  if (node.url) {
    window.open(node.url, '_blank');
    return;
  }
  
  if (state.mode === "project") {
    cleanupGifElements();
    state.nodes = state.nodes.filter(n => n.kind !== "description" && n.kind !== "media");
    state.mode = "category";
    state.selectedProjectIndex = -1;
    state.uiDepthTarget = 2;
    state.cameraTargetOffsetX = CFG.CAMERA.SHIFT_PER_DEPTH * state.ctx.canvas.width * state.uiDepthTarget;
    for (let i = 0; i < state.nodes.length; i++) {
      if (state.nodes[i].kind === "grandchild") {
        state.nodes[i].targetTimer = 0.01;
      }
    }
  } else if (state.mode === "category" && state.selectedCategoryIndex === idx) {
    refreshCategoryTargets();
  } else {
    enterCategory(idx, node.labelRaw);
  }
}

function handleGrandchildClick(node, idx) {
  if (state.mode === "project" && state.selectedProjectIndex === idx) {
    cleanupGifElements();
    state.nodes = state.nodes.filter(n => n.kind !== "description" && n.kind !== "media");
    state.mode = "category";
    state.selectedProjectIndex = -1;
    state.uiDepthTarget = 2;
    state.cameraTargetOffsetX = CFG.CAMERA.SHIFT_PER_DEPTH * state.ctx.canvas.width * state.uiDepthTarget;
    for (let i = 0; i < state.nodes.length; i++) {
      if (state.nodes[i].kind === "grandchild") {
        state.nodes[i].targetTimer = 0.01;
      }
    }
  } else {
    enterProjectMode(idx, node.category, node.slug);
  }
}

function startDrag(idx, x, y) {
  state.draggedNodeIndex = idx;
  const n = state.nodes[idx];
  state.dragOffsetX = x - n.x;
  state.dragOffsetY = y - n.y;
  n.vx = 0;
  n.vy = 0;
  n.targetTimer = 1e9;
}

function handlePointerMove(e, canvas) {
  const rect = canvas.getBoundingClientRect();
  const x = (e.clientX - rect.left) * (canvas.width / rect.width);
  const y = (e.clientY - rect.top) * (canvas.height / rect.height);
  
  if (state.draggedNodeIndex >= 0) {
    handleDrag(x, y, rect);
    return;
  }
  
  handleHover(x, y, rect);
}

function handleDrag(x, y, rect) {
  const draggedNode = state.nodes[state.draggedNodeIndex];
  if (!draggedNode) return;
  
  draggedNode.x = x - state.dragOffsetX;
  draggedNode.y = y - state.dragOffsetY;
  draggedNode.targetX = draggedNode.x;
  draggedNode.targetY = draggedNode.y;
  
  const cssScaleX = rect.width / state.ctx.canvas.width;
  const cssScaleY = rect.height / state.ctx.canvas.height;
  
  if (draggedNode.kind === "description" || draggedNode.kind === "aboutDescription" || draggedNode.kind === "textContent") {
    if (draggedNode._boxWidth && draggedNode._boxHeight) {
      const center = draggedNode.kind === "description" 
        ? getDescriptionBoxCenter(draggedNode)
        : { x: draggedNode.x, y: draggedNode.y };
      const rectX = center.x - draggedNode._boxWidth / 2;
      const rectY = center.y - draggedNode._boxHeight / 2;
      window.setHoverBox?.({
        x: rect.left + rectX * cssScaleX,
        y: rect.top + rectY * cssScaleY,
        w: draggedNode._boxWidth * cssScaleX,
        h: draggedNode._boxHeight * cssScaleY,
      });
    }
  } else if (draggedNode.kind === "media") {
    const baseWidth = draggedNode._imageWidth || CFG.MEDIA.SIZE;
    const baseHeight = draggedNode._imageHeight || CFG.MEDIA.SIZE;
    const scale = draggedNode._individualScale || 1;
    const imgWidth = baseWidth * scale;
    const imgHeight = baseHeight * scale;
    const rectX = draggedNode.x - imgWidth / 2 - CFG.MEDIA.BRACKET_PADDING;
    const rectY = draggedNode.y - imgHeight / 2 - CFG.MEDIA.BRACKET_PADDING;
    window.setHoverBox?.({
      x: rect.left + rectX * cssScaleX,
      y: rect.top + rectY * cssScaleY,
      w: (imgWidth + CFG.MEDIA.BRACKET_PADDING * 2) * cssScaleX,
      h: (imgHeight + CFG.MEDIA.BRACKET_PADDING * 2) * cssScaleY,
    });
  }
}

function handleHover(x, y, rect) {
  let hitIndex = hitTestAtScreen(x, y);
  
  // Filter out non-interactive nodes in project mode
  if (hitIndex >= 0 && !isNodeInteractiveInProjectMode(hitIndex)) {
    hitIndex = -1;
  }
  
  const n = hitIndex >= 0 ? state.nodes[hitIndex] : null;
  
  if (hitIndex !== state.hoveredNodeIndex) {
    if (state.hoveredNodeIndex >= 0 && canResume(state.hoveredNodeIndex)) {
      const prev = state.nodes[state.hoveredNodeIndex];
      prev.targetTimer = 0.01;
      prev.vx += (Math.random() - 0.5) * 0.1;
      prev.vy += (Math.random() - 0.5) * 0.1;
    }
    state.hoveredNodeIndex = hitIndex;
    if (hitIndex >= 0) {
      n.vx = 0;
      n.vy = 0;
      n.targetX = n.x;
      n.targetY = n.y;
      n.targetTimer = 1e9;
      if (n.kind === "media") {
        let maxZ = 0;
        for (const node of state.nodes) {
          if (node.kind === "media" && node._zIndex > maxZ) {
            maxZ = node._zIndex;
          }
        }
        n._zIndex = maxZ + 1;
      }
    }
  }
  
  if (n) {
    updateHoverBox(n, hitIndex, rect);
  } else {
    window.clearHoverBox?.();
  }
}

function updateHoverBox(n, hitIndex, rect) {
  const cssScaleX = rect.width / state.ctx.canvas.width;
  const cssScaleY = rect.height / state.ctx.canvas.height;
  
  if (n.kind === "description" || n.kind === "aboutDescription" || n.kind === "textContent") {
    if (n._boxWidth && n._boxHeight) {
      const center = n.kind === "description"
        ? getDescriptionBoxCenter(n)
        : n.kind === "textContent"
        ? { x: getScreenXForIndex(hitIndex), y: n.y }
        : { x: n.x, y: n.y };
      
      const rectX = center.x - n._boxWidth / 2;
      const rectY = center.y - n._boxHeight / 2;
      window.setHoverBox?.({
        x: rect.left + rectX * cssScaleX,
        y: rect.top + rectY * cssScaleY,
        w: n._boxWidth * cssScaleX,
        h: n._boxHeight * cssScaleY,
      });
    }
  } else if (n.kind === "media") {
    const baseWidth = n._imageWidth || CFG.MEDIA.SIZE;
    const baseHeight = n._imageHeight || CFG.MEDIA.SIZE;
    const scale = n._individualScale || 1;
    const imgWidth = baseWidth * scale;
    const imgHeight = baseHeight * scale;
    const rectX = n.x - imgWidth / 2 - CFG.MEDIA.BRACKET_PADDING;
    const rectY = n.y - imgHeight / 2 - CFG.MEDIA.BRACKET_PADDING;
    window.setHoverBox?.({
      x: rect.left + rectX * cssScaleX,
      y: rect.top + rectY * cssScaleY,
      w: (imgWidth + CFG.MEDIA.BRACKET_PADDING * 2) * cssScaleX,
      h: (imgHeight + CFG.MEDIA.BRACKET_PADDING * 2) * cssScaleY,
    });
  } else {
    const dpr = Math.max(1, window.devicePixelRatio || 1);
    const fontSize = getFontSizeForIndex(hitIndex);
    const isMain = hitIndex < 3;
    const scale = isMain ? fontSize / CFG.FONTS.MAIN : 1;
    const rectW = CFG.RECT.w * scale;
    const rectH = isMain ? CFG.RECT.h * scale : CFG.RECT.h;
    const screenX = getScreenXForIndex(hitIndex);
    const labelWidth = measureTextWidth(n.label, fontSize);
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
}

function getFontSizeForIndex(i) {
  const isMain = i < 3;
  let fontSize = CFG.FONTS.MAIN;
  if (state.mode === "category" && isMain && i !== state.mainNodeIndexes.PROJECTS) fontSize = CFG.FONTS.MAIN_SMALL;
  const n = state.nodes[i];
  if (n?.kind === "child") fontSize = CFG.FONTS.CHILD;
  if (n?.kind === "grandchild") fontSize = CFG.FONTS.GRANDCHILD;
  if (n?.kind === "description") fontSize = 14;
  
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
  if (n?.kind === "child" && (state.mode === "category" || state.mode === "project")) {
    if (i !== state.selectedCategoryIndex) {
      fontSize *= (1 - (1 - CFG.CHILD.SHRINK_SCALE) * catT);
      if (state.mode === "project") {
        fontSize *= (1 - (1 - CFG.PROJECT.SHRINK_SCALE) * projectT);
      }
    }
  }
  if (n?.kind === "grandchild" && state.mode === "project") {
    if (i !== state.selectedProjectIndex) {
      fontSize *= (1 - (1 - CFG.PROJECT.SHRINK_SCALE) * projectT);
    }
  }
  if (n?.kind === "media" && state.mode === "project") {
    fontSize = 12;
  }
  if (n?.kind === "description" && state.mode === "project") {
    fontSize = 14;
  }
  return fontSize;
}

function handlePointerUp() {
  if (state.draggedNodeIndex >= 0) {
    const draggedNode = state.nodes[state.draggedNodeIndex];
    if (draggedNode) {
      draggedNode.targetX = draggedNode.x;
      draggedNode.targetY = draggedNode.y;
      draggedNode.vx = 0;
      draggedNode.vy = 0;
      draggedNode.targetTimer = 1e9;
      
      // Mark media as manually moved (ignores boundary clamping)
      if (draggedNode.kind === "media") {
        draggedNode._manuallyMoved = true;
      }
    }
    state.draggedNodeIndex = -1;
    state.dragOffsetX = 0;
    state.dragOffsetY = 0;
  }
}

function handlePointerLeave() {
  if (state.draggedNodeIndex >= 0) {
    state.draggedNodeIndex = -1;
    state.dragOffsetX = 0;
    state.dragOffsetY = 0;
  }
  
  for (let i = 0; i < state.nodes.length; i++) {
    const n = state.nodes[i];
    if (!canResume(i)) continue;
    if (n.targetTimer > 1e8) n.targetTimer = 0.1;
  }
  state.hoveredNodeIndex = -1;
  window.clearHoverBox?.();
}

