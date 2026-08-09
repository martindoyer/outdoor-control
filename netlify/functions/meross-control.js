// Sends a control command (toggle on/off, or brightness) to one Meross device.
// See meross-devices.js for why this uses `meross-iot` instead of `meross-cloud`.

const Meross = require('meross-iot');

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
    meross = await Meross.connect({
      email: process.env.MEROSS_EMAIL,
      password: process.env.MEROSS_PASSWORD,
    });

    const device = meross.devices.list().find((d) => d.uuid === uuid);
    if (!device) throw new Error('Device not found, or offline');

    if (action === 'toggle') {
      if (device.light) {
        await device.light.set({ channel: 0, onoff: on ? 1 : 0 });
      } else if (device.toggle) {
        await device.toggle.set({ channel: 0, on: !!on });
      } else {
        throw new Error('Device has no toggle or light capability');
      }
    } else if (action === 'brightness') {
      if (!device.light) throw new Error('Device is not dimmable');
      await device.light.set({ channel: 0, luminance: Number(brightness) });
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
