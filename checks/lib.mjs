// Shared steps for the suites: they drive the app the way a member does.
import { expect } from '/home/user/oss-new/control/runtime/index.mjs';

export const YEAR = new Date().getUTCFullYear();

export function isoDaysAgo(days) {
  const d = new Date();
  d.setUTCDate(d.getUTCDate() - days);
  return d.toISOString().slice(0, 10);
}

export async function createAccount(page, { name, kind = 'customer', email = '', taxId = '', terms = '30', address = '' }) {
  await page.goto('/accounts');
  await page.getByTestId('new-account').click();
  await page.fill('#account-name', name);
  await page.selectOption('#account-kind', kind);
  if (email) await page.fill('#account-email', email);
  if (taxId) await page.fill('#account-tax', taxId);
  if (address) await page.fill('#account-address', address);
  await page.fill('#account-terms', terms);
  await Promise.all([page.waitForURL(/\/accounts\/[0-9a-f-]{36}$/), page.getByTestId('save-account').click()]);
  await expect(page.getByRole('heading', { level: 1 })).toHaveText(name);
  return page.url().split('/').pop();
}

export async function createItem(page, { code, name, kind = 'product', unit = 'unit', price, cost = '0', vat = '20', active = true }) {
  await page.goto('/items');
  await page.getByTestId('new-item').click();
  await page.fill('#item-code', code);
  await page.fill('#item-name', name);
  await page.selectOption('#item-kind', kind);
  await page.fill('#item-unit', unit);
  await page.fill('#item-price', price);
  await page.fill('#item-cost', cost);
  await page.selectOption('#item-vat', vat);
  if (!active) await page.locator('label[for=item-active]').click();
  await page.getByTestId('save-item').click();
  await expect(page.getByTestId('item-row').filter({ hasText: code })).toBeVisible();
}

/** Opens the new-document dialog on a list page and creates a draft; returns its id. */
export async function newDraft(page, { list, type, account }) {
  await page.goto(`/${list}?type=${type}`);
  await page.getByTestId('new-document').click();
  await page.selectOption('#new-doc-type', type);
  await page.selectOption('#new-doc-account', { label: account });
  await Promise.all([page.waitForURL(/\/documents\/[0-9a-f-]{36}$/), page.getByTestId('create-document').click()]);
  await expect(page.getByTestId('document-title')).toContainText('draft');
  return page.url().split('/').pop();
}

/** Adds a line: an item label from the picker, or free text. */
export async function addLine(page, { item, description, qty, price, discount, vat }) {
  const index = await page.getByTestId('line-editor').count();
  await page.getByTestId('add-line').click();
  if (item) await page.selectOption(`#line-item-${index}`, { label: item });
  if (description) await page.fill(`#line-desc-${index}`, description);
  if (qty) await page.fill(`#line-qty-${index}`, qty);
  if (price) await page.fill(`#line-price-${index}`, price);
  if (discount) await page.fill(`#line-disc-${index}`, discount);
  if (vat) await page.selectOption(`#line-vat-${index}`, vat);
}

export async function validate(page) {
  await page.getByTestId('validate-document').click();
  try {
    await expect(page.getByTestId('document-title')).not.toContainText('draft');
  } catch (error) {
    const shown = await page.getByTestId('document-error').textContent({ timeout: 500 }).catch(() => null);
    console.log(`Validation failed; the page shows: ${shown}`);
    throw error;
  }
}

/** The document's status, shown under its title. */
export function status(page) {
  return page.getByTestId('status-badge').first();
}
