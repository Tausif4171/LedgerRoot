// Only workspace pages are valid post-login destinations. Never accept an external URL.
export function loginReturn(value: string | null): string {
  return value && /^\/(?:documents(?:\/[a-zA-Z0-9_-]+)?|requests|quality)$/.test(value)
    ? value
    : "/documents";
}
export function loginHref(path: string): string {
  return `/login?next=${encodeURIComponent(loginReturn(path))}`;
}
