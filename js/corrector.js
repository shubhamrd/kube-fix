/**
 * Kubernetes YAML Corrector Engine
 * Provides automated remediations, specific quick-fixes, indentation repair, formatting, and diff generation.
 */

class K8sYamlCorrector {
  constructor() {
    this.schemas = window.K8S_SCHEMAS || {};
  }

  /**
   * Replace all tab characters with 2 spaces
   */
  replaceTabs(yamlText) {
    return yamlText.replace(/\t/g, '  ');
  }

  /**
   * Multi-pass intelligent YAML Indentation & Structural Repair
   * Repairs misaligned list items, unindented children, odd spaces, and syntax issues.
   */
  fixIndentation(yamlText) {
    if (!yamlText || yamlText.trim() === '') return yamlText;

    let cleaned = yamlText.replace(/\r\n/g, '\n').replace(/\r/g, '\n');

    // Pass 1: Replace tabs with 2 spaces
    cleaned = cleaned.replace(/\t/g, '  ');

    // Pass 2: Un-indent document separators ('---')
    cleaned = cleaned
      .split('\n')
      .map(line => (line.trim() === '---' ? '---' : line))
      .join('\n');

    // Pass 3: Fix missing space after colons (e.g. key:val -> key: val)
    cleaned = cleaned
      .split('\n')
      .map(line => {
        if (line.includes('http://') || line.includes('https://') || line.trim().startsWith('#')) {
          return line;
        }
        return line.replace(/^(\s*[a-zA-Z0-9_\-\.]+):([^\s\/\"'].*)$/, '$1: $2');
      })
      .join('\n');

    // Pass 4: Normalize odd indentation steps (e.g. 3 spaces -> 2 spaces, 5 -> 4)
    cleaned = cleaned
      .split('\n')
      .map(line => {
        if (!line.trim() || line.trim().startsWith('#') || line.trim() === '---') return line;
        const match = line.match(/^(\s*)(.*)$/);
        const spaces = match[1].length;
        const content = match[2];
        if (spaces % 2 !== 0) {
          return ' '.repeat(Math.max(0, spaces - 1)) + content;
        }
        return line;
      })
      .join('\n');

    let lines = cleaned.split('\n');

    // Pass 5: Fix empty mapping headers followed by unindented children or lists
    for (let i = 0; i < lines.length - 1; i++) {
      const curr = lines[i];
      const next = lines[i + 1];
      const currTrim = curr.trim();
      const nextTrim = next.trim();

      if (currTrim.endsWith(':') && !currTrim.startsWith('#') && currTrim !== '---') {
        const currIndent = curr.search(/\S|$/);
        const nextIndent = next.search(/\S|$/);
        if (nextTrim && !nextTrim.startsWith('#') && nextTrim !== '---') {
          // If child line is not indented deeper than parent mapping key
          if (nextIndent <= currIndent) {
            lines[i + 1] = ' '.repeat(currIndent + 2) + nextTrim;
          }
        }
      }
    }

    // Pass 6: Fix misaligned list item properties
    // (properties under '- name: ...' that don't have '-' but have the same indent as '-')
    let currentListIndent = -1;
    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      const trim = line.trim();
      if (!trim || trim.startsWith('#') || trim === '---') {
        currentListIndent = -1;
        continue;
      }

      const indent = line.search(/\S|$/);

      if (trim.startsWith('- ')) {
        currentListIndent = indent;
      } else if (currentListIndent !== -1) {
        if (indent < currentListIndent) {
          currentListIndent = -1;
        } else if (indent === currentListIndent) {
          // Indent by 2 spaces to align with list properties
          lines[i] = ' '.repeat(indent + 2) + trim;
        }
      }
    }

    cleaned = lines.join('\n');

    // Pass 7: Verify with jsyaml.loadAll and format cleanly
    try {
      if (typeof jsyaml !== 'undefined') {
        const docs = jsyaml.loadAll(cleaned);
        const formatted = docs
          .filter(d => d !== null && d !== undefined)
          .map(d => jsyaml.dump(d, { indent: 2, lineWidth: -1, noRefs: true }).trim());
        return formatted.join('\n---\n') + '\n';
      }
      return cleaned;
    } catch (err) {
      // If jsyaml still encounters an issue at err.mark.line, attempt targeted line adjustment
      if (err.mark && typeof jsyaml !== 'undefined') {
        const errLine = err.mark.line;
        const retryLines = cleaned.split('\n');

        if (errLine < retryLines.length) {
          // Attempt 1: Indent line +2 spaces
          const copy1 = [...retryLines];
          copy1[errLine] = '  ' + copy1[errLine];
          try {
            const docs = jsyaml.loadAll(copy1.join('\n'));
            const formatted = docs
              .filter(d => d !== null && d !== undefined)
              .map(d => jsyaml.dump(d, { indent: 2, lineWidth: -1, noRefs: true }).trim());
            return formatted.join('\n---\n') + '\n';
          } catch (e1) {}

          // Attempt 2: Outdent line -2 spaces
          const copy2 = [...retryLines];
          if (copy2[errLine].startsWith('  ')) {
            copy2[errLine] = copy2[errLine].substring(2);
            try {
              const docs = jsyaml.loadAll(copy2.join('\n'));
              const formatted = docs
                .filter(d => d !== null && d !== undefined)
                .map(d => jsyaml.dump(d, { indent: 2, lineWidth: -1, noRefs: true }).trim());
              return formatted.join('\n---\n') + '\n';
            } catch (e2) {}
          }
        }
      }

      return cleaned;
    }
  }

  /**
   * Prettify and reformat YAML using 2 spaces indentation
   */
  prettify(yamlText) {
    try {
      const indentationFixed = this.fixIndentation(yamlText);
      const docs = jsyaml.loadAll(indentationFixed);
      const formattedDocs = docs
        .filter(d => d !== null && d !== undefined)
        .map(d => jsyaml.dump(d, { indent: 2, lineWidth: -1, noRefs: true }).trim());
      return formattedDocs.join('\n---\n') + '\n';
    } catch (e) {
      console.warn('Prettify failed to parse YAML, returning indentation-fixed text:', e);
      return this.fixIndentation(yamlText);
    }
  }

  /**
   * Fix ALL issues across the YAML: indentation, syntax, schemas, security, and deprecations
   */
  fixAll(yamlText) {
    // Step 1: Repair indentation and raw syntax
    let currentText = this.fixIndentation(yamlText);

    try {
      const docs = jsyaml.loadAll(currentText);
      const modifiedDocs = [];

      docs.forEach(doc => {
        if (!doc || typeof doc !== 'object') {
          if (doc !== null && doc !== undefined) modifiedDocs.push(doc);
          return;
        }

        const fixedDoc = JSON.parse(JSON.stringify(doc));

        // 1. Fix Kind casing
        if (fixedDoc.kind && typeof fixedDoc.kind === 'string') {
          fixedDoc.kind = fixedDoc.kind.charAt(0).toUpperCase() + fixedDoc.kind.slice(1);
        }

        // 2. Fix Deprecated apiVersion
        if (fixedDoc.apiVersion && fixedDoc.kind) {
          const depMap = this.schemas.deprecatedApis && this.schemas.deprecatedApis[fixedDoc.apiVersion];
          if (depMap && depMap[fixedDoc.kind]) {
            fixedDoc.apiVersion = depMap[fixedDoc.kind];
          }
        }

        // 3. Fix Metadata Name RFC1123
        if (fixedDoc.metadata && fixedDoc.metadata.name) {
          fixedDoc.metadata.name = this.sanitizeRfc1123Name(fixedDoc.metadata.name);
        }

        // 4. Fix Non-string Labels
        if (fixedDoc.metadata && fixedDoc.metadata.labels && typeof fixedDoc.metadata.labels === 'object') {
          Object.keys(fixedDoc.metadata.labels).forEach(k => {
            fixedDoc.metadata.labels[k] = String(fixedDoc.metadata.labels[k]);
          });
        }

        // 5. Workload Selector and Pod Template sync
        if (['Deployment', 'StatefulSet', 'DaemonSet', 'ReplicaSet'].includes(fixedDoc.kind)) {
          this.remediateWorkloadSelectors(fixedDoc);
        }

        // 6. Ingress v1 Schema Migration
        if (fixedDoc.kind === 'Ingress') {
          this.remediateIngress(fixedDoc);
        }

        // 7. Secret Data Plaintext to Base64
        if (fixedDoc.kind === 'Secret') {
          this.remediateSecret(fixedDoc);
        }

        // 8. Pod/Container Resources & Security Context
        this.remediateContainers(fixedDoc);

        modifiedDocs.push(fixedDoc);
      });

      const formatted = modifiedDocs.map(d =>
        jsyaml.dump(d, { indent: 2, lineWidth: -1, noRefs: true }).trim()
      );

      return formatted.join('\n---\n') + '\n';
    } catch (e) {
      console.warn('Post-indentation remediation fallback:', e);
      return currentText;
    }
  }

  /**
   * Apply a specific quick fix based on issue properties
   */
  applySingleFix(yamlText, issue) {
    if (issue.fixType === 'replace_tabs' || issue.fixType === 'fix_indentation' || issue.fixType === 'syntax_fix') {
      return this.fixIndentation(yamlText);
    }

    try {
      let currentText = this.fixIndentation(yamlText);
      const docs = jsyaml.loadAll(currentText);

      const targetDocIdx = issue.docIndex || 0;
      if (!docs[targetDocIdx] || typeof docs[targetDocIdx] !== 'object') {
        return yamlText;
      }

      const doc = docs[targetDocIdx];

      switch (issue.fixType) {
        case 'update_api_version':
          if (issue.fixData && issue.fixData.newApiVersion) {
            doc.apiVersion = issue.fixData.newApiVersion;
          }
          break;

        case 'fix_kind_casing':
          if (issue.fixData && issue.fixData.correctKind) {
            doc.kind = issue.fixData.correctKind;
          }
          break;

        case 'sanitize_name':
          if (doc.metadata && doc.metadata.name) {
            doc.metadata.name = this.sanitizeRfc1123Name(doc.metadata.name);
          }
          break;

        case 'quote_label_value':
          if (doc.metadata && doc.metadata.labels && issue.fixData) {
            doc.metadata.labels[issue.fixData.key] = String(issue.fixData.value);
          }
          break;

        case 'add_selector_from_template':
        case 'sync_template_labels':
          this.remediateWorkloadSelectors(doc);
          break;

        case 'migrate_ingress_v1':
        case 'add_ingress_pathtype':
          this.remediateIngress(doc);
          break;

        case 'base64_encode_secret':
          if (doc.kind === 'Secret' && doc.data && issue.fixData) {
            doc.data[issue.fixData.key] = this.toBase64(issue.fixData.value);
          }
          break;

        case 'inject_recommended_resources':
          this.injectContainerResources(doc, issue.fixData ? issue.fixData.containerName : null);
          break;

        case 'harden_container_security':
          this.hardenContainerSecurity(doc, issue.fixData ? issue.fixData.containerName : null);
          break;

        case 'remove_privileged':
          this.removePrivileged(doc, issue.fixData ? issue.fixData.containerName : null);
          break;

        case 'set_image_pull_policy_always':
          this.setImagePullPolicy(doc, issue.fixData ? issue.fixData.containerName : null, 'Always');
          break;

        case 'add_pod_security_context':
          this.addPodSecurityContext(doc);
          break;

        default:
          return yamlText;
      }

      const formatted = docs.map(d =>
        jsyaml.dump(d, { indent: 2, lineWidth: -1, noRefs: true }).trim()
      );

      return formatted.join('\n---\n') + '\n';
    } catch (e) {
      console.error('Failed to apply single fix:', e);
      return this.fixIndentation(yamlText);
    }
  }

  /**
   * Remediate Workload Selectors (Deployment, StatefulSet, DaemonSet)
   */
  remediateWorkloadSelectors(doc) {
    if (!doc.spec) doc.spec = {};

    let templateLabels = {};
    if (doc.spec.template && doc.spec.template.metadata && doc.spec.template.metadata.labels) {
      templateLabels = { ...doc.spec.template.metadata.labels };
    } else {
      const defaultAppLabel = doc.metadata && doc.metadata.name ? doc.metadata.name : 'app';
      templateLabels = { app: defaultAppLabel };
      if (!doc.spec.template) doc.spec.template = {};
      if (!doc.spec.template.metadata) doc.spec.template.metadata = {};
      doc.spec.template.metadata.labels = templateLabels;
    }

    if (!doc.spec.selector) {
      doc.spec.selector = { matchLabels: { ...templateLabels } };
    } else if (!doc.spec.selector.matchLabels) {
      doc.spec.selector.matchLabels = { ...templateLabels };
    } else {
      Object.keys(doc.spec.selector.matchLabels).forEach(k => {
        if (!doc.spec.template.metadata.labels) {
          doc.spec.template.metadata.labels = {};
        }
        doc.spec.template.metadata.labels[k] = doc.spec.selector.matchLabels[k];
      });
    }
  }

  /**
   * Remediate Ingress manifest to modern v1 specification
   */
  remediateIngress(doc) {
    doc.apiVersion = 'networking.k8s.io/v1';

    if (doc.spec && doc.spec.rules && Array.isArray(doc.spec.rules)) {
      doc.spec.rules.forEach(rule => {
        if (rule.http && rule.http.paths && Array.isArray(rule.http.paths)) {
          rule.http.paths.forEach(p => {
            if (!p.pathType) {
              p.pathType = 'Prefix';
            }

            if (p.backend) {
              if (p.backend.serviceName || p.backend.servicePort) {
                const sName = p.backend.serviceName || 'service-name';
                const sPort = p.backend.servicePort || 80;
                const portObj = typeof sPort === 'number' ? { number: sPort } : { name: String(sPort) };

                p.backend = {
                  service: {
                    name: sName,
                    port: portObj
                  }
                };
              }
            }
          });
        }
      });
    }
  }

  /**
   * Remediate Secret unencoded data
   */
  remediateSecret(doc) {
    if (doc.data && typeof doc.data === 'object') {
      const base64Regex = /^[A-Za-z0-9+/=]+$/;
      Object.keys(doc.data).forEach(k => {
        const valStr = String(doc.data[k]).trim();
        if (!base64Regex.test(valStr) || valStr.length % 4 !== 0) {
          doc.data[k] = this.toBase64(valStr);
        }
      });
    }
  }

  /**
   * Remediate container specs (resources, security context)
   */
  remediateContainers(doc) {
    let podSpec = null;
    if (doc.kind === 'Pod' && doc.spec) {
      podSpec = doc.spec;
    } else if (doc.spec && doc.spec.template && doc.spec.template.spec) {
      podSpec = doc.spec.template.spec;
    }

    if (!podSpec || !podSpec.containers || !Array.isArray(podSpec.containers)) return;

    if (!podSpec.securityContext) {
      podSpec.securityContext = {
        runAsNonRoot: true,
        seccompProfile: { type: 'RuntimeDefault' }
      };
    }

    podSpec.containers.forEach(c => {
      if (!c.resources) {
        c.resources = {
          requests: { cpu: '100m', memory: '128Mi' },
          limits: { cpu: '500m', memory: '512Mi' }
        };
      } else {
        if (!c.resources.requests) {
          c.resources.requests = { cpu: '100m', memory: '128Mi' };
        }
        if (!c.resources.limits) {
          c.resources.limits = { cpu: '500m', memory: '512Mi' };
        }
      }

      if (!c.securityContext) {
        c.securityContext = {
          allowPrivilegeEscalation: false,
          readOnlyRootFilesystem: true,
          runAsNonRoot: true,
          capabilities: { drop: ['ALL'] }
        };
      } else {
        if (c.securityContext.privileged === true) {
          delete c.securityContext.privileged;
        }
        if (c.securityContext.allowPrivilegeEscalation === undefined) {
          c.securityContext.allowPrivilegeEscalation = false;
        }
        if (c.securityContext.runAsNonRoot === undefined) {
          c.securityContext.runAsNonRoot = true;
        }
      }

      if (c.image && c.image.endsWith(':latest')) {
        c.imagePullPolicy = 'Always';
      }
    });
  }

  injectContainerResources(doc, containerName) {
    this.modifyContainers(doc, containerName, c => {
      if (!c.resources) {
        c.resources = {
          requests: { cpu: '100m', memory: '128Mi' },
          limits: { cpu: '500m', memory: '512Mi' }
        };
      } else {
        if (!c.resources.requests) c.resources.requests = { cpu: '100m', memory: '128Mi' };
        if (!c.resources.limits) c.resources.limits = { cpu: '500m', memory: '512Mi' };
      }
    });
  }

  hardenContainerSecurity(doc, containerName) {
    this.modifyContainers(doc, containerName, c => {
      if (!c.securityContext) {
        c.securityContext = {
          allowPrivilegeEscalation: false,
          readOnlyRootFilesystem: true,
          runAsNonRoot: true,
          capabilities: { drop: ['ALL'] }
        };
      } else {
        c.securityContext.allowPrivilegeEscalation = false;
        c.securityContext.runAsNonRoot = true;
        if (c.securityContext.privileged === true) {
          delete c.securityContext.privileged;
        }
      }
    });
  }

  removePrivileged(doc, containerName) {
    this.modifyContainers(doc, containerName, c => {
      if (c.securityContext) {
        delete c.securityContext.privileged;
      }
    });
  }

  setImagePullPolicy(doc, containerName, policy) {
    this.modifyContainers(doc, containerName, c => {
      c.imagePullPolicy = policy;
    });
  }

  addPodSecurityContext(doc) {
    let podSpec = null;
    if (doc.kind === 'Pod' && doc.spec) podSpec = doc.spec;
    else if (doc.spec && doc.spec.template && doc.spec.template.spec) podSpec = doc.spec.template.spec;

    if (podSpec) {
      podSpec.securityContext = {
        runAsNonRoot: true,
        seccompProfile: { type: 'RuntimeDefault' }
      };
    }
  }

  modifyContainers(doc, containerName, callback) {
    let containers = [];
    if (doc.kind === 'Pod' && doc.spec && doc.spec.containers) {
      containers = doc.spec.containers;
    } else if (doc.spec && doc.spec.template && doc.spec.template.spec && doc.spec.template.spec.containers) {
      containers = doc.spec.template.spec.containers;
    }

    containers.forEach(c => {
      if (!containerName || c.name === containerName) {
        callback(c);
      }
    });
  }

  sanitizeRfc1123Name(name) {
    return String(name)
      .toLowerCase()
      .replace(/[^a-z0-9-.]/g, '-')
      .replace(/^-+|-+$/g, '')
      .substring(0, 253);
  }

  toBase64(str) {
    try {
      return btoa(unescape(encodeURIComponent(str)));
    } catch (e) {
      return btoa(str);
    }
  }

  /**
   * Generate line-by-line diff comparing original vs corrected YAML
   */
  computeDiff(oldText, newText) {
    const oldLines = oldText.split('\n');
    const newLines = newText.split('\n');
    const diff = [];

    let oIdx = 0;
    let nIdx = 0;

    while (oIdx < oldLines.length || nIdx < newLines.length) {
      const oLine = oldLines[oIdx];
      const nLine = newLines[nIdx];

      if (oLine === nLine) {
        diff.push({
          type: 'unchanged',
          oldLineNumber: oIdx + 1,
          newLineNumber: nIdx + 1,
          content: oLine
        });
        oIdx++;
        nIdx++;
      } else if (oIdx < oldLines.length && (nIdx >= newLines.length || !newLines.includes(oLine))) {
        diff.push({
          type: 'removed',
          oldLineNumber: oIdx + 1,
          newLineNumber: null,
          content: oLine
        });
        oIdx++;
      } else if (nIdx < newLines.length && (oIdx >= oldLines.length || !oldLines.includes(nLine))) {
        diff.push({
          type: 'added',
          oldLineNumber: null,
          newLineNumber: nIdx + 1,
          content: nLine
        });
        nIdx++;
      } else {
        diff.push({
          type: 'removed',
          oldLineNumber: oIdx + 1,
          newLineNumber: null,
          content: oLine
        });
        diff.push({
          type: 'added',
          oldLineNumber: null,
          newLineNumber: nIdx + 1,
          content: nLine
        });
        oIdx++;
        nIdx++;
      }
    }

    return diff;
  }
}

if (typeof window !== 'undefined') {
  window.K8sYamlCorrector = K8sYamlCorrector;
}
