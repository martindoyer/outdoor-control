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

    // Helper: JSON.stringify silently turns a Map into {} — unwrap it properly
    // so we can actually see/use what's inside instead of assuming it's empty.
    const unwrapMaybeMap = (val) => {
      if (val instanceof Map) return Object.fromEntries(val);
      return val;
    };

    const result = [];
    for (const device of devices) {
      let toggleGetAllResult = null;
      let toggleGetAllError = null;
      try {
        if (device.toggle) toggleGetAllResult = unwrapMaybeMap(await device.toggle.getAll());
      } catch (e) {
        toggleGetAllError = e.message || String(e);
      }

      // Real switch channels, excluding the master/"Main channel" entry.
      const realChannels = Array.isArray(device.channels)
        ? device.channels.filter((ch) => !ch._master)
        : [];

      if (realChannels.length > 1) {
        for (const ch of realChannels) {
          let state = null;
          let stateError = null;
          try {
            state = await device.toggle.get({ channel: ch._index });
          } catch (e) {
            stateError = e.message || String(e);
          }
          result.push({
            uuid: `${device.uuid}:${ch._index}`,
            name: ch._name || `${device.name} — Switch ${ch._index}`,
            online: !!device.isOnline,
            dimmable: false,
            isOn: !!(state && (state.on ?? state.onoff)),
            brightness: 100,
            _debug: { state, stateError },
          });
        }
      } else {
        result.push({
          uuid: device.uuid,
          name: device.name,
          online: !!device.isOnline,
          dimmable: !!device.light,
          isOn: false,
          brightness: 100,
        });
      }

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
