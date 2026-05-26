# Klinik Afifi HR Portal

Deploy-ready HR portal foundation and Batch 2 modules built with Next.js App Router, TypeScript, Tailwind CSS, Supabase Auth, Supabase Postgres, and Supabase Storage.

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

## Routes

- `/login`
- `/dashboard`
- `/staff`
- `/leave`
- `/mc`
- `/feedback`
- `/feedback/manage`
- `/roster`
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

### Storage

- `mc-uploads`
- `staff-compliance`
- `clinic-compliance`
- `staff-documents`
- `circular-attachments`

Batch 2 document pages upload files into:

- `staff-compliance`
- `clinic-compliance`

Files are not exposed publicly in this batch. The app stores the Supabase Storage path in the database and shows filename/status in the UI.

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
  supabase/
```

## Deployment

The app is ready for Vercel deployment.

1. Import the repository into Vercel.
2. Set `NEXT_PUBLIC_SUPABASE_URL` and `NEXT_PUBLIC_SUPABASE_ANON_KEY` in the Vercel project environment settings.
3. Deploy.

## Batch 2 follow-up ideas

- Add signed URL downloads for private compliance files.
- Tighten row-level filtering further based on final branch and ownership relationships.
- Connect leave, feedback, and roster forms to richer approval workflows and audit history.
