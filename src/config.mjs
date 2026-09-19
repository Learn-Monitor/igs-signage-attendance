import { readFileSync } from 'node:fs';

function required(name) {
  const fileName = process.env[`${name}_FILE`];
  const value = fileName ? readFileSync(fileName, 'utf8').trim() : process.env[name];
  if (!value) throw new Error(`${name} is required`);
  return value;
}

function secret(name) {
  const value = required(name);
  if (!/^[A-Za-z0-9_-]{43,128}$/.test(value)) throw new Error(`${name} must be a base64url-encoded 256-bit secret`);
  const decoded = Buffer.from(value, 'base64url');
  if (decoded.length < 32) throw new Error(`${name} must contain at least 32 random bytes`);
  return value;
}

function origin(name) {
  const value = required(name);
  const parsed = new URL(value);
  if (parsed.protocol !== 'https:' || parsed.username || parsed.password || parsed.pathname !== '/' || parsed.search || parsed.hash) {
    throw new Error(`${name} must be an HTTPS origin`);
  }
  return parsed.origin;
}

export function loadConfig() {
  return {
    port: Number.parseInt(process.env.PORT || '3004', 10),
    attendanceBaseUrl: origin('ARCANUM_ATTENDANCE_BASE_URL'),
    attendanceServiceKey: secret('ATTENDANCE_SIGNAGE_SERVICE_KEY'),
    locationCode: required('ATTENDANCE_LOCATION_INGANG'),
    displayKey: secret('DISPLAY_KEY_EINGANG'),
    gtsLocationCode: required('ATTENDANCE_LOCATION_GTS'),
    gtsDisplayKey: secret('DISPLAY_KEY_GTS'),
    publicOrigin: origin('SIGNAGE_PUBLIC_ORIGIN'),
  };
}
