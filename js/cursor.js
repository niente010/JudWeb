// Draw a global crosshair cursor and optional corner brackets around hovered targets

import { CURSOR } from "./graph/config.js";

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
  ctx.lineWidth = CURSOR.LINE_WIDTH * dpr;

  const now = performance.now();
  const progress = Math.min(1, (now - state.lastHover) / CURSOR.TRANSITION_MS);
  const tIn = state.isHovering ? progress : 0; // 0->1 when entering hover
  if (!hoverBox) {
    // 3-point cursor: one line up, two diagonal lines down (Y shape) with gap at center
    const size = CURSOR.SIZE * dpr;
    const gap = CURSOR.GAP * dpr;
    // Calculate angle for diagonal lines (half of bottom angle, from vertical down)
    const halfAngle = (CURSOR.BOTTOM_ANGLE / 2) * (Math.PI / 180);
    const sinA = Math.sin(halfAngle);
    const cosA = Math.cos(halfAngle);
    ctx.beginPath();
    // Vertical line going up (starts from gap, same length)
    ctx.moveTo(mouse.x, mouse.y - gap);
    ctx.lineTo(mouse.x, mouse.y - gap - size);
    // Diagonal line going down-left (starts from gap, same length)
    ctx.moveTo(mouse.x - sinA * gap, mouse.y + cosA * gap);
    ctx.lineTo(mouse.x - sinA * (gap + size), mouse.y + cosA * (gap + size));
    // Diagonal line going down-right (starts from gap, same length)
    ctx.moveTo(mouse.x + sinA * gap, mouse.y + cosA * gap);
    ctx.lineTo(mouse.x + sinA * (gap + size), mouse.y + cosA * (gap + size));
    ctx.stroke();
  } else {
    // Corner brackets around hovered element (cursor transforms into brackets)
    const x = hoverBox.x * dpr - CURSOR.BRACKET_OFFSET * dpr;
    const y = hoverBox.y * dpr - CURSOR.BRACKET_OFFSET * dpr;
    const w = hoverBox.w * dpr + CURSOR.BRACKET_OFFSET * 2 * dpr;
    const h = hoverBox.h * dpr + CURSOR.BRACKET_OFFSET * 2 * dpr;
    const l = Math.min(CURSOR.BRACKET_LENGTH * dpr, Math.min(w, h) / 3); // bracket length
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

