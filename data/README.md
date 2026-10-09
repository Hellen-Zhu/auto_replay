# Upload files

Files that cases upload, referenced from case files by relative path (for example `data/FX_TRF.dat`).

- Put one `.dat` file per product here, named after the product type: `FX_PSCRIPT.dat`, `FX_TRF.dat`, `FX_PSCRIPT_FSKO.dat`, ...
  (copy them from `src/test/resources/data/` of the E2E project).
- A case whose product has no file here is skipped (`prepare()` in `tests/support.ts`).
- The same file is uploaded on the New Trade page and sent with the create-trade API request of a case that prepares its trade through the API.
- `npm run build:portable` copies this folder into the PO package; a case can only upload files from this folder.
