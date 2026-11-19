import { startRuntime, expect } from '/home/user/oss-new/control/runtime/index.mjs';
import { addLine, createAccount, createItem, newDraft, status, validate, YEAR } from './lib.mjs';

const runtime = await startRuntime();
try {
  let page = await (await runtime.context('owner')).newPage();
  const accountId = await createAccount(page, { name: 'Northwind Bakery', email: 'billing@northwind.example' });
  await createItem(page, { code: 'WEB-01', name: 'Website design', kind: 'service', price: '650' });
  const invoiceId = await newDraft(page, { list: 'sales', type: 'invoice', account: 'Northwind Bakery' });
  await addLine(page, { item: 'WEB-01 · Website design', qty: '2' });
  await validate(page);
  await page.fill('#pay-amount', '500');
  await page.getByTestId('record-payment').click();
  await expect(status(page)).toHaveText('Partly paid');

  await runtime.restart();

  page = await (await runtime.context('owner')).newPage();
  await page.goto(`/documents/${invoiceId}`);
  await expect(page.getByTestId('document-title')).toHaveText(`Invoice INV-${YEAR}-0001`);
  await expect(status(page)).toHaveText('Partly paid');
  await expect(page.getByTestId('remaining')).toContainText('1,060.00');
  await page.goto(`/accounts/${accountId}`);
  await expect(page.getByTestId('account-receivable')).toContainText('1,060.00');
  await page.goto('/items');
  await expect(page.getByTestId('item-row')).toContainText('WEB-01');
  // The numbering carries on after a restart.
  await newDraft(page, { list: 'sales', type: 'invoice', account: 'Northwind Bakery' });
  await addLine(page, { description: 'Hosting, one year', qty: '1', price: '120' });
  await validate(page);
  await expect(page.getByTestId('document-title')).toHaveText(`Invoice INV-${YEAR}-0002`);
  console.log('persistence: ok');
} finally {
  await runtime.close();
}
