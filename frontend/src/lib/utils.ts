import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';

/**
 * Merge conditional class names and resolve Tailwind class conflicts.
 *
 * Combines {@link https://github.com/lukeed/clsx | clsx} for conditional class
 * composition with {@link https://github.com/dcastil/tailwind-merge | tailwind-merge}
 * so that later Tailwind utilities win over earlier conflicting ones.
 *
 * @param inputs - Class values (strings, arrays, or conditional objects).
 * @returns A single, de-duplicated className string.
 */
export function cn(...inputs: ClassValue[]): string {
  return twMerge(clsx(inputs));
}
