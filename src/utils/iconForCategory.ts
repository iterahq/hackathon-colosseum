import type { LucideIcon } from 'lucide-react';
import { ICON_MAP } from '@/components/branded/ProgramIcon';

/** Resolves a program's `icon` key to its lucide icon, defaulting to `code`. */
export function iconForCategory(icon?: string): LucideIcon {
  return ICON_MAP[icon ?? ''] ?? ICON_MAP.code;
}
