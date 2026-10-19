// Copyright (c) 2026 Vitalii Shkrobatskyi
// SPDX-License-Identifier: GPL-3.0-only

import { compileRegex } from './regex';
import { isEmailType } from './emails';
import { isAutomaticType, PERSONAL_FIELD_TERMS } from './personal-data';

export const BUILTIN_FILTERS = [
  { id: 'sensitive-fields', matchingRule: 'password / passcode / secret / token / api key / authorization', caseSensitive: false, name: 'Sensitive field values', description: 'Values and nested text in fields labelled Password, Passcode, Secret, Token, API key or Authorization.' },
  { id: 'authorization', matchingRule: 'Bearer … / Basic …', caseSensitive: true, name: 'Authorization values', description: 'Bearer and Basic credentials in page text.' },
  { id: 'jwt', matchingRule: 'eyJ….….…', caseSensitive: true, name: 'JWTs', description: 'Recognizable JSON Web Token values.' },
  { id: 'github', matchingRule: 'ghp_… / gho_… / ghu_… / ghs_… / ghr_… / github_pat_…', caseSensitive: true, name: 'GitHub tokens', description: 'GitHub personal access tokens and other recognized GitHub tokens.' },
  { id: 'aws', matchingRule: 'AKIA… / ASIA…', caseSensitive: true, name: 'AWS access keys', description: 'Access key IDs starting with AKIA or ASIA.' },
  { id: 'openai', matchingRule: 'sk-… / sk-proj-…', caseSensitive: true, name: 'OpenAI-style keys', description: 'Recognizable keys starting with sk- or sk-proj-.' },
  { id: 'assignments', matchingRule: 'api key: … / token=… / secret: … / password=…', caseSensitive: false, name: 'Assigned secrets', description: 'Credentials following labels such as api_key=, token:, secret: or password:.' },
  { id: 'query-values', matchingRule: '?api_key=… / ?token=… / ?secret=… / ?password=…', caseSensitive: false, name: 'Secret URL parameters', description: 'Values of api_key, token, secret and password URL query parameters.' },
  { id: 'email-mask-domain', matchingRule: '', caseSensitive: false, name: 'Mask email addresses (including domains)', description: 'Masks the email name and domain labels with the same three-character cap, keeping the final domain suffix. Full hiding still wins.' },
  { id: 'email-hide', matchingRule: '', caseSensitive: false, name: 'Hide email addresses', description: 'Hides entire email addresses. Overrides partial masking, regardless of rule order.' },
  { id: 'phone-mask', matchingRule: '', caseSensitive: false, name: 'Mask phone numbers', description: 'Masks phone digits using the email length rule: half, rounded down, capped at three visible digits. Keeps formatting. Full hiding wins.' },
  { id: 'phone-numbers', matchingRule: '', caseSensitive: false, name: 'Hide phone numbers', description: 'Hides phone-shaped numbers with + or 00 prefixes, or English Phone, Tel, Mobile or Fax labels. Local unlabelled numbers are not detected.' },
  { id: 'payment-cards', matchingRule: '', caseSensitive: false, name: 'Hide payment card numbers', description: 'Hides 13–19 digit card-shaped numbers passing the Luhn checksum, including space and hyphen separators. Does not verify that a card exists.' },
  { id: 'iban', matchingRule: '', caseSensitive: false, name: 'Hide IBANs', description: 'Hides IBANs with a recognized country length and valid MOD-97 checksum, with or without spaces. Does not verify the bank account.' },
  { id: 'personal-fields-mask', matchingRule: '', caseSensitive: false, name: 'Mask personal field values (English labels)', description: 'Masks names, addresses, phones and emails under common English field labels. Documents, dates of birth, financial details and CVV/CVC are fully hidden. Full hiding wins.' },
  { id: 'personal-fields', matchingRule: '', caseSensitive: false, name: 'Hide personal field values (English labels)', description: 'Hides values and nested text of fields with common English personal or financial labels. Keeps labels visible. Does not detect names or addresses in prose.' },
] as const;
const NEW_BUILTIN_IDS = ['phone-numbers', 'payment-cards', 'iban', 'personal-fields'];
export const V12_BUILTIN_FILTERS = BUILTIN_FILTERS.filter(filter => !['phone-mask', 'personal-fields-mask'].includes(filter.id));
export const V11_BUILTIN_FILTERS = V12_BUILTIN_FILTERS.filter(filter => !NEW_BUILTIN_IDS.includes(filter.id));
const RETIRED_EMAIL_BUILTIN = { id: 'email-mask', matchingRule: '', caseSensitive: false, name: 'Mask email addresses', description: 'Keeps up to the first three characters before @, or half for shorter names, and masks the rest. Keeps the domain visible.' } as const;
export const V10_BUILTIN_FILTERS = [...V11_BUILTIN_FILTERS, RETIRED_EMAIL_BUILTIN];
export const V9_BUILTIN_FILTERS = V10_BUILTIN_FILTERS.filter(filter => filter.id !== 'email-mask-domain');
export const LEGACY_BUILTIN_FILTERS = V11_BUILTIN_FILTERS.filter(filter => !['email-mask', 'email-hide', 'email-mask-domain'].includes(filter.id));

export type BuiltinFilterId = (typeof BUILTIN_FILTERS)[number]['id'] | 'email-mask';
const ALL_BUILTIN_FILTERS = [...BUILTIN_FILTERS, RETIRED_EMAIL_BUILTIN];
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
  { id: 'personalFieldsHide', label: 'Hide personal field values (English labels)', scope: 'fields', description: 'Automatically hides values and nested text under common English personal or financial field labels. Keeps labels visible. No matching text or case setting is needed.' },
  { id: 'phoneNumbersMask', label: 'Mask phone numbers', scope: 'text', description: 'Automatically masks phone digits, keeping min(3, floor(digit count / 2)) visible and preserving formatting. Full hiding wins. No matching text or case setting is needed.' },
  { id: 'personalFieldsMask', label: 'Mask personal field values (English labels)', scope: 'fields', description: 'Automatically masks names, addresses, phones and emails under common English field labels. Documents, dates of birth, financial details and CVV/CVC are fully hidden. Keeps labels. No matching text or case setting is needed.' },
  { id: 'phoneNumbers', label: 'Hide phone numbers', scope: 'text', description: 'Automatically hides phone-shaped numbers with + or 00 prefixes, or English Phone, Tel, Mobile or Fax labels. Unlabelled local numbers stay visible. No matching text or case setting is needed.' },
  { id: 'paymentCards', label: 'Hide payment card numbers', scope: 'text', description: 'Automatically hides 13–19 digit numbers passing the Luhn checksum, with optional spaces or hyphens. No matching text or case setting is needed. Does not verify card issuance.' },
  { id: 'iban', label: 'Hide IBANs', scope: 'text', description: 'Automatically hides IBANs with a recognized country length and valid MOD-97 checksum. Optional spaces are accepted. No matching text or case setting is needed.' },
  { id: 'emailMaskDomain', label: 'Mask email addresses (including domains)', scope: 'text', description: 'Automatically masks email names and domain labels, keeping the final domain suffix. No matching text or case setting is needed. Full hiding overrides masking.' },
  { id: 'emailHide', label: 'Hide email addresses', scope: 'text', description: 'Automatically hides entire email addresses. Overrides partial masking. No matching text or case setting is needed.' },
  { id: 'text', label: 'Text', scope: 'text', description: 'Hide literal alternatives anywhere in captured text, values, links and metadata. Separate alternatives with space / space.' },
  { id: 'literalText', label: 'Text — single literal', scope: 'text', description: 'Hide the entire matching rule as one literal substring, including spaces and slashes. Preserves older text rules.' },
  { id: 'fieldLabels', label: 'Field labels', scope: 'fields', description: 'Hide field values and nested text when a label contains a literal alternative. Keep the label visible.' },
  { id: 'fieldWords', label: 'Field labels — whole words', scope: 'fields', description: 'Hide field values and nested text when a literal alternative has word boundaries in the field label. Keep the label visible.' },
  { id: 'urlParameters', label: 'URL parameters', scope: 'text', description: 'Hide values after exact parameter names in ?name=value and &name=value. Enter names only, without ?, &, =, # or line breaks.' },
  { id: 'regex', label: 'Regex', scope: 'text', description: 'Hide matches of a regular expression. Use Insert example to start. Enter the expression without / delimiters or flags. Case sensitive controls letter case.' },
  ...DETECTOR_MODES.filter(mode => !['githubTokens', 'awsKeys', 'openaiKeys'].includes(mode.key)).map(mode => ({ id: mode.key, label: mode.label, scope: 'text', description: mode.description })),
] as const;
const CUSTOM_RULE_TYPE_IDS = ['text', 'literalText', 'fieldLabels', 'fieldWords', 'urlParameters', 'regex', 'authorization', 'jwt', 'assignedSecrets'] as const;
export type CustomRuleType = (typeof CUSTOM_RULE_TYPE_IDS)[number];
export function isCustomRuleType(type: unknown): type is CustomRuleType {
  return CUSTOM_RULE_TYPE_IDS.some(id => id === type);
}
export const CUSTOM_RULE_TYPES = RULE_TYPES.filter(type => isCustomRuleType(type.id));

export type RuleType = (typeof RULE_TYPES)[number]['id'] | 'emailMask';
const RETIRED_EMAIL_TYPE = { id: 'emailMask', label: 'Mask email addresses', scope: 'text', description: 'Automatically masks email addresses, keeping at most the first three characters before @ (half for shorter names) and the domain. No matching text or case setting is needed.' } as const;
export const V12_RULE_TYPES = RULE_TYPES.filter(type => !['phoneNumbersMask', 'personalFieldsMask', 'personalFieldsHide'].includes(type.id));
export const V11_RULE_TYPES = V12_RULE_TYPES.filter(type => !['phoneNumbers', 'paymentCards', 'iban'].includes(type.id));
export const V10_RULE_TYPES = [...V11_RULE_TYPES, RETIRED_EMAIL_TYPE];
export const V9_RULE_TYPES = V10_RULE_TYPES.filter(type => type.id !== 'emailMaskDomain');
export const V8_RULE_TYPES = V9_RULE_TYPES.filter(type => !isEmailType(type.id));
export const LEGACY_RULE_TYPES = [
  ...V8_RULE_TYPES.filter(type => type.id !== 'regex'),
  ...DETECTOR_MODES.filter(mode => ['githubTokens', 'awsKeys', 'openaiKeys'].includes(mode.key)).map(mode => ({ id: mode.key, label: mode.label, scope: 'text', description: mode.description })),
];
const supportedType = (id: unknown) => [...RULE_TYPES, RETIRED_EMAIL_TYPE, ...LEGACY_RULE_TYPES].some(type => type.id === id);

export function migrateTokenRule(rule: CustomRedactionRule): CustomRedactionRule {
  if (rule.type === 'emailMask') return { ...rule, type: 'emailMaskDomain', text: '', caseSensitive: false };
  const suffixes: Partial<Record<RuleType, string>> = { githubTokens: '[A-Za-z0-9_]{20,}', awsKeys: '[0-9A-Z]{16}', openaiKeys: '[A-Za-z0-9_-]{16,}' };
  const suffix = rule.type && suffixes[rule.type];
  if (!suffix) return rule;
  const prefixes = customRuleTerms(rule).map(term => term.replace(/[.*+?^${}()|[\]\\]/gu, '\\$&')).join('|');
  return { ...rule, type: 'regex', text: `\\b(?:${prefixes})${suffix}\\b` };
}
const LEGACY_MODE_KEYS = ['fieldLabels', 'urlParameters', ...EXTRA_MODE_KEYS] as const;

/** Bridge typed rules to the existing matching engines; never execute imported definitions. */
export function legacyRuleFromType(rule: CustomRedactionRule): CustomRedactionRule {
  if (!rule.type) return rule;
  const { type, ...base } = rule;
  if (type === 'regex' || isAutomaticType(type)) return rule;
  if (type === 'literalText') return base;
  return { ...base, fieldLabels: type === 'fieldLabels' || type === 'fieldWords', urlParameters: type === 'urlParameters',
    ...(type === 'fieldWords' ? { wholeWords: true } : {}),
    ...Object.fromEntries(DETECTOR_MODES.filter(mode => mode.key === type).map(mode => [mode.key, true])),
  };
}

/** A usable, editable equivalent of a built-in, including literal aliases. */
function legacyBuiltinRule(id: BuiltinFilterId, caseSensitive = ALL_BUILTIN_FILTERS.find(filter => filter.id === id)!.caseSensitive): CustomRedactionRule {
  const builtin = ALL_BUILTIN_FILTERS.find(filter => filter.id === id)!;
  if (id === 'email-mask' || id === 'email-hide' || id === 'email-mask-domain') return { id, name: builtin.name, text: '', type: id === 'email-mask' ? 'emailMask' : id === 'email-mask-domain' ? 'emailMaskDomain' : 'emailHide', caseSensitive: false, enabled: true };
  if (id === 'phone-mask' || id === 'personal-fields-mask') return { id, name: builtin.name, text: '', type: id === 'phone-mask' ? 'phoneNumbersMask' : 'personalFieldsMask', caseSensitive: false, enabled: true };
  if (id === 'phone-numbers' || id === 'payment-cards' || id === 'iban') return { id, name: builtin.name, text: '', type: id === 'phone-numbers' ? 'phoneNumbers' : id === 'payment-cards' ? 'paymentCards' : 'iban', caseSensitive: false, enabled: true };
  if (id === 'personal-fields') return { id, name: builtin.name, text: PERSONAL_FIELD_TERMS, type: 'fieldWords', caseSensitive, enabled: true };
  if (id === 'sensitive-fields') return { id, name: builtin.name, text: 'password / passcode / secret / token / api key / api_key / api-key / apikey / authorization', type: 'fieldWords', caseSensitive, enabled: true };
  if (id === 'query-values') return { id, name: builtin.name, text: 'api key / api_key / api-key / apikey / token / secret / password', type: 'urlParameters', caseSensitive, enabled: true };
  const mode = DETECTOR_MODES.find(mode => mode.builtin === id)!;
  return { id, name: builtin.name, text: mode.terms, type: mode.key, caseSensitive, enabled: true };
}

export function customRuleFromBuiltin(id: BuiltinFilterId, caseSensitive = ALL_BUILTIN_FILTERS.find(filter => filter.id === id)!.caseSensitive): CustomRedactionRule {
  if (id === 'personal-fields') return { id, name: BUILTIN_FILTERS.find(filter => filter.id === id)!.name, text: '', type: 'personalFieldsHide', caseSensitive: false, enabled: true };
  return migrateTokenRule(legacyBuiltinRule(id, caseSensitive));
}

export interface RedactionSettings {
  version: 1 | 2 | 3 | 4 | 5 | 6;
  disabledBuiltins: BuiltinFilterId[];
  customRules: CustomRedactionRule[];
  builtinCaseSensitivity?: Partial<Record<BuiltinFilterId, boolean>>;
}

export function builtinCaseSensitive(settings: RedactionSettings, id: BuiltinFilterId): boolean {
  return settings.builtinCaseSensitivity?.[id] ?? ALL_BUILTIN_FILTERS.find(filter => filter.id === id)!.caseSensitive;
}

export const REDACTION_LIMITS = { rules: 400, name: 80, text: 256, regex: 4096, totalText: 131072, json: 1_000_000 } as const;

/** Lists use a slash surrounded by spaces, leaving URL and path slashes literal. */
export function customRuleTerms(rule: CustomRedactionRule): string[] {
  if (rule.type) return ['literalText', 'regex'].includes(rule.type) ? [rule.text] : rule.text.split(' / ').map(term => term.trim());
  return rule.fieldLabels === undefined && rule.urlParameters === undefined && !EXTRA_MODE_KEYS.some(key => rule[key]) ? [rule.text] : rule.text.split(' / ').map(term => term.trim());
}

export function defaultRedactionSettings(): RedactionSettings {
  return { version: 6, disabledBuiltins: ['email-hide', 'phone-numbers', 'personal-fields'], customRules: [] };
}

/** Return a detached, whitelisted configuration or reject it without partial changes. */
export function validateRedactionSettings(value: unknown): RedactionSettings {
  const invalid = () => { throw new Error('Invalid filters. Check the filter format, built-in IDs and limit of 400 custom filters.'); };
  if (typeof value !== 'object' || value === null) return invalid();
  const candidate = value as Partial<RedactionSettings>;
  const allowedBuiltins = candidate.version! < 4 ? V10_BUILTIN_FILTERS : candidate.version === 4 ? V11_BUILTIN_FILTERS : candidate.version === 5 ? V12_BUILTIN_FILTERS : BUILTIN_FILTERS;
  if (![1, 2, 3, 4, 5, 6].includes(candidate.version!) || !Array.isArray(candidate.disabledBuiltins) || !Array.isArray(candidate.customRules) ||
    candidate.disabledBuiltins.length > allowedBuiltins.length || candidate.customRules.length > REDACTION_LIMITS.rules) return invalid();
  const ids = new Set<string>();
  for (const id of candidate.disabledBuiltins) {
    if (!allowedBuiltins.some(filter => filter.id === id) || ids.has(id)) return invalid();
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
    if (isAutomaticType(item.type)) throw new Error('Automatic filter types are built-in only. Choose a configurable type for custom filters.');
    if (typeof item.name !== 'string' || !item.name.trim() || item.name.length > REDACTION_LIMITS.name ||
      typeof item.text !== 'string' || !item.text.trim() || item.text.length > (item.type === 'regex' ? REDACTION_LIMITS.regex : REDACTION_LIMITS.text) ||
      typeof item.caseSensitive !== 'boolean' || typeof item.enabled !== 'boolean' ||
      LEGACY_MODE_KEYS.some(key => item[key] !== undefined && typeof item[key] !== 'boolean')) return invalid();
    let types: RuleType[];
    if (item.type !== undefined) {
      if (!supportedType(item.type) || LEGACY_MODE_KEYS.some(key => item[key] !== undefined)) return invalid();
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
      const original = { id, name: item.name, text: item.text, type, caseSensitive: item.caseSensitive, enabled: item.enabled };
      if (customRuleTerms(original).some(term => !term.trim())) return invalid();
      const result = migrateTokenRule(original);
      if (!isCustomRuleType(result.type)) return invalid();
      if (result.type === 'regex') {
        try { compileRegex(result.text, result.caseSensitive); }
        catch (error) { throw new Error(`Filter ${customRules.length + 1}: ${error instanceof Error ? error.message : 'Invalid Regex.'}`); }
      }
      if (customRuleTerms(result).some(term => !term.trim())) return invalid();
      if (type === 'urlParameters' && customRuleTerms(result).some(term => /[?&=#\r\n\t]/u.test(term))) return invalid();
      total += result.text.length;
      customRules.push(result);
      if (customRules.length > REDACTION_LIMITS.rules || total > REDACTION_LIMITS.totalText) return invalid();
    }
  }
  const disabledBuiltins = new Set(candidate.disabledBuiltins);
  if (candidate.version === 1) disabledBuiltins.add('email-hide');
  if (candidate.version! < 4) {
    const oldMaskEnabled = !disabledBuiltins.has('email-mask');
    const oldDomainMaskEnabled = candidate.version! >= 3 && !disabledBuiltins.has('email-mask-domain');
    if (oldMaskEnabled || oldDomainMaskEnabled) disabledBuiltins.delete('email-mask-domain');
    else disabledBuiltins.add('email-mask-domain');
    disabledBuiltins.delete('email-mask');
  }
  if (candidate.version! < 5) { disabledBuiltins.add('phone-numbers'); disabledBuiltins.add('personal-fields'); }
  const result: RedactionSettings = { version: 6, disabledBuiltins: BUILTIN_FILTERS.filter(filter => disabledBuiltins.has(filter.id)).map(filter => filter.id), customRules };
  if (candidate.builtinCaseSensitivity !== undefined) {
    const overrides = candidate.builtinCaseSensitivity;
    if (typeof overrides !== 'object' || overrides === null || Array.isArray(overrides) ||
      Object.entries(overrides).some(([id, value]) => !ALL_BUILTIN_FILTERS.some(filter => filter.id === id) || typeof value !== 'boolean' || isAutomaticType(customRuleFromBuiltin(id as BuiltinFilterId).type))) return invalid();
    const entries = BUILTIN_FILTERS.filter(filter => !isAutomaticType(customRuleFromBuiltin(filter.id).type) && overrides[filter.id] !== undefined && overrides[filter.id] !== filter.caseSensitive)
      .map(filter => [filter.id, overrides[filter.id]]);
    if (entries.length) result.builtinCaseSensitivity = Object.fromEntries(entries);
  }
  return result;
}

export function importRedactionSettings(json: string): RedactionSettings {
  if (json.length > REDACTION_LIMITS.json) throw new Error('The filter file is too large. The limit is 1 MB.');
  let parsed: unknown;
  try { parsed = JSON.parse(json.charCodeAt(0) === 0xfeff ? json.slice(1) : json); }
  catch { throw new Error('Invalid JSON. Choose a valid filter export file.'); }
  if (typeof parsed === 'object' && parsed !== null && 'version' in parsed && 'format' in parsed && [2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13].includes(parsed.version as number)) {
    if ([7, 8, 9, 10, 11, 12, 13].includes(parsed.version as number)) return importTypedFilters(parsed);
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
      const builtin = LEGACY_BUILTIN_FILTERS.find(filter => filter.id === value.id);
      const expectedRule = legacy && builtin?.id === 'sensitive-fields'
        ? 'Field labels: password, passcode, secret, token, api key, authorization' :
        detectors && builtin ? legacyBuiltinRule(builtin.id).text : builtin?.matchingRule;
      if (value.type !== 'builtin' || !builtin || seen.has(builtin.id) || typeof value.enabled !== 'boolean' ||
        value.matchingRule !== expectedRule || typeof value.caseSensitive !== 'boolean' ||
        (!unified && value.caseSensitive !== builtin.caseSensitive) ||
        (!legacy && value.fieldLabels !== (builtin.id === 'sensitive-fields')) ||
        (urlModes && value.urlParameters !== (builtin.id === 'query-values')) ||
        (detectors && EXTRA_MODE_KEYS.some(key => value[key] !== (legacyRuleFromType(legacyBuiltinRule(builtin.id))[key] ?? false)))) {
        throw new Error('The file contains unsupported built-in filters. Choose an export from a compatible extension version.');
      }
      seen.add(builtin.id);
      if (value.caseSensitive !== builtin.caseSensitive) builtinCaseSensitivity[builtin.id] = value.caseSensitive;
      if (!value.enabled) disabledBuiltins.push(builtin.id);
    }
    if (seen.size !== LEGACY_BUILTIN_FILTERS.length) throw new Error('The filter file must include every built-in filter.');
    return validateRedactionSettings({ version: 1, disabledBuiltins, customRules, builtinCaseSensitivity });
  }
  // Continue accepting earlier configuration-only exports.
  return validateRedactionSettings(parsed);
}

/** The catalog documents code-defined types; imported text never defines new detectors. */
function importTypedFilters(parsed: object): RedactionSettings {
  const file = parsed as { version?: unknown; format?: unknown; availableRuleTypes?: unknown; filters?: unknown };
  const invalid = () => { throw new Error('Invalid filter file. Use supported rule types from a compatible Copy as Context export.'); };
  const catalog = file.version === 7 ? LEGACY_RULE_TYPES : file.version === 8 ? V8_RULE_TYPES : file.version === 9 ? V9_RULE_TYPES : file.version === 10 ? V10_RULE_TYPES : file.version === 11 ? V11_RULE_TYPES : file.version === 12 ? V12_RULE_TYPES : RULE_TYPES;
  const builtins = file.version === 13 ? BUILTIN_FILTERS : file.version === 12 ? V12_BUILTIN_FILTERS : file.version === 11 ? V11_BUILTIN_FILTERS : file.version === 10 ? V10_BUILTIN_FILTERS : file.version === 9 ? V9_BUILTIN_FILTERS : LEGACY_BUILTIN_FILTERS;
  if (file.format !== 'copy-as-context-filters' || !Array.isArray(file.availableRuleTypes) ||
    file.availableRuleTypes.length !== catalog.length || !Array.isArray(file.filters) ||
    file.filters.length > builtins.length + REDACTION_LIMITS.rules) return invalid();
  const types = new Set<string>();
  for (const item of file.availableRuleTypes) {
    if (typeof item !== 'object' || item === null || !catalog.some(type => type.id === item.id) || types.has(item.id) ||
      typeof item.label !== 'string' || item.label.length > 100 || typeof item.description !== 'string' || item.description.length > 1000 ||
      !['text', 'fields'].includes(item.scope)) return invalid();
    types.add(item.id);
  }
  const seen = new Set<BuiltinFilterId>();
  const settings = defaultRedactionSettings();
  if (file.version === 9 || file.version === 10) {
    settings.version = file.version === 9 ? 2 : 3;
    settings.disabledBuiltins = [];
  }
  for (const item of file.filters) {
    if (typeof item !== 'object' || item === null || !catalog.some(type => type.id === item.type) ||
      typeof item.matchingRule !== 'string' || typeof item.caseSensitive !== 'boolean' || typeof item.enabled !== 'boolean' ||
      'text' in item || LEGACY_MODE_KEYS.some(key => key in item)) return invalid();
    if (item.source === 'custom') {
      if (isAutomaticType(item.type)) throw new Error('Automatic filter types are built-in only. Choose a configurable type for custom filters.');
      settings.customRules.push({ id: item.id, name: item.name, text: item.matchingRule, type: item.type, caseSensitive: item.caseSensitive, enabled: item.enabled });
    } else if (item.source === 'builtin') {
      const builtin = builtins.find(filter => filter.id === item.id);
      if (!builtin || seen.has(builtin.id)) return invalid();
      const expected = file.version === 7 || builtin.id === 'email-mask' || (Number(file.version) < 13 && builtin.id === 'personal-fields') ? legacyBuiltinRule(builtin.id) : customRuleFromBuiltin(builtin.id);
      if (item.type !== expected.type || item.matchingRule !== expected.text || (isAutomaticType(expected.type) && item.caseSensitive !== expected.caseSensitive)) return invalid();
      seen.add(builtin.id);
      settings.disabledBuiltins = settings.disabledBuiltins.filter(id => id !== builtin.id);
      if (!item.enabled) settings.disabledBuiltins.push(builtin.id);
      if (item.caseSensitive !== builtin.caseSensitive) {
        settings.builtinCaseSensitivity ??= {};
        settings.builtinCaseSensitivity[builtin.id] = item.caseSensitive;
      }
    } else return invalid();
  }
  if (seen.size !== builtins.length) return invalid();
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
    version: 13,
    availableRuleTypes: RULE_TYPES,
    filters: [
      ...BUILTIN_FILTERS.map(filter => entry('builtin', {
        ...customRuleFromBuiltin(filter.id, builtinCaseSensitive(config, filter.id)), enabled: !config.disabledBuiltins.includes(filter.id),
      }, filter.description)),
      ...config.customRules.map(rule => entry('custom', rule, '')),
    ],
  }, null, 2)}\n`;
}
