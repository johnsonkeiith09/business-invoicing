import { startRuntime, expect } from '/home/user/oss-new/control/runtime/index.mjs';
import { addLine, createAccount, createItem, newDraft, status, validate, YEAR } from './lib.mjs';

const runtime = await startRuntime();

/** Replays a server-function call a page made, as another role. */
async function replay(request, role) {
  const url = new URL(request.url());
  const headers = {};
  for (const [k, v] of Object.entries(await request.allHeaders())) {
    if (['content-type', 'accept', 'x-tsr-serverfn', 'x-tsr-redirect'].includes(k) || k.startsWith('x-tsr')) headers[k] = v;
  }
  return runtime.fetch(url.pathname + url.search, { role, method: 'POST', headers, body: request.postData() });
}
const serverFnPost = (r) => r.url().includes('/_serverFn/') && r.method() === 'POST';

try {
  const db = await runtime.database();
  // Anonymous and outsider are refused everywhere private; members get in.
  await runtime.assertPrivateAccess(['/', '/accounts', '/items', '/sales', '/purchases', '/collections', '/reports', '/settings', '/health']);
  for (const path of ['/reports/export?report=vat&from=2020-01-01&to=2030-12-31', '/documents/00000000-0000-4000-8000-000000000000']) {
    for (const role of [undefined, 'outsider']) {
      const res = await runtime.fetch(path, { role });
      expect([401, 403, 404]).toContain(res.status);
    }
  }

  // No sign-in of its own.
  for (const path of ['/login', '/signin', '/signup', '/register', '/logout']) {
    const res = await runtime.fetch(path, { role: 'owner' });
    expect(res.status).toBe(404);
  }
  const home = await (await runtime.fetch('/', { role: 'owner' })).text();
  expect(home).not.toContain('type="password"');

  const owner = await (await runtime.context('owner')).newPage();
  const member = await (await runtime.context('member')).newPage();

  // Admin-only: the company profile.
  await owner.goto('/settings');
  await owner.fill('#company-name', 'Harbor Lane Studio');
  const [saveCall] = await Promise.all([owner.waitForRequest(serverFnPost), owner.getByTestId('save-company').click()]);
  await expect(owner.getByText('Company profile saved')).toBeVisible();
  await member.goto('/settings');
  await expect(member.getByTestId('read-only-note')).toBeVisible();
  await expect(member.getByTestId('save-company')).toHaveCount(0);
  await expect(member.locator('#company-name')).toBeDisabled();
  await expect(member.locator('#company-name')).toHaveValue('Harbor Lane Studio');
  const forged = JSON.parse(JSON.stringify(saveCall.postData() ?? ''));
  const memberSave = await replay({ url: () => saveCall.url(), allHeaders: () => saveCall.allHeaders(), postData: () => forged.replace('Harbor Lane Studio', 'Taken Over Ltd') }, 'member');
  expect(await memberSave.text()).toContain('Only an admin');
  const outsiderSave = await replay(saveCall, 'outsider');
  expect([401, 403]).toContain(outsiderSave.status);
  const [{ name }] = (await db.prepare('select name from companies').all()).results;
  expect(name).toBe('Harbor Lane Studio');

  // Drafts belong to their author until validated.
  await createAccount(owner, { name: 'Northwind Bakery', email: 'billing@northwind.example' });
  await createItem(owner, { code: 'WEB-01', name: 'Website design', kind: 'service', price: '650' });
  const draftId = await newDraft(owner, { list: 'sales', type: 'quote', account: 'Northwind Bakery' });
  await addLine(owner, { item: 'WEB-01 · Website design', qty: '2' });
  const [draftSave] = await Promise.all([owner.waitForRequest(serverFnPost), owner.getByTestId('save-draft').click()]);
  await expect(owner.getByText('Draft saved')).toBeVisible();

  await member.goto(`/documents/${draftId}`);
  await expect(member.getByText('Document not found')).toBeVisible();
  await member.goto('/sales?type=quote');
  await expect(member.getByTestId('document-row')).toHaveCount(0);
  const memberEdit = await replay(draftSave, 'member');
  expect(await memberEdit.text()).toContain('Document not found');
  const lineCount = (await db.prepare('select count(*) as n from lines where document_id = ?').bind(draftId).all()).results[0].n;
  expect(lineCount).toBe(1);

  // Validated documents are the team's; a member sees the quote.
  await owner.goto(`/documents/${draftId}`);
  await validate(owner);
  await member.goto(`/documents/${draftId}`);
  await expect(member.getByTestId('document-title')).toHaveText(`Quote QU-${YEAR}-0001`);

  // Public share route: one document only, nothing after revoking, nothing for unknown tokens.
  await owner.getByTestId('create-share').click();
  const sharePath = new URL(await owner.getByTestId('share-url').inputValue()).pathname;
  const page = await (await runtime.fetch(sharePath)).text();
  expect(page).toContain('Website design');
  expect(page).not.toContain('billing@northwind.example');
  expect(page).not.toContain(draftId);
  expect((await runtime.fetch('/s/AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA')).status).toBe(404);
  expect((await runtime.fetch('/s/AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA', { method: 'POST', headers: { 'content-type': 'application/x-www-form-urlencoded' }, body: 'answer=accept' })).status).toBe(404);
  await owner.getByTestId('revoke-share').click();
  await expect(owner.getByTestId('create-share')).toBeVisible();
  expect((await runtime.fetch(sharePath)).status).toBe(404);
  expect((await runtime.fetch(sharePath, { method: 'POST', headers: { 'content-type': 'application/x-www-form-urlencoded' }, body: 'answer=accept' })).status).toBe(404);
  await owner.reload();
  await expect(status(owner)).toHaveText('Validated');

  // Drafts are never shareable.
  const draft2 = await newDraft(owner, { list: 'sales', type: 'invoice', account: 'Northwind Bakery' });
  await expect(owner.getByTestId('create-share')).toHaveCount(0);
  expect(draft2).toBeTruthy();

  // Another organization sees none of it, even with ids.
  const outsider = await runtime.fetch(`/documents/${draftId}`, { role: 'outsider' });
  expect([401, 403, 404]).toContain(outsider.status);
  console.log('authorization: ok');
} finally {
  await runtime.close();
}
