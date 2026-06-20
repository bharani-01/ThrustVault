# ThrustVault UAV Motor Database & Analytics Console

[![Production Status](https://img.shields.io/badge/status-active-success.svg)](#)
[![License](https://img.shields.io/badge/license-MIT-blue.svg)](#)
[![Backend](https://img.shields.io/badge/backend-Flask-lightgrey.svg)](#)
[![Database](https://img.shields.io/badge/database-Supabase%20%2F%20PostgreSQL-blueviolet.svg)](#)

ThrustVault is an enterprise-grade, secure web application designed for UAV engineers, drone manufacturers, and fleet administrators to catalog, analyze, compare, and export professional brushless motor specifications.

---

## 📂 Repository Architecture & File Mapping

The repository conforms to enterprise MNC standards, segregating concerns into modular directories:

```
thrustvault-workspace/
├── .env                              # Local environment configurations (ignored in git)
├── .gitignore                        # Git exclusions mapping
├── README.md                         # Project documentation
├── requirements.txt                  # Python production and development dependencies
├── render.yaml                       # Infrastructure-as-Code deployment schema for Render.com
├── app.py                            # WSGI entrypoint for production-grade Gunicorn runners
├── server.py                         # Secure Flask Static Server & Configuration API Router
│
├── database/                         # Data layer, schemas, migrations, and seeding scripts
│   ├── schema.sql                    # Core PostgreSQL database schema
│   ├── audit_schema.sql              # Secondary log warehouse schema
│   ├── seed_motors.py                # Supabase database population script for drone motors
│   ├── seed_performance.py           # Supabase database population script for telemetry runs
│   ├── migration_access_requests.sql # Role request management tables
│   ├── migration_drafts_table.sql    # Motor catalog draft schema migration
│   ├── migration_fix_user_cascade.sql # Cascade user deletion and orphaned profiles migration
│   ├── migration_onboarding_progress.sql # User walkthrough onboarding state tracker
│   ├── migration_performance.sql     # Telemetry run tables and data points migration
│   ├── migration_user_onboarding.sql # Extended user onboarding fields migration
│   └── migration_validation.sql      # Database constraint and trigger check migration
│
├── public/                           # Client-side static assets (HTML/CSS/JS)
│   ├── style.css                     # Global glassmorphic unified design system (Light Theme)
│   ├── page-loader.js                # Core layout transitions controller
│   │
│   ├── index.html                    # Public Landing View
│   ├── login.html                    # User Login & Forgot Password OTP portal
│   ├── request_access.html           # Access requests form (onboarding flow)
│   ├── guest_dashboard.html          # Guest Portal: Catalog & Side-by-Side motor comparison
│   ├── user_dashboard.html           # User Portal: Spec editor & catalog upload console
│   ├── admin_dashboard.html          # Admin Portal: System health overview & analytics
│   ├── admin_users.html              # Admin Portal: User management & Role Assignment (RBAC)
│   ├── admin_access_requests.html    # Admin Portal: Onboarding approvals dashboard
│   ├── admin_schema_customizer.html  # Admin Portal: Supabase structural configuration
│   ├── performance_analytics.html    # Performance Portal: Telemetry chart visualizer
│   ├── admin_exports.html            # Admin Portal: Studio-Style Motor Exporter interface
│   ├── admin_audit_logs.html         # Admin Portal: Security and Event Log visualizer
│   ├── thrustvault_presentation.html # Enterprise brand introduction deck
│   ├── 404.html                      # Customized 404 & 403 HTTP Error View
│   │
│   ├── login.js                      # Controller for signin, password recovery, and OTP
│   ├── onboarding.js                 # Controller for request access submissions
│   ├── guest_app.js                  # Controller for guest catalog actions & comparison sets
│   ├── user_app.js                   # Controller for user uploads, motor additions & edits
│   ├── admin_app.js                  # Controller for admin dashboard visualizations
│   ├── admin_users_app.js            # Controller for user profile activation & RBAC changes
│   ├── admin_access_requests_app.js  # Controller for approval/rejection workflows & emails
│   ├── admin_schema_app.js           # Controller for schema properties config
│   ├── performance_app.js            # Controller for telemetry plotting (Chart.js)
│   ├── admin_exports_app.js          # Controller for studio-style exporting and downloads
│   ├── admin_audit_logs_app.js        # Controller for event list rendering & threat levels
│   │
│   └── libs/                         # Externally cached third-party Javascript engines
│       ├── chart.umd.js              # Chart.js charting engine
│       ├── lucide.min.js             # SVG icon runtime loader
│       └── xlsx.full.min.js          # SheetJS spreadsheet creation engine
│
└── motor_scraper/                    # Scraper utilities (external catalog ingestion tools)
```

---

## 🛡️ Role-Based Access Control (RBAC) System

ThrustVault implements a secure four-tier access control paradigm enforced via PostgreSQL Row-Level Security (RLS) policies and Flask routing filters:

| Role | Permissions | Access Locations |
| :--- | :--- | :--- |
| **Anonymous** | Authentication, onboarding registration, OTP, public presentation. | `/login`, `/request_access`, `/thrustvault_presentation` |
| **Guest** | Read-only access to motor catalog, charts, comparisons. | `/dashboard`, `/performance_analytics` |
| **User** | Read/Write access to motors. Create/edit motor entries, import raw catalogs. | `/dashboard`, `/performance_analytics` |
| **Admin** | Read/Write access to motors/users. Manage approvals, update RBAC, audit security logs, customize schema parameters, export databases. | `/admin_*`, `/performance_analytics` |

---

## 🔧 Installation & Configuration

### Prerequisites
- Python **3.8+**
- A Supabase PostgreSQL database instance (with primary and secondary log instances configured)

### 1. Repository Setup
Clone the repository and install the dependencies:
```bash
pip install -r requirements.txt
```

### 2. Environment Variables Mapping
Configure the `.env` file in the root directory:
```ini
# Supabase Database Credentials (Primary Catalog)
SUPABASE_URL="https://your-primary-id.supabase.co"
SUPABASE_ANON_KEY="your-primary-anon-key"

# Supabase Log Warehouse Credentials (Secondary Database)
AUDIT_SUPABASE_URL="https://your-secondary-id.supabase.co"
AUDIT_SUPABASE_ANON_KEY="your-secondary-anon-key"

# Email Notification Integration
RESEND_API_KEY="re_your_resend_integration_key"
```

### 3. Database Migration & Initialization
Apply the schemas in the Supabase SQL Console in this sequence:
1. Run [`database/schema.sql`](file:///d:/motor%20data/database/schema.sql) to initialize base tables, auth triggers, and RLS policies.
2. Execute the migration files: [`database/migration_performance.sql`](file:///d:/motor%20data/database/migration_performance.sql), [`database/migration_access_requests.sql`](file:///d:/motor%20data/database/migration_access_requests.sql), etc.
3. Run the Python seeding scripts to populate initial motors and telemetry runs:
   ```bash
   python database/seed_motors.py
   python database/seed_performance.py
   ```

---

## 🚀 Execution & Deployment

### Local Development Server
Execute the Python static server from the repository root:
```bash
python server.py
```
The application will launch on **`http://localhost:8000`**.

### Production deployment (WSGI)
For production environments, serve the application via Gunicorn:
```bash
gunicorn app:app --bind 0.0.0.0:8000 --workers 4
```

---

## 🔒 Security Specifications

- **Directory Traversal Defense**: The Flask file handler uses `os.path.normpath` and whitelisted filenames to prevent directory traversal attacks.
- **Config Access Controls**: The `/api/config` endpoint verifies `Origin`, `Referer`, and `Host` headers to prevent unauthorized direct reading of database secrets.
- **Event Audit Log Pipeline**: All security-sensitive actions (e.g. privilege changes, auth failures, data exports) are captured and shipped asynchronously to a secondary audit database via `database/audit_schema.sql` integration.
