import type { ReactNode } from 'react';
import { ExternalLink, GraduationCap, Undo2, Upload } from 'lucide-react';
import type { ProfileIcon, ProfileImage } from '@iterahq/shell-core';

/** The glyphs of the universal profile screen on the web: the lucide icons the old page drew, at the sizes it drew them. */
export function profileScreenIcon(icon: ProfileIcon): ReactNode {
  switch (icon.kind) {
    case 'revert':
      return <Undo2 className="w-4 h-4" />;
    case 'upload':
      return <Upload className="w-4 h-4" />;
    case 'learn-photo':
      return <GraduationCap className="w-4 h-4" />;
    case 'external':
      return <ExternalLink className="w-4 h-4" />;
  }
}

/** The pictures of the screen on the web: the elements of the old page (a photo host never gets a referrer). */
export function profileScreenImage(image: ProfileImage): ReactNode {
  if (image.kind === 'preset') return <img src={image.uri} alt="" className="w-full h-full object-cover" />;
  return (
    <img
      src={image.uri}
      alt={image.label}
      referrerPolicy="no-referrer"
      className="w-20 h-20 rounded-full object-cover border-2 border-evergreen/40"
      data-testid="profile-avatar-preview"
    />
  );
}
