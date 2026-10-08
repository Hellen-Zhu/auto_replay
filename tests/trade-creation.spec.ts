import fs from 'fs';
import path from 'path';
import { test } from '../framework/fixtures';
import { datFile, type TradeCreationData, type TradeKind } from '../framework/flows';

// Mirrors trade_creation.feature of the E2E project. To cover another product, add it here, add the rows of its
// case IDs to testdata/trade-creation.json and put its data/<PRODUCT>.dat in place; the product type is also
// what is typed into the Product ID field.
const PRODUCTS = ['FX_CO', 'FX_TRF', 'FX_FSB'];

const KINDS: { kind: TradeKind; no: string; label: string }[] = [
  { kind: 'normal', no: '001', label: 'trade' },
  { kind: 'stepinFull', no: '002', label: 'StepIn full trade' },
  { kind: 'stepinPartial', no: '003', label: 'StepIn partial trade' },
];

test.describe('Trade creation', () => {
  for (const product of PRODUCTS) {
    for (const { kind, no, label } of KINDS) {
      test(`[TC-TRADE-CREATION-${product}-UI-${no}] Maker creates a new ${product} ${label}`, async ({ flows, testData }) => {
        test.skip(!fs.existsSync(path.resolve(__dirname, '..', datFile(product))), `${datFile(product)} is missing`);
        test.info().annotations.push({
          type: 'description',
          description: `Maker books a new ${product} ${label} from its dat file and verifies it is created with pending approval status`,
        });
        const data = testData<TradeCreationData>(); // the row of testdata/trade-creation.json with this case ID

        await flows.auth.login('maker');
        const tradeId = await flows.tradeCreation.createTrade(product, kind, data);
        await flows.tradeCreation.expectPendingApproval(tradeId);
      });
    }
  }
});
