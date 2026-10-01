import { renderExportAttribution } from './serializers/attribution';
import type { CompressionLevel, ExportFormat, SerializedContext } from './contracts';
import type { SemanticTree } from './model';
import { redactSemanticTree } from './privacy';
import { serializeMarkdown, serializeSemanticText } from './serializers';
import { serializeMaximum } from './serializers/maximum';
import { countMarkdownCharacters } from './serializers/markdown';
import { countSemanticTextCharacters } from './serializers/semantic-text';
import { compressSemanticTree } from './transforms';

export type SupportedExportFormat = Extract<ExportFormat, 'semantic-text' | 'markdown'>;

export interface PreparedExport {
  serialized: SerializedContext;
  characterCount: number;
  approximateTokenCount: number;
  reductionRatio: number | null;
  redactionCount: number;
}

/** Runs export in the order compression, optional redaction, then serialization. */
export function prepareExport(
  tree: SemanticTree,
  compressionLevel: CompressionLevel,
  format: SupportedExportFormat,
  redactSensitiveData = true,
): PreparedExport {
  // Without is already normalized; serializers and redaction do not mutate it.
  const selectedTree = compressionLevel === 'without' ? tree : compressSemanticTree(tree, compressionLevel);
  const redaction = redactForExport(selectedTree, redactSensitiveData);
  const attribution = renderExportAttribution(compressionLevel, redactSensitiveData);
  const selected = compressionLevel === 'maximum'
    ? serializeMaximum(redaction.tree, format, attribution) : serialize(redaction.tree, format, attribution);
  const baseline = compressionLevel === 'without'
    ? selected.characterCount
    : countCharacters(redactForExport(tree, redactSensitiveData).tree, format, renderExportAttribution('without', redactSensitiveData));
  const characterCount = selected.characterCount;
  const rawRatio = baseline === 0
    ? null
    : 1 - characterCount / baseline;

  return {
    serialized: selected,
    characterCount,
    approximateTokenCount: Math.ceil(characterCount / 4),
    reductionRatio: rawRatio === null ? null : Math.max(0, rawRatio),
    redactionCount: redaction.redactionCount,
  };
}

function redactForExport(tree: SemanticTree, redactSensitiveData: boolean) {
  return redactSensitiveData ? redactSemanticTree(tree) : { tree, redactionCount: 0 };
}

function serialize(tree: SemanticTree, format: SupportedExportFormat, attribution: string): SerializedContext {
  return format === 'semantic-text' ? serializeSemanticText(tree, attribution) : serializeMarkdown(tree, attribution);
}

function countCharacters(tree: SemanticTree, format: SupportedExportFormat, attribution: string): number {
  return format === 'semantic-text' ? countSemanticTextCharacters(tree, attribution) : countMarkdownCharacters(tree, attribution);
}
