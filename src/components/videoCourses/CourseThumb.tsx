import { useState } from 'react';
import { Play } from 'lucide-react';
import { courseColor } from '@/utils/courses';
import { thumbGlyph } from '@/utils/videoCourses';

interface Props {
  title: string;
  slug: string;
  src: string | null;
  /** Big centered play glyph (hero) instead of none. */
  play?: boolean;
  className?: string;
}

/** 16:9 course thumbnail; a colored block with a 3-letter glyph stands in when the image is missing or fails. */
export function CourseThumb({ title, slug, src, play = false, className = '' }: Props) {
  const [failed, setFailed] = useState(false);
  const color = courseColor(slug);
  const showImage = Boolean(src) && !failed;

  return (
    <span className={`relative block aspect-video w-full overflow-hidden bg-[#0A0908] ${className}`}>
      {showImage ? (
        <img src={src ?? undefined} alt="" loading="lazy" decoding="async" onError={() => setFailed(true)} className="h-full w-full object-cover" />
      ) : (
        <span data-testid="thumb-fallback" className="flex h-full w-full items-center justify-center [font:700_44px_JetBrains_Mono]" style={{ background: color.c, color: color.ink }}>
          {thumbGlyph(title)}
        </span>
      )}
      {play && (
        <span aria-hidden className="absolute inset-0 flex items-center justify-center">
          <span className="flex h-16 w-16 items-center justify-center rounded-full border-b-4 border-[#B8913A] bg-[#F2C66D] text-[#0A0908] max-sm:h-12 max-sm:w-12">
            <Play className="h-7 w-7 translate-x-0.5 fill-current" />
          </span>
        </span>
      )}
    </span>
  );
}
