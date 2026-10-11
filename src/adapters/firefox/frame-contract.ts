import type { CaptureOutcome } from '../types';
import type { DomCaptureLimits } from '../dom/limits';
import type { DomCaptureWork } from '../dom/capture';
import { isDomCaptureOutcome } from '../dom/validate';
import { FIREFOX_CAPTURE_LIMITS as LIMITS } from './limits';
import type { FrameVisibility } from './frame-visibility';
import { isFrameAccess } from '../../frame-access';

export interface FrameOwner {
  frameId: number;
  path: number[];
  visibility: 'visible' | 'unknown';
  source: string;
  pending: boolean;
}
export interface FrameSnapshot {
  operation: string;
  generation: string;
  outcome: CaptureOutcome;
  owners: FrameOwner[];
  work: DomCaptureWork;
}
export type FrameCommand = { operation: string } & (
  { mode: 'capture'; limits: DomCaptureLimits; maxOwners: number; allowedOrigin?: string } |
  { mode: 'verify'; generation: string } |
  { mode: 'release' }
);
export interface FrameVerification {
  operation: string;
  generation: string;
  valid: boolean;
  inventoryChanged: boolean;
  owners: { frameId: number; visibility: FrameVisibility; changed: boolean; pending: boolean }[];
}
export type FrameHandler = (command: FrameCommand) => unknown;
export interface FrameGlobal { __copyAsContextFrames?: FrameHandler }

const record = (value: unknown): value is Record<string, unknown> => typeof value === 'object' && value !== null && !Array.isArray(value);
const keys = (value: Record<string, unknown>, allowed: string[]): boolean => Object.keys(value).every(key => allowed.includes(key));
const integer = (value: unknown): value is number => typeof value === 'number' && Number.isSafeInteger(value) && value >= 0;

/** Bound and validate producer data before merging or recursive core transforms. */
export function isFrameSnapshot(value: unknown, operation: string, embedded: boolean): value is FrameSnapshot {
  if (!record(value) || !keys(value, ['operation', 'generation', 'outcome', 'owners', 'work']) || value.operation !== operation ||
    typeof value.generation !== 'string' || value.generation.length > 64 || !value.generation ||
    !isDomCaptureOutcome(value.outcome, embedded) || !Array.isArray(value.owners) || value.owners.length > LIMITS.owners || !record(value.work)) return false;
  const work = value.work;
  if (!keys(work, ['nodes', 'visited', 'nameWork', 'characters', 'milliseconds'])) return false;
  for (const key of ['nodes', 'visited', 'nameWork', 'characters', 'milliseconds']) {
    if (typeof work[key] !== 'number' || !Number.isFinite(work[key]) || work[key] < 0) return false;
  }
  if (!['nodes', 'visited', 'nameWork', 'characters'].every(key => integer(work[key]))) return false;
  if (value.outcome.ok && (Number(work.nodes) > LIMITS.maxNodes || Number(work.characters) > LIMITS.maxCharacters ||
    Number(work.visited) > LIMITS.maxVisited || Number(work.nameWork) > LIMITS.maxVisited)) return false;
  const seen = new Set<number>();
  for (const owner of value.owners) {
    if (!record(owner) || !keys(owner, ['frameId', 'path', 'visibility', 'source', 'pending']) ||
      !integer(owner.frameId) || owner.frameId === 0 || seen.has(owner.frameId) ||
      !Array.isArray(owner.path) || !owner.path.length || owner.path.length > LIMITS.maxDepth + 1 || !owner.path.every(integer) ||
      !['visible', 'unknown'].includes(String(owner.visibility)) || typeof owner.pending !== 'boolean' ||
      typeof owner.source !== 'string' || owner.source !== '' && !isFrameAccess([owner.source])) return false;
    seen.add(owner.frameId);
    if (!value.outcome.ok) return false;
    let node = value.outcome.tree.root;
    for (const index of owner.path) { const child = node.children[index]; if (!child) return false; node = child; }
    if (node.role !== 'embedded-document' || node.children.length || node.value !== 'Not captured: unavailable') return false;
  }
  try { return JSON.stringify(value).length <= LIMITS.maxPayloadCharacters; } catch { return false; }
}

export function isFrameVerification(value: unknown, operation: string, generation: string): value is FrameVerification {
  return record(value) && keys(value, ['operation', 'generation', 'valid', 'inventoryChanged', 'owners']) && value.operation === operation && value.generation === generation &&
    typeof value.valid === 'boolean' && typeof value.inventoryChanged === 'boolean' && Array.isArray(value.owners) && value.owners.length <= LIMITS.owners &&
    new Set(value.owners.map(owner => record(owner) ? owner.frameId : undefined)).size === value.owners.length &&
    value.owners.every(owner => record(owner) && keys(owner, ['frameId', 'visibility', 'changed', 'pending']) && integer(owner.frameId) && owner.frameId > 0 &&
      ['visible', 'hidden', 'technical', 'unknown'].includes(String(owner.visibility)) && typeof owner.changed === 'boolean' && typeof owner.pending === 'boolean');
}

/** Serialized by executeScript; keep this function free of imports and closures. */
export function dispatchFrameCommand(command: FrameCommand): unknown {
  if (command.mode === 'capture' && command.allowedOrigin !== undefined) {
    // Inspect only origin metadata before allowing any child DOM capture. Blank and
    // srcdoc documents inherit their accessible parent's origin; sandboxed frames fail closed.
    try {
      let target: Window = window;
      let origin = target.location.origin;
      for (let depth = 0; origin === 'null' && depth < 8; depth++) {
        if (!['about:blank', 'about:srcdoc'].includes(target.location.href) || target === target.parent) return undefined;
        target = target.parent; origin = target.location.origin;
      }
      if (origin === 'null' || origin !== command.allowedOrigin) return undefined;
    } catch { return undefined; }
  }
  return (globalThis as FrameGlobal).__copyAsContextFrames?.(command);
}
