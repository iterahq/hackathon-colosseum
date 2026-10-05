import { createElement } from 'react';
import { iconForCategory } from '@/utils/iconForCategory';

/**
 * The 88px flat icon tile, filled with the category accent, dark ink icon —
 * the "text on fill" pairing the brand guide marks as correct for the green
 * CTA. A ring in the card's own color descolls it from the thumbnail it
 * crosses (`-mt-11` on the caller, so it sits half on the thumbnail, half on
 * the card body).
 */
export function CategoryTile({ icon, accent }: { icon?: string; accent: string }) {
  return (
    <div
      className="flex items-center justify-center w-[88px] h-[88px] rounded-[22px] outline-solid outline-[5px] outline-card group-hover:scale-105 transition-transform duration-500"
      style={{ backgroundColor: accent }}
    >
      {createElement(iconForCategory(icon), { className: 'w-10 h-10 text-brand-bg', strokeWidth: 2.25 })}
    </div>
  );
}
