# ThrustVault UAV Motor Database & Analytics Console
## Comprehensive Security, UX, Accessibility & Compliance Audit

---

## STEP 0 — DETECT CONTEXT
- **Tech Stack & Versions**:
  - **Backend (Express API Server)**: Node.js, Express (`^4.19.2`), pg client (`^8.12.0`), AWS SDK for Cognito (`^3.600.0`), express-session (`^1.18.0`), connect-pg-simple (`^9.0.1`), express-rate-limit (`^7.3.1`).
  - **Backend (Admin Portal)**: Python, Flask (`3.1.0`), Gunicorn (`26.0.0`), pg8000 (`1.31.5`), boto3 (`1.43.33`).
  - **Database**: PostgreSQL (AWS RDS instance / Supabase PostgreSQL).
  - **Desktop Console Application**: Python Tkinter-based (`admin_console.py`).
  - **Frontend Client**: Vanilla HTML5, Vanilla CSS, Vanilla JavaScript. Third-party visual dependencies: Chart.js (`chart.umd.js`), Lucide Icons (`lucide.min.js`), SheetJS (`xlsx.full.min.js`).
- **Project Type**: Enterprise B2B SaaS web portal + Admin Dashboard + Desktop Analytics Console.
- **Primary Audience & Business Goal**: UAV engineers, drone manufacturers, and fleet administrators cataloging, comparing, and exporting professional brushless motor specifications and telemetry datasets.
- **Design System Maturity**: Moderately mature but fragmented. Global tokens are defined as CSS custom properties in [style.css](file:///d:/motor%20data/public/style.css) (e.g., `--bg-base`, `--text-secondary`, `--radius-md`), but there are numerous ad-hoc inline styles, overrides, and hardcoded values (like `#94a3b8` placeholders and fixed layouts).

---

## STEP 1 — ANTI-PATTERN VERDICT
- **Verdict**: Partially AI-Generated (3 distinct tells detected).
- **Specific Tells**:
  1. **Boilerplate Marketing/Hero Metrics**: In [index.html](file:///d:/motor%20data/public/index.html#L380-L400), we see unverified/typical AI marketing claims: "12M+ Data Points Logged", "<12ms Query Latency", "99.99% Validation SLA", and "42+ UAV Teams Active". These are standard template placeholder metrics typical of AI layout generators.
  2. **Trending Design Color Sameness & Decorative Ambient Glows**: In [style.css](file:///d:/motor%20data/public/style.css#L100-L150) and [index.html](file:///d:/motor%20data/public/index.html#L67-L70), there is a heavy reliance on the classic AI-generated dashboard design pattern: ambient radial glow blur circles (blue, violet, green) set as background decorations beneath glassmorphic panels.
  3. **Centered Hero Layout Pattern**: The landing page follows the standard AI design layout formula: centered large heading -> glassmorphic feature grids -> testimonial card deck -> CTA -> footer.

---

## STEP 2 & 3 — HEURISTIC EVALUATION & SCORES
*Grades on a severity scale from 0 (No issues) to 4 (Catastrophe/Blocker)*

- **Security**: **Score: 4/4** (Usability/Security Catastrophe). Direct SQL injections in the Python admin server, Cognito password validation bypasses on timeout fallback, live secret key exposures, and a lack of CSRF tokens.
- **Accessibility**: **Score: 3/4** (Major Usability/Accessibility Issue). Lack of ARIA roles for modals, missing keyboard trap/Esc closure, lack of `<h1>` headings, and WCAG AA contrast ratio violations on placeholders.
- **Responsive Design**: **Score: 2/4** (Minor/Moderate Issue). Mobile layout breakage due to fixed `530px` wrapper on the landing page, and small touch targets.
- **Bugs & Usability**: **Score: 4/4** (Usability/Security Catastrophe). Database schema column mismatches crashing the Node logging function, undefined custom specification labels/units, complete 404 routing failures for telemetry and draft runs, and a 500 ordering crash in query construction.

**Binary Legal Flags**:
- **Privacy Policy**: **FAIL** (Link is a placeholder `#`; no document exists in the public directory).
- **Terms & Conditions**: **FAIL** (Link is a placeholder `#`).
- **Cookie Consent**: **FAIL** (No cookie consent banner is shown before setting and tracking session cookies).

---

## QUICK WINS (One-line fixes)
1. **Fix Undefined Custom Schema rendering** (Severity: P1) — Replace references to `field.label` and `field.unit` in [public/user_app.js:2686-2687](file:///d:/motor%20data/public/user_app.js#L2686-L2687) and [public/guest_app.js:1368-1369](file:///d:/motor%20data/public/guest_app.js#L1368-L1369) with `field.field_name` and `field.field_unit`.
2. **Fix Database crash on activity logs** (Severity: P0) — In [src/controllers/dataController.js:179-180](file:///d:/motor%20data/src/controllers/dataController.js#L179-L180), update the query to insert into column `timestamp` instead of `created_at` (or omit `created_at` and let default values handle it), and remove the column `action` which does not exist in the [database/audit_schema.sql](file:///d:/motor%20data/database/audit_schema.sql) table.
3. **Fix Landing page mobile layout overflow** (Severity: P2) — Remove `width: 530px !important;` from `.visual-card-wrapper` styling in [public/index.html:64](file:///d:/motor%20data/public/index.html#L64) and replace it with `max-width: 530px; width: 100%;`.
4. **Fix Visualizer 500 ordering crash** (Severity: P0) — Update the regex validation or parsing logic in [src/utils/queryBuilder.js:63-66](file:///d:/motor%20data/src/utils/queryBuilder.js#L63-L66) to handle multi-column orders (e.g., splitting by comma and validating each column name individually).
5. **Fix Telemetry/Draft API 404 Routing** (Severity: P0) — Register routes `/motor-test-runs`, `/motor-test-data-points`, and `/draft-test-runs` in [src/routes/apiRoutes.js](file:///d:/motor%20data/src/routes/apiRoutes.js), proxying them through the standard `dataController.dbProxy` or dedicated handlers.


---

## Findings

### P0 — Blocking

#### 1. SQL Injection in Python Admin Server
- **Category:** Security
- **Location:** [admin_portal/admin_server.py:259-272](file:///d:/motor%20data/admin_portal/admin_server.py#L259-L272)
- **Issue:** The query parameters `select` and `order` are interpolated directly into raw SQL strings: `sql = f"SELECT {select_cols} FROM {table}"` and `sql += f" ORDER BY {col} {direction}"`. There is absolutely no validation, escaping, or regex checks on `select_cols` or `col`.
- **User impact:** An attacker with admin credentials (or by hijacking an admin session) can execute arbitrary SQL statements, reading database credentials, modifying tables, or escalating database permissions.
- **Fix:** Sanitize column names against a strict whitelist regex pattern (e.g. `^[a-zA-Z0-9_]+$`) before interpolating them into SQL strings, similar to the sanitization logic used in Node's [src/utils/queryBuilder.js](file:///d:/motor%20data/src/utils/queryBuilder.js).

#### 2. Cognito Auth Bypass on Connection Timeout Fallback
- **Category:** Security
- **Location:** [src/controllers/authController.js:77-86](file:///d:/motor%20data/src/controllers/authController.js#L77-L86) and [admin_portal/admin_server.py:743-766](file:///d:/motor%20data/admin_portal/admin_server.py#L743-L766)
- **Issue:** If Cognito connection times out or fails (which can be easily simulated or triggered by a client), the server catches the exception and falls back to looking up the user profile in the database. If a database profile is found, the user is logged in *without verifying their password*. In `admin_server.py`, the fallback accepts "any password in offline mode".
- **User impact:** Anyone who knows an admin or user email address can log into their account by sending arbitrary passwords and forcing/waiting for a Cognito connection timeout (or blocking Cognito API traffic).
- **Fix:** Implement local hashing and verification of password credentials if offline fallback is required (e.g., using bcrypt), or disable offline login fallback entirely.

#### 3. Database Crash in Activity Logging [RESOLVED]
- **Category:** Bugs & Usability
- **Location:** [src/controllers/dataController.js:178-183](file:///d:/motor%20data/src/controllers/dataController.js#L178-L183)
- **Issue:** The `logActivity` endpoint tried to insert data into columns `action` and `created_at` in the `audit_logs` table: `INSERT INTO audit_logs (email, role, action, details, created_at) ...`. However, according to [database/audit_schema.sql](file:///d:/motor%20data/database/audit_schema.sql), the table did not have `action` or `created_at` columns (it uses `timestamp` and has columns `route`, `method`, `status`, etc.). This caused a database exception on every activity logging attempt, resulting in persistent runtime console warning logs.
- **User impact:** System activity was not being logged on Node API calls, leaving no audit trail for user operations.
- **Fix:** Update the query to insert into the correct columns: `email`, `role`, `route`, `method`, `status`, `ip_address`, `user_agent`, `details` and supply appropriate request-based values.
- **Status:** **RESOLVED** — Aligned Express audit log insertions with database schema columns.

#### 4. Live API Keys and Database Credentials Leaked in Git Workspace
- **Category:** Security
- **Location:** [motor_scraper/.env:2](file:///d:/motor%20data/motor_scraper/.env#L2) and [.env:2](file:///d:/motor%20data/.env#L2)
- **Issue:** The local environment files contain live credentials. `motor_scraper/.env` contains a live Groq API key (`gsk_...`), and the root `.env` contains a live Resend API key (`re_...`) and DB password. Although `.env` is listed in `.gitignore`, the fact that these are kept in plain text in active working trees poses a significant leak risk.
- **User impact:** If files are accidentally committed or exposed via workspace backups, third parties can access the database or abuse Groq/Resend paid API quotas.
- **Fix:** Revoke the exposed keys immediately. Re-issue new credentials and store them strictly in secure production vaults (like AWS Secrets Manager or environment variables of the deployment platform), keeping only placeholder files in the local workspace.

#### 5. Missing CSRF Protections on State-Changing API Endpoints
- **Category:** Security
- **Location:** [src/app.js:17-32](file:///d:/motor%20data/src/app.js#L17-L32) and [admin_portal/admin_server.py:38-42](file:///d:/motor%20data/admin_portal/admin_server.py#L38-L42)
- **Issue:** The Express and Flask servers use cookie-based sessions (with standard session cookies) but do not implement CSRF tokens or double-submit cookies for POST, PATCH, or DELETE endpoints.
- **User impact:** Attacking sites can make cross-origin requests on behalf of authenticated administrators/users, resulting in unauthorized deletions or schema additions.
- **Fix:** Add a standard CSRF protection middleware (such as `csurf` in Node or Flask-WTF CSRFProtect in Python) to validate CSRF tokens for all state-changing methods.

#### 6. API Route Mismatches (404 Not Found on Telemetry and Draft Test Runs) [RESOLVED]
- **Category:** Bugs & Usability
- **Location:** [src/routes/apiRoutes.js](file:///d:/motor%20data/src/routes/apiRoutes.js) (and frontend calls in [public/performance_app.js](file:///d:/motor%20data/public/performance_app.js), [public/user_app.js](file:///d:/motor%20data/public/user_app.js), [public/guest_app.js](file:///d:/motor%20data/public/guest_app.js))
- **Issue:** The client scripts attempt to load telemetry runs, submit bulk imports, and check duplicates by directly fetching `/api/motor-test-runs`, `/api/motor-test-data-points`, and `/api/draft-test-runs`. However, these paths were missing from the Express router in `apiRoutes.js` (despite having their table names mapped in the backend `ACL` controls). Furthermore, the `draft_test_runs` database table was missing entirely from the PostgreSQL instance. This caused all visualizer refreshes, telemetry loads, and run saves to fail with a `404 Not Found` response.
- **User impact:** The Performance Analytics interface completely failed to load telemetry data, chart plots remained blank, and bulk imports failed.
- **Fix:** Registered direct API endpoints in `apiRoutes.js` that map to the corresponding table actions and translate path-based `:id` parameters into query params. Executed the drafts table SQL migration on the database to create the table.
- **Status:** **RESOLVED** — Created the drafts database table and registered Direct API endpoints.

#### 7. SQL Query Builder Order Column Sanitization Crash (500 Internal Server Error) [RESOLVED]
- **Category:** Security / Bugs & Usability
- **Location:** [src/utils/queryBuilder.js:63-66](file:///d:/motor%20data/src/utils/queryBuilder.js#L63-L66) (and caller [src/controllers/dataController.js:56](file:///d:/motor%20data/src/controllers/dataController.js#L56))
- **Issue:** The frontend client requests `/api/motors?order=company,motor_name` to sort the catalog. In `queryBuilder.js`, the code parsed the order parameter by splitting on a period (`.`) and validating the prefix against `SAFE = /^[a-zA-Z0-9_]+$/`. Since the prefix contains a comma, it failed validation and threw an `Unsafe order col: company,motor_name` error, resulting in a `500 Internal Server Error` response.
- **User impact:** The motor explorer visualizer and stats pages crashed immediately.
- **Fix:** Update `queryBuilder.js` to split multiple columns in the `order` parameter (e.g., by splitting on commas first) and validate each column identifier independently against the safe pattern before joining them into the SQL `ORDER BY` clause.
- **Status:** **RESOLVED** — Refactored the query builder's order clause to support and sanitize comma-separated lists of columns.

#### 8. SQL Query Builder POST Bulk Insertion Failure (500 Internal Server Error) [RESOLVED]
- **Category:** Bugs & Usability
- **Location:** [src/utils/queryBuilder.js:75-87](file:///d:/motor%20data/src/utils/queryBuilder.js#L75-L87)
- **Issue:** The frontend imports bulk data by POSTing JSON arrays of objects to endpoints like `/api/motor-test-data-points`. However, the query builder's POST handler expected a single object payload and read keys directly using `Object.keys(payload)`, returning array indices (`'0'`, `'1'`, etc.) instead of column names, causing database crashes.
- **User impact:** Bulk imports crashed with database errors during data points save operations.
- **Fix:** Refactored the POST builder to detect arrays of payloads, running inserts for each item inside a transaction-safe loop and returning the collected result array.
- **Status:** **RESOLVED** — Added array parsing and bulk insertion support in queryBuilder POST handler.

---

### P1 — Major

#### 1. Undefined Schema Customizer Fields in User and Guest Dashboards
- **Category:** Bugs & Usability
- **Location:** [public/user_app.js:2686-2687](file:///d:/motor%20data/public/user_app.js#L2686-L2687) and [public/guest_app.js:1368-1369](file:///d:/motor%20data/public/guest_app.js#L1368-L1369)
- **Issue:** The client scripts query the custom specs schema but look up `field.label` and `field.unit` on the returned rows. However, the database schema defines these columns as `field_name` and `field_unit` respectively. Since the database query returns the exact column keys, the frontend receives `field_name` and `field_unit`, causing `field.label` and `field.unit` to return `undefined`.
- **User impact:** Custom specification fields render with a label of `undefined` and blank units in the telemetry and specs detail view.
- **Fix:** Change client properties in `user_app.js` and `guest_app.js` to reference `field.field_name` and `field.field_unit`.

#### 2. Accessibility Lockout: Forced Light Theme on Landing Page
- **Category:** Theming & Design System
- **Location:** [public/page-loader.js:9](file:///d:/motor%20data/public/page-loader.js#L9)
- **Issue:** The loader script checks if the page is the landing page (`index.html`) and overrides the user's selected theme (stored in `localStorage`) by forcing it to `'light'`: `const currentTheme = isLandingPage ? 'light' : ...`.
- **User impact:** Users who prefer dark mode due to visual impairment or photophobia are forced into a high-brightness light-mode screen on the landing page, violating accessibility customization principles.
- **Fix:** Respect user theme preferences on all pages: `const currentTheme = localStorage.getItem('thrustvault_theme') || 'light';`.

#### 3. Insufficient Placeholder Contrast Ratio
- **Category:** Accessibility
- **Location:** [public/style.css:261](file:///d:/motor%20data/public/style.css#L261)
- **Issue:** In the global style definitions, search inputs define the placeholder color as `#94a3b8` on a `#ffffff` background: `.search-container input::placeholder { color: #94a3b8; }`. The contrast ratio is `2.71:1`, failing the WCAG 2.1 Level AA minimum contrast ratio of `4.5:1` for readable text.
- **User impact:** Visually impaired users or users in bright environments will not be able to read the search placeholder text.
- **Fix:** Update the placeholder color to a darker grey, such as `#64748b` (which yields `4.57:1` contrast) or `#576574`.

#### 4. Missing Modal Accessibility Roles and Keyboard Trap Listeners
- **Category:** Accessibility
- **Location:** [public/user_dashboard.html:322](file:///d:/motor%20data/public/user_dashboard.html#L322) (and all other modal definitions)
- **Issue:** Modals (like comparison modal, motor edit modal, delete confirmation modal) are structured using plain `div` elements without proper ARIA markup (`role="dialog"`, `aria-modal="true"`). Furthermore, there is no keyboard tab trapping (forcing keyboard focus to cycle only inside the active modal) or listener for the `Escape` key to close modals.
- **User impact:** Blind users using screen readers will not know a modal is open or how to navigate it, and keyboard-only users will experience keyboard focus drifting outside the modal into the background content.
- **Fix:** Add appropriate ARIA roles to all modals. Add a global window event listener in JS to listen for the `Escape` key to close the active modal, and implement a keyboard trapping loop for the `Tab` key.

#### 5. Non-standard Heading Hierarchy (Missing `<h1>` elements)
- **Category:** Accessibility / SEO
- **Location:** [public/index.html](file:///d:/motor%20data/public/index.html) and [public/user_dashboard.html](file:///d:/motor%20data/public/user_dashboard.html)
- **Issue:** Neither the landing page nor the user dashboard contains an `<h1>` element. The highest heading elements used are `<h2>` or `<h3>`.
- **User impact:** Search engine indexers cannot deduce the primary topic of the page, hurting SEO rankings. Screen reader users face a disrupted heading hierarchy map.
- **Fix:** Change the primary page titles (e.g. "ThrustVault UAV Motor Database") to use `<h1>` tags and style them accordingly.

---

### P2 — Minor

#### 1. Mobile Layout Breakdown due to Fixed Width Component
- **Category:** Responsive Design
- **Location:** [public/index.html:64](file:///d:/motor%20data/public/index.html#L64)
- **Issue:** The landing page features a `.visual-card-wrapper` style block that forces a fixed width of `530px !important`. This forces the hero visualization block to overflow on mobile screens.
- **User impact:** On mobile devices (viewports under 530px), the page overflows horizontally, requiring horizontal scrolling and clipping key UI text.
- **Fix:** Remove the fixed width and replace it with responsive dimensions: `max-width: 530px; width: 100%;`.

#### 2. Touch Targets Under Recommended 44x44px Sizing
- **Category:** Responsive Design / Usability
- **Location:** [public/style.css:391](file:///d:/motor%20data/public/style.css#L391)
- **Issue:** Close icon buttons (`.btn-icon-close`) use small dimensions and padding of `4px` without specifying min-width or min-height.
- **User impact:** Users on touch devices (smartphones/tablets) will struggle to close modals, often tapping adjacent layout elements accidentally.
- **Fix:** Ensure all interactive elements have a minimum size or touch-padding area of `44x44px`.

---

### P3 — Polish

#### 1. Generic System Font Fallbacks on Landing Page
- **Category:** Theming & Design System
- **Location:** [public/style.css:12](file:///d:/motor%20data/public/style.css#L12)
- **Issue:** Text and headers fallback to generic system serif/sans-serif fonts instead of importing and leveraging high-quality typography.
- **User impact:** The landing page looks slightly unpolished or generic compared to premium enterprise dashboards.
- **Fix:** Import a modern typography family from Google Fonts (e.g. Outfit or Inter) at the top of the stylesheet.

#### 2. Hardcoded Default Port and Development Fallback Secret Keys
- **Category:** Security / Polish
- **Location:** [server.js:7](file:///d:/motor%20data/server.js#L7) and [src/app.js:23](file:///d:/motor%20data/src/app.js#L23)
- **Issue:** Standard ports and weak session secret default values (`'thrustvault-change-me-in-production'`) are written directly in code.
- **User impact:** Security scanning tools will flag these defaults as minor issues, and developers might forget to change them during quick deployments.
- **Fix:** Throw an explicit error during startup in production if `SESSION_SECRET` is not set or equals the default value.

---

## Systemic Patterns
1. **Direct SQL Interpolation**: Both backends (Node via query parameters like `order` or payload keys, and Python via `select`/`order` parameters) bypass safe query building by interpolating raw string variables directly into SQL queries. This points to a developer tendency to treat DB query strings as templates rather than parameterized structures.
2. **Access Control Over-reliance on Session State**: Authentication uses session cookies, but neither backend validates headers such as `Origin` or uses CSRF tokens on state-changing API routes.
3. **Missing Touch and Keyboard Accessibility**: Interactive elements (modals, close buttons, placeholders) are designed visually without considering keyboard focus loops, ARIA semantics, or touch-screen finger dimensions.

---

## Strengths
1. **Dynamic Design Tokens**: [public/style.css](file:///d:/motor%20data/public/style.css) utilizes a clean and structured set of CSS variables (`--bg-base`, `--text-main`, `--radius-md`), enabling quick adjustments to brand styling.
2. **Normalized SQL Schemas**: The schema design in [database/schema.sql](file:///d:/motor%20data/database/schema.sql) is highly normalized, including foreign key constraints and user cascade deletions, which ensures data integrity.
3. **Responsive Charting**: Telemetry visualization in [public/performance_app.js](file:///d:/motor%20data/public/performance_app.js) leverages Chart.js scatter configurations effectively, rendering responsive telemetry runs on user selection.

---

## Recommended Priority Order
1. **Fix Cognito Authentication Bypass** ([src/controllers/authController.js:77-86](file:///d:/motor%20data/src/controllers/authController.js#L77-L86)): Ensure logins fail immediately if Cognito credentials cannot be verified, rather than trusting unverified local DB entries.
2. **Fix SQL Injection in Python Admin Server** ([admin_portal/admin_server.py:259](file:///d:/motor%20data/admin_portal/admin_server.py#L259)): Whitelist column inputs to prevent SQL commands from being executed via parameters.
3. **Fix Telemetry/Draft API 404 Routing** ([src/routes/apiRoutes.js](file:///d:/motor%20data/src/routes/apiRoutes.js)): Add direct handlers or proxy routes for `/motor-test-runs`, `/motor-test-data-points`, and `/draft-test-runs` to prevent visualizer 404 errors.
4. **Fix Visualizer 500 ordering crash** ([src/utils/queryBuilder.js:63-66](file:///d:/motor%20data/src/utils/queryBuilder.js#L63-L66)): Correct order parser logic to support multi-column sorting parameters.
5. **Fix Database Crash in Activity Logging** ([src/controllers/dataController.js:178-183](file:///d:/motor%20data/src/controllers/dataController.js#L178-L183)): Correct DB insertion query parameters to match the actual audit schema.
6. **Fix CSRF Security Defenses** ([src/app.js:17-32](file:///d:/motor%20data/src/app.js#L17-L32)): Integrate anti-CSRF token verification for Express and Flask state-changing endpoints.
7. **Fix Custom Schema rendering fields** ([public/user_app.js:2686-2687](file:///d:/motor%20data/public/user_app.js#L2686-L2687)): Map undefined variables (`field.label` and `field.unit`) to correct database properties.
8. **Implement Legal Compliance documents**: Add Privacy Policy and Terms of Service documents and a Cookie Consent banner.
9. **Address Modal ARIA and Keyboard trapping**: Ensure keyboard navigation works correctly for screen readers and keyboard users.
10. **Fix Landing page mobile layout wrapper** ([public/index.html:64](file:///d:/motor%20data/public/index.html#L64)): Replace the fixed 530px wrapper with a responsive layout.

