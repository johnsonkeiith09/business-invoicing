# Business Invoicing

Quotes, delivery notes, invoices, credit notes, purchase orders and supplier bills for a small business, with payments, collections and reports. It runs as a private app behind your EveryApp Gateway.

Inspired by https://manageo.io

Built with [oss.new](https://oss.new) for [EveryApp](https://github.com/every-app/every-app).

## Features

- Keep customers and suppliers with contacts, balances, documents and activity; archive the ones you no longer use.
- Keep a catalogue of products and services with prices, costs and VAT rates, and pick from it on any document.
- Write quotes, delivery notes, invoices and credit notes with gap-free numbering, convert an accepted quote to an invoice, and print any of them.
- Raise purchase orders, mark them received and record supplier bills, with a list of bills to pay by due date.
- Record payments received and made, follow unpaid invoices by age, and email a reminder for an overdue one.
- See revenue, purchases, margin, receivables and payables for a year, and export sales, VAT and aging reports as CSV.
- Share a quote or invoice by link; the customer can accept or refuse a quote from it.
- Set the company details and number prefixes printed on documents (admins only).

Left out: stock and warehouses, projects and production, electronic invoicing to the tax authority, bank reconciliation, recurring invoices, multi-currency, add-on modules, and accounts and sign-in, which your Gateway handles.

## Setup

- Install: `pnpm install`
- Run locally: `pnpm dev`
- Test: `pnpm test` (unit), and the release checks in `checks/` with the oss.new runtime
- Deploy: `pnpm run deploy`, or install a release with `pnpm everyapp install <repository url>`

There are no secrets or settings. The database comes with the deploy. Payment reminders need email sending on your Gateway (the optional "Payment reminders by email" feature); without it, everything else works and the reminder button says email isn't set up.

## Limitations

- Amounts are shown in one currency per organization; VAT rates are 0, 7, 10, 14 and 20 %.
- Drafts are visible only to the member who wrote them, until validated.
- Reminder emails were not sent in local tests: they need a Gateway with email configured.
