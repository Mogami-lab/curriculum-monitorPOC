# Curriculum Coverage Monitor (CCM)

A lightweight MVP web application for weekly curriculum coverage capture and monitoring across schools in Gauteng.

Built with plain HTML/CSS/JavaScript + [Supabase](https://supabase.com) for the backend. No build step required.

---

## Table of Contents

1. [Architecture Overview](#architecture-overview)
2. [Project Structure](#project-structure)
3. [Supabase Setup](#supabase-setup)
4. [Frontend Configuration](#frontend-configuration)
5. [Deploying to GitHub Pages](#deploying-to-github-pages)
6. [User Roles & Access](#user-roles--access)
7. [Pilot Demo Dataset](#pilot-demo-dataset)
8. [Adding Users](#adding-users)
9. [Future Enhancements](#future-enhancements)

---

## Architecture Overview

```
┌──────────────────────────────────────────────────────────┐
│                    GitHub Pages (static)                  │
│  index.html   capture.html   dashboard.html  verify.html  │
│  css/styles.css                                           │
│  js/auth.js  capture.js  dashboard.js  verification.js   │
│  js/supabase-client.js  utils.js                         │
└────────────────────────┬─────────────────────────────────┘
                         │ HTTPS
┌────────────────────────▼─────────────────────────────────┐
│                   Supabase (hosted)                       │
│  Auth (email/password)                                    │
│  PostgreSQL database (all tables + RLS)                   │
│  Storage bucket: "evidence" (files up to 10MB)            │
└──────────────────────────────────────────────────────────┘
```

**No server, no build tools, no framework.** Just open the HTML files.

---

## Project Structure

```
curriculum-monitor/
├── index.html              ← Login page
├── capture.html            ← Educator: weekly capture form
├── dashboard.html          ← Curriculum official: monitoring dashboard
├── verification.html       ← Departmental head: verify submissions
├── config.js               ← ⚠ Fill in your Supabase keys (not committed)
├── .env.example            ← Template for config.js
├── css/
│   └── styles.css
├── js/
│   ├── supabase-client.js  ← Supabase init + getProfile()
│   ├── auth.js             ← signIn, signOut, requireAuth, renderUserNav
│   ├── capture.js          ← Form logic: topics, evidence upload, submission
│   ├── dashboard.js        ← Filters, summary cards, table, drilldown panel
│   ├── verification.js     ← DH review and verify/flag workflow
│   └── utils.js            ← Shared helpers (toast, formatters, etc.)
└── sql/
    ├── 01_schema.sql       ← Full database schema
    ├── 02_rls_policies.sql ← Row-level security policies
    └── 03_seed_data.sql    ← Pilot data (Gr12 Maths + Life Sciences)
```

---

## Supabase Setup

### 1. Create a Supabase project

Go to [supabase.com](https://supabase.com), create a new project, and note your:
- **Project URL** (`https://xxxx.supabase.co`)
- **Anon public key** (safe for frontend use)

### 2. Run the SQL files

In the Supabase **SQL Editor**, run these files **in order**:

```
sql/01_schema.sql       ← Creates all tables + indexes + functions
sql/02_rls_policies.sql ← Enables RLS + creates access policies
sql/03_seed_data.sql    ← Inserts pilot data (province, schools, ATP topics)
```

Paste each file's contents and click **Run**.

### 3. Create the evidence storage bucket

In **Storage → New bucket**:
- Name: `evidence`
- Public: **No**
- File size limit: `10485760` (10 MB)
- Allowed MIME types: `image/jpeg,image/png,image/webp,application/pdf`

Then add two storage policies (**Storage → Policies**):

**INSERT** (authenticated users can upload):
```sql
CREATE POLICY "evidence_upload" ON storage.objects
  FOR INSERT WITH CHECK (
    bucket_id = 'evidence' AND auth.uid() IS NOT NULL
  );
```

**SELECT** (authenticated users can read):
```sql
CREATE POLICY "evidence_read" ON storage.objects
  FOR SELECT USING (
    bucket_id = 'evidence' AND auth.uid() IS NOT NULL
  );
```

### 4. Enable email auth

In **Authentication → Settings**:
- Enable **Email** provider
- You can disable email confirmation for the pilot (toggle off "Confirm email")

---

## Frontend Configuration

Copy `.env.example` and create `config.js` in the project root:

```js
window.__ENV = {
  SUPABASE_URL:      'https://YOUR_PROJECT_REF.supabase.co',
  SUPABASE_ANON_KEY: 'YOUR_SUPABASE_ANON_KEY'
};
```

Add `config.js` to `.gitignore` if you don't want keys in your repository (the anon key is public-safe, but good practice):

```
# .gitignore
config.js
```

Then add `<script src="config.js"></script>` before the module scripts in each HTML page (already included in the template).

---

## Deploying to GitHub Pages

### Option A: Direct GitHub Pages

1. Push this folder to a GitHub repository (e.g. `ccm-pilot`)
2. Go to **Settings → Pages**
3. Source: **Deploy from branch** → `main` → `/ (root)`
4. Your app will be live at `https://yourusername.github.io/ccm-pilot/`

### Option B: GitHub Actions (recommended for config injection)

If you want to keep Supabase keys out of the repo, add a GitHub Actions workflow that injects them at deploy time:

```yaml
# .github/workflows/deploy.yml
name: Deploy CCM

on:
  push:
    branches: [main]

jobs:
  deploy:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - name: Inject config
        run: |
          cat > config.js <<EOF
          window.__ENV = {
            SUPABASE_URL: '${{ secrets.SUPABASE_URL }}',
            SUPABASE_ANON_KEY: '${{ secrets.SUPABASE_ANON_KEY }}'
          };
          EOF
      - uses: peaceiris/actions-gh-pages@v3
        with:
          github_token: ${{ secrets.GITHUB_TOKEN }}
          publish_dir: .
```

Add `SUPABASE_URL` and `SUPABASE_ANON_KEY` in **Settings → Secrets and variables → Actions**.

---

## User Roles & Access

| Role | Page access | Capabilities |
|------|-------------|--------------|
| `educator` | capture.html | Capture weekly coverage, upload evidence, view own school data |
| `departmental_head` | verification.html, dashboard.html | Verify/flag submissions, view own school dashboard |
| `curriculum_official` | dashboard.html | View all schools across districts, drill down to evidence |

---

## Adding Users

### Step 1: Create auth account

In **Authentication → Users → Add user**:
- Email: e.g. `sipho@pretoriahigh.edu.za`
- Password: temporary (user can reset)

Copy the **User UID** shown in the users list.

### Step 2: Insert profile record

In **SQL Editor**:

```sql
INSERT INTO user_profiles (id, school_id, full_name, role, subject_id, grade_id)
VALUES (
  'PASTE_USER_UUID_HERE',
  '44444444-0000-0000-0000-000000000001',  -- Pretoria High School
  'Sipho Dlamini',
  'educator',
  '66666666-0000-0000-0000-000000000001',  -- Mathematics
  '55555555-0000-0000-0000-000000000003'   -- Grade 12
);
```

Use `NULL` for `subject_id` and `grade_id` for DH and curriculum officials. Use `NULL` for `school_id` for curriculum officials.

### Pilot user emails (suggested)

```
educator1@pretoriahigh.edu.za  → educator, Pretoria High, Gr12 Maths
educator2@pretoriahigh.edu.za  → educator, Pretoria High, Gr12 Life Sciences
dh@pretoriahigh.edu.za         → departmental_head, Pretoria High
official@education.gov.za      → curriculum_official
```

---

## Pilot Demo Dataset

The seed data includes:

**Province:** Gauteng

**Districts:**
- Tshwane South
- Johannesburg Central

**Schools (4):**
- Pretoria High School
- Waterkloof High School
- Centurion Academy
- Soweto Secondary School

**Grade 12 Mathematics — Term 1 ATP:**
| Week | Topic |
|------|-------|
| 1–3  | Patterns, Sequences and Series |
| 4–5  | Functions and Inverses |
| 6–7  | Exponential and Logarithmic Functions |
| 8    | Finance, Growth and Decay |
| 9–10 | Trigonometry: Compound Angles |

**Grade 12 Life Sciences — Term 1 ATP:**
| Week | Topic |
|------|-------|
| 1–3  | DNA: The Code of Life |
| 4–5  | Meiosis |
| 6–8  | Genetics and Inheritance |
| 9–10 | Evolution |

---

## Future Enhancements

### Short-term (Pilot to Phase 1)
- [ ] Email notifications when submissions are flagged
- [ ] Bulk import of ATP topics via CSV upload
- [ ] Printable coverage reports per school/subject
- [ ] Mobile push notifications via PWA
- [ ] Offline-capable capture form (service worker + IndexedDB sync)

### Medium-term
- [ ] Dashboard charts (Recharts or Chart.js) showing pacing trends
- [ ] Automated ATP pacing comparison (expected vs. actual)
- [ ] Parent/community view: high-level school progress (no PII)
- [ ] Multi-province support with province-level official role
- [ ] SMS notifications via Africa's Talking / Vonage

### Long-term
- [ ] Integration with LURITS / SA-SAMS learner data
- [ ] AI-assisted topic detection from uploaded evidence photos
- [ ] Predictive analytics: identify schools at risk of being behind
- [ ] API for integration with provincial EMIS systems

---

## Support

For setup issues, contact your circuit manager or the CCM pilot coordinator.

Supabase documentation: https://supabase.com/docs  
GitHub Pages documentation: https://pages.github.com
