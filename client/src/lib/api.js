// Thin fetch wrapper. The access token lives in memory only (never localStorage), and the
// refresh token is an httpOnly cookie the browser sends by itself.
let accessToken = null;
let refreshing = null;
let authLost = () => {};

export const getAccessToken = () => accessToken;
export const setAccessToken = (t) => {
  accessToken = t;
};
export const onAuthLost = (fn) => {
  authLost = fn;
};

export class ApiError extends Error {
  constructor(message, status, details) {
    super(message);
    this.status = status;
    this.details = details;
  }
}

function rawFetch(path, { method = 'GET', body, auth = true } = {}) {
  const headers = {};
  if (body !== undefined) headers['Content-Type'] = 'application/json';
  if (auth && accessToken) headers.Authorization = `Bearer ${accessToken}`;
  return fetch(`/api${path}`, { method, headers, credentials: 'include', body: body !== undefined ? JSON.stringify(body) : undefined });
}

// One refresh at a time, even if several requests fail together.
export function refreshSession() {
  if (!refreshing) {
    refreshing = (async () => {
      try {
        const res = await rawFetch('/auth/refresh', { method: 'POST', auth: false });
        if (!res.ok) {
          accessToken = null;
          return null;
        }
        const data = await res.json();
        accessToken = data.accessToken;
        return data;
      } catch {
        return null;
      }
    })().finally(() => {
      refreshing = null;
    });
  }
  return refreshing;
}

async function request(path, opts = {}) {
  let res;
  try {
    res = await rawFetch(path, opts);
  } catch {
    throw new ApiError('Cannot reach the server. Is it running?', 0);
  }
  if (res.status === 401 && opts.auth !== false) {
    const renewed = await refreshSession();
    if (renewed) res = await rawFetch(path, opts);
    else {
      authLost();
      throw new ApiError('Your session expired. Sign in again.', 401);
    }
  }
  let data = null;
  try {
    data = await res.json();
  } catch {
    /* empty body */
  }
  if (!res.ok) throw new ApiError(data?.error || res.statusText || 'Request failed', res.status, data?.details);
  return data;
}

export const api = {
  get: (path, opts) => request(path, { ...opts, method: 'GET' }),
  post: (path, body, opts) => request(path, { ...opts, method: 'POST', body: body ?? {} }),
  put: (path, body, opts) => request(path, { ...opts, method: 'PUT', body }),
  patch: (path, body, opts) => request(path, { ...opts, method: 'PATCH', body }),
  del: (path, opts) => request(path, { ...opts, method: 'DELETE' }),
};
