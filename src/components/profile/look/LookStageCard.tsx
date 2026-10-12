import { useState } from 'react';
import { ArtViewer } from '@/components/artviewer/ArtViewer';
import { LookStage } from '@/components/wardrobe/LookStage';
import { TeraOriginLine } from '@/components/tera/TeraOriginLine';
import { useI18n } from '@/i18n';
import { loreOf } from '@/lib/teraLoreSafe';
import type { LearnerAvatar } from '@/types/avatar';

const FOCUS = 'focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#3FD17F]';

/** The current look, large, with its name, tier, one line of epithet and a collapsed story. */
export function LookStageCard({ avatar, outfit }: { avatar: LearnerAvatar; outfit: string | null }) {
  const { t, locale } = useI18n();
  const [open, setOpen] = useState(false);
  const [zoom, setZoom] = useState(false);
  const lore = loreOf(avatar.key, locale);
  const name = lore?.name ?? avatar.title;
  return (
    <div className="flex flex-col items-center gap-3 text-center md:w-[220px] md:flex-none">
      <LookStage avatar={avatar} outfit={outfit} className="!h-[150px] !w-[150px] md:!h-[220px] md:!w-[220px]" />
      <h3 className="[font:700_28px/1_'Barlow_Condensed'] text-[#F4EDE2]" data-testid="look-name">{name}</h3>
      <span className="rounded-full border border-[#262320] px-2.5 py-0.5 font-mono text-[10px] uppercase tracking-wider text-[#A0978A]">{avatar.tierName}</span>
      {avatar.origin && <TeraOriginLine origin={avatar.origin} />}
      {lore?.epithet && <p className="max-w-full truncate font-sans text-sm text-[#C9BFB0]">{lore.epithet}</p>}
      <div className="flex gap-4 font-mono text-xs text-[#3FD17F]">
        {lore && (
          <button type="button" aria-expanded={open} onClick={() => setOpen(!open)} className={`min-h-11 underline-offset-4 hover:underline ${FOCUS}`} data-testid="look-story-toggle">
            {open ? t('avatar.look.story.close') : t('avatar.look.story.open')}
          </button>
        )}
        <button type="button" onClick={() => setZoom(true)} className={`min-h-11 underline-offset-4 hover:underline ${FOCUS}`}>{t('avatar.look.zoom')}</button>
      </div>
      {open && lore && (
        <div className="text-left font-sans text-sm text-[#C9BFB0]" data-testid="avatar-story">
          <p>{lore.story}</p>
          {lore.quote && <p className="mt-2 italic text-[#A0978A]">“{lore.quote}”</p>}
        </div>
      )}
      {zoom && <ArtViewer title={name} line={lore?.epithet ?? avatar.tierName} story={lore?.story} asset={avatar.assetAddress} src={avatar.imageUrl} round onClose={() => setZoom(false)} />}
    </div>
  );
}
