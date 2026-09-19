import test from 'node:test';
import assert from 'node:assert/strict';
import { once } from 'node:events';
import { createApp } from '../src/app.mjs';
import { AttendanceClient, validatePayload } from '../src/attendance-client.mjs';
import { boardHtml } from '../src/frontend.mjs';

const DISPLAY_KEY = 'MDEyMzQ1Njc4OWFiY2RlZjAxMjM0NTY3ODlhYmNkZWY';
const config = { displayKey: DISPLAY_KEY, locationCode: 'ARRIVAL', publicOrigin: 'https://igs.dedyn.io' };
const payload = validPayload();

test('display API requires its profile-bound key', async () => {
  await withServer({ currentQr: async () => payload }, async base => {
    assert.equal((await fetch(`${base}/api/qr/eingang`)).status, 401);
    assert.equal((await fetch(`${base}/api/qr/eingang`, { headers: { Authorization: 'Bearer wrong' } })).status, 401);
    const response = await fetch(`${base}/api/qr/eingang`, { headers: { Authorization: `Bearer ${DISPLAY_KEY}` } });
    assert.equal(response.status, 200); assert.equal((await response.json()).location.code, 'ARRIVAL');
    assert.equal((await fetch(`${base}/api/qr/other`, { headers: { Authorization: `Bearer ${DISPLAY_KEY}` } })).status, 404);
  });
});

test('null-origin CORS and authorization preflight are exact, never global', async () => {
  await withServer({ currentQr: async () => payload }, async base => {
    const preflight = await fetch(`${base}/api/qr/eingang`, { method: 'OPTIONS', headers: { Origin: 'null', 'Access-Control-Request-Method': 'GET', 'Access-Control-Request-Headers': 'Authorization' } });
    assert.equal(preflight.status, 204); assert.equal(preflight.headers.get('access-control-allow-origin'), 'null'); assert.equal(preflight.headers.get('access-control-allow-headers'), 'Authorization');
    const denied = await fetch(`${base}/api/qr/eingang`, { method: 'OPTIONS', headers: { Origin: 'https://evil.example', 'Access-Control-Request-Method': 'GET', 'Access-Control-Request-Headers': 'Authorization' } });
    assert.equal(denied.status, 403); assert.equal(denied.headers.get('access-control-allow-origin'), null);
    const ordinary = await fetch(`${base}/api/status`, { headers: { Origin: 'null' } }); assert.equal(ordinary.headers.get('access-control-allow-origin'), null);
  });
});

test('upstream outage returns no stale QR and recovery is automatic', async () => {
  let online = true;
  await withServer({ currentQr: async () => { if (!online) throw new Error('attendance_request_failed'); return payload; } }, async base => {
    const auth = { Authorization: `Bearer ${DISPLAY_KEY}` };
    assert.equal((await fetch(`${base}/api/qr/eingang`, { headers: auth })).status, 200);
    online = false;
    const failed = await fetch(`${base}/api/qr/eingang`, { headers: auth }); assert.equal(failed.status, 503); assert.deepEqual(await failed.json(), { error: 'attendance_unavailable' });
    let status = await (await fetch(`${base}/api/status`)).json(); assert.equal(status.currentQrValid, false); assert.equal(status.attendanceReachable, false);
    online = true; assert.equal((await fetch(`${base}/api/qr/eingang`, { headers: auth })).status, 200);
    status = await (await fetch(`${base}/api/status`)).json(); assert.equal(status.currentQrValid, true);
  });
});

test('payload validation rejects wrong location, stale and implausible responses', () => {
  const now = Date.now(); assert.equal(validatePayload(validPayload(now), 'ARRIVAL', now).location.code, 'ARRIVAL');
  assert.throws(() => validatePayload({ ...validPayload(now), location: { code: 'LA', name: 'LA', type: 'LOCATION' } }, 'ARRIVAL', now));
  assert.throws(() => validatePayload({ ...validPayload(now), validUntil: new Date(now - 1).toISOString() }, 'ARRIVAL', now));
  assert.throws(() => validatePayload({ ...validPayload(now), qrSvg: '' }, 'ARRIVAL', now));
});

test('board shell contains no secret or QR and implements expiry fail-safe without reload', () => {
  const html = boardHtml(config.publicOrigin);
  assert.doesNotMatch(html, new RegExp(DISPLAY_KEY)); assert.doesNotMatch(html, /<svg xmlns=/); assert.match(html, /location\.hash/); assert.match(html, /Authorization:'Bearer '\+key/);
  assert.match(html, /setTimeout\(\(\)=>\{expire\(\);load\(\);\}/); assert.doesNotMatch(html, /location\.reload/); assert.match(html, /Check-in momentan nicht verfügbar/);
});

async function withServer(client, run) {
  const server = createApp(config, client); server.listen(0, '127.0.0.1'); await once(server, 'listening');
  try { await run(`http://127.0.0.1:${server.address().port}`); } finally { server.close(); await once(server, 'close'); }
}
function validPayload(now = Date.now()) { return { location: { code: 'ARRIVAL', name: 'Haupteingang', type: 'ARRIVAL' }, qrSvg: '<svg xmlns="http://www.w3.org/2000/svg"></svg>', checkinPath: '/attendance-checkin?token=abc', validUntil: new Date(now + 20000).toISOString(), validForSeconds: 20 }; }


test('board uses the configured canonical origin natively, including sandbox CSP', async () => {
  await withServer({ currentQr: async () => payload }, async base => {
    const response = await fetch(`${base}/board/eingang`);
    const html = await response.text();
    assert.match(response.headers.get('content-security-policy'), /connect-src https:\/\/igs\.dedyn\.io/);
    assert.ok(html.includes(config.publicOrigin + '/integrations/attendance/api/qr/eingang'));
    assert.ok(!html.includes('dynv6'));
  });
});

test('QR check-in link uses public origin while authenticated upstream stays separate', async () => {
  const client = new AttendanceClient({ publicOrigin: config.publicOrigin, attendanceBaseUrl: 'https://attendance.example', locationCode: 'ARRIVAL', attendanceServiceKey: 'test-only' }, async url => {
    assert.equal(url, 'https://attendance.example/attendance-signage-token');
    return { ok: true, json: async () => validPayload() };
  });
  assert.equal(new URL((await client.currentQr()).checkinPath).origin, config.publicOrigin);
});
