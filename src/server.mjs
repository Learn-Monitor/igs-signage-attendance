import { loadConfig } from './config.mjs';
import { AttendanceClient } from './attendance-client.mjs';
import { createApp } from './app.mjs';

const config = loadConfig();

const arrivalClient = new AttendanceClient({
  ...config,
  locationType: 'ARRIVAL',
});

const gtsClient = new AttendanceClient({
  ...config,
  locationCode: config.gtsLocationCode,
  locationType: 'LOCATION',
});

const server = createApp(config, arrivalClient, gtsClient);
server.listen(config.port, '0.0.0.0', () => console.log(`[server] attendance signage listening on ${config.port}`));
for (const signal of ['SIGTERM', 'SIGINT']) process.on(signal, () => server.close(() => process.exit(0)));
