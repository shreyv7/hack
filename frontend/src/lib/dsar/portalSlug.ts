/** Extract org slug from `/portal/{org-slug}` browser path. */
export function getPortalOrgSlugFromPath(pathname: string = window.location.pathname): string | null {
  const match = pathname.match(/^\/portal\/([^/]+)\/?$/i);
  return match?.[1] ?? null;
}

export function isPublicPortalPath(pathname: string = window.location.pathname): boolean {
  return getPortalOrgSlugFromPath(pathname) !== null;
}

/** Canonical no-login portal URL for an organization. */
export function buildPublicPortalUrl(orgSlug: string, origin: string = import.meta.env.VITE_PUBLIC_URL || window.location.origin): string {
  const slug = encodeURIComponent(orgSlug.trim());
  return `${origin.replace(/\/$/, '')}/portal/${slug}`;
}
