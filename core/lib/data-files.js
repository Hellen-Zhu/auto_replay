// The files a case uploads or sends with an API step: where they are and which ones a step needs.

const fs = require('fs');
const path = require('path');
const { fillParams } = require('./values');

/** The folder of the files a case uploads or sends, relative to the root: one folder per product in it */
const DATA_DIR = 'testdata/dat';
/** A case file exported while the files were in data/ names them there: the same file is now in DATA_DIR */
const dataPath = (rel) => String(rel).replace(/^data\//, DATA_DIR + '/');

/**
 * Files to upload are shipped with the cases in the folder DATA_DIR (e.g. testdata/dat/FX_TRF/FX_TRF.dat).
 * A case file can only point inside that folder, never at an arbitrary path on the machine.
 */
function resolveDataFile(rootDir, rel) {
  if (!rootDir) throw new Error('The folder that holds the upload files is not known (ctx.rootDir is missing)');
  rel = dataPath(rel);
  const base = path.join(rootDir, DATA_DIR);
  const file = path.resolve(rootDir, rel);
  if (!file.startsWith(base + path.sep)) throw new Error(`Upload files must be inside the folder ${DATA_DIR}: ${rel}`);
  if (!fs.existsSync(file)) throw new Error(`File to upload was not found: ${rel} (expected at ${file})`);
  return file;
}

/** The files of DATA_DIR a step needs: what an upload step uploads and the file parts of an api step */
function dataFilesOf(step, params) {
  const files = (step.action === 'upload' ? [step.value]
    : step.action === 'api' ? Object.values(step.multipart || {}).filter((p) => p && p.file).map((p) => p.file) : []).map(dataPath);
  return params ? files.map((f) => fillParams(f, params)) : files;
}

module.exports = { DATA_DIR, resolveDataFile, dataFilesOf };
