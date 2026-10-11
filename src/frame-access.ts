/** Only query-free, exact HTTP(S) host patterns may cross the capture/UI boundary. */
export function isFrameAccess(value: unknown): value is string[] {
  return Array.isArray(value) && value.length <= 128 && new Set(value).size === value.length && value.every(pattern => {
    if (typeof pattern !== 'string' || pattern.length > 2_048 || !/^https?:\/\/[^/*]+\/\*$/u.test(pattern)) return false;
    try {
      const url = new URL(pattern.slice(0, -1));
      return !url.username && !url.password && !url.port && pattern === `${url.protocol}//${url.hostname}/*`;
    } catch { return false; }
  });
}
