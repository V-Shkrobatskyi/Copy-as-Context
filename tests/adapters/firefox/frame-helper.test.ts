// Copyright (c) 2026 Vitalii Shkrobatskyi
// SPDX-License-Identifier: GPL-3.0-only

import { afterEach, describe, expect, it, vi } from 'vitest';
import { JSDOM } from 'jsdom';
import { createFrameHandler } from '@/src/adapters/firefox/frame-helper';
import { DOM_CAPTURE_LIMITS } from '@/src/adapters/dom/limits';
import { isFrameSnapshot, isFrameVerification, type FrameSnapshot, type FrameVerification } from '@/src/adapters/firefox/frame-contract';
import { prepareExport } from '@/src/core';

const windows: JSDOM[] = [];
function setup(markup: string) {
  const dom = new JSDOM(markup, { url: 'https://example.test/' }); windows.push(dom);
  const doc = dom.window.document;
  let next = 1;
  const ids = new Map<Element, number>();
  for (const element of doc.querySelectorAll('iframe,frame')) {
    ids.set(element, next++);
    element.getBoundingClientRect = () => ({ width: 200, height: 100, top: 1000, left: 0, right: 200, bottom: 1100, x: 0, y: 1000, toJSON: () => ({}) });
  }
  const handler = createFrameHandler(doc, target => target === doc.defaultView ? 0 : ids.get(target as Element) ?? -1);
  const capture = (operation = 'test') => handler({ mode: 'capture', operation, limits: { ...DOM_CAPTURE_LIMITS }, maxOwners: 128 }) as FrameSnapshot;
  return { doc, handler, capture, ids };
}
afterEach(() => { windows.splice(0).forEach(dom => dom.window.close()); vi.useRealTimers(); });

describe('isolated Firefox frame helper', () => {
  it('filters hidden and technical owners before capture, retaining below-viewport documents in position', () => {
    const fixture = setup('<p>Before</p><iframe title="Visible" src="https://child.test/path?secret=private"></iframe><div style="opacity:0"><iframe title="Hidden"></iframe></div><iframe title="Pixel"></iframe><p>After</p>');
    const pixel = fixture.doc.querySelector('[title="Pixel"]')!;
    pixel.getBoundingClientRect = () => ({ width: 1, height: 1, top: 0, bottom: 1, left: 0, right: 1, x: 0, y: 0, toJSON: () => ({}) });
    const snapshot = fixture.capture();
    expect(isFrameSnapshot(snapshot, 'test', false)).toBe(true);
    expect(snapshot.owners).toHaveLength(1);
    expect(snapshot.owners[0]).toMatchObject({ frameId: 1, source: 'https://child.test/*' });
    expect(JSON.stringify(snapshot)).not.toContain('secret=');
    if (!snapshot.outcome.ok) throw Error('Capture failed');
    expect(JSON.stringify(snapshot.outcome.tree)).not.toMatch(/Hidden|Pixel/u);
    fixture.handler({ mode: 'release', operation: 'test' });
    expect(fixture.handler({ mode: 'verify', operation: 'test', generation: snapshot.generation })).toBeUndefined();
  });
  it('keeps password getters unread through labels, contenteditable and embedded boundaries for every profile', () => {
    const fixture = setup('<label id="pw">Label<input type="password" value="synthetic-secret"></label><button aria-labelledby="pw">Go</button><div contenteditable="true"><input type="password"></div><iframe title="Checkout"></iframe>');
    for (const input of fixture.doc.querySelectorAll('input')) Object.defineProperty(input, 'value', { get() { throw Error('Password read'); } });
    const snapshot = fixture.capture();
    if (!snapshot.outcome.ok) throw Error(JSON.stringify(snapshot));
    for (const level of ['without', 'detailed', 'compact', 'maximum'] as const) for (const format of ['semantic-text', 'markdown'] as const) {
      expect(prepareExport(snapshot.outcome.tree, level, format, false).serialized.content).not.toContain('synthetic-secret');
    }
    fixture.handler({ mode: 'release', operation: 'test' });
  });
  it('rejects stale generation, changed owner IDs, same-URL document replacement and pagehide', () => {
    const fixture = setup('<iframe title="Widget"></iframe>'); const snapshot = fixture.capture();
    expect(fixture.handler({ mode: 'verify', operation: 'test', generation: 'other' })).toBeUndefined();
    fixture.ids.set(fixture.doc.querySelector('iframe')!, 999);
    const changed = fixture.handler({ mode: 'verify', operation: 'test', generation: snapshot.generation }) as FrameVerification;
    expect(isFrameVerification(changed, 'test', snapshot.generation)).toBe(true);
    expect(changed.owners[0]?.changed).toBe(true);
    fixture.doc.open(); fixture.doc.write('<p>New document, same URL</p>'); fixture.doc.close();
    expect(fixture.handler({ mode: 'verify', operation: 'test', generation: snapshot.generation })).toMatchObject({ valid: false });
    fixture.handler({ mode: 'release', operation: 'test' });
  });
  it('releases listeners and structural references when the background disappears', () => {
    vi.useFakeTimers();
    const fixture = setup('<iframe></iframe>');
    const removed = vi.spyOn(fixture.doc.querySelector('iframe')!, 'removeEventListener');
    const snapshot = fixture.capture();
    vi.advanceTimersByTime(12000);
    expect(removed).toHaveBeenCalledWith('load', expect.any(Function));
    expect(fixture.handler({ mode: 'verify', operation: 'test', generation: snapshot.generation })).toBeUndefined();
    expect(vi.getTimerCount()).toBe(0);
  });
  it('bounds owner inventory and records real aggregate work without changing root URL validation', () => {
    const fixture = setup('<iframe></iframe><iframe></iframe>');
    const snapshot = fixture.handler({ mode: 'capture', operation: 'test', limits: { ...DOM_CAPTURE_LIMITS }, maxOwners: 1 }) as FrameSnapshot;
    expect(isFrameSnapshot(snapshot, 'test', false)).toBe(true);
    expect(snapshot.owners).toHaveLength(1);
    expect(snapshot.work.nodes).toBeGreaterThan(0);
    expect(snapshot.work.visited).toBeGreaterThan(0);
    expect(JSON.stringify(snapshot)).toContain('Not captured: limit exceeded');
    fixture.handler({ mode: 'release', operation: 'test' });
  });
});


describe('origin restriction before DOM capture', () => {
  afterEach(() => vi.unstubAllGlobals());
  it('rejects other origins even with an earlier individual site grant', async () => {
    const { dispatchFrameCommand } = await import('@/src/adapters/firefox/frame-contract');
    const handler = vi.fn(() => 'captured');
    vi.stubGlobal('__copyAsContextFrames', handler);
    vi.stubGlobal('window', { location: { origin: 'https://other.test', href: 'https://other.test/' } });
    const command = { mode: 'capture' as const, operation: 'restricted', limits: { ...DOM_CAPTURE_LIMITS }, maxOwners: 128, allowedOrigin: 'https://root.test' };
    expect(dispatchFrameCommand(command)).toBeUndefined(); expect(handler).not.toHaveBeenCalled();
    vi.stubGlobal('window', { location: { origin: 'https://root.test', href: 'https://root.test/widget' } });
    expect(dispatchFrameCommand(command)).toBe('captured');
  });
  it('allows inherited blank/srcdoc documents and rejects inaccessible parents', async () => {
    const { dispatchFrameCommand } = await import('@/src/adapters/firefox/frame-contract');
    const handler = vi.fn(() => 'captured'); vi.stubGlobal('__copyAsContextFrames', handler);
    const command = { mode: 'capture' as const, operation: 'restricted', limits: { ...DOM_CAPTURE_LIMITS }, maxOwners: 128, allowedOrigin: 'https://root.test' };
    for (const href of ['about:blank', 'about:srcdoc']) {
      vi.stubGlobal('window', { location: { origin: 'null', href }, parent: { location: { origin: 'https://root.test', href: 'https://root.test/' } } });
      expect(dispatchFrameCommand(command)).toBe('captured');
    }
    vi.stubGlobal('window', { location: { origin: 'null', href: 'about:srcdoc' }, get parent() { throw Error('Denied'); } });
    expect(dispatchFrameCommand(command)).toBeUndefined();
    expect(handler).toHaveBeenCalledTimes(2);
  });
});
