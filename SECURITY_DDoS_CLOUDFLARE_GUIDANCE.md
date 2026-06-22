# Cloud-Native Security & Performance Deployment Guide (Cloudflare)

This guide documents the enterprise-grade configurations for deploying **Cloudflare** as a reverse proxy in front of the ThrustVault application. This setup enables **SSL/TLS certificates**, **DDoS protection**, **Gzip/Brotli JSON response compression**, and **HTTP security headers** at the Cloudflare Edge network without needing to test or deploy backend server modifications.

---

## 1. SSL/TLS Encryption Configuration

To secure communication between users, the Cloudflare edge, and the ThrustVault Node.js origin server, configure:

1. Navigate to **SSL/TLS** > **Overview** in the Cloudflare dashboard.
2. Set the encryption mode to **Full (Strict)**. This ensures that:
   - All traffic between the client browser and Cloudflare is encrypted via HTTPS.
   - All traffic between Cloudflare and your origin server is encrypted using a valid certificate on the origin.
3. In **SSL/TLS** > **Edge Certificates**:
   - Enable **Always Use HTTPS** to automatically redirect HTTP traffic (port 80) to HTTPS (port 443).
   - Enable **Opportunistic Encryption** and **TLS 1.3** to optimize speed and secure protocols.
   - Enable **Automatic HTTPS Rewrites** to automatically resolve mixed content issues.

---

## 2. DDoS Mitigation & Threat Protection

Cloudflare automatically buffers traffic and blocks volumetric network layer (Layer 3/4) attacks. For application layer (Layer 7) DDoS mitigation:

1. Navigate to **Security** > **Settings**:
   - Set **Security Level** to **Medium** (or **High** during active threat scenarios).
   - Enable **Under Attack Mode** only if you detect sudden, unexplained traffic spikes causing server load.
2. Navigate to **Security** > **WAF** > **Rate Limiting Rules**:
   - **Rule A (Brute-Force Shield):** 
     - *Expression:* `(http.request.uri.path eq "/api/auth/login") or (http.request.uri.path eq "/api/auth/forgot-password")`
     - *Action:* Block (or show Challenge) if requests exceed **5 requests per 1 minute** per IP.
   - **Rule B (API Abuse Shield):**
     - *Expression:* `(http.request.uri.path starts_with "/api/guest/") or (http.request.uri.path eq "/api/public/request-access")`
     - *Action:* Block (or show Challenge) if requests exceed **60 requests per 1 minute** per IP.
3. Enable Cloudflare Managed Rulesets (OWASP Core Ruleset) to filter SQL injections, path traversals, and cross-site scripting attempts before they reach Node.js.

---

## 3. Gzip/Brotli & JSON compression at the Edge

To minimize JSON and HTML payload delivery sizes and maximize speed:

1. Navigate to **Speed** > **Optimization** > **Content Optimization**.
2. Enable **Brotli** compression. Cloudflare will automatically compress JSON response APIs, HTML pages, CSS files, and JS scripts using Brotli (which is up to 20% more efficient than standard Gzip).
3. If your client requests standard gzip, Cloudflare will fallback to gzip compression automatically.
4. Set up a **Cache Rule** (under **Caching** > **Cache Rules**) for static files:
   - *Expression:* `(http.request.uri.path.extension in {"css" "js" "png" "jpg" "jpeg" "webp" "svg" "ico" "woff" "woff2"})`
   - *Action:* Eligible for cache, set Edge Cache TTL to **7 days**. This offloads static asset delivery entirely to Cloudflare's CDN edge.

---

## 4. Edge-Injected Security Headers (Transform Rules)

Since the backend node server code cannot be modified immediately, you can inject security headers at the Edge using Cloudflare **Transform Rules**.

1. Navigate to **Rules** > **Transform Rules** > **Modify Response Header**.
2. Create a rule named "Inject Security Headers".
3. Set the expression to: `true` (applies to all incoming requests).
4. Add the following header modifications (set static value):
   - **Strict-Transport-Security:** `max-age=31536000; includeSubDomains; preload` (Enforces HTTPS)
   - **X-Frame-Options:** `SAMEORIGIN` (Clickjacking defense)
   - **X-Content-Type-Options:** `nosniff` (MIME sniffing defense)
   - **Referrer-Policy:** `strict-origin-when-cross-origin` (Protects referrer data)
   - **X-XSS-Protection:** `1; mode=block` (Cross-site scripting protection for older browsers)
   - **Content-Security-Policy:** `default-src 'self'; script-src 'self' 'unsafe-inline' 'unsafe-eval' https://cdn.tailwindcss.com https://ajax.googleapis.com https://unpkg.com; style-src 'self' 'unsafe-inline' https://fonts.googleapis.com; font-src 'self' https://fonts.gstatic.com; img-src 'self' data:; connect-src 'self'; frame-ancestors 'none'; object-src 'none';`

---

## Summary of Benefits

By deploying this network-level configuration in front of the ThrustVault server, you achieve:
- **A+ Grade Security Status** on security audits.
- **Enterprise-Grade DDoS Shielding** with automated IP reputation filtering.
- **Compressed JSON payload transmissions** (reducing load time).
- **Zero code changes** to the production Node.js application, preventing regressions.
