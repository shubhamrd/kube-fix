# KubeFix — Kubernetes YAML Validator & Corrector

A high-performance, client-side web application for validating Kubernetes YAML manifests, detecting syntax errors, migrating deprecated APIs, enforcing security best practices, and applying 1-click automated corrections.

---

## Features

- **YAML Syntax Validation**: Pinpoints tab characters, indentation mismatches, unclosed quotes, and syntax errors with line/column tracking.
- **Kubernetes Schema & API Deprecation**:
  - Automatically identifies deprecated API versions (e.g., `extensions/v1beta1`, `batch/v1beta1`, `networking.k8s.io/v1beta1`) and upgrades them to modern v1 APIs.
  - Validates `metadata.name` RFC 1123 compliance.
  - Enforces string values on labels and annotations.
- **Workload Spec & Selector Synchronization**:
  - Verifies that `spec.selector.matchLabels` matches `spec.template.metadata.labels` to prevent failed rollouts.
  - Auto-injects matching selector definitions when missing.
- **Security Hardening**:
  - Flags `privileged: true` containers and containers running as root (UID 0).
  - Recommends and auto-injects hardened `securityContext` (`runAsNonRoot: true`, `allowPrivilegeEscalation: false`, `readOnlyRootFilesystem: true`, `capabilities.drop: ["ALL"]`).
- **Resource Management**:
  - Identifies containers missing CPU/Memory requests or limits.
  - Auto-injects baseline recommended resource quotas.
- **Ingress v1 Migration**:
  - Detects legacy `serviceName`/`servicePort` structures and converts them to modern `backend.service.name` and `backend.service.port.number`.
  - Ensures `pathType: Prefix` or `Exact` is defined.
- **Plaintext Secret Detection**:
  - Alerts on plaintext strings in Secret `data` and auto-encodes them to Base64.
- **1-Click Auto-Fix & Diff Viewer**:
  - Apply individual quick-fixes per issue or execute "Auto-Fix All".
  - Interactive diff viewer highlighting additions and deletions.
- **Resource Architecture Visualizer**:
  - Interactive visual cards displaying parsed workloads, namespaces, replicas, ports, and container images.
- **100% Client-Side & Private**:
  - All processing runs directly in the browser via Web APIs and `js-yaml`. No manifests or credentials ever leave your computer.

---

## Hosting & Running

Because this application uses standard HTML5, Vanilla CSS, and modern JavaScript with zero backend dependencies, you can host it anywhere:

### 1. Local Preview
Using Python:
```bash
python3 -m http.server 8080
```
Then open `http://localhost:8080` in your web browser.

Or open `index.html` directly in any web browser (`file:///.../yaml-validtor/index.html`).

### 2. GitHub Pages
1. Push the `yaml-validtor` directory or repository to GitHub.
2. Go to **Settings** > **Pages**.
3. Choose the branch and folder (root or `/docs`) and click **Save**.

### 3. Vercel / Netlify / Cloudflare Pages
Simply deploy this directory as a static site. No build command is required (`Publish directory: .`).

### 4. Docker Container Image Execution

#### Build Docker Image
```bash
docker build -t kubefix-validator:latest .
```

#### Run Container
```bash
docker run -d -p 8080:80 --name kubefix-yaml-validator kubefix-validator:latest
```
Access the application at `http://localhost:8080`.

#### Using Docker Compose (Quickest)
```bash
docker compose up -d
```
To stop the container:
```bash
docker compose down
```

---

## Keyboard Shortcuts

| Shortcut | Action |
| :--- | :--- |
| `Ctrl + Enter` / `Cmd + Enter` | Run Validation & Analysis |
| `Ctrl + Shift + K` / `Cmd + Shift + K` | Auto-Fix All Issues |
| `Ctrl + Shift + F` / `Cmd + Shift + F` | Prettify & Reformat YAML |
| `Tab` | Indent with 2 spaces |
| `Escape` | Close modals |
