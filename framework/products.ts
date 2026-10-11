// Product registry: the one place that says which product supports which scenario.
// To add a product: add a line here with the capabilities it supports and put its data/<PRODUCT>/<PRODUCT>.dat in place.
// Every spec that loops productsWith(...) then gets the product's cases, with their case IDs, by itself.

/**
 * What a product can be tested for; one capability per scenario that not every product supports.
 * A variation in data only (e.g. direction Sell) is not a capability and not a case: it is run by changing the
 * case data of an existing case.
 */
export type Capability =
  | 'create' // book a normal trade
  | 'stepInFull'
  | 'stepInPartial';

/** Product type (also what is typed as the Product ID, and the name of its folder in data/ and of its default dat file) -> supported capabilities */
export const PRODUCTS: Record<string, readonly Capability[]> = {
  FX_PSCRIPT: ['create', 'stepInFull', 'stepInPartial'],
  FX_TRF: ['create', 'stepInFull', 'stepInPartial'],
  FX_PSCRIPT_FSKO: ['create', 'stepInFull', 'stepInPartial'],
};

/** The products that support a capability, in the order of the registry */
export function productsWith(capability: Capability): string[] {
  return Object.keys(PRODUCTS).filter((product) => PRODUCTS[product].includes(capability));
}

/** The name of the dat file a product's cases use unless their data names another one */
export const defaultDatFile = (product: string) => `${product}.dat`;

/**
 * A dat file of a product, shipped with the cases: data/<PRODUCT>/<file>. A product has a folder because it can have
 * several dat files, one per variant of its structure; which one a case uses is data, not a product of its own.
 */
export const datFile = (product: string, file: string = defaultDatFile(product)) => `data/${product}/${file}`;
