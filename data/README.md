# Upload files

Files that cases upload, referenced from case files by relative path (for example `data/FX_TRF/FX_TRF.dat`).

- One folder per product, named after the product type; the product's default file has the same name:
  `FX_TRF/FX_TRF.dat`, `FX_PSCRIPT/FX_PSCRIPT.dat`, `FX_PSCRIPT_FSKO/FX_PSCRIPT_FSKO.dat`, ...
  (copy them from `src/test/resources/data/` of the E2E project).
- Other dat files of the same product (variants of its structure) go into the product's folder under their own
  names. A case whose product and dat file are case data (`product`, `datFile`) can be run with any of them: the
  runner lists the products and, for the chosen product, its files.
- A case whose dat file is not here is skipped (`prepare()` in `tests/support.ts`).
- The same file is uploaded on the New Trade page and sent with the create-trade API request of a case that prepares its trade through the API.
- `npm run build:portable` copies this folder into the PO package; a case can only upload files from this folder.
