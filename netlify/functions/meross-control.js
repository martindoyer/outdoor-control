// Sends a control command (toggle on/off, or brightness) to one Meross device.
// See meross-devices.js for why this uses `meross-iot` instead of `meross-cloud`.

const Meross = require('meross-iot');

// meross-iot's underlying MQTT connection can emit 'error' events with no
// listener attached, which crashes the whole Node process (not just our
// try/catch) — these two handlers stop that from taking the function down.
process.on('uncaughtException', (err) => console.error('Uncaught exception:', err));
process.on('unhandledRejection', (reason) => console.error('Unhandled rejection:', reason));

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

  let meross;
  try {
    meross = await Meross.authenticate({
      email: process.env.MEROSS_EMAIL,
      password: process.env.MEROSS_PASSWORD,
    });
    if (typeof meross.on === 'function') {
      meross.on('error', (e) => console.error('meross instance error event:', e));
    }

    await meross.devices.discover({ onlineOnly: false });
    await meross.devices.initialize();

    // uuid may be "realUuid:channelIndex" for multi-outlet devices — split it back apart.
    const [realUuid, channelPart] = uuid.includes(':') ? uuid.split(':') : [uuid, '0'];
    const channel = Number(channelPart) || 0;

    const device = meross.devices.list().find((d) => d.uuid === realUuid);
    if (!device) throw new Error('Device not found, or offline');

    if (action === 'toggle') {
      if (device.light) {
        await device.light.set({ channel, onoff: on ? 1 : 0 });
      } else if (device.toggle) {
        await device.toggle.set({ channel, on: !!on });
      } else {
        throw new Error('Device has no toggle or light capability');
      }
    } else if (action === 'brightness') {
      if (!device.light) throw new Error('Device is not dimmable');
      await device.light.set({ channel, luminance: Number(brightness) });
    } else {
      throw new Error(`Unknown action: ${action}`);
    }

    return { statusCode: 200, body: JSON.stringify({ ok: true }) };
  } catch (err) {
    return { statusCode: 502, body: `Meross error: ${err.message || err}` };
  } finally {
    if (meross && typeof meross.disconnect === 'function') {
      await meross.disconnect().catch(() => {});
    }
  }
};
