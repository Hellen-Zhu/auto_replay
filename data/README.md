# Upload files

Files that cases upload, referenced from case files by relative path (for example `data/FX_TRF.dat`).

- Put one `.dat` file per product here, named after the product type: `FX_CO.dat`, `FX_TRF.dat`, `FX_FSB.dat`, ...
  (copy them from `src/test/resources/data/` of the E2E project).
- `tests/trade-creation.spec.ts` skips a product whose file is missing.
- `npm run build:portable` copies this folder into the PO package; a case can only upload files from this folder.
