// Lists Meross devices and their current state.
//
// Uses `meross-iot`. Note: Meross.connect() alone was returning zero devices —
// discovery has to be triggered explicitly, so we call discover() + initialize()
// before reading the list.

const Meross = require('meross-iot');

// meross-iot's underlying MQTT connection can emit 'error' events with no
// listener attached, which crashes the whole Node process (not just our
// try/catch) — these two handlers stop that from taking the function down.
process.on('uncaughtException', (err) => console.error('Uncaught exception:', err));
process.on('unhandledRejection', (reason) => console.error('Unhandled rejection:', reason));

exports.handler = async () => {
  if (!process.env.MEROSS_EMAIL || !process.env.MEROSS_PASSWORD) {
    return { statusCode: 500, body: 'MEROSS_EMAIL / MEROSS_PASSWORD not set in Netlify environment variables' };
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

    const available = await meross.devices.discover({ onlineOnly: false });
    await meross.devices.initialize();

    const devices = meross.devices.list();

    const result = [];
    for (const device of devices) {
      let toggleGetAllResult = null;
      let toggleGetAllError = null;
      try {
        if (device.toggle) toggleGetAllResult = await device.toggle.getAll();
      } catch (e) {
        toggleGetAllError = e.message || String(e);
      }

      result.push({
        uuid: device.uuid,
        name: device.name,
        online: !!device.isOnline,
        isOn: false,
        dimmable: !!device.light,
        brightness: 100,
        _debug: {
          hasToggle: !!device.toggle,
          hasLight: !!device.light,
          toggleGetAllResult,
          toggleGetAllError,
          channelsProperty: device.channels ?? null,
          capabilitiesProperty: device.capabilities ?? null,
          deviceOwnKeys: Object.keys(device),
        },
      });
    }

    return {
      statusCode: 200,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(result),
    };
  } catch (err) {
    return { statusCode: 502, body: `Meross error: ${err.message || err}` };
  } finally {
    if (meross && typeof meross.disconnect === 'function') {
      await meross.disconnect().catch(() => {});
    }
  }
};
