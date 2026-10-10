// Where the runner finds its files: the folder that holds runner/, core/, cases/, data/ and evidence/.

const path = require('path');

const ROOT = path.resolve(__dirname, '..', '..');
const CASES_DIR = path.join(ROOT, 'cases');
const EVIDENCE_DIR = path.join(ROOT, 'evidence');

module.exports = { ROOT, CASES_DIR, EVIDENCE_DIR };
