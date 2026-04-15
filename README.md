# Team Timeline & Expense Tracker

Production-ready full-stack app with:
- Frontend: React + Vite + Tailwind CSS
- Backend: Supabase Auth + PostgreSQL + Storage
- Hosting: Firebase Hosting (frontend)

## Features

### Authentication
- Google OAuth via Supabase Auth
- Session persistence with auto refresh
- Auto profile creation on first login with role assignment

### Roles
- Employee:
  - CRUD own timeline entries
  - CRUD own expenses + receipt upload
  - View personal dashboard and reports
- Admin:
  - View all timeline and expense data
  - Approve/reject expenses
  - View team-wide analytics

### Timeline
- Date, start/end time, onsite/offsite, description
- Auto duration calculation
- Cross-day logic: if end < start, treated as next day
- Daily total hours + onsite/offsite breakdown
- Day shift and night shift split in reports
- Editable table view

### Expense
- Add/edit/delete expenses
- Categories include: Food & Beverages, Miscellaneous, Groceries, Cab, Bus, Train, Tools or hardware, Porter Delivery for Hardware
- Receipt upload (JPG/PNG, max 5MB)
- Receipt preview
- Pending/approved/rejected status
- Category and date filters

### Reports
- Employee monthly report summary
- Export to PDF and XLSX
- Admin export for all-staff day-wise timesheet (Excel template)
- Upload generated files to Supabase Storage bucket `exports`
- Download generated exports from UI

## Folder Structure

```txt
src/
  components/
  context/
  lib/
  pages/
  utils/
supabase/
  schema.sql
```

## Environment Variables

Copy `.env.example` to `.env` and fill values:

```env
VITE_SUPABASE_URL=https://YOUR_PROJECT.supabase.co
VITE_SUPABASE_ANON_KEY=YOUR_SUPABASE_ANON_KEY
VITE_ADMIN_EMAILS=admin1@company.com,admin2@company.com
```

## Supabase Setup

1. Create a Supabase project.
2. Enable Google provider in Auth:
   - Supabase Dashboard -> Authentication -> Providers -> Google
   - Add redirect URL:
     - `http://localhost:5173`
     - your production URL
3. Run SQL in [supabase/schema.sql](supabase/schema.sql).
4. IMPORTANT: Update admin emails in function `is_admin_email` in [supabase/schema.sql](supabase/schema.sql).
5. Confirm buckets exist:
   - `receipts`
   - `exports`

## Local Development

```bash
npm install
npm run dev
```

## Firebase Hosting (Frontend Only)

### One-time setup

```bash
npm install -g firebase-tools
firebase login
firebase init hosting
```

When prompted:
- Use existing project: select your Firebase project
- Public directory: `dist`
- Configure as single-page app: `Yes`
- Set up automatic builds/deploy with GitHub: optional

This repo already includes [firebase.json](firebase.json) with SPA rewrites.

### Deploy

```bash
npm run build
firebase deploy --only hosting
```

## Security Notes

- Role-based checks are enforced in Supabase RLS policies, not only frontend.
- Only admins can update expense `status` (enforced via trigger + RLS).
- Employees can access only their own data via RLS.
- Storage object access is folder-scoped by authenticated user ID.

## Production Checklist

- Replace placeholder admin emails in SQL function and env file.
- Set production OAuth redirect URL in Supabase Auth Google provider.
- Replace `.firebaserc` project ID.
- Review Supabase Auth URL settings and allowed redirect URLs.
- Optional: Add CI pipeline for lint/test/build before deploy.
