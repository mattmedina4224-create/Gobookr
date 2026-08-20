'use strict';

// A tiny dependency-free router with Express-style path params (`/pro/:id`).
class Router {
  constructor() {
    this.routes = { GET: [], POST: [] };
  }

  get(pattern, handler) {
    this.routes.GET.push(this._compile(pattern, handler));
  }

  post(pattern, handler) {
    this.routes.POST.push(this._compile(pattern, handler));
  }

  _compile(pattern, handler) {
    const paramNames = [];
    const regexStr = pattern
      .split('/')
      .map((seg) => {
        if (seg.startsWith(':')) {
          paramNames.push(seg.slice(1));
          return '([^/]+)';
        }
        return seg.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      })
      .join('/');
    return { regex: new RegExp(`^${regexStr}$`), paramNames, handler };
  }

  match(method, pathname) {
    for (const route of this.routes[method] || []) {
      const m = route.regex.exec(pathname);
      if (m) {
        const params = {};
        route.paramNames.forEach((name, i) => (params[name] = decodeURIComponent(m[i + 1])));
        return { handler: route.handler, params };
      }
    }
    return null;
  }
}

module.exports = Router;
