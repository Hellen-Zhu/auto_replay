import fs from 'fs';
import path from 'path';
import { test } from '../framework/fixtures';
import { datFile, type TradeKind } from '../framework/flows';

// Products covered so far; add a product here (and its data/<PRODUCT>.dat) to get its three cases.
// The product type is also what is typed into the Product ID field.
const PRODUCTS = ['FX_CO', 'FX_TRF', 'FX_FSB'];

const KINDS: { kind: TradeKind; no: string; label: string }[] = [
  { kind: 'normal', no: '001', label: 'trade' },
  { kind: 'stepinFull', no: '002', label: 'StepIn full trade' },
  { kind: 'stepinPartial', no: '003', label: 'StepIn partial trade' },
];

test.describe('Trade creation', () => {
  for (const product of PRODUCTS) {
    for (const { kind, no, label } of KINDS) {
      test(`[TC-TRADE-CREATION-${product}-UI-${no}] Maker creates a new ${product} ${label} @case:trade_creation_${product}_${kind}`, async ({ flows }) => {
        test.skip(!fs.existsSync(path.resolve(__dirname, '..', datFile(product))), `${datFile(product)} is missing`);
        test.info().annotations.push({
          type: 'description',
          description: `Maker books a new ${product} ${label} from its dat file and verifies it is created with pending approval status`,
        });

        await flows.auth.login('maker');
        await flows.tradeCreation.createTrade(product, kind);
      });
    }
  }
});
