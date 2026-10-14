// Product registry: the one place that says which product supports which scenario.
// To add a product: add a line here with the capabilities it supports and put its testdata/dat/<PRODUCT>/<PRODUCT>.dat in place.
// Every spec that loops productsWith(...) then gets the product's cases, with their case IDs, by itself.

/**
 * What a product can be tested for; one capability per scenario that not every product supports.
 * A variation in data only (e.g. direction Sell) is not a capability and not a case: it is run by changing the
 * case data of an existing case.
 */
export type Capability =
  | 'create' // book a normal trade
  | 'stepInFull'
  | 'stepInPartial'
  | LifecycleEvent;

/**
 * The lifecycle events on a live trade, one spec each. A spec has one case (one case file, the product is its case
 * data); QA's run repeats it for every product with the event's capability, each creating its trade through the API
 */
export const LIFECYCLE_EVENTS = [
  'cancellation',
  'allocation',
  'amendment',
  'earlyTermination',
  'partialTermination',
  'novationRemaining',
  'partialNovationRemaining',
  'stepOutFull',
  'stepOutPartial',
  'portfolioReassignment',
] as const;
export type LifecycleEvent = (typeof LIFECYCLE_EVENTS)[number];

/** Product type (also what is typed as the Product ID, and the name of its folder in testdata/dat/ and of its default dat file) -> supported capabilities */
export const PRODUCTS: Record<string, readonly Capability[]> = {
  FX_PSCRIPT: ['create', 'stepInFull', 'stepInPartial', ...LIFECYCLE_EVENTS],
  FX_TRF: ['create', 'stepInFull', 'stepInPartial', ...LIFECYCLE_EVENTS],
  FX_PSCRIPT_FSKO: ['create', 'stepInFull', 'stepInPartial', ...LIFECYCLE_EVENTS],
  // A product that does not support an event leaves that capability out: the event's spec then has no run for it and
  // creates no trade of that product. Example, a product without step out:
  // FX_PSCRIPT_FSKO: ['create', 'stepInFull', 'stepInPartial',
  //   ...LIFECYCLE_EVENTS.filter((e) => e !== 'stepOutFull' && e !== 'stepOutPartial')],
  // The PO's runner does not know the capabilities: the product of a case file stays free case data, so tell the PO
  // which products an event does not support.
};

/** The products that support a capability, in the order of the registry */
export function productsWith(capability: Capability): string[] {
  return Object.keys(PRODUCTS).filter((product) => PRODUCTS[product].includes(capability));
}

/** The name of the dat file a product's cases use unless their data names another one */
export const defaultDatFile = (product: string) => `${product}.dat`;

/**
 * A dat file of a product, shipped with the cases: testdata/dat/<PRODUCT>/<file>. A product has a folder because it can have
 * several dat files, one per variant of its structure; which one a case uses is data, not a product of its own.
 */
export const datFile = (product: string, file: string = defaultDatFile(product)) => `testdata/dat/${product}/${file}`;
