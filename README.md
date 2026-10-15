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
docker run -d -p 8080:8080 --name kubefix-yaml-validator kubefix-validator:latest
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

### 5. AWS Lambda Deployment (Serverless Container)

KubeFix is optimized to run as a serverless container on **AWS Lambda** using the [AWS Lambda Web Adapter](https://github.com/aws/aws-lambda-web-adapter). The container runs Nginx on port `8080`, with PID and temporary cache directories relocated to `/tmp` to support Lambda's read-only root filesystem.

#### Step 1: Create an Amazon ECR Repository
```bash
aws ecr create-repository \
  --repository-name kubefix-validator \
  --image-scanning-configuration scanOnPush=true \
  --region <your-region>
```

#### Step 2: Authenticate Docker to Amazon ECR
```bash
aws ecr get-login-password --region <your-region> | \
  docker login --username AWS --password-stdin <aws-account-id>.dkr.ecr.<your-region>.amazonaws.com
```

#### Step 3: Build & Push the Image
Build for `linux/amd64` (or `linux/arm64` if using AWS Graviton2):
```bash
# Tag variable
ECR_URI="<aws-account-id>.dkr.ecr.<your-region>.amazonaws.com/kubefix-validator:latest"

# Build and tag
docker buildx build --platform linux/amd64 -t $ECR_URI --push .
```

#### Step 4: Create the Lambda Function
```bash
aws lambda create-function \
  --function-name kubefix-validator \
  --package-type Image \
  --code ImageUri=$ECR_URI \
  --role arn:aws:iam::<aws-account-id>:role/<lambda-execution-role> \
  --timeout 15 \
  --memory-size 256 \
  --region <your-region>
```

> [!TIP]
> **Resource Sizing**: 256 MB RAM and a 15-second timeout provide optimal performance and negligible cost. Cold starts are typically sub-second.

#### Step 5: Enable Lambda Function URL (Public Web Access)
The simplest and most cost-effective way to expose KubeFix on AWS is via a **Function URL**:

```bash
# Create Function URL with public access
aws lambda create-function-url-config \
  --function-name kubefix-validator \
  --auth-type NONE \
  --region <your-region>

# Allow public invocations
aws lambda add-permission \
  --function-name kubefix-validator \
  --statement-id FunctionURLAllowPublicAccess \
  --action lambda:InvokeFunctionUrl \
  --principal "*" \
  --function-url-auth-type NONE \
  --region <your-region>
```

The output will contain your function's public URL (e.g., `https://<unique-id>.lambda-url.<region>.on.aws/`). Open this URL in any browser to use KubeFix!

*(Optional: If routing through Amazon API Gateway REST API with a stage prefix such as `/prod`, set the environment variable `AWS_LWA_REMOVE_BASE_PATH=/prod` in your Lambda function configuration).*

---

## Keyboard Shortcuts

| Shortcut | Action |
| :--- | :--- |
| `Ctrl + Enter` / `Cmd + Enter` | Run Validation & Analysis |
| `Ctrl + Shift + K` / `Cmd + Shift + K` | Auto-Fix All Issues |
| `Ctrl + Shift + F` / `Cmd + Shift + F` | Prettify & Reformat YAML |
| `Tab` | Indent with 2 spaces |
| `Escape` | Close modals |
