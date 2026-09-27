import type { SemanticTree } from '../../core';

export interface ChromeTabDocumentMetadata {
  title?: string;
  url?: string;
}

/**
 * Adds document-level metadata supplied by the active tab and removes the
 * equivalent fields from the normalized page root to avoid duplicate export.
 */
export function addChromeDocumentMetadata(
  tree: SemanticTree,
  tab: ChromeTabDocumentMetadata,
  capturedAt: string,
): SemanticTree {
  const { name: rootTitle, href: rootUrl, ...rootWithoutDocumentMetadata } = tree.root;

  return {
    ...tree,
    title: documentTitle(tab.title, rootTitle),
    sourceUrl: tab.url ?? rootUrl,
    capturedAt,
    root: rootWithoutDocumentMetadata,
  };
}

function documentTitle(tabTitle: string | undefined, rootTitle: string | undefined): string {
  return tabTitle?.trim() || rootTitle?.trim() || 'Untitled page';
}
