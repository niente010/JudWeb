import { initRouter, navigateTo } from "./router.js";
import { startGraph, stopGraph } from "./graph.js";
import { initCursor, setHoverBox, clearHoverBox } from "./cursor.js";

const appEl = document.getElementById("app");
const canvasEl = document.getElementById("graph-canvas");
const cursorCanvas = document.getElementById("cursor-canvas");

// Header home button navigates to root
document.addEventListener("click", (ev) => {
  const target = ev.target;
  if (target && target.matches(".home-button")) {
    navigateTo("#/");
  }
});

// Router hooks so we can start/stop the animated graph only on home
// expose hover box helpers for non-module listeners (graph.js)
window.setHoverBox = setHoverBox;
window.clearHoverBox = clearHoverBox;
initCursor(cursorCanvas);

initRouter({
  onBeforeRender: (route) => {
    // Toggle canvas visibility per route
    const isHome = route.name === "home";
    canvasEl.style.display = isHome ? "block" : "none";
    // Allow clicks to reach the canvas on home; otherwise enable normal UI
    appEl.style.pointerEvents = isHome ? "none" : "auto";
    if (isHome) startGraph(canvasEl);
    else stopGraph();
  },
  mountPoint: appEl,
});

