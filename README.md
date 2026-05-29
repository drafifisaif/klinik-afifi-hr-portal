# Klinik Afifi HR Portal

Deploy-ready HR portal foundation with Batch 2 and Batch 3B workflow modules built with Next.js App Router, TypeScript, Tailwind CSS, Supabase Auth, Supabase Postgres, and Supabase Storage.

## Stack

- Next.js App Router
- TypeScript
- Tailwind CSS
- Supabase Auth
- Supabase Postgres
- Supabase Storage
- Vercel-ready project structure

## Included foundation

- Supabase email/password login at `/login`
- Protected app layout with redirect to `/login` when unauthenticated
- Current profile lookup from the `profiles` table
- Role-based navigation for `super_admin`, `hr`, `operation`, `branch_pic`, and `staff`
- Reusable dashboard components and shared app shell
- Safe loading, empty, and error states throughout the app

## Batch 2 modules

### Core HR

- Dashboard with expanded operational stats
- Staff directory with create and edit form
- Leave workspace
- MC upload workspace
- Feedback workspace
- Roster management and filtering
- Notifications log

### Staff Compliance

- Staff documents upload and listing
- Document requirements management
- Expiry tracking for staff documents

### Clinic Compliance

- Clinic documents upload and listing
- Branch compliance grouped view
- Expiry tracking for clinic documents

## Batch 3B workflow wiring

### Self profile flow

- Settings is now `My Profile`
- Logged-in users without a linked `staff` row can complete their staff profile in-app
- Personal profile updates now write to `profiles` and linked `staff` records
- HR and super admin can update organizational fields and profile role

### Real leave and MC workflows

- Leave form now inserts real rows into `leave_requests`
- Leave review updates support `pending`, `approved`, `rejected`, and `cancelled`
- Review metadata writes `reviewed_by`, `reviewed_at`, and `review_note`
- Leave balance now reads from `leave_entitlements` and approved `leave_requests`
- MC upload now stores the private storage path in `attachment_url` and creates a `medical_leave` request

### Feedback workflow and notifications

- Feedback form now inserts real `feedbacks` records
- Feedback manage flow supports assignment, status updates, and `feedback_comments`
- Notification rows are created for feedback submission, reply, and status change events
- Topbar now shows unread notification count
- Notifications page supports read tracking with `is_read`
- Email sending stays safely pending with TODO hooks for a future worker or provider integration

### Compliance uploads

- Staff compliance uploads store private bucket paths in `staff_documents.file_url`
- Clinic compliance uploads store private bucket paths in `clinic_compliance_documents.file_url`
- HR and super admin can review staff document status updates

### Roster and holidays

- Branch PIC can create branch shift templates and manage own branch roster
- HR and super admin can manage global and branch templates
- Holidays module added with create, edit, delete, and branch-aware visibility
- Dashboard includes next clinic holiday countdown

## Routes

- `/login`
- `/dashboard`
- `/staff`
- `/leave`
- `/mc`
- `/feedback`
- `/feedback/manage`
- `/roster`
- `/holidays`
- `/notifications`
- `/staff-compliance`
- `/staff-compliance/requirements`
- `/staff-compliance/expiry`
- `/clinic-compliance`
- `/clinic-compliance/branch`
- `/clinic-compliance/expiry`
- `/circulars`
- `/settings`

## Environment variables

Only the public Supabase variables are required in this project:

```bash
NEXT_PUBLIC_SUPABASE_URL=your-supabase-project-url
NEXT_PUBLIC_SUPABASE_ANON_KEY=your-supabase-anon-key
SUPABASE_SERVICE_ROLE_KEY=your-server-only-service-role-key
```

This repo includes `.env.example` only and does not ship any local secret file.

## Local setup

1. Install dependencies:

```bash
pnpm install
```

2. Provide the required environment variables in your preferred local environment setup.

3. Start development:

```bash
pnpm dev
```

4. Open [http://localhost:3000](http://localhost:3000).

## Scripts

```bash
pnpm dev
pnpm build
pnpm start
pnpm lint
```

## Supabase notes

### Auth

- Auth uses Supabase email/password sign-in.
- The frontend only uses `NEXT_PUBLIC_SUPABASE_URL` and `NEXT_PUBLIC_SUPABASE_ANON_KEY`.
- No `service_role` key is used in the frontend.
- HR bulk staff import uses `SUPABASE_SERVICE_ROLE_KEY` on the server only to create Auth users safely.

### Storage

- `mc-uploads`
- `staff-compliance`
- `clinic-compliance`
- `staff-documents`
- `circular-attachments`

Files are not exposed publicly in this batch. The app stores the Supabase Storage path in the database and shows filename/status in the UI.

### Notifications and email

- Notification logging in the `notifications` table is active for feedback workflows
- `email_status` is written as `pending`
- Feedback email notifications are sent server-side through Resend for new feedback, workflow assignment, and replies
- Required server env vars for feedback email:
  - `RESEND_API_KEY`
  - `FEEDBACK_EMAIL_FROM`
  - `NEXT_PUBLIC_APP_URL`
- Missing email provider configuration does not break the build. Feedback still saves and in-app notifications still work.

### Tables used

Core HR:

- `profiles`
- `branches`
- `staff`
- `leave_requests`
- `feedbacks`
- `feedback_comments`
- `notifications`
- `shift_templates`
- `rosters`
- `holidays`
- `leave_entitlements`
- `circulars`

Staff Compliance:

- `document_requirements`
- `staff_documents`

Clinic Compliance:

- `clinic_compliance_documents`

## Project structure

```text
app/
  (auth)/login
  (app)/dashboard
  (app)/staff
  (app)/leave
  (app)/mc
  (app)/feedback
  (app)/feedback/manage
  (app)/roster
  (app)/holidays
  (app)/notifications
  (app)/staff-compliance
  (app)/clinic-compliance
  (app)/circulars
  (app)/settings
components/
lib/
  auth.ts
  data.ts
  navigation.ts
  types.ts
  workflows.ts
  notification-helpers.ts
  supabase/
```

## Deployment

The app is ready for Vercel deployment.

1. Import the repository into Vercel.
2. Set `NEXT_PUBLIC_SUPABASE_URL` and `NEXT_PUBLIC_SUPABASE_ANON_KEY` in the Vercel project environment settings.
3. Deploy.

## Batch 3B follow-up ideas

- Add signed URL download and preview flows for private compliance and MC files.
- Move notification email sending into a server-side worker or function.
- Tighten RLS and role-specific filtering further once the full production schema and policies are finalized.
