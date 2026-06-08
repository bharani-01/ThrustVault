# ThrustVault 🚀
> Professional Drone Motor Database & Analytics Console

ThrustVault is a high-performance web application designed for drone builders, UAV engineers, and fleet administrators to catalog, analyze, and compare professional brushless motor specifications.

---

## 🌟 Key Features

* **Multi-Role Access Control (RBAC):**
  * **Admin:** Full system privileges including user account creation, role updates, category management, and entry management.
  * **Intern:** Read and write access to categories and motor catalogs, allowing specs updating and catalog seeding.
  * **Guest:** Read-only access to view, search, filter, and compare motors.
* **Interactive Comparison Engine:** Select and compare specifications side-by-side for up to 3 motors in real-time.
* **Dynamic Analytics Dashboard:** Visual brand distribution and maximum thrust performance charts powered by `Chart.js`.
* **Flexible Data Operations:** Import and export datasets using CSV or JSON formats.
* **Advanced Search & Filters:** Instantly search by model, manufacturer, or ESC/propeller. Filter options automatically update based on active categories.

---

## 🛠️ Technology Stack

* **Frontend:** Vanilla HTML5, Vanilla CSS3 (custom variables, premium Light Theme design system), and Modern ES6+ JavaScript.
* **Icons:** Lucide Icons (rendered dynamically).
* **Charts:** Chart.js (customized high-contrast light theme layouts).
* **Database & Auth:** Supabase (PostgreSQL with Row-Level Security, custom RPC secure triggers).

---

## 🗄️ Database Architecture & Policies

The database is built on PostgreSQL with Row-Level Security (RLS) enabled on all tables:

1. **`categories` Table:** Defines thrust levels (e.g., `18-22 kg Class`).
   * *Policy:* Read-access for all logged-in users; edit/delete limited to `admin` and `intern` roles.
2. **`motors` Table:** Holds motor specifications.
   * *Policy:* Read-access for all logged-in users; edit/delete limited to `admin` and `intern` roles.
3. **`user_profiles` Table:** Tracks user accounts and authorization roles.
   * *Policy:* Users can select their own profiles; `admin` can read and write all profiles.

---

## 🚀 Local Setup & Installation

### Prerequisites
* Python 3.x
* A Supabase project instance

### 1. Configure the Environment
Create a `.env` file in the root directory:
```env
SUPABASE_URL="https://your-project-id.supabase.co"
SUPABASE_ANON_KEY="your-anon-key"
```

### 2. Set Up the Database
Run the schema setup script in your Supabase SQL Editor:
1. Copy the contents of [`schema.sql`](file:///d:/motor%20data/schema.sql).
2. Execute it to create the tables, indexes, RLS policies, and secure helper functions.

### 3. Run the Development Server
Launch the local static files server:
```bash
python server.py
```
Open your browser and navigate to `http://localhost:8000/`.

---

## 🔒 Security & Production Guidelines

To move this application to production:
1. **Hosting:** Deploy the static HTML, CSS, and JS files directly to CDNs like Vercel, Netlify, or Cloudflare Pages.
2. **API Configurations:** Expose the Supabase URL and Anon Key via edge functions or environment variables (since Anon Key is safe to expose client-side with active RLS).
3. **Audit Logging:** Move user audit logs from client-side `localStorage` to a secure PostgreSQL database table `activity_logs` inside Supabase.
