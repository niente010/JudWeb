let mountPoint = null;
let hooks = null;

const routes = [
  { name: "home", pattern: /^#\/?$/, render: () => "" },
  // All interactions happen on canvas - no separate pages needed
];

export function initRouter(options) {
  mountPoint = options.mountPoint;
  hooks = options;
  window.addEventListener("hashchange", () => { void handleRouteChange(); });
  window.addEventListener("load", () => { void handleRouteChange(); });
  void handleRouteChange();
}

export function navigateTo(hash) {
  if (location.hash === hash) return handleRouteChange();
  location.hash = hash;
}

function matchRoute() {
  const hash = location.hash || "#/";
  for (const r of routes) {
    const m = hash.match(r.pattern);
    if (m) return { route: r, params: m.slice(1) };
  }
  return { route: routes[0], params: [] };
}

async function handleRouteChange() {
  const { route, params } = matchRoute();
  if (hooks && typeof hooks.onBeforeRender === "function") {
    hooks.onBeforeRender(route, params);
  }
  const maybe = route.render({ params, navigateTo });
  const html = typeof maybe?.then === "function" ? await maybe : maybe;
  if (mountPoint) mountPoint.innerHTML = html;
}

