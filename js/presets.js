/**
 * Pre-configured Kubernetes YAML presets for testing and demonstration.
 */

const K8S_PRESETS = {
  indentationErrors: {
    name: 'Indentation & Mapping Errors (Fixable)',
    description: 'Contains broken mapping indentation, unindented metadata keys, and misaligned list properties.',
    yaml: `apiVersion: apps/v1
kind: Deployment
metadata:
name: nginx-deployment
spec:
  replicas: 3
  selector:
    matchLabels:
      app: nginx
  template:
    metadata:
      labels:
        app: nginx
    spec:
      containers:
        - name: nginx
        image: nginx:1.14.2
        ports:
        - containerPort: 80
`
  },

  deprecatedApis: {
    name: 'Deprecated APIs & Legacy Ingress (Fixable)',
    description: 'Uses retired extensions/v1beta1 apiVersion and old Ingress serviceName/servicePort schema.',
    yaml: `apiVersion: extensions/v1beta1
kind: Deployment
metadata:
  name: legacy-frontend
  namespace: default
  labels:
    app: frontend
spec:
  replicas: 2
  template:
    metadata:
      labels:
        app: frontend
    spec:
      containers:
        - name: web
          image: nginx:1.21
          ports:
            - containerPort: 80
---
apiVersion: extensions/v1beta1
kind: Ingress
metadata:
  name: frontend-ingress
spec:
  rules:
    - host: app.example.com
      http:
        paths:
          - path: /
            backend:
              serviceName: legacy-frontend
              servicePort: 80
---
apiVersion: batch/v1beta1
kind: CronJob
metadata:
  name: database-backup
spec:
  schedule: "0 2 * * *"
  jobTemplate:
    spec:
      template:
        spec:
          containers:
            - name: backup
              image: postgres:15-alpine
          restartPolicy: OnFailure
`
  },

  tabsAndSyntax: {
    name: 'Tab Characters & Plaintext Secret (Fixable)',
    description: 'Contains forbidden YAML tab characters and unencoded plaintext secret data.',
    yaml: `apiVersion: v1
kind: Secret
metadata:
	name: db-credentials
type: Opaque
data:
	username: admin_user_plain
	password: super_secret_pass_123!
---
apiVersion: apps/v1
kind: Deployment
metadata:
	name: db-client
spec:
	selector:
		matchLabels:
			app: db-client
	template:
		metadata:
			labels:
				app: db-client
		spec:
			containers:
				- name: client
				  image: alpine:latest
`
  },

  selectorMismatch: {
    name: 'Selector Mismatch & Missing MatchLabels (Fixable)',
    description: 'Deployment with missing or mismatched matchLabels that will fail during cluster deployment.',
    yaml: `apiVersion: apps/v1
kind: Deployment
metadata:
  name: inventory-api
  labels:
    app: inventory
spec:
  replicas: 2
  template:
    metadata:
      labels:
        app: inventory
        version: v1
    spec:
      containers:
        - name: api
          image: inventory-app:latest
          ports:
            - containerPort: 3000
---
apiVersion: v1
kind: Service
metadata:
  name: inventory-svc
spec:
  ports:
    - port: 80
      targetPort: 3000
`
  },

  validStack: {
    name: 'Production Microservice (Valid A+)',
    description: 'Fully compliant Deployment, Service, and Ingress with modern v1 APIs and security hardening.',
    yaml: `apiVersion: apps/v1
kind: Deployment
metadata:
  name: payment-service
  namespace: production
  labels:
    app: payment-service
    tier: backend
spec:
  replicas: 3
  selector:
    matchLabels:
      app: payment-service
  template:
    metadata:
      labels:
        app: payment-service
    spec:
      securityContext:
        runAsNonRoot: true
        seccompProfile:
          type: RuntimeDefault
      containers:
        - name: payment-api
          image: ghcr.io/org/payment-service:v2.4.1
          imagePullPolicy: IfNotPresent
          ports:
            - containerPort: 8080
              name: http
          resources:
            requests:
              cpu: 250m
              memory: 256Mi
            limits:
              cpu: 500m
              memory: 512Mi
          securityContext:
            allowPrivilegeEscalation: false
            readOnlyRootFilesystem: true
            runAsNonRoot: true
            capabilities:
              drop:
                - ALL
          livenessProbe:
            httpGet:
              path: /healthz
              port: 8080
            initialDelaySeconds: 15
            periodSeconds: 20
          readinessProbe:
            httpGet:
              path: /ready
              port: 8080
            initialDelaySeconds: 5
            periodSeconds: 10
---
apiVersion: v1
kind: Service
metadata:
  name: payment-service
  namespace: production
  labels:
    app: payment-service
spec:
  type: ClusterIP
  selector:
    app: payment-service
  ports:
    - name: http
      port: 80
      targetPort: 8080
      protocol: TCP
---
apiVersion: networking.k8s.io/v1
kind: Ingress
metadata:
  name: payment-ingress
  namespace: production
  annotations:
    kubernetes.io/ingress.class: nginx
spec:
  rules:
    - host: payments.example.com
      http:
        paths:
          - path: /
            pathType: Prefix
            backend:
              service:
                name: payment-service
                port:
                  number: 80
`
  }
};

if (typeof window !== 'undefined') {
  window.K8S_PRESETS = K8S_PRESETS;
}
