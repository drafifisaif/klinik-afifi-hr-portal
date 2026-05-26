# Klinik Afifi HR Portal

Deploy-ready HR portal foundation built with Next.js App Router, TypeScript, Tailwind CSS, Supabase Auth, Supabase Postgres, and Supabase Storage.

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
- Foundation routes for dashboard, staff, leave, MC uploads, feedback, notifications, circulars, and settings
- Safe loading, empty, and error states throughout the app

## Routes

- `/login`
- `/dashboard`
- `/staff`
- `/leave`
- `/mc`
- `/feedback`
- `/feedback/manage`
- `/notifications`
- `/circulars`
- `/settings`

## Environment variables

Only the public Supabase variables are required in this foundation:

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

- Auth uses Supabase email/password sign-in.
- Storage upload foundation uses the `mc-uploads` bucket.
- Data pages read from these existing tables:
  - `profiles`
  - `branches`
  - `staff`
  - `leave_requests`
  - `feedbacks`
  - `feedback_comments`
  - `notifications`
  - `circulars`

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
  (app)/notifications
  (app)/circulars
  (app)/settings
components/
lib/
  auth.ts
  data.ts
  types.ts
  supabase/
```

## Deployment

The app is ready for Vercel deployment.

1. Import the repository into Vercel.
2. Set `NEXT_PUBLIC_SUPABASE_URL` and `NEXT_PUBLIC_SUPABASE_ANON_KEY` in the Vercel project environment settings.
3. Deploy.

## Extension ideas

- Add server actions or API routes for leave and feedback mutations once the final column schema is confirmed.
- Expand role-based policies with row-level security in Supabase.
- Add charts, approval flows, and read receipts on top of the existing shared components.
