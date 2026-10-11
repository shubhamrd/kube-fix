/**
 * Kubernetes Schema & Deprecation Database
 * Contains known API versions, deprecation mappings, and validation rules.
 */

const K8S_SCHEMAS = {
  // Canonical modern apiVersion for each Kind
  canonicalApis: {
    Pod: 'v1',
    Service: 'v1',
    ConfigMap: 'v1',
    Secret: 'v1',
    Namespace: 'v1',
    PersistentVolume: 'v1',
    PersistentVolumeClaim: 'v1',
    ServiceAccount: 'v1',
    Endpoints: 'v1',
    LimitRange: 'v1',
    ResourceQuota: 'v1',

    Deployment: 'apps/v1',
    DaemonSet: 'apps/v1',
    StatefulSet: 'apps/v1',
    ReplicaSet: 'apps/v1',

    Job: 'batch/v1',
    CronJob: 'batch/v1',

    Ingress: 'networking.k8s.io/v1',
    IngressClass: 'networking.k8s.io/v1',
    NetworkPolicy: 'networking.k8s.io/v1',

    HorizontalPodAutoscaler: 'autoscaling/v2',

    Role: 'rbac.authorization.k8s.io/v1',
    ClusterRole: 'rbac.authorization.k8s.io/v1',
    RoleBinding: 'rbac.authorization.k8s.io/v1',
    ClusterRoleBinding: 'rbac.authorization.k8s.io/v1',

    PodDisruptionBudget: 'policy/v1',
    CustomResourceDefinition: 'apiextensions.k8s.io/v1',
    StorageClass: 'storage.k8s.io/v1',
    CSINode: 'storage.k8s.io/v1',
    CSIDriver: 'storage.k8s.io/v1',
    CertificateSigningRequest: 'certificates.k8s.io/v1'
  },

  // Deprecated apiVersions and their modern replacements
  deprecatedApis: {
    'extensions/v1beta1': {
      Deployment: 'apps/v1',
      DaemonSet: 'apps/v1',
      ReplicaSet: 'apps/v1',
      Ingress: 'networking.k8s.io/v1',
      NetworkPolicy: 'networking.k8s.io/v1',
      PodSecurityPolicy: 'policy/v1beta1 (Removed in v1.25 - migrate to Pod Security Admission)'
    },
    'apps/v1beta1': {
      Deployment: 'apps/v1',
      StatefulSet: 'apps/v1',
      DaemonSet: 'apps/v1',
      ReplicaSet: 'apps/v1'
    },
    'apps/v1beta2': {
      Deployment: 'apps/v1',
      StatefulSet: 'apps/v1',
      DaemonSet: 'apps/v1',
      ReplicaSet: 'apps/v1'
    },
    'networking.k8s.io/v1beta1': {
      Ingress: 'networking.k8s.io/v1',
      IngressClass: 'networking.k8s.io/v1'
    },
    'batch/v1beta1': {
      CronJob: 'batch/v1'
    },
    'autoscaling/v2beta1': {
      HorizontalPodAutoscaler: 'autoscaling/v2'
    },
    'autoscaling/v2beta2': {
      HorizontalPodAutoscaler: 'autoscaling/v2'
    },
    'rbac.authorization.k8s.io/v1beta1': {
      Role: 'rbac.authorization.k8s.io/v1',
      ClusterRole: 'rbac.authorization.k8s.io/v1',
      RoleBinding: 'rbac.authorization.k8s.io/v1',
      ClusterRoleBinding: 'rbac.authorization.k8s.io/v1'
    },
    'rbac.authorization.k8s.io/v1alpha1': {
      Role: 'rbac.authorization.k8s.io/v1',
      ClusterRole: 'rbac.authorization.k8s.io/v1',
      RoleBinding: 'rbac.authorization.k8s.io/v1',
      ClusterRoleBinding: 'rbac.authorization.k8s.io/v1'
    },
    'policy/v1beta1': {
      PodDisruptionBudget: 'policy/v1'
    },
    'apiextensions.k8s.io/v1beta1': {
      CustomResourceDefinition: 'apiextensions.k8s.io/v1'
    },
    'storage.k8s.io/v1beta1': {
      StorageClass: 'storage.k8s.io/v1',
      CSINode: 'storage.k8s.io/v1',
      CSIDriver: 'storage.k8s.io/v1'
    },
    'certificates.k8s.io/v1beta1': {
      CertificateSigningRequest: 'certificates.k8s.io/v1'
    }
  },

  // Recommended default security context for container hardening
  hardenedContainerSecurityContext: {
    allowPrivilegeEscalation: false,
    readOnlyRootFilesystem: true,
    runAsNonRoot: true,
    capabilities: {
      drop: ['ALL']
    }
  },

  // Recommended default pod security context
  hardenedPodSecurityContext: {
    runAsNonRoot: true,
    seccompProfile: {
      type: 'RuntimeDefault'
    }
  },

  // Baseline recommended resource quotas
  recommendedResources: {
    requests: {
      cpu: '100m',
      memory: '128Mi'
    },
    limits: {
      cpu: '500m',
      memory: '512Mi'
    }
  },

  // Standard regex patterns
  patterns: {
    // RFC 1123 DNS subdomain (lowercase alphanumeric, hyphens, periods; max 253 chars)
    dnsSubdomain: /^[a-z0-9]([-a-z0-9.]*[a-z0-9])?$/,
    // RFC 1123 DNS label (lowercase alphanumeric, hyphens; max 63 chars)
    dnsLabel: /^[a-z0-9]([-a-z0-9]*[a-z0-9])?$/,
    // Kubernetes CPU value: e.g. "100m", "0.5", "1", "2500m"
    cpu: /^([0-9]+(\.[0-9]+)?|[0-9]+m)$/,
    // Kubernetes Memory value: e.g. "128Mi", "1Gi", "512M", "1000000"
    memory: /^[0-9]+(\.[0-9]+)?(E|P|T|G|M|k|Ei|Pi|Ti|Gi|Mi|Ki)?$/
  }
};

// Export to window if in browser environment
if (typeof window !== 'undefined') {
  window.K8S_SCHEMAS = K8S_SCHEMAS;
}
