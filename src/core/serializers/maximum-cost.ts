/** Conservative local cost model calibrated with cl100k_base/o200k_base (not a tokenizer). */
export function estimateEncodingCost(text: string): number {
  let cost = 0;
  // Repeated punctuation can be a cheap merged token; avoid charging per character.
  const normalized = text.replace(/([\x21-\x2f\x3a-\x40\x5b-\x60\x7b-\x7e])\1{2,}/gu, '$1');
  for (const part of normalized.match(/[A-Za-z]+|[0-9]+|\s+|[^A-Za-z0-9\s]/gu) ?? []) {
    const first = part.charCodeAt(0);
    if (first === 32 || first === 9 || first === 10 || first === 13) cost += part.split('\n').length - 1;
    else if ((first >= 65 && first <= 90) || (first >= 97 && first <= 122)) {
      cost += ROLE_COSTS.get(part) ?? Math.max(1, part.length / 7);
    } else if (first >= 48 && first <= 57) cost += Math.ceil(part.length / 3);
    else cost += part === '•' ? .5 : part.charCodeAt(0) < 128 ? .6 : 1;
  }
  return cost;
}

// Minimum observed savings across two encodings, depths and plain/Markdown role slots.
// Zero-gain pairs such as button/bt and textbox/tb are deliberately absent.
export const ROLE_ALIASES: ReadonlyArray<readonly [string, string]> = [
  ['StaticText', 'st'], ['listitem', 'li'], ['sectionheader', 'sh'],
  ['columnheader', 'ch'], ['LayoutTable', 'lt'], ['rowgroup', 'rg'], ['combobox', 'cb'],
];

const ROLE_COSTS = new Map(ROLE_ALIASES.map(([role]) => [role, 2]));

/** Per-export bounded memoization; indentation contributes no cost in this model. */
export function createEncodingCounter(): { add: (line: string) => void; total: () => number } {
  let cost = 0;
  const costs = new Map<string, number>();
  return {
    add(line) {
      const key = line.trimStart();
      let estimate = costs.get(key);
      if (estimate === undefined) {
        estimate = estimateEncodingCost(`${key}\n`);
        if (costs.size < 4096) costs.set(key, estimate);
      }
      cost += estimate;
    },
    total: () => cost,
  };
}
