// Shared execution core: QA running a case locally and the PO replaying a case file both go through
// this same logic, so that "what ran when it was recorded is exactly what runs on replay".
// This file is the entry only: everything outside core/ requires it and nothing else. The code is in core/lib/,
// split by responsibility; a module there requires only modules before it in this list (no cycles).
// Note: keep core/ CommonJS and dependent only on @playwright/test, so it can be bundled into the portable runner.

module.exports = {
  ...require('./lib/case-format'), // the versions of the case file format, reading a case file
  ...require('./lib/values'), // placeholders: resolving and showing them
  ...require('./lib/targets'), // a target as a locator and as text
  ...require('./lib/data-files'), // the files a case uploads or sends
  ...require('./lib/requests'), // clicks that wait for or read a response, API calls
  ...require('./lib/execute'), // running one step
  ...require('./lib/describe'), // a step as one readable line
};
