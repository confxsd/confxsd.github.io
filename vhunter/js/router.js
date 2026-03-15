// VHunter Router Module

export function parseRoute() {
  const hash = window.location.hash.slice(1) || 'dashboard';
  const [page, ticker] = hash.split('/');
  return { page: page || 'dashboard', ticker: ticker || null };
}

export function updateRoute(page, ticker = null) {
  const hash = ticker ? `${page}/${ticker}` : page;
  if (window.location.hash !== `#${hash}`) {
    history.pushState(null, '', `#${hash}`);
  }
}

export function initRouter(onRouteChange) {
  window.addEventListener('hashchange', () => {
    const route = parseRoute();
    onRouteChange(route);
  });
}
