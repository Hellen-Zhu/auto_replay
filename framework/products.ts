// Product registry: the one place that says which product supports which scenario.
// To add a product: add a line here with the capabilities it supports and put its data/<PRODUCT>.dat in place.
// Every spec that loops productsWith(...) then gets the product's cases, with their case IDs, by itself.

/** What a product can be tested for; one capability per scenario that not every product supports */
export type Capability =
  | 'create' // book a normal trade
  | 'stepInFull'
  | 'stepInPartial'
  | 'sell'; // book a normal trade with direction Sell

/** Product type (also what is typed as the Product ID, and the name of the dat file) -> supported capabilities */
export const PRODUCTS: Record<string, readonly Capability[]> = {
  FX_PSCRIPT: ['create', 'stepInFull', 'stepInPartial'],
  FX_TRF: ['create', 'stepInFull', 'stepInPartial', 'sell'],
  FX_PSCRIPT_FSKO: ['create', 'stepInFull', 'stepInPartial'],
};

/** The products that support a capability, in the order of the registry */
export function productsWith(capability: Capability): string[] {
  return Object.keys(PRODUCTS).filter((product) => PRODUCTS[product].includes(capability));
}
