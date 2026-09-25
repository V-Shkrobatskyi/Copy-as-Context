import type { CaptureResult } from './contracts';

/**
 * Boundary used by adapters to turn plain, adapter-local data into a semantic tree.
 * A Chrome CDP implementation belongs in adapters/chrome, not in this module.
 */
export interface SemanticTreeNormalizer<RawTree> {
  normalize(rawTree: RawTree): CaptureResult;
}
