// Lists Meross devices and their current state.
//
// Uses `meross-iot` (actively maintained, mirrors the Python MerossIot
// project) rather than the older `meross-cloud` package, which is
// unmaintained and doesn't handle Meross's multi-region login — that's
// what caused the earlier "email not registered" error even with correct
// credentials. This library is still labeled pre-release by its author;
// if a future version renames methods, check
// https://github.com/Doekse/merossiot/blob/main/packages/meross-iot/README.md

const Meross = require('meross-iot');

exports.handler = async () => {
  if (!process.env.MEROSS_EMAIL || !process.env.MEROSS_PASSWORD) {
    return { statusCode: 500, body: 'MEROSS_EMAIL / MEROSS_PASSWORD not set in Netlify environment variables' };
  }

  let meross;
  try {
    meross = await Meross.connect({
      email: process.env.MEROSS_EMAIL,
      password: process.env.MEROSS_PASSWORD,
    });

    const devices = meross.devices.list();

    const result = devices.map((device) => {
      const dimmable = !!device.light;
      return {
        uuid: device.uuid,
        name: device.name,
        online: !!device.isOnline,
        dimmable,
        // Live on/off + brightness wiring is a follow-up once login succeeds —
        // see README note. Reporting reachability for now so devices show up.
        isOn: false,
        brightness: 100,
      };
    });

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
