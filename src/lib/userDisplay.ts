export type DisplayableUser = {
  display_name?: unknown;
  username?: unknown;
};

/** Safely prepare text received from a user profile for display or searching. */
export function normalizeUserText(value: unknown): string {
  return typeof value === 'string' ? value.trim() : '';
}

/** Usernames are displayed and searched without any leading @ supplied by the API. */
export function getNormalizedUsername(user?: DisplayableUser | null): string {
  return normalizeUserText(user?.username).replace(/^@+/, '').trim();
}

/** A search query is case-insensitive and accepts one conventional leading @. */
export function normalizeUserSearchQuery(value: unknown): string {
  return normalizeUserText(value).replace(/^@/, '').toLocaleLowerCase();
}

/** Match only the user-facing identity fields used by participant pickers. */
export function userMatchesSearchQuery(user: DisplayableUser | null | undefined, query: unknown): boolean {
  const normalizedQuery = normalizeUserSearchQuery(query);
  if (!normalizedQuery) return true;

  return normalizeUserText(user?.display_name).toLocaleLowerCase().includes(normalizedQuery)
    || getNormalizedUsername(user).toLocaleLowerCase().includes(normalizedQuery);
}

/** Human-facing name: never use an internal id as a UI fallback. */
export function getUserDisplayName(user?: DisplayableUser | null, fallback = 'User'): string {
  const displayName = normalizeUserText(user?.display_name);
  if (displayName) return displayName;
  const username = getNormalizedUsername(user);
  return username || fallback;
}

/** Secondary username label, always normalized to exactly one leading @. */
export function getUserUsernameLabel(user?: DisplayableUser | null): string | null {
  const username = getNormalizedUsername(user);
  return username ? `@${username}` : null;
}

/** Retained for non-picker callers that deliberately need to hide duplicate labels. */
export function hasDistinctDisplayName(user?: DisplayableUser | null): boolean {
  const displayName = normalizeUserText(user?.display_name);
  const username = getNormalizedUsername(user);
  return Boolean(displayName && displayName !== username);
}
