// Lists Meross devices and their current state.
//
// NOTE: Meross has no official public API. This uses the community
// `meross-cloud` package, which reverse-engineers Meross's login + MQTT
// control protocol. It's widely used and stable in practice, but it is not
// a supported/documented interface — Meross could change it without notice.
// Verify method names against the current `meross-cloud` README if this
// starts failing after a package update.

const MerossCloud = require('meross-cloud');

function withMerossClient(handler) {
  return new Promise((resolve, reject) => {
    const meross = new MerossCloud({
      email: process.env.MEROSS_EMAIL,
      password: process.env.MEROSS_PASSWORD,
      logger: () => {},
    });

    const devices = [];
    meross.on('deviceInitialized', (deviceId, deviceDef, device) => {
      devices.push({ deviceId, deviceDef, device });
    });
    meross.on('error', reject);

    meross.connect((err) => {
      if (err) return reject(err);
      // Devices register over MQTT asynchronously after connect — give them
      // a moment before reading state.
      setTimeout(async () => {
        try {
          const result = await handler(devices);
          meross.disconnect();
          resolve(result);
        } catch (e) {
          meross.disconnect();
          reject(e);
        }
      }, 2500);
    });
  });
}

exports.handler = async () => {
  if (!process.env.MEROSS_EMAIL || !process.env.MEROSS_PASSWORD) {
    return { statusCode: 500, body: 'MEROSS_EMAIL / MEROSS_PASSWORD not set in Netlify environment variables' };
  }

  try {
    const result = await withMerossClient(async (devices) => {
      return Promise.all(devices.map(async ({ deviceId, deviceDef, device }) => {
        let isOn = false;
        let dimmable = false;
        let brightness = 100;
        try {
          const status = await device.getSystemAllData();
          const digest = status?.all?.digest || {};

          if (Array.isArray(digest.togglex) && digest.togglex.length) {
            isOn = !!digest.togglex[0].onoff;
          } else if (digest.toggle) {
            isOn = !!digest.toggle.onoff;
          }

          if (digest.light) {
            dimmable = typeof digest.light.luminance === 'number';
            brightness = digest.light.luminance ?? 100;
            if (typeof digest.light.onoff === 'number') isOn = !!digest.light.onoff;
          }
        } catch (e) {
          // Device likely offline — still list it so it's visible in the UI.
        }
        return {
          uuid: deviceId,
          name: deviceDef.devName,
          isOn,
          dimmable,
          brightness,
        };
      }));
    });

    return {
      statusCode: 200,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(result),
    };
  } catch (err) {
    return { statusCode: 502, body: `Meross error: ${err.message || err}` };
  }
};
