export const DOM_CAPTURE_LIMITS = {
  maxNodes: 20_000,
  maxVisited: 100_000,
  maxDepth: 128,
  maxCharacters: 1_000_000,
  maxMilliseconds: 2_000,
  maxPayloadCharacters: 6_500_000,
} as const;

export type DomCaptureLimits = { [Key in keyof typeof DOM_CAPTURE_LIMITS]: number };

export class CaptureLimitError extends Error {}
