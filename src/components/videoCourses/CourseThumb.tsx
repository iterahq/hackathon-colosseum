import { useState } from 'react';
import { Play } from 'lucide-react';
import { thumbGlyph } from '@/utils/videoCourses';

interface Props {
  title: string;
  slug: string;
  src: string | null;
  /** Big centered play glyph (hero) instead of none. */
  play?: boolean;
  className?: string;
}

/** 16:9 course thumbnail; a dark cover with the title, a green edge and a play glyph stands in when the image is missing or fails. */
export function CourseThumb({ title, slug, src, play = false, className = '' }: Props) {
  const [failed, setFailed] = useState(false);
  const showImage = Boolean(src) && !failed;

  return (
    <span className={`relative block aspect-video w-full overflow-hidden bg-[#0A0908] ${className}`}>
      {showImage ? (
        <img src={src ?? undefined} alt="" loading="lazy" decoding="async" onError={() => setFailed(true)} className="h-full w-full object-cover" />
      ) : (
        <span
          data-testid="thumb-fallback"
          data-slug={slug}
          className="relative flex h-full w-full flex-col justify-between overflow-hidden border-t-2 border-t-[#3FD17F] bg-[#141210] p-3"
        >
          <span aria-hidden className="pointer-events-none absolute -right-1 -top-2 select-none [font:700_96px/0.85_'Barlow_Condensed'] text-transparent" style={{ WebkitTextStroke: '1.5px #1D4F36' }}>
            {thumbGlyph(title)}
          </span>
          <span className="relative flex h-6 w-6 items-center justify-center rounded-full border border-[#3FD17F] text-[#3FD17F]">
            <Play className="h-3 w-3 translate-x-px fill-current" />
          </span>
          <span className="relative line-clamp-2 [font:700_24px/1_'Barlow_Condensed'] text-[#F4EDE2]">{title}</span>
        </span>
      )}
      {play && (
        <span aria-hidden className="absolute inset-0 flex items-center justify-center">
          <span className="flex h-16 w-16 items-center justify-center rounded-full border-b-4 border-[#1F8A4F] bg-[#3FD17F] text-[#0A0908] max-sm:h-12 max-sm:w-12">
            <Play className="h-7 w-7 translate-x-0.5 fill-current" />
          </span>
        </span>
      )}
    </span>
  );
}
