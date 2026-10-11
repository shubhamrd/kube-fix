# ==============================================================================
# Production Dockerfile for KubeFix - Kubernetes YAML Validator & Corrector
# ==============================================================================

FROM nginx:1.27-alpine

LABEL maintainer="KubeFix Team"
LABEL description="Kubernetes YAML Validator & Corrector Web Application"
LABEL version="1.0.0"

# Remove default nginx static assets
RUN rm -rf /usr/share/nginx/html/*

# Copy custom Nginx configuration
COPY nginx.conf /etc/nginx/conf.d/default.conf

# Copy application assets
COPY index.html /usr/share/nginx/html/
COPY css/ /usr/share/nginx/html/css/
COPY js/ /usr/share/nginx/html/js/
COPY vendor/ /usr/share/nginx/html/vendor/

# Set proper permissions for static web files
RUN chmod -R 755 /usr/share/nginx/html

# Expose HTTP port
EXPOSE 80

# Health check to ensure nginx is serving traffic
HEALTHCHECK --interval=30s --timeout=3s --retries=3 --start-period=5s \
  CMD wget --quiet --tries=1 --spider http://localhost/healthz || exit 1

# Start Nginx in foreground
CMD ["nginx", "-g", "daemon off;"]
