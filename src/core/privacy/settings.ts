// Copyright (c) 2026 Vitalii Shkrobatskyi
// SPDX-License-Identifier: GPL-3.0-only

export const BUILTIN_FILTERS = [
  { id: 'sensitive-fields', matchingRule: 'password / passcode / secret / token / api key / authorization', caseSensitive: false, name: 'Sensitive field values', description: 'Values and nested text in fields labelled Password, Passcode, Secret, Token, API key or Authorization.' },
  { id: 'authorization', matchingRule: 'Bearer … / Basic …', caseSensitive: true, name: 'Authorization values', description: 'Bearer and Basic credentials in page text.' },
  { id: 'jwt', matchingRule: 'eyJ….….…', caseSensitive: true, name: 'JWTs', description: 'Recognizable JSON Web Token values.' },
  { id: 'github', matchingRule: 'ghp_… / gho_… / ghu_… / ghs_… / ghr_… / github_pat_…', caseSensitive: true, name: 'GitHub tokens', description: 'GitHub personal access tokens and other recognized GitHub tokens.' },
  { id: 'aws', matchingRule: 'AKIA… / ASIA…', caseSensitive: true, name: 'AWS access keys', description: 'Access key IDs starting with AKIA or ASIA.' },
  { id: 'openai', matchingRule: 'sk-… / sk-proj-…', caseSensitive: true, name: 'OpenAI-style keys', description: 'Recognizable keys starting with sk- or sk-proj-.' },
  { id: 'assignments', matchingRule: 'api key: … / token=… / secret: … / password=…', caseSensitive: false, name: 'Assigned secrets', description: 'Credentials following labels such as api_key=, token:, secret: or password:.' },
  { id: 'query-values', matchingRule: '?api_key=… / ?token=… / ?secret=… / ?password=…', caseSensitive: false, name: 'Secret URL parameters', description: 'Values of api_key, token, secret and password URL query parameters.' },
] as const;

export type BuiltinFilterId = (typeof BUILTIN_FILTERS)[number]['id'];
export interface CustomRedactionRule {
  id: string;
  name: string;
  text: string;
  caseSensitive: boolean;
  enabled: boolean;
  type?: RuleType;
  /** Legacy flags are accepted only for migration to a single type per rule. Missing on legacy rules, whose text remains one literal string. */
  fieldLabels?: boolean;
  urlParameters?: boolean;
  authorization?: boolean;
  jwt?: boolean;
  githubTokens?: boolean;
  awsKeys?: boolean;
  openaiKeys?: boolean;
  assignedSecrets?: boolean;
  wholeWords?: boolean;
}
/** Each detector treats matchingRule terms as literal names or prefixes, never regex. */
export const DETECTOR_MODES = [
  { key: 'authorization', label: 'Authorization', builtin: 'authorization', terms: 'Bearer / Basic', description: 'Scheme names followed by whitespace and a credential of at least 8 characters. Keeps the scheme.' },
  { key: 'jwt', label: 'JWT', builtin: 'jwt', terms: 'eyJ', description: 'First-segment prefixes for three dot-separated JWT segments: at least 5 characters after the prefix and 5 in each remaining segment.' },
  { key: 'githubTokens', label: 'GitHub tokens', builtin: 'github', terms: 'ghp_ / gho_ / ghu_ / ghs_ / ghr_ / github_pat_', description: 'Prefixes followed by at least 20 letters, digits or underscores.' },
  { key: 'awsKeys', label: 'AWS keys', builtin: 'aws', terms: 'AKIA / ASIA', description: 'Prefixes followed by exactly 16 uppercase letters or digits. Case sensitive also controls the suffix.' },
  { key: 'openaiKeys', label: 'OpenAI keys', builtin: 'openai', terms: 'sk- / sk-proj-', description: 'Prefixes followed by at least 16 letters, digits, underscores or hyphens.' },
  { key: 'assignedSecrets', label: 'Assigned secrets', builtin: 'assignments', terms: 'api key / api_key / api-key / apikey / token / secret / password', description: 'Labels followed by : or = and a value of at least 8 characters. Keeps the label and separator.' },
] as const;
export const EXTRA_MODE_KEYS = [...DETECTOR_MODES.map(mode => mode.key), 'wholeWords'] as const;
export type ExtraModeKey = (typeof EXTRA_MODE_KEYS)[number];

export const RULE_TYPES = [
  { id: 'text', label: 'Text', scope: 'text', description: 'Hide literal alternatives anywhere in captured text, values, links and metadata. Separate alternatives with space / space.' },
  { id: 'literalText', label: 'Text — single literal', scope: 'text', description: 'Hide the entire matching rule as one literal substring, including spaces and slashes. Preserves older text rules.' },
  { id: 'fieldLabels', label: 'Field labels', scope: 'fields', description: 'Hide field values and nested text when a label contains a literal alternative. Keep the label visible.' },
  { id: 'fieldWords', label: 'Field labels — whole words', scope: 'fields', description: 'Hide field values and nested text when a literal alternative has word boundaries in the field label. Keep the label visible.' },
  { id: 'urlParameters', label: 'URL parameters', scope: 'text', description: 'Hide values after exact parameter names in ?name=value and &name=value. Enter names only, without ?, &, =, # or line breaks.' },
  ...DETECTOR_MODES.map(mode => ({ id: mode.key, label: mode.label, scope: 'text', description: mode.description })),
] as const;
export type RuleType = (typeof RULE_TYPES)[number]['id'];
const LEGACY_MODE_KEYS = ['fieldLabels', 'urlParameters', ...EXTRA_MODE_KEYS] as const;

/** Bridge typed rules to the existing matching engines; never execute imported definitions. */
export function legacyRuleFromType(rule: CustomRedactionRule): CustomRedactionRule {
  if (!rule.type) return rule;
  const { type, ...base } = rule;
  if (type === 'literalText') return base;
  return { ...base, fieldLabels: type === 'fieldLabels' || type === 'fieldWords', urlParameters: type === 'urlParameters',
    ...(type === 'fieldWords' ? { wholeWords: true } : {}),
    ...Object.fromEntries(DETECTOR_MODES.filter(mode => mode.key === type).map(mode => [mode.key, true])),
  };
}

/** A usable, editable equivalent of a built-in, including literal aliases. */
export function customRuleFromBuiltin(id: BuiltinFilterId, caseSensitive = BUILTIN_FILTERS.find(filter => filter.id === id)!.caseSensitive): CustomRedactionRule {
  const builtin = BUILTIN_FILTERS.find(filter => filter.id === id)!;
  if (id === 'sensitive-fields') return { id, name: builtin.name, text: 'password / passcode / secret / token / api key / api_key / api-key / apikey / authorization', type: 'fieldWords', caseSensitive, enabled: true };
  if (id === 'query-values') return { id, name: builtin.name, text: 'api key / api_key / api-key / apikey / token / secret / password', type: 'urlParameters', caseSensitive, enabled: true };
  const mode = DETECTOR_MODES.find(mode => mode.builtin === id)!;
  return { id, name: builtin.name, text: mode.terms, type: mode.key, caseSensitive, enabled: true };
}

export interface RedactionSettings {
  version: 1;
  disabledBuiltins: BuiltinFilterId[];
  customRules: CustomRedactionRule[];
  builtinCaseSensitivity?: Partial<Record<BuiltinFilterId, boolean>>;
}

export function builtinCaseSensitive(settings: RedactionSettings, id: BuiltinFilterId): boolean {
  return settings.builtinCaseSensitivity?.[id] ?? BUILTIN_FILTERS.find(filter => filter.id === id)!.caseSensitive;
}

export const REDACTION_LIMITS = { rules: 400, name: 80, text: 256, totalText: 65536, json: 256_000 } as const;

/** Lists use a slash surrounded by spaces, leaving URL and path slashes literal. */
export function customRuleTerms(rule: CustomRedactionRule): string[] {
  if (rule.type) return rule.type === 'literalText' ? [rule.text] : rule.text.split(' / ').map(term => term.trim());
  return rule.fieldLabels === undefined && rule.urlParameters === undefined && !EXTRA_MODE_KEYS.some(key => rule[key]) ? [rule.text] : rule.text.split(' / ').map(term => term.trim());
}

export function defaultRedactionSettings(): RedactionSettings {
  return { version: 1, disabledBuiltins: [], customRules: [] };
}

/** Return a detached, whitelisted configuration or reject it without partial changes. */
export function validateRedactionSettings(value: unknown): RedactionSettings {
  const invalid = () => { throw new Error('Invalid filters. Check the filter format, built-in IDs and limit of 400 custom filters.'); };
  if (typeof value !== 'object' || value === null) return invalid();
  const candidate = value as Partial<RedactionSettings>;
  if (candidate.version !== 1 || !Array.isArray(candidate.disabledBuiltins) || !Array.isArray(candidate.customRules) ||
    candidate.disabledBuiltins.length > BUILTIN_FILTERS.length || candidate.customRules.length > REDACTION_LIMITS.rules) return invalid();
  const ids = new Set<string>();
  for (const id of candidate.disabledBuiltins) {
    if (!BUILTIN_FILTERS.some(filter => filter.id === id) || ids.has(id)) return invalid();
    ids.add(id);
  }
  // Reserve original IDs before splitting legacy multi-mode rules to avoid collisions.
  const sourceIds = new Set<string>();
  for (const rule of candidate.customRules) {
    if (typeof rule !== 'object' || rule === null || typeof rule.id !== 'string' ||
      !/^[a-zA-Z0-9_-]{1,64}$/u.test(rule.id) || sourceIds.has(rule.id)) return invalid();
    sourceIds.add(rule.id);
  }
  const customRules: CustomRedactionRule[] = [];
  let total = 0;
  for (const rule of candidate.customRules) {
    const item = rule as Partial<CustomRedactionRule>;
    if (typeof item.name !== 'string' || !item.name.trim() || item.name.length > REDACTION_LIMITS.name ||
      typeof item.text !== 'string' || !item.text.trim() || item.text.length > REDACTION_LIMITS.text ||
      typeof item.caseSensitive !== 'boolean' || typeof item.enabled !== 'boolean' ||
      LEGACY_MODE_KEYS.some(key => item[key] !== undefined && typeof item[key] !== 'boolean')) return invalid();
    let types: RuleType[];
    if (item.type !== undefined) {
      if (!RULE_TYPES.some(type => type.id === item.type) || LEGACY_MODE_KEYS.some(key => item[key] !== undefined)) return invalid();
      types = [item.type];
    } else {
      types = [];
      if (item.fieldLabels) types.push(item.wholeWords ? 'fieldWords' : 'fieldLabels');
      if (item.urlParameters) types.push('urlParameters');
      for (const mode of DETECTOR_MODES) if (item[mode.key]) types.push(mode.key);
      if (!types.length) types.push(item.fieldLabels === undefined && item.urlParameters === undefined && !item.wholeWords ? 'literalText' : 'text');
    }
    for (const [index, type] of types.entries()) {
      let id = item.id!;
      if (index) {
        let suffix = index + 1;
        do { id = `${item.id!.slice(0, 54)}-type-${suffix++}`; } while (sourceIds.has(id));
        sourceIds.add(id);
      }
      const result: CustomRedactionRule = { id, name: item.name, text: item.text, type, caseSensitive: item.caseSensitive, enabled: item.enabled };
      if (customRuleTerms(result).some(term => !term.trim())) return invalid();
      if (type === 'urlParameters' && customRuleTerms(result).some(term => /[?&=#\r\n\t]/u.test(term))) return invalid();
      total += item.text.length;
      customRules.push(result);
      if (customRules.length > REDACTION_LIMITS.rules || total > REDACTION_LIMITS.totalText) return invalid();
    }
  }
  const result: RedactionSettings = { version: 1, disabledBuiltins: [...candidate.disabledBuiltins], customRules };
  if (candidate.builtinCaseSensitivity !== undefined) {
    const overrides = candidate.builtinCaseSensitivity;
    if (typeof overrides !== 'object' || overrides === null || Array.isArray(overrides) ||
      Object.entries(overrides).some(([id, value]) => !BUILTIN_FILTERS.some(filter => filter.id === id) || typeof value !== 'boolean')) return invalid();
    const entries = BUILTIN_FILTERS.filter(filter => overrides[filter.id] !== undefined && overrides[filter.id] !== filter.caseSensitive)
      .map(filter => [filter.id, overrides[filter.id]]);
    if (entries.length) result.builtinCaseSensitivity = Object.fromEntries(entries);
  }
  return result;
}

export function importRedactionSettings(json: string): RedactionSettings {
  if (json.length > REDACTION_LIMITS.json) throw new Error('The filter file is too large. The limit is 256 KB.');
  let parsed: unknown;
  try { parsed = JSON.parse(json.charCodeAt(0) === 0xfeff ? json.slice(1) : json); }
  catch { throw new Error('Invalid JSON. Choose a valid filter export file.'); }
  if (typeof parsed === 'object' && parsed !== null && 'version' in parsed && [2, 3, 4, 5, 6, 7].includes(parsed.version as number)) {
    if (parsed.version === 7) return importTypedFilters(parsed);
    const legacy = parsed.version === 2;
    const unified = [4, 5, 6].includes(parsed.version as number);
    const detectors = parsed.version === 6;
    const urlModes = parsed.version === 5 || detectors;
    const file = parsed as { format?: unknown; filters?: unknown };
    if (file.format !== 'copy-as-context-filters' || !Array.isArray(file.filters) || file.filters.length > BUILTIN_FILTERS.length + REDACTION_LIMITS.rules) {
      throw new Error('Invalid filter file. Choose a supported Copy as Context filter export.');
    }
    const seen = new Set<string>();
    const disabledBuiltins: BuiltinFilterId[] = [];
    const customRules: unknown[] = [];
    const builtinCaseSensitivity: Partial<Record<BuiltinFilterId, boolean>> = {};
    for (const value of file.filters) {
      if (typeof value !== 'object' || value === null) throw new Error('Invalid filter file.');
      if (value.type === 'text') {
        if (!detectors && EXTRA_MODE_KEYS.some(key => value[key] === true)) throw new Error('Detector modes require a version 6 filter file.');
        if (legacy && 'fieldLabels' in value) throw new Error('Field labels require a version 3 filter file.');
        if (!urlModes && 'urlParameters' in value) throw new Error('URL parameters require a version 5 filter file.');
        if (unified && ('text' in value || typeof value.matchingRule !== 'string')) throw new Error('Custom filters must use matchingRule in version 4 or later files.');
        const { type: _origin, ...legacyRule } = value;
        customRules.push(unified ? { ...legacyRule, text: value.matchingRule } : legacyRule); continue;
      }
      const builtin = BUILTIN_FILTERS.find(filter => filter.id === value.id);
      const expectedRule = legacy && builtin?.id === 'sensitive-fields'
        ? 'Field labels: password, passcode, secret, token, api key, authorization' :
        detectors && builtin ? customRuleFromBuiltin(builtin.id).text : builtin?.matchingRule;
      if (value.type !== 'builtin' || !builtin || seen.has(builtin.id) || typeof value.enabled !== 'boolean' ||
        value.matchingRule !== expectedRule || typeof value.caseSensitive !== 'boolean' ||
        (!unified && value.caseSensitive !== builtin.caseSensitive) ||
        (!legacy && value.fieldLabels !== (builtin.id === 'sensitive-fields')) ||
        (urlModes && value.urlParameters !== (builtin.id === 'query-values')) ||
        (detectors && EXTRA_MODE_KEYS.some(key => value[key] !== (legacyRuleFromType(customRuleFromBuiltin(builtin.id))[key] ?? false)))) {
        throw new Error('The file contains unsupported built-in filters. Choose an export from a compatible extension version.');
      }
      seen.add(builtin.id);
      if (value.caseSensitive !== builtin.caseSensitive) builtinCaseSensitivity[builtin.id] = value.caseSensitive;
      if (!value.enabled) disabledBuiltins.push(builtin.id);
    }
    if (seen.size !== BUILTIN_FILTERS.length) throw new Error('The filter file must include every built-in filter.');
    return validateRedactionSettings({ version: 1, disabledBuiltins, customRules, builtinCaseSensitivity });
  }
  // Continue accepting earlier configuration-only exports.
  return validateRedactionSettings(parsed);
}

/** The catalog documents code-defined types; imported text never defines new detectors. */
function importTypedFilters(parsed: object): RedactionSettings {
  const file = parsed as { format?: unknown; availableRuleTypes?: unknown; filters?: unknown };
  const invalid = () => { throw new Error('Invalid filter file. Use supported rule types from a compatible Copy as Context export.'); };
  if (file.format !== 'copy-as-context-filters' || !Array.isArray(file.availableRuleTypes) ||
    file.availableRuleTypes.length !== RULE_TYPES.length || !Array.isArray(file.filters) ||
    file.filters.length > BUILTIN_FILTERS.length + REDACTION_LIMITS.rules) return invalid();
  const types = new Set<string>();
  for (const item of file.availableRuleTypes) {
    if (typeof item !== 'object' || item === null || !RULE_TYPES.some(type => type.id === item.id) || types.has(item.id) ||
      typeof item.label !== 'string' || item.label.length > 100 || typeof item.description !== 'string' || item.description.length > 1000 ||
      !['text', 'fields'].includes(item.scope)) return invalid();
    types.add(item.id);
  }
  const seen = new Set<BuiltinFilterId>();
  const settings = defaultRedactionSettings();
  for (const item of file.filters) {
    if (typeof item !== 'object' || item === null || !RULE_TYPES.some(type => type.id === item.type) ||
      typeof item.matchingRule !== 'string' || typeof item.caseSensitive !== 'boolean' || typeof item.enabled !== 'boolean' ||
      'text' in item || LEGACY_MODE_KEYS.some(key => key in item)) return invalid();
    if (item.source === 'custom') {
      settings.customRules.push({ id: item.id, name: item.name, text: item.matchingRule, type: item.type, caseSensitive: item.caseSensitive, enabled: item.enabled });
    } else if (item.source === 'builtin') {
      const builtin = BUILTIN_FILTERS.find(filter => filter.id === item.id);
      if (!builtin || seen.has(builtin.id)) return invalid();
      const expected = customRuleFromBuiltin(builtin.id);
      if (item.type !== expected.type || item.matchingRule !== expected.text) return invalid();
      seen.add(builtin.id);
      if (!item.enabled) settings.disabledBuiltins.push(builtin.id);
      if (item.caseSensitive !== builtin.caseSensitive) {
        settings.builtinCaseSensitivity ??= {};
        settings.builtinCaseSensitivity[builtin.id] = item.caseSensitive;
      }
    } else return invalid();
  }
  if (seen.size !== BUILTIN_FILTERS.length) return invalid();
  return validateRedactionSettings(settings);
}

export function exportRedactionSettings(settings: RedactionSettings): string {
  const config = validateRedactionSettings(settings);
  const entry = (source: 'builtin' | 'custom', rule: CustomRedactionRule, description: string) => ({
    source, id: rule.id, name: rule.name, description, type: rule.type,
    matchingRule: rule.text, caseSensitive: rule.caseSensitive, enabled: rule.enabled,
  });
  return `${JSON.stringify({
    format: 'copy-as-context-filters',
    version: 7,
    availableRuleTypes: RULE_TYPES,
    filters: [
      ...BUILTIN_FILTERS.map(filter => entry('builtin', {
        ...customRuleFromBuiltin(filter.id, builtinCaseSensitive(config, filter.id)), enabled: !config.disabledBuiltins.includes(filter.id),
      }, filter.description)),
      ...config.customRules.map(rule => entry('custom', rule, '')),
    ],
  }, null, 2)}\n`;
}
