// Product registry: the one place that says which product supports which scenario.
// To add a product: add a line here with the capabilities it supports and put its data/<PRODUCT>.dat in place.
// Every spec that loops productsWith(...) then gets the product's cases, with their case IDs, by itself.

/**
 * What a product can be tested for; one capability per scenario that not every product supports.
 * A variation in data only (e.g. direction Sell) is not a capability: it is a single test with its testdata row.
 */
export type Capability =
  | 'create' // book a normal trade
  | 'stepInFull'
  | 'stepInPartial';

/** Product type (also what is typed as the Product ID, and the name of the dat file) -> supported capabilities */
export const PRODUCTS: Record<string, readonly Capability[]> = {
  FX_PSCRIPT: ['create', 'stepInFull', 'stepInPartial'],
  FX_TRF: ['create', 'stepInFull', 'stepInPartial'],
  FX_PSCRIPT_FSKO: ['create', 'stepInFull', 'stepInPartial'],
};

/** The products that support a capability, in the order of the registry */
export function productsWith(capability: Capability): string[] {
  return Object.keys(PRODUCTS).filter((product) => PRODUCTS[product].includes(capability));
}

/** The product's .dat file, shipped with the cases in data/ (same names as the E2E project's ProductDatFiles) */
export const datFile = (product: string) => `data/${product}.dat`;
