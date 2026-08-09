// Sends a control command (toggle on/off, or brightness) to one Meross device.
// See meross-devices.js for the caveat on this being an unofficial protocol.

const MerossCloud = require('meross-cloud');

exports.handler = async (event) => {
  if (event.httpMethod !== 'POST') {
    return { statusCode: 405, body: 'Method not allowed' };
  }
  if (!process.env.MEROSS_EMAIL || !process.env.MEROSS_PASSWORD) {
    return { statusCode: 500, body: 'MEROSS_EMAIL / MEROSS_PASSWORD not set in Netlify environment variables' };
  }

  let payload;
  try {
    payload = JSON.parse(event.body || '{}');
  } catch {
    return { statusCode: 400, body: 'Invalid JSON body' };
  }
  const { uuid, action, on, brightness } = payload;
  if (!uuid || !action) {
    return { statusCode: 400, body: 'uuid and action are required' };
  }

  return new Promise((resolve) => {
    const meross = new MerossCloud({
      email: process.env.MEROSS_EMAIL,
      password: process.env.MEROSS_PASSWORD,
      logger: () => {},
    });

    let targetDevice = null;
    meross.on('deviceInitialized', (deviceId, deviceDef, device) => {
      if (deviceId === uuid) targetDevice = device;
    });
    meross.on('error', (err) => {
      resolve({ statusCode: 502, body: `Meross error: ${err.message || err}` });
    });

    meross.connect((err) => {
      if (err) {
        resolve({ statusCode: 502, body: `Meross connect error: ${err.message || err}` });
        return;
      }
      setTimeout(async () => {
        try {
          if (!targetDevice) throw new Error('Device not found, or offline');

          if (action === 'toggle') {
            await targetDevice.controlToggleX(0, !!on);
          } else if (action === 'brightness') {
            await targetDevice.controlLight({ luminance: Number(brightness) });
          } else {
            throw new Error(`Unknown action: ${action}`);
          }

          meross.disconnect();
          resolve({ statusCode: 200, body: JSON.stringify({ ok: true }) });
        } catch (e) {
          meross.disconnect();
          resolve({ statusCode: 502, body: `Meross error: ${e.message || e}` });
        }
      }, 2000);
    });
  });
};
