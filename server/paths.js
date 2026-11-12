// Mythic Reverie data is isolated from I/O and Minami. Set IO_CINEMA_DATA_DIR to keep data outside
// the checkout; otherwise use this installation's ignored data directory.
const fs = require('fs');
const path = require('path');
const APP_ROOT = path.join(__dirname, '..');
const configuredDataDir=process.env.MYTHIC_REVERIE_DATA_DIR||process.env.IO_CINEMA_DATA_DIR;
const DATA_DIR=configuredDataDir?path.resolve(configuredDataDir):path.join(APP_ROOT,'cinema-data');
fs.mkdirSync(DATA_DIR, { recursive: true });
module.exports = { DATA_DIR, APP_ROOT };
