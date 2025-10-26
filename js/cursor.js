// Draw a global crosshair cursor and optional corner brackets around hovered targets

// Tunable style parameters
const CURSOR_LINE_WIDTH = 2.0;
const CROSSHAIR_SIZE = 10; // px (base, scaled by DPR)
const BRACKET_LENGTH = 16; // px (base, scaled by DPR)
const BRACKET_OFFSET = 4; // px distance from box edges
const TRANSITION_MS = 120; // crosshair <-> brackets duration

let ctx = null;
let raf = null;
let hoverBox = null; // {x,y,w,h} in CSS pixels
let hoverElement = null; // HTMLElement currently hovered (for home button etc.)
let mouse = { x: 0, y: 0 };
let state = { lastHover: performance.now(), isHovering: false };
let footerEl = null;

export function initCursor(canvas) {
  ctx = canvas.getContext("2d");
  footerEl = document.getElementById("cursor-xy");
  const resize = () => {
    const dpr = Math.max(1, window.devicePixelRatio || 1);
    canvas.width = Math.floor(canvas.clientWidth * dpr);
    canvas.height = Math.floor(canvas.clientHeight * dpr);
  };
  resize();
  window.addEventListener("resize", resize);

  window.addEventListener("pointermove", (e) => {
    const rect = canvas.getBoundingClientRect();
    mouse.x = (e.clientX - rect.left) * (canvas.width / rect.width);
    mouse.y = (e.clientY - rect.top) * (canvas.height / rect.height);
    if (footerEl) {
      const cssX = Math.round(e.clientX - rect.left);
      const cssY = Math.round(e.clientY - rect.top);
      footerEl.textContent = `X.${cssX} _ Y.${cssY}`;
    }
  });

  // Track hover on interactive DOM elements (links, buttons)
  document.addEventListener("pointermove", (e) => {
    const el = e.target instanceof HTMLElement ? e.target.closest('a, button, [data-hover-box]') : null;
    const wasHovering = !!hoverElement || !!hoverBoxFromCanvas;
    hoverElement = el || null;
    if (hoverElement) {
      const rect = hoverElement.getBoundingClientRect();
      setHoverBox({ x: rect.left, y: rect.top, w: rect.width, h: rect.height });
    } else if (!hoverBoxFromCanvas) {
      clearHoverBox();
    }
    const isHovering = !!hoverElement || !!hoverBoxFromCanvas;
    if (isHovering !== wasHovering) state.lastHover = performance.now();
    state.isHovering = isHovering;
  });

  const loop = () => {
    draw();
    raf = requestAnimationFrame(loop);
  };
  raf = requestAnimationFrame(loop);
}

let hoverBoxFromCanvas = false;
export function setHoverBox(box) {
  hoverBox = box; // CSS pixels
  hoverBoxFromCanvas = true;
  const now = performance.now();
  if (!state.isHovering) state.lastHover = now;
  state.isHovering = true;
}

function draw() {
  if (!ctx) return;
  const { canvas } = ctx;
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  const dpr = Math.max(1, window.devicePixelRatio || 1);
  ctx.save();
  ctx.strokeStyle = getComputedStyle(document.documentElement).getPropertyValue("--fg").trim() || "#00ff66";
  ctx.lineWidth = CURSOR_LINE_WIDTH * dpr;

  const now = performance.now();
  const progress = Math.min(1, (now - state.lastHover) / TRANSITION_MS);
  const tIn = state.isHovering ? progress : 0; // 0->1 when entering hover
  if (!hoverBox) {
    // Crosshair (only when not hovering an interactive element)
    const size = CROSSHAIR_SIZE * dpr;
    ctx.beginPath();
    ctx.moveTo(mouse.x - size, mouse.y);
    ctx.lineTo(mouse.x + size, mouse.y);
    ctx.moveTo(mouse.x, mouse.y - size);
    ctx.lineTo(mouse.x, mouse.y + size);
    ctx.stroke();
  } else {
    // Corner brackets around hovered element (cursor transforms into brackets)
    const x = hoverBox.x * dpr - BRACKET_OFFSET * dpr;
    const y = hoverBox.y * dpr - BRACKET_OFFSET * dpr;
    const w = hoverBox.w * dpr + BRACKET_OFFSET * 2 * dpr;
    const h = hoverBox.h * dpr + BRACKET_OFFSET * 2 * dpr;
    const l = Math.min(BRACKET_LENGTH * dpr, Math.min(w, h) / 3); // bracket length
    // animate in from center using tIn
    const cx = x + w / 2, cy = y + h / 2;
    const k = tIn; // 0..1
    const ix = cx + (x - cx) * k;
    const iy = cy + (y - cy) * k;
    const iw = w * k;
    const ih = h * k;
    // TL
    ctx.beginPath();
    ctx.moveTo(ix, iy + l);
    ctx.lineTo(ix, iy);
    ctx.lineTo(ix + l, iy);
    // TR
    ctx.moveTo(ix + iw - l, iy);
    ctx.lineTo(ix + iw, iy);
    ctx.lineTo(ix + iw, iy + l);
    // BR
    ctx.moveTo(ix + iw, iy + ih - l);
    ctx.lineTo(ix + iw, iy + ih);
    ctx.lineTo(ix + iw - l, iy + ih);
    // BL
    ctx.moveTo(ix + l, iy + ih);
    ctx.lineTo(ix, iy + ih);
    ctx.lineTo(ix, iy + ih - l);
    ctx.stroke();
  }

  ctx.restore();
}

export function clearHoverBox() { hoverBox = null; hoverBoxFromCanvas = false; }

