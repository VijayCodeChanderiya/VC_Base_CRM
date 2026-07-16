# Alphatech CRM & Inventory Management System

Web-based CRM + Inventory system: customers, products, IMEI/serial tracking, sales,
purchases, warranty, returns, suppliers, and reports.

## Stack

- Frontend: React 19 + Vite + TypeScript + Tailwind CSS v4 + Radix primitives
- Backend: Node.js + Express + TypeScript
- Database: PostgreSQL + Prisma ORM
- Auth: JWT + Role-Based Access Control (ADMIN, STAFF, COMPANY, RESELLER)

## Project layout

```
app/
  backend/    Express API, Prisma schema/migrations
  frontend/   React SPA (Vite)
```

## Prerequisites

- Node.js 20+ (installed via winget: OpenJS.NodeJS.LTS)
- PostgreSQL running locally (this machine: `E:\VC Base CRM\Postgresql`, port 1107)

## Backend setup

```bash
cd backend
npm install
# .env already configured with DATABASE_URL, JWT_SECRET, PORT=4000
npx prisma migrate dev   # apply schema (already run once)
npx tsx prisma/seed.ts   # seeds admin@alphatech.local / Admin@123
npm run dev              # starts on http://localhost:4000
```

## Frontend setup

```bash
cd frontend
npm install
npm run dev               # starts on http://localhost:5173, proxies /api to :4000
```

Login with the seeded admin account: `admin@alphatech.local` / `Admin@123`.

## What's implemented so far (foundation phase)

- Full Prisma schema covering all PRD entities (Users, Customers, Suppliers, Products,
  Categories, Inventory, Inventory Transactions, IMEI Records, Sales, Sale Items,
  Purchases, Purchase Items, Returns, Warranty Claims, Payments, Notifications,
  Audit Logs, Files, Settings).
- JWT auth + role-based route guards.
- Product Catalog CRUD (quantity-based and IMEI/serial-tracked products).
- IMEI stock-in and search.
- Customer CRUD.
- Sales/Invoice creation with:
  - Atomic stock decrement that can never go below zero (row-level guarded update).
  - Atomic IMEI claim on sale — a sold IMEI cannot be sold twice, even under
    concurrent requests.
  - Auto tax/subtotal/grand total computation and invoice numbering.
- React SPA: login, dashboard, products, IMEI search, customers, sales/invoice pages.

## Not yet built (next phases)

Supplier management UI, Purchase management, Returns/Refund/Replacement, Warranty
management, Payment management, Reports (PDF/Excel/CSV), Notifications, User
management UI, Settings, Audit log viewer, File manager, Global search, Barcode/QR
support, Backup & restore, and the GPS-specific features (vehicle management,
installation records, SIM management, RMA workflow, multi-branch inventory, GST
invoicing).
