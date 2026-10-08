import fs from 'fs';
import path from 'path';
import { test } from '../framework/fixtures';
import { loadCases } from '../framework/data';
import { datFile, type TradeCreationData, type TradeKind } from '../framework/flows';

// One case per row of testdata/trade-creation.json; the row's id is the case ID shown in [ ] in the title.
// To cover another product, add its rows there and put its data/<PRODUCT>.dat in place; the product type is
// also what is typed into the Product ID field.
const KINDS: Record<TradeKind, string> = {
  normal: 'trade',
  stepinFull: 'StepIn full trade',
  stepinPartial: 'StepIn partial trade',
};

test.describe('Trade creation', () => {
  for (const data of loadCases<TradeCreationData>('trade-creation')) {
    const { id, product, kind } = data;
    if (!KINDS[kind]) throw new Error(`testdata/trade-creation.json, case ${id}: unknown kind "${kind}" (use ${Object.keys(KINDS).join(', ')})`);
    const label = KINDS[kind];

    test(`[${id}] Maker creates a new ${product} ${label}`, async ({ flows }) => {
      test.skip(!fs.existsSync(path.resolve(__dirname, '..', datFile(product))), `${datFile(product)} is missing`);
      test.info().annotations.push({
        type: 'description',
        description: `Maker books a new ${product} ${label} from its dat file and verifies it is created with pending approval status`,
      });

      await flows.auth.login('maker');
      const tradeId = await flows.tradeCreation.createTrade(data);
      await flows.tradeCreation.expectPendingApproval(tradeId);
    });
  }
});
