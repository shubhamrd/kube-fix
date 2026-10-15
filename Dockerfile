# ==============================================================================
# Production Dockerfile for KubeFix - AWS Lambda & Container Compatible
# ==============================================================================

FROM nginx:1.27-alpine

LABEL maintainer="KubeFix Team"
LABEL description="Kubernetes YAML Validator & Corrector Web Application for AWS Lambda"
LABEL version="1.1.0"

# Install libc6-compat for Alpine compatibility with AWS Lambda Web Adapter binary
RUN apk add --no-cache libc6-compat

# Copy AWS Lambda Web Adapter binary from public ECR
COPY --from=public.ecr.aws/awsguru/aws-lambda-adapter:1.1.0 /lambda-adapter /opt/extensions/lambda-adapter

# Remove default nginx static assets and existing default configs
RUN rm -rf /usr/share/nginx/html/* /etc/nginx/conf.d/*

# Copy unified Nginx configuration to /etc/nginx/nginx.conf
COPY nginx.conf /etc/nginx/nginx.conf

# Copy application assets
COPY index.html /usr/share/nginx/html/
COPY css/ /usr/share/nginx/html/css/
COPY js/ /usr/share/nginx/html/js/
COPY vendor/ /usr/share/nginx/html/vendor/

# Set proper permissions for static web files
RUN chmod -R 755 /usr/share/nginx/html

# Configure AWS Lambda Web Adapter defaults
ENV PORT=8080 \
    AWS_LWA_PORT=8080 \
    AWS_LWA_READINESS_CHECK_PATH=/healthz

# Expose HTTP port
EXPOSE 8080

# Health check to ensure nginx is serving traffic
HEALTHCHECK --interval=30s --timeout=3s --retries=3 --start-period=5s \
  CMD wget --quiet --tries=1 --spider http://localhost:8080/healthz || exit 1

# Start Nginx in foreground
CMD ["nginx", "-g", "daemon off;"]
