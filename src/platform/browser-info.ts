interface Brand { brand: string; version: string }
export interface BrowserInfoDependencies {
  getBrowserInfo?: () => Promise<{ name: string; version: string }>;
  getPlatformInfo?: () => Promise<{ os: string }>;
  userAgent?: string;
  userAgentData?: {
    brands?: Brand[];
    platform?: string;
    getHighEntropyValues?: (hints: string[]) => Promise<{ fullVersionList?: Brand[] }>;
  };
}

function clean(value: string | undefined): string {
  return (value ?? '').replace(/[\u0000-\u001f\u007f-\u009f]/gu, ' ').trim().slice(0, 80);
}

function version(value: string | undefined): string {
  const text = clean(value);
  if (!/^\d+(?:\.\d+)*(?:[ab]\d+|esr)?$/u.test(text)) return '';
  return text.replace(/^(\d+)\.0\.0\.0$/u, '$1');
}

function platform(os: string | undefined, ua: string): string {
  if (os === 'android' || os === 'Android' || /Android/u.test(ua)) return 'Android';
  if (['mac', 'win', 'linux', 'cros', 'openbsd', 'Windows', 'macOS', 'Linux', 'Chrome OS'].includes(os ?? '')
    || /Windows|Macintosh|X11|CrOS/u.test(ua)) return 'Desktop';
  return '';
}

async function bounded<T>(read: (() => Promise<T>) | undefined, timeoutMs: number): Promise<T | undefined> {
  if (!read) return undefined;
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    return await Promise.race([
      Promise.resolve().then(read),
      new Promise<undefined>((resolve) => { timer = setTimeout(() => resolve(undefined), timeoutMs); }),
    ]);
  } catch { return undefined; }
  finally { clearTimeout(timer); }
}

/** Reads only local runtime metadata; failures must never prevent a page export. */
export async function resolveBrowserInfo(deps: BrowserInfoDependencies, timeoutMs = 250): Promise<string> {
  const ua = (deps.userAgent ?? '').slice(0, 2048);
  const [runtime, os, hints] = await Promise.all([
    bounded(deps.getBrowserInfo, timeoutMs),
    bounded(deps.getPlatformInfo, timeoutMs),
    bounded(deps.userAgentData?.getHighEntropyValues
      ? () => deps.userAgentData!.getHighEntropyValues!(['fullVersionList']) : undefined, timeoutMs),
  ]);
  let name = clean(runtime?.name);
  let browserVersion = version(runtime?.version);
  if (!name) {
    const brands = hints?.fullVersionList ?? deps.userAgentData?.brands ?? [];
    for (const [brand, label] of [['Microsoft Edge', 'Edge'], ['Opera', 'Opera'], ['Brave', 'Brave'], ['Google Chrome', 'Chrome'], ['Chromium', 'Chromium']]) {
      const entry = brands.find((item) => item.brand === brand);
      if (entry) { name = label!; browserVersion = version(entry.version); break; }
    }
    // Explicit derivative tokens take priority over a generic Chrome brand.
    for (const [pattern, label] of [[/Edg(?:A|iOS)?\/([\d.]+)/u, 'Edge'], [/OPR\/([\d.]+)/u, 'Opera'], [/Firefox\/([\d.ab]+)/u, 'Firefox']] as const) {
      const match = ua.match(pattern);
      if (match && name !== label) { name = label; browserVersion = version(match[1]); break; }
    }
    if (!name) {
      const match = ua.match(/(?:Chrome|Chromium)\/([\d.]+)/u);
      if (match) { name = 'Chromium'; browserVersion = version(match[1]); }
    }
  }
  if (!name) return 'Unavailable';
  return [name, platform(os?.os ?? deps.userAgentData?.platform, ua), browserVersion].filter(Boolean).join(' ');
}
