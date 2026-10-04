import type { NodeStates } from '../../core/model';

const ROLES = new Set(('alert alertdialog application article banner blockquote button caption cell checkbox code columnheader combobox complementary contentinfo definition deletion dialog directory document emphasis feed figure form generic grid gridcell group heading img insertion link list listbox listitem log main marquee math menu menubar menuitem menuitemcheckbox menuitemradio meter navigation none note option paragraph presentation progressbar radio radiogroup region row rowgroup rowheader scrollbar search searchbox separator slider spinbutton status strong subscript superscript switch tab table tablist tabpanel term textbox time timer toolbar tooltip tree treegrid treeitem').split(' '));
const CONTENT_NAMES = new Set(('button link heading checkbox radio switch option tab menuitem menuitemcheckbox menuitemradio treeitem cell gridcell columnheader rowheader caption term').split(' '));

export function composedChildren(element: Element): Node[] {
  if (element.shadowRoot) return Array.from(element.shadowRoot.childNodes);
  if (element.localName === 'slot') {
    const assigned = (element as HTMLSlotElement).assignedNodes({ flatten: true });
    if (assigned.length) return assigned;
  }
  if (element.localName === 'details' && !element.hasAttribute('open')) {
    const summary = Array.from(element.children).find((child) => child.localName === 'summary');
    return summary ? [summary] : [];
  }
  if (element.localName === 'input' || element.localName === 'textarea') return [];
  return Array.from(element.childNodes);
}

export function isPassword(element: Element): boolean {
  return element.localName === 'input' && (element as HTMLInputElement).type === 'password';
}

export function isDisabled(element: Element): boolean {
  return element.matches(':disabled') || element.closest('[aria-disabled]')?.getAttribute('aria-disabled') === 'true';
}

export function isFocusable(element: Element): boolean {
  if (isDisabled(element) || element.closest('[inert]')) return false;
  const html = element as HTMLElement;
  return html.tabIndex >= 0 || element.hasAttribute('tabindex') ||
    element.getAttribute('contenteditable') === 'true';
}

export function roleForElement(element: Element): string {
  const explicit = element.getAttribute('role')?.split(/\s+/u).find((role) => ROLES.has(role));
  if (explicit && explicit !== 'none' && explicit !== 'presentation') return explicit;
  if (explicit && !isFocusable(element) && !Array.from(element.attributes).some((attribute) => attribute.name.startsWith('aria-'))) return 'none';
  const tag = element.localName;
  if (/^h[1-6]$/u.test(tag)) return 'heading';
  switch (tag) {
    case 'a': case 'area': return element.hasAttribute('href') ? 'link' : 'generic';
    case 'button': case 'summary': return 'button';
    case 'input': {
      switch ((element as HTMLInputElement).type) {
        case 'button': case 'submit': case 'reset': case 'image': return 'button';
        case 'checkbox': return 'checkbox';
        case 'radio': return 'radio';
        case 'range': return 'slider';
        case 'number': return 'spinbutton';
        case 'search': return 'searchbox';
        default: return element.hasAttribute('list') && !isPassword(element) ? 'combobox' : 'textbox';
      }
    }
    case 'textarea': return 'textbox';
    case 'select': return (element as HTMLSelectElement).multiple || (element as HTMLSelectElement).size > 1 ? 'listbox' : 'combobox';
    case 'option': return 'option';
    case 'optgroup': case 'fieldset': case 'details': return 'group';
    case 'main': return 'main';
    case 'nav': return 'navigation';
    case 'aside': return 'complementary';
    case 'header': case 'footer': return element.parentElement?.closest('article,aside,main,nav,section') ? 'generic' : tag === 'header' ? 'banner' : 'contentinfo';
    case 'section': return element.hasAttribute('aria-label') || element.hasAttribute('aria-labelledby') ? 'region' : 'generic';
    case 'form': return element.hasAttribute('aria-label') || element.hasAttribute('aria-labelledby') || element.hasAttribute('title') ? 'form' : 'generic';
    case 'article': return 'article';
    case 'dialog': return 'dialog';
    case 'ul': case 'ol': return 'list';
    case 'li': return 'listitem';
    case 'table': return 'table';
    case 'thead': case 'tbody': case 'tfoot': return 'rowgroup';
    case 'tr': return 'row';
    case 'td': return 'cell';
    case 'th': return element.getAttribute('scope') === 'row' || element.getAttribute('scope') === 'rowgroup' ? 'rowheader' : 'columnheader';
    case 'caption': return 'caption';
    case 'img': return 'img';
    case 'figure': return 'figure';
    case 'p': return 'paragraph';
    case 'code': case 'strong': case 'em': case 'blockquote': return tag === 'em' ? 'emphasis' : tag;
    case 'hr': return 'separator';
    case 'progress': return 'progressbar';
    case 'meter': return 'meter';
    default: return element.getAttribute('contenteditable') === 'true' ? 'textbox' : 'generic';
  }
}

export function allowsContentName(role: string): boolean { return CONTENT_NAMES.has(role); }

export function elementStates(element: Element, role: string): NodeStates | undefined {
  const states: NodeStates = {};
  if (['checkbox', 'radio', 'switch', 'menuitemcheckbox', 'menuitemradio'].includes(role)) {
    const aria = element.getAttribute('aria-checked');
    if (aria === 'mixed') states.checked = 'mixed';
    else if (aria === 'true' || aria === 'false') states.checked = aria === 'true';
    else if (element.localName === 'input') states.checked = (element as HTMLInputElement).indeterminate ? 'mixed' : (element as HTMLInputElement).checked;
  }
  for (const key of ['expanded', 'selected', 'required', 'disabled', 'readOnly'] as const) {
    const aria = element.getAttribute(`aria-${key.toLowerCase()}`);
    if (aria === 'true' || aria === 'false') states[key] = aria === 'true';
  }
  if (element.localName === 'option') states.selected = (element as HTMLOptionElement).selected;
  if (element.matches('input,textarea,select,button,option,optgroup,fieldset')) states.disabled = isDisabled(element);
  if (element.matches('input,textarea,select')) states.required = (element as HTMLInputElement).required || states.required === true;
  if (element.matches('input,textarea')) states.readOnly = (element as HTMLInputElement).readOnly || states.readOnly === true;
  if (element.localName === 'summary' && element.parentElement?.localName === 'details') states.expanded = element.parentElement.hasAttribute('open');
  if (isFocusable(element)) states.focusable = true;
  if (element.ownerDocument.activeElement === element || element.getRootNode() instanceof element.ownerDocument.defaultView!.ShadowRoot && (element.getRootNode() as ShadowRoot).activeElement === element) states.focused = true;
  return Object.keys(states).length ? states : undefined;
}
