import { startRuntime, expect } from '/home/user/oss-new/control/runtime/index.mjs';
import { addLine, createAccount, createItem, isoDaysAgo, newDraft, status, validate, YEAR } from './lib.mjs';

const runtime = await startRuntime();
try {
  await runtime.assertPrivateAccess(['/', '/accounts', '/items', '/sales', '/purchases', '/collections', '/reports', '/settings']);
  const owner = await runtime.context('owner');
  const page = await owner.newPage();

  // F008: the company profile and numbering prefixes.
  await page.goto('/settings');
  await runtime.assertBackLink(page);
  await page.fill('#company-name', 'Harbor Lane Studio');
  await page.fill('#company-address', '14 Quay Street\nPortsmouth PO1 2AB');
  await page.fill('#company-taxId', 'GB 284 1937 22');
  await page.fill('#company-email', 'accounts@harborlane.example');
  await page.fill('#company-bankDetails', 'IBAN GB33 BUKB 2020 1555 5555 55');
  await page.fill('#prefix-invoice', 'FAC');
  await page.getByTestId('save-company').click();
  await expect(page.getByText('Company profile saved')).toBeVisible();
  await page.reload();
  await expect(page.locator('#prefix-invoice')).toHaveValue('FAC');

  // F001: customers and suppliers with contacts.
  const customerId = await createAccount(page, { name: 'Northwind Bakery', email: 'billing@northwind.example', taxId: 'FR 41 552 100 554', terms: '30', address: '3 Rue des Fours\n69002 Lyon' });
  await page.fill('#contact-name', 'Amélie Laurent');
  await page.fill('#contact-role', 'Office manager');
  await page.fill('#contact-email', 'amelie@northwind.example');
  await page.getByTestId('add-contact').click();
  await expect(page.getByTestId('contact-row')).toContainText('Amélie Laurent');
  await createAccount(page, { name: 'Cedar Print Supply', kind: 'supplier', terms: '45' });
  await createAccount(page, { name: 'Bluefin Marine', email: 'ap@bluefin.example', terms: '15' });
  const archivedId = await createAccount(page, { name: 'Old Mill Café' });
  await page.getByTestId('archive-account').click();
  await expect(page.getByText('Archived', { exact: true }).first()).toBeVisible();
  await page.goto('/accounts?q=Northwind');
  await expect(page.getByTestId('account-row')).toHaveCount(1);
  await page.goto('/accounts');
  await expect(page.getByTestId('account-row').filter({ hasText: 'Old Mill' })).toHaveCount(0);
  await page.goto('/accounts?archived=true');
  await expect(page.getByTestId('account-row').filter({ hasText: 'Old Mill' })).toHaveCount(1);

  // F002: the catalogue; inactive items stay out of the picker.
  await createItem(page, { code: 'WEB-01', name: 'Website design', kind: 'service', unit: 'day', price: '650', cost: '0', vat: '20' });
  await createItem(page, { code: 'PRN-10', name: 'Printed brochures (box of 100)', price: '85.50', cost: '40', vat: '10' });
  await createItem(page, { code: 'OLD-01', name: 'Retired banner', price: '20', active: false });
  await page.getByTestId('new-item').click();
  await page.fill('#item-code', 'WEB-01');
  await page.fill('#item-name', 'Duplicate');
  await page.fill('#item-price', '1');
  await page.getByTestId('save-item').click();
  await expect(page.getByText('Reference WEB-01 is already used')).toBeVisible();
  await page.keyboard.press('Escape');

  // F003: a quote with catalogue and free-text lines, totals computed by the server.
  const quoteId = await newDraft(page, { list: 'sales', type: 'quote', account: 'Northwind Bakery' });
  await expect(page.locator('#line-item-0')).toHaveCount(0);
  await page.getByTestId('add-line').click();
  const options = await page.locator('#line-item-0 option').allTextContents();
  expect(options.join('|')).not.toContain('Retired banner');
  await page.getByRole('button', { name: 'Remove line 1' }).click();
  await addLine(page, { item: 'WEB-01 · Website design', qty: '3', discount: '10' });
  await addLine(page, { item: 'PRN-10 · Printed brochures (box of 100)', qty: '4' });
  await addLine(page, { description: 'Project kickoff workshop', qty: '1', price: '300', vat: '20' });
  await validate(page);
  // 3 × 650 − 10 % = 1755; 4 × 85.50 = 342 at 10 %; 300. Net 2397, VAT 411 + 34.20.
  await expect(page.getByTestId('document-title')).toHaveText(`Quote QU-${YEAR}-0001`);
  await expect(page.getByTestId('total-net')).toContainText('2,397.00');
  await expect(page.getByTestId('total-gross')).toContainText('2,842.20');
  await expect(status(page)).toHaveText('Validated');

  // F007: share link; the customer accepts from it.
  await page.getByTestId('create-share').click();
  const shareUrl = await page.getByTestId('share-url').inputValue();
  expect(new URL(shareUrl).hostname).toBe(runtime.hostname);
  const sharePath = new URL(shareUrl).pathname;
  const shared = await runtime.fetch(sharePath);
  expect(shared.status).toBe(200);
  const sharedHtml = await shared.text();
  expect(sharedHtml).toContain('Harbor Lane Studio');
  expect(sharedHtml).toContain('Project kickoff workshop');
  const visitor = await (await runtime.context(null)).newPage();
  await visitor.goto(sharePath);
  await expect(visitor.getByTestId('document-sheet')).toContainText('Northwind Bakery');
  await Promise.all([visitor.waitForURL(sharePath), visitor.getByTestId('share-accept').click()]);
  await expect(visitor.getByTestId('status-badge')).toHaveText('Accepted');
  await expect(visitor.getByTestId('share-accept')).toHaveCount(0);
  await page.reload();
  await expect(status(page)).toHaveText('Accepted');
  await expect(page.getByTestId('document-activity')).toContainText('Accepted through the share link');

  // F003: the accepted quote becomes an invoice and a delivery note.
  await page.locator('label[for=with-delivery]').click();
  await Promise.all([page.waitForURL((u) => !u.pathname.endsWith(quoteId)), page.getByTestId('convert-quote').click()]);
  await expect(page.getByTestId('document-title')).toHaveText('Invoice draft');
  const invoiceId = page.url().split('/').pop();
  await expect(page.getByTestId('line-editor')).toHaveCount(3);
  await validate(page);
  await expect(page.getByTestId('document-title')).toHaveText(`Invoice FAC-${YEAR}-0001`);
  await expect(status(page)).toHaveText('Issued');
  await expect(page.getByTestId('related-documents')).toContainText(`Quote QU-${YEAR}-0001`);

  // F002: later catalogue edits leave the invoice alone.
  await page.goto('/items');
  await page.getByTestId('item-row').filter({ hasText: 'WEB-01' }).click();
  await page.fill('#item-price', '900');
  await page.getByTestId('save-item').click();
  await expect(page.getByTestId('item-row').filter({ hasText: 'WEB-01' })).toContainText('900.00');
  await page.goto(`/documents/${invoiceId}`);
  await expect(page.getByTestId('total-net')).toContainText('2,397.00');

  // F005: payments cap at the remaining amount and move the status.
  await page.fill('#pay-amount', '5000');
  await page.getByTestId('record-payment').click();
  await expect(page.getByTestId('document-error')).toContainText("can't exceed what remains");
  await page.fill('#pay-amount', '1000');
  await page.selectOption('#pay-method', 'transfer');
  await page.fill('#pay-ref', 'TRX-88213');
  await page.getByTestId('record-payment').click();
  await expect(status(page)).toHaveText('Partly paid');
  await expect(page.getByTestId('remaining')).toContainText('1,842.20');

  // F003: a credit note can't exceed what remains on its invoice.
  await page.getByTestId('credit-invoice').click();
  await expect(page.getByTestId('document-title')).toHaveText('Credit note draft');
  await page.getByTestId('validate-document').click();
  await expect(page.getByTestId('document-error')).toContainText("can't exceed what remains");
  await page.getByRole('button', { name: 'Remove line 1' }).click();
  await page.getByRole('button', { name: 'Remove line 1' }).click();
  await validate(page);
  await expect(page.getByTestId('document-title')).toHaveText(`Credit note CN-${YEAR}-0001`);
  await page.goto(`/documents/${invoiceId}`);
  await expect(page.getByTestId('remaining')).toContainText('1,482.20');

  // F005: an overdue invoice in collections, with a reminder attempt.
  await newDraft(page, { list: 'sales', type: 'invoice', account: 'Bluefin Marine' });
  await page.fill('#doc-date', isoDaysAgo(50));
  await page.fill('#doc-due', isoDaysAgo(35));
  await addLine(page, { item: 'PRN-10 · Printed brochures (box of 100)', qty: '10' });
  await validate(page);
  await expect(status(page)).toHaveText('Overdue');
  await page.getByTestId('send-reminder').click();
  await expect(page.getByTestId('reminder-result')).toContainText("Email isn't set up");
  await page.goto('/collections');
  await expect(page.getByTestId('unpaid-row')).toHaveCount(2);
  await expect(page.getByTestId('bucket-31_60')).toContainText('940.50');
  await expect(page.getByTestId('receivable-row').filter({ hasText: 'Northwind Bakery' })).toContainText('1,482.20');

  // F004: a purchase order, received, then billed and partly paid.
  await newDraft(page, { list: 'purchases', type: 'order', account: 'Cedar Print Supply' });
  await addLine(page, { item: 'PRN-10 · Printed brochures (box of 100)', qty: '12' });
  await validate(page);
  await expect(page.getByTestId('document-title')).toHaveText(`Purchase order PO-${YEAR}-0001`);
  await expect(status(page)).toHaveText('Sent');
  await page.getByTestId('receive-order').click();
  await expect(status(page)).toHaveText('Received');
  await page.getByTestId('bill-from-order').click();
  await expect(page.getByTestId('document-title')).toHaveText('Bill draft');
  await page.fill('#doc-supplier-ref', 'CPS-2291');
  await validate(page);
  await expect(page.getByTestId('document-sheet')).toContainText('CPS-2291');
  await expect(page.getByTestId('total-gross')).toContainText('528.00');
  await page.goto('/purchases?type=bill');
  await expect(page.getByTestId('bills-to-pay')).toContainText('Cedar Print Supply');
  await page.getByTestId('bills-to-pay').getByRole('link').first().click();
  await page.fill('#pay-amount', '200');
  await page.selectOption('#pay-method', 'cheque');
  await page.getByTestId('record-payment').click();
  await expect(status(page)).toHaveText('Partly paid');

  // F001: the account page shows balance and documents; one with documents can't be deleted.
  await page.goto(`/accounts/${customerId}`);
  await expect(page.getByTestId('account-receivable')).toContainText('1,482.20');
  await expect(page.getByTestId('delete-account')).toHaveCount(0);
  await expect(page.getByText(`Invoice FAC-${YEAR}-0001`)).toBeVisible();
  await page.goto(`/accounts/${archivedId}`);
  await page.getByTestId('archive-account').click();
  await expect(page.getByTestId('delete-account')).toBeVisible();

  // F003: lists filter by status and total by status.
  await page.goto('/sales?type=invoice&status=overdue');
  await expect(page.getByTestId('document-row')).toHaveCount(1);
  await expect(page.getByTestId('status-filter-partly_paid')).toContainText('1');
  await page.goto('/sales?type=delivery');
  await expect(page.getByTestId('document-row')).toHaveCount(1);
  await expect(page.getByTestId('document-row')).toContainText('Northwind Bakery');

  // F006: reports and CSV export.
  const csv = await runtime.fetch(`/reports/export?report=sales-by-customer&from=${YEAR - 1}-01-01&to=${YEAR}-12-31`, { role: 'owner' });
  expect(csv.status).toBe(200);
  expect(csv.headers.get('content-type')).toContain('text/csv');
  const csvText = await csv.text();
  expect(csvText).toContain('Northwind Bakery,2397.00,300.00,2097.00');
  const vat = await (await runtime.fetch(`/reports/export?report=vat&from=${YEAR}-01-01&to=${YEAR}-12-31`, { role: 'owner' })).text();
  expect(vat.split('\n')[0]).toBe('Month,VAT collected,VAT deductible,Balance');
  await page.goto(`/reports?from=${YEAR - 1}-01-01&to=${YEAR}-12-31`);
  await expect(page.getByTestId('report-sales-by-item')).toContainText('Website design');
  await expect(page.getByTestId('report-aging')).toContainText('Bluefin Marine');

  // F006: the dashboard for the year.
  await page.goto('/');
  await runtime.assertBackLink(page);
  await expect(page.getByTestId('kpi-revenue')).not.toHaveText(/^\D*0\.00$/);
  await expect(page.getByTestId('kpi-payable')).toContainText('328.00');
  await expect(page.getByTestId('top-customers')).toContainText('Northwind Bakery');
  await expect(page.getByTestId('top-items')).toContainText('Website design');
  await runtime.screenshot(page);

  // Phone-sized smoke.
  const phone = await (await runtime.context('member', { viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true })).newPage();
  await phone.goto('/sales?type=invoice');
  await expect(phone.getByRole('heading', { level: 1 })).toHaveText('Sales');
  await expect(phone.getByTestId('document-row').first()).toBeVisible();
  console.log('behavior: ok');
} finally {
  await runtime.close();
}
