import type { SemanticNode } from '../../core/model';
import type { CaptureOutcome } from '../types';
import type { CaptureWarningCode } from '../../capture-warnings';
import { CaptureLimitError, DOM_CAPTURE_LIMITS, type DomCaptureLimits } from './limits';
import { allowsContentName, composedChildren, elementStates, isPassword, roleForElement } from './semantics';

const OMIT_TAGS = new Set(['script', 'style', 'template', 'noscript', 'head']);
const clean = (value: string): string => value.replace(/\s+/gu, ' ').trim();

/** A bounded HTML/ARIA approximation, not the browser's computed AX tree. */
export function captureDomPage(doc: Document, limits: DomCaptureLimits = DOM_CAPTURE_LIMITS): CaptureOutcome {
  const started = performance.now();
  let visitedCount = 0;
  let outputCount = 1;
  let characters = 4;
  let nameWork = 0;
  const warnings = new Set<CaptureWarningCode>();
  const styles = new WeakMap<Element, CSSStyleDeclaration>();
  const names = new WeakMap<Element, string>();
  const style = (element: Element): CSSStyleDeclaration => {
    let result = styles.get(element);
    if (!result) { result = doc.defaultView!.getComputedStyle(element); styles.set(element, result); }
    return result;
  };
  const check = (): void => {
    if (performance.now() - started > limits.maxMilliseconds || outputCount > limits.maxNodes ||
      visitedCount > limits.maxVisited || nameWork > limits.maxVisited || characters > limits.maxCharacters) throw new CaptureLimitError();
  };
  const text = (value: string): string => { characters += value.length; check(); return value; };
  const pruned = (element: Element): boolean => OMIT_TAGS.has(element.localName) ||
    element.hasAttribute('hidden') || element.hasAttribute('inert') || element.getAttribute('aria-hidden') === 'true' ||
    element.localName === 'input' && (element as HTMLInputElement).type === 'hidden' ||
    element.localName === 'dialog' && !element.hasAttribute('open') || style(element).display === 'none';

  function textAlternative(root: Element, includeHidden: boolean, exclude?: Element, path = new Set<Element>([root])): string {
    const parts: string[] = [];
    const stack: { node: Node | null; depth: number }[] = [{ node: root, depth: 0 }];
    const seen = new Set<Node>();
    let length = 0;
    const add = (value: string): void => { length += value.length; if (length > limits.maxCharacters) throw new CaptureLimitError(); parts.push(value); };
    while (stack.length) {
      const { node, depth } = stack.pop()!;
      nameWork++; check();
      if (node === null) { add(' '); continue; }
      if (depth > limits.maxDepth) throw new CaptureLimitError();
      if (seen.has(node) || node === exclude) continue;
      seen.add(node);
      if (node.nodeType === 3) { add(node.textContent ?? ''); continue; }
      if (node.nodeType !== 1) continue;
      const element = node as Element;
      if (OMIT_TAGS.has(element.localName) || ['iframe', 'frame', 'canvas'].includes(element.localName) || !includeHidden && (pruned(element) || style(element).visibility === 'hidden' || style(element).visibility === 'collapse')) continue;
      // Never read a password value, including controls embedded in referenced labels.
      if (isPassword(element)) continue;
      if (element !== root && element.hasAttribute('aria-labelledby')) {
        add(` ${accessibleName(element, path, includeHidden)} `); continue;
      }
      const aria = element.getAttribute('aria-label');
      if (element !== root && aria) { add(` ${aria} `); continue; }
      if (element.localName === 'img' || element.localName === 'input' && (element as HTMLInputElement).type === 'image') { add(` ${element.getAttribute('alt') ?? ''} `); continue; }
      if (element.localName === 'input' || element.localName === 'textarea') {
        if (element !== root) add(` ${(element as HTMLInputElement).value} `);
        continue;
      }
      if (element.localName === 'select') { add(` ${Array.from((element as HTMLSelectElement).selectedOptions).map((option) => option.label).join(' ')} `); continue; }
      if (element.localName === 'br') { add(' '); continue; }
      if (element !== root && /^(?:block|flex|grid|list-item|table(?:-|$))/u.test(style(element).display)) {
        add(' '); stack.push({ node: null, depth });
      }
      const children = composedChildren(element);
      if (nameWork + stack.length + children.length > limits.maxVisited) throw new CaptureLimitError();
      for (let i = children.length - 1; i >= 0; i--) stack.push({ node: children[i]!, depth: depth + 1 });
    }
    return clean(parts.join(''));
  }

  function accessibleName(element: Element, path = new Set<Element>(), referenced = false): string {
    check();
    if (path.has(element)) return '';
    if (path.size > 32) throw new CaptureLimitError();
    const next = new Set(path).add(element);
    const scope = element.getRootNode() as Document | ShadowRoot;
    const refs = element.getAttribute('aria-labelledby')?.trim().split(/\s+/u).map((id) => scope.getElementById?.(id)).filter((ref): ref is HTMLElement => !!ref) ?? [];
    if (refs.length) return clean(refs.map((ref) => accessibleName(ref, next, true)).join(' '));
    const aria = clean(element.getAttribute('aria-label') ?? '');
    if (aria) return aria;
    const labels = (element as HTMLInputElement).labels;
    if (labels?.length) return clean(Array.from(labels).map((label) => textAlternative(label, false, element, next)).join(' '));
    if (element.localName === 'img') return element.getAttribute('alt') ?? element.getAttribute('title') ?? '';
    if (element.localName === 'input') {
      const input = element as HTMLInputElement;
      if (input.type === 'image') return input.alt || input.title || 'Submit';
      if (['button', 'submit', 'reset'].includes(input.type)) return input.value || (input.type === 'submit' ? 'Submit' : input.type === 'reset' ? 'Reset' : '');
    }
    const captionTag = ({ fieldset: 'legend', table: 'caption', figure: 'figcaption', svg: 'title' } as Record<string, string>)[element.localName];
    if (captionTag) {
      const caption = Array.from(element.children).find((child) => child.localName === captionTag);
      if (caption) return textAlternative(caption, false, undefined, next);
    }
    if (element.localName === 'optgroup') return element.getAttribute('label') ?? '';
    if (element.localName === 'option' && element.hasAttribute('label')) return (element as HTMLOptionElement).label;
    if (referenced || allowsContentName(roleForElement(element))) {
      const content = textAlternative(element, referenced, undefined, next);
      if (content) return content;
    }
    return element.getAttribute('title') ?? '';
  }

  try {
    if (!doc.body || !doc.defaultView) return { ok: false, error: { code: 'unsupported-page', message: 'This document cannot be captured.' } };
    const root: SemanticNode = { role: 'page', children: [] };
    const stack = [{ node: doc.body as Node, parent: root, depth: 0, listLevel: 0 }];
    const visited = new WeakSet<Node>();
    while (stack.length) {
      const { node, parent, depth, listLevel } = stack.pop()!;
      visitedCount++; check();
      if (depth > limits.maxDepth) throw new CaptureLimitError();
      if (visited.has(node)) continue;
      visited.add(node);
      if (node.nodeType === 3) {
        const value = clean(node.textContent ?? '');
        if (value) { outputCount++; parent.children.push({ role: text('StaticText'), name: text(value), children: [] }); check(); }
        continue;
      }
      if (node.nodeType !== 1) continue;
      const element = node as Element;
      if (pruned(element)) continue;
      const hidden = style(element).visibility === 'hidden' || style(element).visibility === 'collapse';
      const role = roleForElement(element);
      const nextListLevel = listLevel + Number(role === 'list');
      let container = parent;
      if (element !== doc.body && !hidden) {
        const output: SemanticNode = { role: text(role), children: [] };
        outputCount++; check();
        let name = names.get(element);
        if (name === undefined) { name = accessibleName(element); names.set(element, name); }
        if (name) output.name = text(clean(name));
        const states = elementStates(element, role);
        if (states) output.states = states;
        const ariaLevel = Number(element.getAttribute('aria-level'));
        if (Number.isInteger(ariaLevel) && ariaLevel > 0) output.level = ariaLevel;
        else if (/^h[1-6]$/u.test(element.localName)) output.level = Number(element.localName[1]);
        else if (role === 'listitem' && listLevel > 0) output.level = listLevel;
        if (element.matches('input,textarea,select') && !isPassword(element) && !['button', 'checkbox', 'radio'].includes(role)) output.value = text((element as HTMLInputElement).value);
        else if (element.getAttribute('contenteditable') === 'true') output.value = text(textAlternative(element, false));
        else if (['slider', 'spinbutton', 'progressbar', 'meter'].includes(role)) {
          const value = element.getAttribute('aria-valuetext') ?? element.getAttribute('aria-valuenow') ?? (element.matches('progress,meter') ? String((element as HTMLProgressElement).value) : null);
          if (value !== null) output.value = text(value);
        }
        if (role === 'link' && element.hasAttribute('href')) {
          try {
            const url = new URL(element.getAttribute('href')!, doc.baseURI);
            if (['http:', 'https:', 'mailto:', 'tel:'].includes(url.protocol)) output.href = text(url.href);
          } catch { /* Invalid links are omitted without exposing their raw value. */ }
        }
        parent.children.push(output); container = output;
        if (element.localName === 'iframe' || element.localName === 'frame') warnings.add('embedded-frames');
        if (element.localName === 'canvas') warnings.add('canvas-content');
      }
      if (element.localName === 'iframe' || element.localName === 'frame' || element.localName === 'canvas') continue;
      let children = composedChildren(element);
      if (hidden) children = children.filter((child) => child.nodeType !== 3);
      if (visitedCount + stack.length + children.length > limits.maxVisited) throw new CaptureLimitError();
      for (let i = children.length - 1; i >= 0; i--) stack.push({ node: children[i]!, parent: container, depth: depth + 1, listLevel: nextListLevel });
    }
    const tree = { schemaVersion: 1 as const, title: text(doc.title || 'Untitled page'), sourceUrl: text(doc.location.href), root };
    const result: CaptureOutcome = { ok: true, tree, ...(warnings.size ? { warnings: [...warnings] } : {}) };
    if (JSON.stringify(result).length > limits.maxPayloadCharacters) throw new CaptureLimitError();
    return result;
  } catch (error) {
    return { ok: false, error: {
      code: error instanceof CaptureLimitError ? 'capture-limit' : 'capture-failed',
      message: error instanceof CaptureLimitError ? 'This page exceeds the capture limits.' : 'Unable to read this page’s semantic structure.',
    } };
  }
}
