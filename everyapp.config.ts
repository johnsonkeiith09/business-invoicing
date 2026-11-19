import { defineEveryApp } from "@every-app/sdk";

// defineEveryApp types the manifest. The Gateway keeps it; the Worker gets
// the bindings it lists (env.DB), never the file.
export default defineEveryApp({
  id: "business-invoicing",
  name: "Business Invoicing",
  description:
    "Quotes, invoices, purchases and payments for a small business, with its customers, suppliers and catalogue.",
  icon: "/icon.svg",
  resources: {
    d1: ["DB"],
  },
  // Every member of the organization works in it.
  access: "everyone",
  public: [
    // Share links: a customer views a quote or invoice and answers a quote.
    { path: "/s/:token", methods: ["GET", "POST"] },
  ],
  // The built styles and scripts the share page loads, and the icon.
  publicAssets: ["/assets/**", "/icon.svg"],
  capabilities: {
    email: {
      access: "write",
      why: "Sends customers a payment reminder for an overdue invoice, with a link to it.",
    },
  },
  features: {
    reminders: {
      name: "Payment reminders by email",
      why: "Members email a reminder to a customer whose invoice is overdue.",
      steps: ["Set up email sending on your Gateway."],
      capabilities: ["email"],
    },
  },
});
