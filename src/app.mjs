import http from 'node:http';
import { timingSafeEqual } from 'node:crypto';
import { boardHtml } from './frontend.mjs';

const BOARD_PATH = '/board/eingang';
const QR_PATH = '/api/qr/eingang';
const GTS_BOARD_PATH = '/board/gts';
const GTS_QR_PATH = '/api/qr/gts';
const STATUS_PATH = '/api/status';

export function createApp(config, attendanceClient, gtsAttendanceClientOrNow = null, nowArg = () => Date.now()) {
  const legacyNow = typeof gtsAttendanceClientOrNow === 'function';
  const gtsAttendanceClient = legacyNow ? null : gtsAttendanceClientOrNow;
  const now = legacyNow ? gtsAttendanceClientOrNow : nowArg;

  const state = { attendanceReachable: false, lastAttendanceSuccess: null, locationActive: false, currentQrValidUntil: null, lastRefresh: null, errorState: 'not_yet_refreshed' };
  const expectedDisplayKey = Buffer.from(config.displayKey, 'base64url');
  const hasGts = Boolean(config.gtsDisplayKey && config.gtsLocationCode && gtsAttendanceClient);
  const expectedGtsDisplayKey = hasGts ? Buffer.from(config.gtsDisplayKey, 'base64url') : null;

  return http.createServer(async (request, response) => {
    const path = new URL(request.url, 'http://localhost').pathname;
    if (path === BOARD_PATH || path === `${BOARD_PATH}/`) {
      if (request.method !== 'GET' && request.method !== 'HEAD') return methodNotAllowed(response);
      return html(response, boardHtml(config.publicOrigin), request.method === 'HEAD', config.publicOrigin);
    }

    if (hasGts && (path === GTS_BOARD_PATH || path === `${GTS_BOARD_PATH}/`)) {
      if (request.method !== 'GET' && request.method !== 'HEAD') return methodNotAllowed(response);
      return html(response, boardHtml(config.publicOrigin, 'gts', 'GTS'), request.method === 'HEAD', config.publicOrigin);
    }

    if (path === QR_PATH) {
      if (request.method === 'OPTIONS') return preflight(request, response);
      if (request.method !== 'GET' && request.method !== 'HEAD') return methodNotAllowed(response);
      if (!authorized(request.headers.authorization, expectedDisplayKey)) return json(response, 401, { error: 'unauthorized' }, request, request.method === 'HEAD', true);
      state.lastRefresh = new Date(now()).toISOString();
      try {
        const payload = await attendanceClient.currentQr();
        state.attendanceReachable = true;
        state.lastAttendanceSuccess = new Date(now()).toISOString();
        state.locationActive = true;
        state.currentQrValidUntil = payload.validUntil;
        state.errorState = null;
        return json(response, 200, payload, request, request.method === 'HEAD', true);
      } catch (error) {
        state.attendanceReachable = false;
        state.locationActive = false;
        state.currentQrValidUntil = null;
        state.errorState = safeError(error);
        return json(response, 503, { error: 'attendance_unavailable' }, request, request.method === 'HEAD', true);
      }
    }
    if (hasGts && path === GTS_QR_PATH) {
      if (request.method === 'OPTIONS') return preflight(request, response);
      if (request.method !== 'GET' && request.method !== 'HEAD') return methodNotAllowed(response);
      if (!authorized(request.headers.authorization, expectedGtsDisplayKey)) {
        return json(response, 401, { error: 'unauthorized' }, request, request.method === 'HEAD', true);
      }

      try {
        const payload = await gtsAttendanceClient.currentQr();
        return json(response, 200, payload, request, request.method === 'HEAD', true);
      } catch (error) {
        return json(response, 503, { error: 'attendance_unavailable' }, request, request.method === 'HEAD', true);
      }
    }

    if (path === STATUS_PATH) {
      if (request.method !== 'GET' && request.method !== 'HEAD') return methodNotAllowed(response);
      const currentQrValid = Boolean(state.currentQrValidUntil && Date.parse(state.currentQrValidUntil) > now());
      return json(response, 200, { healthy: state.attendanceReachable && state.locationActive && currentQrValid, attendanceReachable: state.attendanceReachable, lastAttendanceSuccess: state.lastAttendanceSuccess, locationCode: config.locationCode, locationActive: state.locationActive, currentQrValid, currentQrValidUntil: state.currentQrValidUntil, lastRefresh: state.lastRefresh, errorState: state.errorState }, request, request.method === 'HEAD');
    }
    return json(response, 404, { error: 'not_found' }, request);
  });
}

function authorized(value, expected) {
  if (typeof value !== 'string' || !value.startsWith('Bearer ')) return false;
  let supplied;
  try { supplied = Buffer.from(value.slice(7), 'base64url'); } catch { return false; }
  return supplied.length === expected.length && timingSafeEqual(supplied, expected);
}

function preflight(request, response) {
  if (request.headers.origin !== 'null') return json(response, 403, { error: 'cors_origin_denied' }, request);
  const requestedMethod = String(request.headers['access-control-request-method'] || '').toUpperCase();
  const requestedHeaders = String(request.headers['access-control-request-headers'] || '').toLowerCase().split(',').map(value => value.trim()).filter(Boolean);
  if (requestedMethod !== 'GET' || requestedHeaders.some(header => header !== 'authorization') || !requestedHeaders.includes('authorization')) return json(response, 403, { error: 'cors_preflight_denied' }, request);
  response.writeHead(204, { ...baseHeaders(), ...corsHeaders(), 'Access-Control-Max-Age': '300' });
  response.end();
}

function html(response, body, head = false, publicOrigin) {
  response.writeHead(200, { ...baseHeaders(), 'Content-Type': 'text/html; charset=utf-8', 'Content-Security-Policy': `default-src 'self'; script-src 'unsafe-inline'; style-src 'unsafe-inline'; img-src 'self' data:; connect-src ${publicOrigin}`, 'Cache-Control': 'no-store' });
  response.end(head ? undefined : body);
}

function json(response, status, payload, request = {}, head = false, allowNullOrigin = false) {
  const cors = allowNullOrigin && request.headers?.origin === 'null' ? corsHeaders() : {};
  const body = `${JSON.stringify(payload)}\n`;
  response.writeHead(status, { ...baseHeaders(), ...cors, 'Content-Type': 'application/json; charset=utf-8', 'Content-Security-Policy': "default-src 'none'; frame-ancestors 'none'", 'Cache-Control': 'no-store' });
  response.end(head ? undefined : body);
}

function corsHeaders() { return { 'Access-Control-Allow-Origin': 'null', 'Access-Control-Allow-Methods': 'GET, OPTIONS', 'Access-Control-Allow-Headers': 'Authorization', Vary: 'Origin' }; }
function baseHeaders() { return { 'X-Content-Type-Options': 'nosniff', 'Referrer-Policy': 'no-referrer', 'X-Robots-Tag': 'noindex, nofollow, noarchive' }; }
function methodNotAllowed(response) { response.writeHead(405, { ...baseHeaders(), Allow: 'GET, HEAD, OPTIONS' }); response.end(); }
function safeError(error) { const value = error instanceof Error ? error.message : String(error); return /^(attendance_[a-z0-9_]+)$/.test(value) ? value : 'attendance_request_failed'; }
