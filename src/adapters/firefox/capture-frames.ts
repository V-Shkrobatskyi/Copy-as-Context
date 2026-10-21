// Copyright (c) 2026 Vitalii Shkrobatskyi
// SPDX-License-Identifier: GPL-3.0-only

import type { CaptureControls } from '../types';
import { sourceAllowed } from '../../policy/sources';
import type { CaptureTab } from '../capture';
import type { CaptureOutcome } from '../types';
import type { CaptureErrorCode, SemanticNode } from '../../core';
import { isDomCaptureOutcome } from '../dom/validate';
import { DOM_CAPTURE_LIMITS, type DomCaptureLimits } from '../dom/limits';
import { FIREFOX_CAPTURE_LIMITS as LIMITS } from './limits';
import { dispatchFrameCommand, isFrameSnapshot, isFrameVerification, type FrameCommand, type FrameSnapshot } from './frame-contract';

export type FrameInjection = { target: { tabId: number; frameIds: number[] }; world: 'ISOLATED' } & (
  { files: string[] } | { func: typeof dispatchFrameCommand; args: [FrameCommand] }
);
export interface FirefoxFrameClient {
  allowCrossOrigin?(): Promise<boolean>;
  execute(details: FrameInjection): Promise<{ frameId: number; result?: unknown; error?: unknown }[]>;
  getTab(tabId: number): Promise<{ url?: string }>;
  onUpdated(listener: (tabId: number, info: { status?: string; url?: string }) => void): () => void;
  onRemoved(listener: (tabId: number) => void): () => void;
}
class FrameFailure extends Error {
  constructor(readonly code: CaptureErrorCode) { super(code); }
}
const failure = (code: CaptureErrorCode): CaptureOutcome => ({ ok: false, error: { code, message: ({
  'page-changed': 'The page changed before capture finished.',
  'permission-denied': 'The browser denied access to this page.',
  'capture-timeout': 'Page capture took too long. Try again.',
  'capture-limit': 'This page exceeds the capture limits.',
  'invalid-tree': 'The page returned an invalid semantic tree.',
  'unsupported-page': 'This document cannot be captured.',
  'policy-blocked': 'Capture of this source is disabled by site restrictions.',
} as Partial<Record<CaptureErrorCode, string>>)[code] ?? 'Unable to capture this page’s semantic structure.' } });
function errorCode(error: unknown): CaptureErrorCode {
  if (error instanceof FrameFailure) return error.code;
  const message = error instanceof Error ? error.message.toLowerCase() : '';
  if (/permission|not allowed|cannot access|restricted|access denied/u.test(message)) return 'permission-denied';
  if (/no tab|invalid tab|tab.*closed|frame.*removed/u.test(message)) return 'page-changed';
  return 'capture-failed';
}
interface CapturedFrame { frameId: number; snapshot: FrameSnapshot; node: SemanticNode; boundary?: SemanticNode; children: CapturedFrame[] }

/** Capture only selected documents, sequentially, with one budget and operation identity. */
export function createFirefoxCapturer(client: FirefoxFrameClient): (tab: CaptureTab, capturedAt: string, selection?: string, signal?: AbortSignal, controls?: CaptureControls) => Promise<CaptureOutcome> {
  const inFlight = new Set<number>();
  return async (tab, capturedAt, selection, signal, controls) => {
    if (inFlight.has(tab.id)) return failure('capture-failed');
    inFlight.add(tab.id);
    const operation = crypto.randomUUID();
    const deadline = Date.now() + LIMITS.captureMs;
    const installed = new Set<number>();
    const seen = new Set<number>();
    const candidates = new Set<string>();
    let navigation = false;
    let policyPartial = false;
    let closed = false;
    let documents = 0;
    let ownerCount = 0;
    let payload = 0;
    let inventoryChanged = false;
    let allowedOrigin: string | undefined;
    const remaining: DomCaptureLimits = { ...DOM_CAPTURE_LIMITS };
    const stopUpdated = client.onUpdated((id, info) => { if (id === tab.id && (info.status === 'loading' || info.url !== undefined)) navigation = true; });
    const stopRemoved = client.onRemoved(id => { if (id === tab.id) navigation = true; });
    const bounded = async <T>(promise: Promise<T>, milliseconds: number = LIMITS.commandMs): Promise<T> => {
      const wait = Math.min(milliseconds, deadline - Date.now());
      let timer: ReturnType<typeof setTimeout> | undefined;
      try {
        if (wait <= 0) throw new FrameFailure('capture-timeout');
        const value = await Promise.race([promise, new Promise<never>((_resolve, reject) => { timer = setTimeout(() => reject(new FrameFailure('capture-timeout')), wait); })]);
        if (closed || navigation || signal?.aborted || Date.now() >= deadline) throw new FrameFailure(navigation || signal?.aborted ? 'page-changed' : 'capture-timeout');
        return value;
      } finally { clearTimeout(timer); }
    };
    const release = (frameId: number): void => {
      // Cleanup belongs to this token, even if an old injection finishes after a newer export.
      void client.execute({ target: { tabId: tab.id, frameIds: [frameId] }, world: 'ISOLATED', func: dispatchFrameCommand,
        args: [{ mode: 'release', operation }] }).catch(() => {});
    };
    const command = async (frameId: number, details: FrameCommand): Promise<unknown> => {
      if (navigation || closed) throw new FrameFailure(navigation ? 'page-changed' : 'capture-timeout');
      const raw = client.execute({ target: { tabId: tab.id, frameIds: [frameId] }, world: 'ISOLATED', func: dispatchFrameCommand, args: [details] });
      if (details.mode === 'capture') void raw.then(() => { if (closed) release(frameId); }, () => {});
      const results = await bounded(raw);
      const result = results[0];
      if (results.length !== 1 || result?.frameId !== frameId) throw new FrameFailure('invalid-tree');
      if (result.error !== undefined) throw new FrameFailure('capture-failed');
      return result.result;
    };
    const read = async (frameId: number, boundary?: SemanticNode, baseDepth = 0): Promise<CapturedFrame> => {
      if (seen.has(frameId)) throw new FrameFailure('invalid-tree');
      seen.add(frameId); documents++;
      installed.add(frameId);
      await bounded(client.execute({ target: { tabId: tab.id, frameIds: [frameId] }, world: 'ISOLATED', files: ['/frame-capture.js'] }));
      const snapshot = await command(frameId, { mode: 'capture', operation, ...(controls ? { controls } : {}), ...(frameId === 0 && selection ? { selection } : {}),
        limits: { ...remaining, maxDepth: Math.max(0, LIMITS.maxDepth - baseDepth) }, maxOwners: LIMITS.owners - ownerCount, ...(frameId !== 0 && allowedOrigin !== undefined ? { allowedOrigin } : {}) });
      if (!isFrameSnapshot(snapshot, operation, frameId !== 0)) throw new FrameFailure('invalid-tree');
      remaining.maxNodes -= snapshot.work.nodes;
      remaining.maxVisited -= snapshot.work.visited + snapshot.work.nameWork;
      remaining.maxCharacters -= snapshot.work.characters;
      remaining.maxMilliseconds -= snapshot.work.milliseconds;
      payload += JSON.stringify(snapshot).length;
      ownerCount += snapshot.owners.length;
      if (!snapshot.outcome.ok) throw new FrameFailure(snapshot.outcome.error.code);
      if (remaining.maxNodes < 0 || remaining.maxVisited < 0 || remaining.maxCharacters < 0 || remaining.maxMilliseconds < 0 || payload > LIMITS.maxPayloadCharacters) throw new FrameFailure('capture-limit');
      const node = snapshot.outcome.tree.root;
      const stack = [{ node, depth: baseDepth }];
      while (stack.length) {
        const item = stack.pop()!;
        if (item.depth > LIMITS.maxDepth) throw new FrameFailure('capture-limit');
        for (const child of item.node.children) stack.push({ node: child, depth: item.depth + 1 });
      }
      if (frameId !== 0 && snapshot.outcome.tree.title) node.name = snapshot.outcome.tree.title;
      return { frameId, snapshot, node, boundary, children: [] };
    };
    const boundaryAt = (frame: CapturedFrame, path: number[]): SemanticNode => {
      let node = frame.node;
      for (const index of path) node = node.children[index]!;
      return node;
    };
    const visit = async (frame: CapturedFrame, depth: number, baseDepth: number): Promise<void> => {
      for (const owner of frame.snapshot.owners) {
        const boundary = boundaryAt(frame, owner.path);
        if (navigation) throw new FrameFailure('page-changed');
        if (owner.visibility !== 'visible') { boundary.value = 'Not captured: visibility unknown'; continue; }
        if (owner.pending) { boundary.value = 'Not captured: not loaded'; continue; }
        if (documents >= LIMITS.documents || depth >= LIMITS.frameDepth || remaining.maxNodes <= 1 || remaining.maxVisited <= 0 ||
          remaining.maxCharacters < 256 || remaining.maxMilliseconds <= 0 || deadline - Date.now() < LIMITS.commandMs ||
          baseDepth + owner.path.length + 1 >= LIMITS.maxDepth) { boundary.value = 'Not captured: limit exceeded'; continue; }
        try {
          const before = await command(frame.frameId, { mode: 'verify', operation, generation: frame.snapshot.generation });
          if (!isFrameVerification(before, operation, frame.snapshot.generation) || !before.valid) throw new FrameFailure('page-changed');
          const current = before.owners.find(item => item.frameId === owner.frameId);
          if (!current || current.changed) throw new FrameFailure('page-changed');
          if (current.visibility !== 'visible') { boundary.value = 'Not captured: visibility unknown'; continue; }
          const child = await read(owner.frameId, boundary, baseDepth + owner.path.length + 1);
          boundary.value = 'Captured'; boundary.children = [child.node];
          frame.children.push(child);
          await visit(child, depth + 1, baseDepth + owner.path.length + 1);
        } catch (error) {
          const code = errorCode(error);
          boundary.children = [];
          boundary.value = code === 'page-changed' ? 'Not captured: document changed' : /limit|timeout/u.test(code) ? 'Not captured: limit exceeded' : 'Not captured: unavailable';
          if (code === 'policy-blocked') { boundary.role = '__omitted-frame'; policyPartial = true; }
          if (code === 'permission-denied' && (!controls?.sources || sourceAllowed(owner.source.replace(/\/\*$/u, '/'), controls.sources)) && owner.source && candidates.size < LIMITS.owners) candidates.add(owner.source);
        }
      }
    };
    const verify = async (frame: CapturedFrame): Promise<void> => {
      try {
        const result = await command(frame.frameId, { mode: 'verify', operation, generation: frame.snapshot.generation });
        if (!isFrameVerification(result, operation, frame.snapshot.generation) || !result.valid || result.owners.length !== frame.snapshot.owners.length) throw new FrameFailure('page-changed');
        if (result.inventoryChanged) inventoryChanged = true;
        for (const owner of frame.snapshot.owners) {
          const state = result.owners.find(item => item.frameId === owner.frameId);
          const boundary = boundaryAt(frame, owner.path);
          if (!state || state.changed) { boundary.children = []; boundary.value = 'Not captured: document changed'; }
          else if (state.visibility === 'hidden' || state.visibility === 'technical') {
            // Defer removal until every original path has been resolved.
            boundary.children = []; boundary.role = '__omitted-frame';
          } else if (state.visibility !== 'visible') { boundary.children = []; boundary.value = 'Not captured: visibility unknown'; }
          else if (state.pending) { boundary.children = []; boundary.value = 'Not captured: not loaded'; }
        }
        for (const child of frame.children) if (child.boundary?.value === 'Captured' && child.boundary.role !== '__omitted-frame') await verify(child);
      } catch (error) {
        if (!frame.boundary) throw error;
        frame.boundary.children = []; frame.boundary.value = 'Not captured: document changed';
      }
    };
    try {
      if (!sourceAllowed(tab.url, controls?.sources)) throw new FrameFailure('policy-blocked');
      const crossOrigin = client.allowCrossOrigin ? await bounded(client.allowCrossOrigin()) : true;
      const root = await read(0);
      if (!crossOrigin && root.snapshot.outcome.ok) allowedOrigin = new URL(root.snapshot.outcome.tree.sourceUrl!).origin;
      await visit(root, 0, 0);
      await verify(root);
      const current = await bounded(client.getTab(tab.id));
      const outcome = root.snapshot.outcome;
      if (!outcome.ok) return outcome;
      if (navigation || current.url !== undefined && current.url !== outcome.tree.sourceUrl || tab.url !== undefined && tab.url !== outcome.tree.sourceUrl) throw new FrameFailure('page-changed');
      const warnings = new Set<'canvas-content' | 'embedded-frames-partial' | 'source-policy-omitted'>();
      if (policyPartial) warnings.add('source-policy-omitted');
      if (inventoryChanged) warnings.add('embedded-frames-partial');
      const collect = (frame: CapturedFrame): void => {
        if (frame.snapshot.outcome.ok && frame.snapshot.outcome.warnings?.includes('canvas-content')) warnings.add('canvas-content');
        for (const child of frame.children) if (child.boundary?.value === 'Captured') collect(child);
      };
      collect(root);
      const stack = [{ node: root.node, depth: 0 }];
      while (stack.length) {
        const { node, depth } = stack.pop()!;
        if (depth > LIMITS.maxDepth) throw new FrameFailure('capture-limit');
        node.children = node.children.filter(child => child.role !== '__omitted-frame');
        if (node.role === 'embedded-document' && node.value !== 'Captured') warnings.add('embedded-frames-partial');
        for (const child of node.children) stack.push({ node: child, depth: depth + 1 });
      }
      const result: CaptureOutcome = { ok: true, tree: outcome.tree,
        ...(warnings.size ? { warnings: [...warnings] } : {}), ...(candidates.size ? { frameAccess: [...candidates] } : {}) };
      if (!isDomCaptureOutcome({ ok: true, tree: result.tree, ...(result.warnings ? { warnings: result.warnings } : {}) }) || JSON.stringify(result).length > LIMITS.maxPayloadCharacters) throw new FrameFailure('capture-limit');
      result.tree.capturedAt = capturedAt;
      return result;
    } catch (error) { return failure(navigation ? 'page-changed' : errorCode(error)); }
    finally {
      closed = true;
      stopUpdated(); stopRemoved();
      for (const frameId of installed) release(frameId);
      inFlight.delete(tab.id);
    }
  };
}
