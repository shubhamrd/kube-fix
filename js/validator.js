/**
 * Kubernetes YAML Validator Engine
 * Performs multi-layer inspection: YAML Indentation, Syntax, K8s Core Schema, and Best Practices.
 */

class K8sYamlValidator {
  constructor() {
    this.schemas = window.K8S_SCHEMAS || {};
  }

  /**
   * Main validation entrypoint.
   * @param {string} yamlText - Raw YAML text
   * @returns {Object} Validation report containing issues, docs, score, summary
   */
  validate(yamlText) {
    const report = {
      isValid: true,
      hasSyntaxError: false,
      issues: [],
      documents: [],
      score: 100,
      grade: 'A+',
      stats: {
        totalResources: 0,
        errors: 0,
        warnings: 0,
        infos: 0,
        fixableCount: 0
      }
    };

    if (!yamlText || yamlText.trim() === '') {
      return report;
    }

    const lines = yamlText.replace(/\r\n/g, '\n').replace(/\r/g, '\n').split('\n');

    // Layer 1: Dedicated Line-by-Line Indentation & Tab Inspection
    this.inspectIndentationAndRawText(lines, report);

    // Layer 2: YAML Syntax Parsing via js-yaml
    let parsedDocs = [];
    try {
      if (typeof jsyaml === 'undefined') {
        throw new Error('YAML parser library (js-yaml) is not loaded.');
      }
      parsedDocs = jsyaml.loadAll(yamlText);
    } catch (yamlErr) {
      report.isValid = false;
      report.hasSyntaxError = true;
      const lineNum = yamlErr.mark ? yamlErr.mark.line + 1 : 1;
      const colNum = yamlErr.mark ? yamlErr.mark.column + 1 : 1;
      const snippet = yamlErr.mark ? yamlErr.mark.snippet : '';
      const lineContent = lines[lineNum - 1] || '';

      // Produce human-friendly indentation error explanation
      const friendlyInfo = this.formatYamlError(yamlErr, lineNum, lineContent);

      report.issues.unshift({
        id: 'syntax_error',
        severity: 'error',
        category: 'Indentation & Syntax',
        docIndex: 0,
        line: lineNum,
        column: colNum,
        message: friendlyInfo.message,
        details: snippet || lineContent,
        fixable: true,
        fixType: 'fix_indentation',
        recommendation: friendlyInfo.recommendation
      });

      this.calculateStats(report);
      return report;
    }

    // Filter out null or comment-only documents from multi-doc YAML
    const validDocs = [];
    parsedDocs.forEach((doc, idx) => {
      if (doc !== null && doc !== undefined) {
        validDocs.push({ data: doc, originalIndex: idx });
      }
    });

    report.stats.totalResources = validDocs.length;

    if (validDocs.length === 0) {
      report.issues.push({
        id: 'empty_yaml',
        severity: 'warning',
        category: 'Structure',
        docIndex: 0,
        line: 1,
        message: 'No Kubernetes resource manifests found in the YAML document.',
        recommendation: 'Add at least one Kubernetes manifest containing apiVersion, kind, and metadata.'
      });
      this.calculateStats(report);
      return report;
    }

    // Layer 3: Kubernetes Semantic & Schema Validation for each resource
    validDocs.forEach((item, docIdx) => {
      const doc = item.data;
      const docContext = {
        docIndex: docIdx,
        docTotal: validDocs.length,
        lines: lines
      };

      report.documents.push({
        index: docIdx,
        apiVersion: doc && doc.apiVersion ? doc.apiVersion : 'Unknown',
        kind: doc && doc.kind ? doc.kind : 'Unknown',
        name: doc && doc.metadata && doc.metadata.name ? doc.metadata.name : 'Unnamed',
        namespace: doc && doc.metadata && doc.metadata.namespace ? doc.metadata.namespace : 'default',
        raw: doc
      });

      this.validateDocument(doc, docContext, report);
    });

    this.calculateStats(report);
    return report;
  }

  /**
   * Format js-yaml syntax and indentation errors into clear, actionable advice
   */
  formatYamlError(yamlErr, lineNum, lineContent) {
    const rawReason = (yamlErr.reason || yamlErr.message || '').toLowerCase();
    let message = `YAML Syntax Error: ${yamlErr.reason || yamlErr.message}`;
    let recommendation = 'Fix invalid indentation, unquoted special characters, or mismatched quotes.';

    if (rawReason.includes('bad indentation of a mapping entry')) {
      message = `Indentation Error: Bad indentation of mapping entry on line ${lineNum} ('${lineContent.trim()}')`;
      recommendation = 'Ensure child properties are indented consistently under their parent mapping or list bullet (use 2 spaces per indentation level).';
    } else if (rawReason.includes('tab characters')) {
      message = `Tab Forbidden Error: Line ${lineNum} contains tab characters for indentation`;
      recommendation = 'YAML strictly forbids tab characters. Use 2 spaces per indentation level instead.';
    } else if (rawReason.includes('colon is missed') || rawReason.includes('implicit mapping pair')) {
      message = `Mapping Syntax Error: Missing space after colon or malformed key-value pair on line ${lineNum}`;
      recommendation = 'Ensure every mapping key is followed by a colon and a space, e.g. "key: value".';
    } else if (rawReason.includes('end of the stream or a document separator')) {
      message = `Document Structure Error: Unexpected token or missing document separator ('---') on line ${lineNum}`;
      recommendation = 'Check indentation of multi-document streams and verify proper "---" separators.';
    }

    return { message, recommendation };
  }

  /**
   * Line-by-line inspection for tabs, uneven spaces, and structural indentation flaws
   */
  inspectIndentationAndRawText(lines, report) {
    let tabCount = 0;
    const tabLines = [];
    let prevHeaderLine = null;
    let prevHeaderIndent = -1;
    let prevHeaderText = '';
    let inList = false;
    let listBulletIndent = -1;
    let listBulletLine = -1;

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      const lineNum = i + 1;
      const trim = line.trim();

      // Check Tabs
      if (line.includes('\t')) {
        tabCount++;
        if (tabLines.length < 5) {
          tabLines.push(lineNum);
        }
      }

      if (!trim || trim.startsWith('#')) {
        continue;
      }

      // Check Indented Document Separator
      if (trim === '---') {
        if (line.startsWith(' ') || line.startsWith('\t')) {
          report.issues.push({
            id: `indented_doc_separator_${lineNum}`,
            severity: 'error',
            category: 'Indentation',
            docIndex: 0,
            line: lineNum,
            message: `Document separator '---' on line ${lineNum} must start at column 1 and cannot be indented.`,
            details: line,
            fixable: true,
            fixType: 'fix_indentation',
            recommendation: 'Remove leading spaces before "---".'
          });
        }
        prevHeaderLine = null;
        inList = false;
        continue;
      }

      const indent = line.search(/\S|$/);

      // Check Odd Indentation Steps (1 space, 3 spaces, 5 spaces)
      if (indent > 0 && indent % 2 !== 0 && !line.includes('\t')) {
        report.issues.push({
          id: `odd_indentation_${lineNum}`,
          severity: 'warning',
          category: 'Indentation',
          docIndex: 0,
          line: lineNum,
          message: `Line ${lineNum} has ${indent} leading spaces (odd indentation). Kubernetes standard is 2 spaces per indentation level.`,
          details: line,
          fixable: true,
          fixType: 'fix_indentation',
          recommendation: `Change indentation on line ${lineNum} to ${Math.max(0, indent - 1)} or ${indent + 1} spaces.`
        });
      }

      // Check Unindented Child Mapping directly following parent ending with ':'
      if (prevHeaderLine !== null) {
        if (!trim.startsWith('- ') && indent <= prevHeaderIndent) {
          // If the child is not indented deeper than parent
          report.issues.push({
            id: `unindented_child_${lineNum}`,
            severity: 'error',
            category: 'Indentation',
            docIndex: 0,
            line: lineNum,
            message: `Indentation error: Line ${lineNum} ('${trim}') is not indented under parent '${prevHeaderText}' on line ${prevHeaderLine}.`,
            details: `Parent on line ${prevHeaderLine}: ${lines[prevHeaderLine - 1]}\nChild on line ${lineNum}: ${line}`,
            fixable: true,
            fixType: 'fix_indentation',
            recommendation: `Indent line ${lineNum} by at least 2 spaces more than line ${prevHeaderLine} (expected indent: ${prevHeaderIndent + 2} spaces).`
          });
        }
        prevHeaderLine = null;
      }

      // Check Misaligned List Item Property
      // e.g.:
      // - name: web
      // image: nginx  <-- same indent as '- ', but lacks '-'
      if (trim.startsWith('- ')) {
        inList = true;
        listBulletIndent = indent;
        listBulletLine = lineNum;
      } else if (inList) {
        if (indent < listBulletIndent) {
          inList = false;
        } else if (indent === listBulletIndent) {
          report.issues.push({
            id: `misaligned_list_property_${lineNum}`,
            severity: 'error',
            category: 'Indentation',
            docIndex: 0,
            line: lineNum,
            message: `Indentation error: Line ${lineNum} ('${trim}') has the same indentation (${indent} spaces) as list item bullet on line ${listBulletLine}.`,
            details: `List bullet on line ${listBulletLine}: ${lines[listBulletLine - 1]}\nMisaligned field on line ${lineNum}: ${line}`,
            fixable: true,
            fixType: 'fix_indentation',
            recommendation: `Indent line ${lineNum} by 2 additional spaces (indent: ${indent + 2} spaces) to align with properties under the list item.`
          });
        }
      }

      // Check if current line is an empty mapping header (e.g. "metadata:", "spec:", "ports:")
      if (trim.endsWith(':')) {
        prevHeaderLine = lineNum;
        prevHeaderIndent = indent;
        prevHeaderText = trim;
      }
    }

    if (tabCount > 0) {
      report.issues.unshift({
        id: 'tabs_detected',
        severity: 'error',
        category: 'Indentation & Syntax',
        docIndex: 0,
        line: tabLines[0],
        message: `Found ${tabCount} tab character(s) on line(s): ${tabLines.join(', ')}${tabCount > 5 ? '...' : ''}. Tabs are forbidden in YAML.`,
        details: 'YAML specification strictly requires spaces (typically 2 spaces per indentation level) instead of tab characters.',
        fixable: true,
        fixType: 'fix_indentation',
        recommendation: 'Replace all tab characters with 2 spaces.'
      });
    }
  }

  /**
   * Validate a single Kubernetes resource document
   */
  validateDocument(doc, context, report) {
    if (typeof doc !== 'object' || Array.isArray(doc)) {
      report.issues.push({
        id: 'invalid_doc_type',
        severity: 'error',
        category: 'Structure',
        docIndex: context.docIndex,
        line: this.findDocStartLine(context.lines, context.docIndex),
        message: `Kubernetes manifest must be a YAML mapping/object, but received ${Array.isArray(doc) ? 'array' : typeof doc}.`,
        recommendation: 'Structure the document as an object with apiVersion, kind, and metadata.'
      });
      return;
    }

    const docLineStart = this.findDocStartLine(context.lines, context.docIndex);

    // 1. Check apiVersion
    if (!doc.apiVersion) {
      report.issues.push({
        id: 'missing_api_version',
        severity: 'error',
        category: 'Schema',
        docIndex: context.docIndex,
        line: docLineStart,
        message: 'Missing required field: `apiVersion`.',
        recommendation: 'Specify the appropriate apiVersion for this resource (e.g. apps/v1, v1).'
      });
    }

    // 2. Check kind
    if (!doc.kind) {
      report.issues.push({
        id: 'missing_kind',
        severity: 'error',
        category: 'Schema',
        docIndex: context.docIndex,
        line: docLineStart,
        message: 'Missing required field: `kind`.',
        recommendation: 'Specify the Kubernetes resource Kind (e.g. Deployment, Service, Pod, ConfigMap).'
      });
    } else {
      // Check casing of kind
      if (doc.kind.charAt(0) !== doc.kind.charAt(0).toUpperCase()) {
        const line = this.findKeyLine(context.lines, 'kind:', docLineStart);
        report.issues.push({
          id: 'kind_casing',
          severity: 'error',
          category: 'Schema',
          docIndex: context.docIndex,
          line: line,
          message: `Resource kind '${doc.kind}' should be PascalCase (e.g. '${doc.kind.charAt(0).toUpperCase() + doc.kind.slice(1)}').`,
          fixable: true,
          fixType: 'fix_kind_casing',
          fixData: { correctKind: doc.kind.charAt(0).toUpperCase() + doc.kind.slice(1) },
          recommendation: 'Change to standard PascalCase name.'
        });
      }
    }

    // 3. Check for Deprecated apiVersion
    if (doc.apiVersion && doc.kind) {
      const depMap = this.schemas.deprecatedApis && this.schemas.deprecatedApis[doc.apiVersion];
      if (depMap && depMap[doc.kind]) {
        const targetApi = depMap[doc.kind];
        const line = this.findKeyLine(context.lines, 'apiVersion:', docLineStart);
        report.issues.push({
          id: `deprecated_api_${doc.kind.toLowerCase()}`,
          severity: 'warning',
          category: 'Deprecation',
          docIndex: context.docIndex,
          line: line,
          message: `\`apiVersion: ${doc.apiVersion}\` is deprecated for ${doc.kind}. Modern Kubernetes clusters expect \`${targetApi}\`.`,
          details: `Using deprecated APIs will fail on Kubernetes clusters where older API groups are removed.`,
          fixable: true,
          fixType: 'update_api_version',
          fixData: { newApiVersion: targetApi },
          recommendation: `Upgrade apiVersion to '${targetApi}'.`
        });
      }
    }

    // 4. Check metadata
    if (!doc.metadata) {
      report.issues.push({
        id: 'missing_metadata',
        severity: 'error',
        category: 'Schema',
        docIndex: context.docIndex,
        line: docLineStart,
        message: 'Missing required field: `metadata`.',
        recommendation: 'Add `metadata:` containing at minimum `name`.'
      });
    } else {
      this.validateMetadata(doc.metadata, context, report, docLineStart);
    }

    // 5. Kind-specific validation
    switch (doc.kind) {
      case 'Deployment':
      case 'StatefulSet':
      case 'DaemonSet':
      case 'ReplicaSet':
        this.validateWorkload(doc, context, report, docLineStart);
        break;
      case 'Pod':
        this.validatePod(doc, context, report, docLineStart);
        break;
      case 'Service':
        this.validateService(doc, context, report, docLineStart);
        break;
      case 'Ingress':
        this.validateIngress(doc, context, report, docLineStart);
        break;
      case 'ConfigMap':
        this.validateConfigMap(doc, context, report, docLineStart);
        break;
      case 'Secret':
        this.validateSecret(doc, context, report, docLineStart);
        break;
      case 'CronJob':
        this.validateCronJob(doc, context, report, docLineStart);
        break;
      case 'Job':
        this.validateJob(doc, context, report, docLineStart);
        break;
      case 'HorizontalPodAutoscaler':
        this.validateHPA(doc, context, report, docLineStart);
        break;
    }
  }

  /**
   * Validate metadata naming and labels
   */
  validateMetadata(metadata, context, report, docLineStart) {
    const metaLine = this.findKeyLine(context.lines, 'metadata:', docLineStart);

    if (!metadata.name && !metadata.generateName) {
      report.issues.push({
        id: 'missing_metadata_name',
        severity: 'error',
        category: 'Metadata',
        docIndex: context.docIndex,
        line: metaLine,
        message: 'Resource is missing `metadata.name` (or `metadata.generateName`).',
        recommendation: 'Specify a unique name for this resource.'
      });
    } else if (metadata.name) {
      const nameStr = String(metadata.name);
      const nameLine = this.findKeyLine(context.lines, 'name:', metaLine);

      if (nameStr.length > 253) {
        report.issues.push({
          id: 'name_too_long',
          severity: 'error',
          category: 'Metadata',
          docIndex: context.docIndex,
          line: nameLine,
          message: `\`metadata.name\` '${nameStr}' exceeds maximum RFC 1123 length of 253 characters.`,
          recommendation: 'Shorten resource name to 253 characters or fewer.'
        });
      }

      if (this.schemas.patterns && this.schemas.patterns.dnsSubdomain && !this.schemas.patterns.dnsSubdomain.test(nameStr)) {
        report.issues.push({
          id: 'invalid_rfc1123_name',
          severity: 'error',
          category: 'Metadata',
          docIndex: context.docIndex,
          line: nameLine,
          message: `\`metadata.name\` '${nameStr}' is invalid. Must consist of lowercase alphanumeric characters, '-' or '.', and start/end with an alphanumeric character.`,
          fixable: true,
          fixType: 'sanitize_name',
          fixData: { originalName: nameStr },
          recommendation: 'Convert to lowercase and replace invalid characters (such as underscores or spaces) with hyphens.'
        });
      }
    }

    // Namespace validation
    if (metadata.namespace) {
      const nsStr = String(metadata.namespace);
      if (this.schemas.patterns && this.schemas.patterns.dnsLabel && !this.schemas.patterns.dnsLabel.test(nsStr)) {
        const nsLine = this.findKeyLine(context.lines, 'namespace:', metaLine);
        report.issues.push({
          id: 'invalid_namespace_name',
          severity: 'error',
          category: 'Metadata',
          docIndex: context.docIndex,
          line: nsLine,
          message: `\`metadata.namespace\` '${nsStr}' must be a valid DNS label (lowercase alphanumeric and hyphens only, max 63 chars).`,
          recommendation: 'Provide a valid namespace name.'
        });
      }
    }

    // Labels validation
    if (metadata.labels && typeof metadata.labels === 'object') {
      Object.entries(metadata.labels).forEach(([key, val]) => {
        if (typeof val === 'boolean' || typeof val === 'number') {
          const labelLine = this.findKeyLine(context.lines, `${key}:`, metaLine);
          report.issues.push({
            id: `non_string_label_${key}`,
            severity: 'warning',
            category: 'Metadata',
            docIndex: context.docIndex,
            line: labelLine,
            message: `Label '${key}: ${val}' has a non-string value. Kubernetes requires all label values to be strings.`,
            fixable: true,
            fixType: 'quote_label_value',
            fixData: { key: key, value: String(val) },
            recommendation: `Enclose the label value in quotes: "${val}".`
          });
        }
      });
    }
  }

  /**
   * Validate Workload Resources (Deployment, StatefulSet, DaemonSet, ReplicaSet)
   */
  validateWorkload(doc, context, report, docLineStart) {
    if (!doc.spec) {
      report.issues.push({
        id: 'missing_spec',
        severity: 'error',
        category: 'Workload',
        docIndex: context.docIndex,
        line: docLineStart,
        message: `\`spec\` is required for ${doc.kind}.`,
        recommendation: 'Add `spec:` section.'
      });
      return;
    }

    const specLine = this.findKeyLine(context.lines, 'spec:', docLineStart);

    // 1. Check Selector
    if (!doc.spec.selector) {
      report.issues.push({
        id: 'missing_selector',
        severity: 'error',
        category: 'Workload',
        docIndex: context.docIndex,
        line: specLine,
        message: `${doc.kind} is missing \`spec.selector\`. Kubernetes requires a selector to identify managed pods.`,
        fixable: true,
        fixType: 'add_selector_from_template',
        recommendation: 'Add `spec.selector.matchLabels` matching `spec.template.metadata.labels`.'
      });
    } else if (!doc.spec.selector.matchLabels && !doc.spec.selector.matchExpressions) {
      const selLine = this.findKeyLine(context.lines, 'selector:', specLine);
      report.issues.push({
        id: 'empty_selector',
        severity: 'error',
        category: 'Workload',
        docIndex: context.docIndex,
        line: selLine,
        message: `\`spec.selector\` must define \`matchLabels\` or \`matchExpressions\`.`,
        fixable: true,
        fixType: 'add_selector_from_template',
        recommendation: 'Add `matchLabels` under `spec.selector`.'
      });
    }

    // 2. Check Match between selector.matchLabels and template.metadata.labels
    if (doc.spec.selector && doc.spec.selector.matchLabels && doc.spec.template && doc.spec.template.metadata) {
      const selectorLabels = doc.spec.selector.matchLabels || {};
      const templateLabels = doc.spec.template.metadata.labels || {};

      const missingLabels = [];
      Object.keys(selectorLabels).forEach(key => {
        if (templateLabels[key] !== selectorLabels[key]) {
          missingLabels.push(`${key}: ${selectorLabels[key]}`);
        }
      });

      if (missingLabels.length > 0) {
        const selLine = this.findKeyLine(context.lines, 'matchLabels:', specLine);
        report.issues.push({
          id: 'selector_template_mismatch',
          severity: 'error',
          category: 'Workload',
          docIndex: context.docIndex,
          line: selLine,
          message: `Pod template labels do not match \`spec.selector.matchLabels\`. Missing/mismatched: [${missingLabels.join(', ')}]. This will cause the deployment rollout to fail immediately!`,
          fixable: true,
          fixType: 'sync_template_labels',
          fixData: { selectorLabels },
          recommendation: 'Ensure all selector matchLabels exist with identical values in `spec.template.metadata.labels`.'
        });
      }
    }

    // 3. Check Pod Template
    if (!doc.spec.template) {
      report.issues.push({
        id: 'missing_template',
        severity: 'error',
        category: 'Workload',
        docIndex: context.docIndex,
        line: specLine,
        message: `${doc.kind} is missing \`spec.template\` pod specification.`,
        recommendation: 'Define `spec.template` containing metadata and spec.'
      });
      return;
    }

    const podSpec = doc.spec.template.spec;
    if (!podSpec) {
      const tplLine = this.findKeyLine(context.lines, 'template:', specLine);
      report.issues.push({
        id: 'missing_template_spec',
        severity: 'error',
        category: 'Workload',
        docIndex: context.docIndex,
        line: tplLine,
        message: 'Missing `spec.template.spec` in pod template.',
        recommendation: 'Add `spec:` under `template:`.'
      });
      return;
    }

    // 4. Validate Containers and Pod Security
    this.validatePodSpec(podSpec, context, report, specLine, doc.kind);
  }

  /**
   * Validate standalone Pod
   */
  validatePod(doc, context, report, docLineStart) {
    if (!doc.spec) {
      report.issues.push({
        id: 'missing_pod_spec',
        severity: 'error',
        category: 'Pod',
        docIndex: context.docIndex,
        line: docLineStart,
        message: 'Missing `spec` in Pod manifest.',
        recommendation: 'Add `spec:` containing container definitions.'
      });
      return;
    }
    this.validatePodSpec(doc.spec, context, report, docLineStart, 'Pod');
  }

  /**
   * Validate Pod Spec containers, volumes, and security context
   */
  validatePodSpec(podSpec, context, report, baseLine, kindName) {
    const containers = podSpec.containers;
    const containersLine = this.findKeyLine(context.lines, 'containers:', baseLine);

    if (!containers || !Array.isArray(containers) || containers.length === 0) {
      report.issues.push({
        id: 'missing_containers',
        severity: 'error',
        category: 'Containers',
        docIndex: context.docIndex,
        line: containersLine || baseLine,
        message: `${kindName} must define at least one container in \`containers\` array.`,
        recommendation: 'Add one or more containers with `name` and `image`.'
      });
      return;
    }

    // Pod-level Security Context check
    if (!podSpec.securityContext) {
      report.issues.push({
        id: 'missing_pod_security_context',
        severity: 'info',
        category: 'Security',
        docIndex: context.docIndex,
        line: baseLine,
        message: `${kindName} does not define a Pod-level \`securityContext\` (e.g. \`runAsNonRoot: true\`, \`seccompProfile\`).`,
        fixable: true,
        fixType: 'add_pod_security_context',
        recommendation: 'Add baseline pod securityContext to restrict root execution and enforce seccomp profiles.'
      });
    }

    const definedVolumes = new Set((podSpec.volumes || []).map(v => v.name));

    containers.forEach((container, cIdx) => {
      const cName = container.name || `[Container #${cIdx + 1}]`;
      const cLine = this.findKeyLine(context.lines, `- name: ${container.name}`, containersLine) || containersLine;

      if (!container.name) {
        report.issues.push({
          id: `container_${cIdx}_missing_name`,
          severity: 'error',
          category: 'Containers',
          docIndex: context.docIndex,
          line: cLine,
          message: `Container #${cIdx + 1} is missing a \`name\`.`,
          recommendation: 'Provide a unique alphanumeric name for the container.'
        });
      }

      if (!container.image) {
        report.issues.push({
          id: `container_${cIdx}_missing_image`,
          severity: 'error',
          category: 'Containers',
          docIndex: context.docIndex,
          line: cLine,
          message: `Container '${cName}' is missing an \`image\`.`,
          recommendation: 'Specify the container image (e.g. nginx:1.25.0).'
        });
      } else {
        const imgStr = String(container.image);
        if (imgStr.endsWith(':latest') || (!imgStr.includes(':') && !imgStr.includes('@'))) {
          report.issues.push({
            id: `container_${cIdx}_latest_tag`,
            severity: 'warning',
            category: 'Best Practices',
            docIndex: context.docIndex,
            line: this.findKeyLine(context.lines, `image:`, cLine),
            message: `Container '${cName}' uses untagged or ':latest' image tag ('${imgStr}'). This can lead to non-deterministic rollouts.`,
            recommendation: 'Pin the container image to a specific immutable version tag or SHA256 digest.'
          });

          if (imgStr.endsWith(':latest') && container.imagePullPolicy && container.imagePullPolicy !== 'Always') {
            report.issues.push({
              id: `container_${cIdx}_latest_pull_policy`,
              severity: 'warning',
              category: 'Best Practices',
              docIndex: context.docIndex,
              line: cLine,
              message: `Container '${cName}' has ':latest' image but \`imagePullPolicy\` is '${container.imagePullPolicy}'. It should be 'Always'.`,
              fixable: true,
              fixType: 'set_image_pull_policy_always',
              fixData: { containerName: container.name },
              recommendation: "Set `imagePullPolicy: Always`."
            });
          }
        }
      }

      this.validateContainerResources(container, cName, cLine, context, report, cIdx);
      this.validateContainerSecurity(container, cName, cLine, context, report, cIdx);

      if (!container.livenessProbe && !container.readinessProbe) {
        report.issues.push({
          id: `container_${cIdx}_missing_probes`,
          severity: 'info',
          category: 'Resilience',
          docIndex: context.docIndex,
          line: cLine,
          message: `Container '${cName}' has no \`readinessProbe\` or \`livenessProbe\` configured.`,
          recommendation: 'Configure readiness and liveness probes to allow Kubernetes to safely manage pod lifecycle.'
        });
      }

      if (container.volumeMounts && Array.isArray(container.volumeMounts)) {
        container.volumeMounts.forEach(vm => {
          if (!definedVolumes.has(vm.name)) {
            const vmLine = this.findKeyLine(context.lines, `name: ${vm.name}`, cLine);
            report.issues.push({
              id: `unmatched_volume_mount_${vm.name}`,
              severity: 'error',
              category: 'Storage',
              docIndex: context.docIndex,
              line: vmLine,
              message: `Volume mount '${vm.name}' in container '${cName}' does not exist in \`spec.volumes\`. This pod will fail to start.`,
              recommendation: `Define volume '${vm.name}' in \`spec.volumes\` or remove this volumeMount.`
            });
          }
        });
      }
    });
  }

  validateContainerResources(container, cName, cLine, context, report, cIdx) {
    if (!container.resources) {
      report.issues.push({
        id: `container_${cIdx}_missing_resources`,
        severity: 'warning',
        category: 'Resources',
        docIndex: context.docIndex,
        line: cLine,
        message: `Container '${cName}' is missing \`resources\` (requests & limits). It may consume unlimited cluster compute or suffer unpredictable evictions.`,
        fixable: true,
        fixType: 'inject_recommended_resources',
        fixData: { containerName: container.name },
        recommendation: 'Define baseline CPU and memory requests and limits.'
      });
      return;
    }

    const res = container.resources;
    const resLine = this.findKeyLine(context.lines, 'resources:', cLine) || cLine;

    if (!res.requests) {
      report.issues.push({
        id: `container_${cIdx}_missing_requests`,
        severity: 'info',
        category: 'Resources',
        docIndex: context.docIndex,
        line: resLine,
        message: `Container '${cName}' is missing \`resources.requests\`.`,
        fixable: true,
        fixType: 'inject_recommended_resources',
        fixData: { containerName: container.name },
        recommendation: 'Specify CPU and memory requests for cluster scheduling guarantees.'
      });
    }

    if (!res.limits) {
      report.issues.push({
        id: `container_${cIdx}_missing_limits`,
        severity: 'info',
        category: 'Resources',
        docIndex: context.docIndex,
        line: resLine,
        message: `Container '${cName}' is missing \`resources.limits\`.`,
        fixable: true,
        fixType: 'inject_recommended_resources',
        fixData: { containerName: container.name },
        recommendation: 'Specify CPU and memory limits to prevent out-of-memory cascading node failures.'
      });
    }

    if (res.requests && res.requests.cpu && this.schemas.patterns && this.schemas.patterns.cpu && !this.schemas.patterns.cpu.test(String(res.requests.cpu))) {
      report.issues.push({
        id: `invalid_cpu_request_${cIdx}`,
        severity: 'error',
        category: 'Resources',
        docIndex: context.docIndex,
        line: resLine,
        message: `Container '${cName}' has invalid CPU request format: '${res.requests.cpu}'. Valid formats: '100m', '0.5', '2'.`,
        recommendation: "Use valid millicores ('100m') or floating number."
      });
    }

    if (res.limits && res.limits.memory && this.schemas.patterns && this.schemas.patterns.memory && !this.schemas.patterns.memory.test(String(res.limits.memory))) {
      report.issues.push({
        id: `invalid_memory_limit_${cIdx}`,
        severity: 'error',
        category: 'Resources',
        docIndex: context.docIndex,
        line: resLine,
        message: `Container '${cName}' has invalid memory limit format: '${res.limits.memory}'. Valid formats: '128Mi', '1Gi'.`,
        recommendation: "Use binary SI suffix like 'Mi', 'Gi' or decimal suffix."
      });
    }
  }

  validateContainerSecurity(container, cName, cLine, context, report, cIdx) {
    const sec = container.securityContext;

    if (!sec) {
      report.issues.push({
        id: `container_${cIdx}_missing_security_context`,
        severity: 'info',
        category: 'Security',
        docIndex: context.docIndex,
        line: cLine,
        message: `Container '${cName}' is missing a hardened \`securityContext\`.`,
        fixable: true,
        fixType: 'harden_container_security',
        fixData: { containerName: container.name },
        recommendation: 'Add `allowPrivilegeEscalation: false`, `runAsNonRoot: true`, and `readOnlyRootFilesystem: true`.'
      });
      return;
    }

    const secLine = this.findKeyLine(context.lines, 'securityContext:', cLine) || cLine;

    if (sec.privileged === true) {
      report.issues.push({
        id: `container_${cIdx}_privileged`,
        severity: 'error',
        category: 'Security',
        docIndex: context.docIndex,
        line: secLine,
        message: `CRITICAL: Container '${cName}' has \`privileged: true\`. Privileged containers have full host root capabilities and create major security vulnerabilities.`,
        fixable: true,
        fixType: 'remove_privileged',
        fixData: { containerName: container.name },
        recommendation: 'Remove `privileged: true` and grant only specific required capabilities.'
      });
    }

    if (sec.allowPrivilegeEscalation !== false) {
      report.issues.push({
        id: `container_${cIdx}_privilege_escalation`,
        severity: 'warning',
        category: 'Security',
        docIndex: context.docIndex,
        line: secLine,
        message: `Container '${cName}' should explicitly set \`allowPrivilegeEscalation: false\`.`,
        fixable: true,
        fixType: 'harden_container_security',
        fixData: { containerName: container.name },
        recommendation: 'Set `allowPrivilegeEscalation: false`.'
      });
    }

    if (sec.runAsNonRoot !== true && sec.runAsUser === 0) {
      report.issues.push({
        id: `container_${cIdx}_run_as_root`,
        severity: 'warning',
        category: 'Security',
        docIndex: context.docIndex,
        line: secLine,
        message: `Container '${cName}' runs as root (UID 0). Containers should run as non-root users.`,
        fixable: true,
        fixType: 'harden_container_security',
        fixData: { containerName: container.name },
        recommendation: 'Set `runAsNonRoot: true`.'
      });
    }
  }

  validateService(doc, context, report, docLineStart) {
    if (!doc.spec) {
      report.issues.push({
        id: 'service_missing_spec',
        severity: 'error',
        category: 'Service',
        docIndex: context.docIndex,
        line: docLineStart,
        message: 'Service is missing `spec` section.',
        recommendation: 'Add `spec:` containing `ports` and `selector`.'
      });
      return;
    }

    const specLine = this.findKeyLine(context.lines, 'spec:', docLineStart);

    if (!doc.spec.ports || !Array.isArray(doc.spec.ports) || doc.spec.ports.length === 0) {
      report.issues.push({
        id: 'service_missing_ports',
        severity: 'error',
        category: 'Service',
        docIndex: context.docIndex,
        line: specLine,
        message: 'Service must define at least one port in `spec.ports`.',
        recommendation: 'Add `ports:` list with `port` and `targetPort`.'
      });
    } else {
      doc.spec.ports.forEach((p, idx) => {
        if (!p.port || p.port < 1 || p.port > 65535) {
          report.issues.push({
            id: `service_invalid_port_${idx}`,
            severity: 'error',
            category: 'Service',
            docIndex: context.docIndex,
            line: specLine,
            message: `Service port #${idx + 1} has invalid \`port\`: '${p.port}'. Must be an integer between 1 and 65535.`,
            recommendation: 'Specify a valid port number (e.g. 80, 443, 8080).'
          });
        }
      });
    }

    if (doc.spec.type !== 'ExternalName' && (!doc.spec.selector || Object.keys(doc.spec.selector).length === 0)) {
      report.issues.push({
        id: 'service_missing_selector',
        severity: 'warning',
        category: 'Service',
        docIndex: context.docIndex,
        line: specLine,
        message: 'Service does not define `spec.selector`. Unless managing manual Endpoints or Headless external services, it will not route traffic to any pods.',
        recommendation: 'Add `spec.selector` matching your target workload labels.'
      });
    }
  }

  validateIngress(doc, context, report, docLineStart) {
    const isV1 = doc.apiVersion === 'networking.k8s.io/v1';
    const isLegacy = doc.apiVersion === 'extensions/v1beta1' || doc.apiVersion === 'networking.k8s.io/v1beta1';

    if (!doc.spec) {
      report.issues.push({
        id: 'ingress_missing_spec',
        severity: 'error',
        category: 'Ingress',
        docIndex: context.docIndex,
        line: docLineStart,
        message: 'Ingress is missing `spec` section.',
        recommendation: 'Add `spec.rules:` defining routing paths.'
      });
      return;
    }

    const specLine = this.findKeyLine(context.lines, 'spec:', docLineStart);
    let foundDeprecatedBackend = false;
    let missingPathType = false;

    if (doc.spec.rules && Array.isArray(doc.spec.rules)) {
      doc.spec.rules.forEach(rule => {
        if (rule.http && rule.http.paths && Array.isArray(rule.http.paths)) {
          rule.http.paths.forEach(p => {
            if (p.backend && (p.backend.serviceName || p.backend.servicePort)) {
              foundDeprecatedBackend = true;
            }
            if (isV1 && !p.pathType) {
              missingPathType = true;
            }
          });
        }
      });
    }

    if (foundDeprecatedBackend || isLegacy) {
      report.issues.push({
        id: 'ingress_deprecated_backend_syntax',
        severity: 'warning',
        category: 'Ingress',
        docIndex: context.docIndex,
        line: specLine,
        message: 'Ingress uses deprecated v1beta1 backend schema (`serviceName`/`servicePort`). Modern Kubernetes Ingress (`networking.k8s.io/v1`) requires `backend.service.name` and `backend.service.port.number`.',
        fixable: true,
        fixType: 'migrate_ingress_v1',
        recommendation: 'Upgrade to modern Ingress v1 schema with `service.name`, `service.port.number`, and `pathType`.'
      });
    }

    if (missingPathType) {
      report.issues.push({
        id: 'ingress_missing_pathtype',
        severity: 'error',
        category: 'Ingress',
        docIndex: context.docIndex,
        line: specLine,
        message: 'Ingress v1 paths require `pathType` to be explicitly defined (e.g. `Prefix` or `Exact`).',
        fixable: true,
        fixType: 'add_ingress_pathtype',
        recommendation: "Add `pathType: Prefix` under each path."
      });
    }
  }

  validateSecret(doc, context, report, docLineStart) {
    if (doc.data && typeof doc.data === 'object') {
      const base64Regex = /^[A-Za-z0-9+/=]+$/;
      Object.entries(doc.data).forEach(([key, val]) => {
        const valStr = String(val).trim();
        if (!base64Regex.test(valStr) || valStr.length % 4 !== 0) {
          const keyLine = this.findKeyLine(context.lines, `${key}:`, docLineStart);
          report.issues.push({
            id: `secret_unencoded_data_${key}`,
            severity: 'warning',
            category: 'Secret',
            docIndex: context.docIndex,
            line: keyLine,
            message: `Secret \`data.${key}\` appears to be plaintext, not valid Base64 encoded data.`,
            fixable: true,
            fixType: 'base64_encode_secret',
            fixData: { key: key, value: valStr },
            recommendation: 'Base64 encode the value or move it to `stringData:` for automatic encoding by Kubernetes.'
          });
        }
      });
    }
  }

  validateConfigMap(doc, context, report, docLineStart) {
    if (!doc.data && !doc.binaryData) {
      report.issues.push({
        id: 'configmap_empty_data',
        severity: 'info',
        category: 'ConfigMap',
        docIndex: context.docIndex,
        line: docLineStart,
        message: 'ConfigMap does not define any keys in `data` or `binaryData`.',
        recommendation: 'Add configuration key-value pairs under `data:`.'
      });
    }
  }

  validateCronJob(doc, context, report, docLineStart) {
    if (!doc.spec || !doc.spec.schedule) {
      report.issues.push({
        id: 'cronjob_missing_schedule',
        severity: 'error',
        category: 'CronJob',
        docIndex: context.docIndex,
        line: docLineStart,
        message: 'CronJob must specify `spec.schedule` (standard 5-part cron syntax).',
        recommendation: "Add a schedule, e.g. `schedule: '0 0 * * *'` (runs daily at midnight)."
      });
    } else {
      const parts = String(doc.spec.schedule).trim().split(/\s+/);
      if (parts.length < 5) {
        report.issues.push({
          id: 'cronjob_invalid_schedule',
          severity: 'warning',
          category: 'CronJob',
          docIndex: context.docIndex,
          line: docLineStart,
          message: `CronJob schedule '${doc.spec.schedule}' has fewer than 5 standard fields (minute, hour, day of month, month, day of week).`,
          recommendation: "Ensure cron schedule has 5 fields, e.g., '*/15 * * * *'."
        });
      }
    }
  }

  validateJob(doc, context, report, docLineStart) {
    if (!doc.spec || !doc.spec.template) {
      report.issues.push({
        id: 'job_missing_template',
        severity: 'error',
        category: 'Job',
        docIndex: context.docIndex,
        line: docLineStart,
        message: 'Job must define `spec.template` pod specification.',
        recommendation: 'Add `spec.template:` containing pod spec.'
      });
    }
  }

  validateHPA(doc, context, report, docLineStart) {
    if (!doc.spec || !doc.spec.scaleTargetRef) {
      report.issues.push({
        id: 'hpa_missing_scaletargetref',
        severity: 'error',
        category: 'Autoscaling',
        docIndex: context.docIndex,
        line: docLineStart,
        message: 'HorizontalPodAutoscaler requires `spec.scaleTargetRef` to define the target workload.',
        recommendation: 'Add `scaleTargetRef:` with apiVersion, kind, and name.'
      });
    }
  }

  findDocStartLine(lines, docIndex) {
    if (docIndex === 0) return 1;
    let docCount = 0;
    for (let i = 0; i < lines.length; i++) {
      if (lines[i].trim() === '---') {
        docCount++;
        if (docCount === docIndex) {
          return i + 2;
        }
      }
    }
    return 1;
  }

  findKeyLine(lines, searchKey, startLine = 1) {
    const startIdx = Math.max(0, startLine - 1);
    for (let i = startIdx; i < lines.length; i++) {
      if (i > startIdx && lines[i].trim() === '---') {
        break;
      }
      if (lines[i].includes(searchKey)) {
        return i + 1;
      }
    }
    return startLine;
  }

  calculateStats(report) {
    let errs = 0;
    let warns = 0;
    let infos = 0;
    let fixable = 0;

    report.issues.forEach(iss => {
      if (iss.severity === 'error') errs++;
      else if (iss.severity === 'warning') warns++;
      else if (iss.severity === 'info') infos++;

      if (iss.fixable) fixable++;
    });

    report.stats.errors = errs;
    report.stats.warnings = warns;
    report.stats.infos = infos;
    report.stats.fixableCount = fixable;
    report.isValid = errs === 0;

    let score = 100 - (errs * 25) - (warns * 8) - (infos * 2);
    score = Math.max(0, Math.min(100, score));
    report.score = score;

    if (score >= 95) report.grade = 'A+';
    else if (score >= 90) report.grade = 'A';
    else if (score >= 80) report.grade = 'B';
    else if (score >= 70) report.grade = 'C';
    else if (score >= 50) report.grade = 'D';
    else report.grade = 'F';
  }
}

if (typeof window !== 'undefined') {
  window.K8sYamlValidator = K8sYamlValidator;
}
