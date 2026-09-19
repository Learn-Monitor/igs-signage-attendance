export class AttendanceClient {
  constructor(config, fetchImpl = fetch) {
    this.config = config;
    this.fetchImpl = fetchImpl;
  }

  async currentQr() {
    const response = await this.fetchImpl(`${this.config.attendanceBaseUrl}/attendance-signage-token`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'User-Agent': 'igs-signage-attendance/1.0',
        Cookie: `attendance_signage_service_key=${this.config.attendanceServiceKey}`,
      },
      body: JSON.stringify({ location: this.config.locationCode }),
      signal: AbortSignal.timeout(5000),
    });
    if (!response.ok) throw new Error(`attendance_http_${response.status}`);
    const payload = validatePayload(
      await response.json(),
      this.config.locationCode,
      Date.now(),
      this.config.locationType || 'ARRIVAL'
    );
    return { ...payload, checkinPath: new URL(payload.checkinPath, this.config.publicOrigin).toString() };
  }
}

export function validatePayload(payload, expectedCode, now = Date.now(), expectedType = 'ARRIVAL') {
  if (!payload || typeof payload !== 'object') throw new Error('attendance_invalid_payload');
  const location = payload.location;
  if (!location || location.code !== expectedCode || location.type !== expectedType || typeof location.name !== 'string' || !location.name.trim()) {
    throw new Error('attendance_invalid_location');
  }
  if (typeof payload.qrSvg !== 'string' || !payload.qrSvg.startsWith('<svg ') || payload.qrSvg.length > 250000) throw new Error('attendance_invalid_qr');
  if (typeof payload.checkinPath !== 'string' || !payload.checkinPath.startsWith('/attendance-checkin?token=') || payload.checkinPath.length > 1024) throw new Error('attendance_invalid_checkin_path');
  const validUntilMs = Date.parse(payload.validUntil);
  if (!Number.isFinite(validUntilMs) || validUntilMs <= now || validUntilMs > now + 35000) throw new Error('attendance_invalid_expiry');
  const validForSeconds = Number(payload.validForSeconds);
  if (!Number.isFinite(validForSeconds) || validForSeconds < 0 || validForSeconds > 30) throw new Error('attendance_invalid_validity');
  return {
    location: { code: location.code, name: location.name, type: location.type },
    qrSvg: payload.qrSvg,
    checkinPath: payload.checkinPath,
    validUntil: new Date(validUntilMs).toISOString(),
    validForSeconds,
  };
}
