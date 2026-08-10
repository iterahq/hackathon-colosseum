import { ExternalLink } from 'lucide-react';
import type { CodeHelp } from '@iterahq/activity-spec';
import { safeExternalUrl } from '../internal/safeExternalUrl.js';

/**
 * Renders NOTHING when `safeExternalUrl` rejects the authored link, instead of an
 * anchor that does nothing when tapped. Shared by the open editor and the guided
 * variants so the scheme check cannot be present on one surface and missing on
 * the other.
 */
export function CodeHelpLink({ help }: { help: CodeHelp | undefined }) {
  const href = safeExternalUrl(help?.url);
  if (!help || !href) return null;

  return (
    <a
      href={href}
      target="_blank"
      rel="noopener noreferrer"
      data-testid="code-help-link"
      className="mt-2 inline-flex items-center gap-1.5 text-sm text-evergreen-hi hover:underline"
    >
      <ExternalLink className="h-3.5 w-3.5" /> {help.label}
    </a>
  );
}
