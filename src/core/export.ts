import type { CompressionLevel, ExportFormat, SerializedContext } from './contracts';
import type { SemanticTree } from './model';
import { redactSemanticTree } from './privacy';
import { serializeMarkdown, serializeSemanticText } from './serializers';
import { compressSemanticTree } from './transforms';

export type SupportedExportFormat = Extract<ExportFormat, 'semantic-text' | 'markdown'>;

export interface PreparedExport {
  serialized: SerializedContext;
  characterCount: number;
  approximateTokenCount: number;
  reductionRatio: number | null;
  redactionCount: number;
}

/** Runs the only supported export order: compression, redaction, then serialization. */
export function prepareExport(
  tree: SemanticTree,
  compressionLevel: CompressionLevel,
  format: SupportedExportFormat,
): PreparedExport {
  const redaction = redactSemanticTree(compressSemanticTree(tree, compressionLevel));
  const selected = serialize(redaction.tree, format);
  const detailed = serialize(redactSemanticTree(compressSemanticTree(tree, 'detailed')).tree, format);
  const characterCount = selected.characterCount;
  const rawRatio = detailed.characterCount === 0
    ? null
    : 1 - characterCount / detailed.characterCount;

  return {
    serialized: selected,
    characterCount,
    approximateTokenCount: Math.ceil(characterCount / 4),
    reductionRatio: rawRatio === null ? null : Math.max(0, rawRatio),
    redactionCount: redaction.redactionCount,
  };
}

function serialize(tree: SemanticTree, format: SupportedExportFormat): SerializedContext {
  return format === 'semantic-text' ? serializeSemanticText(tree) : serializeMarkdown(tree);
}
