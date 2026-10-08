/**
 * One catalog course: the recessed band with the category tile across its edge, the coloured title, the
 * counts and the foot (enrol / open / locked, and on the dashboard the progress of an enrolled course).
 * The markup and the classes are those of the web's `CatalogProgramCard`, `CatalogCard`,
 * `LockedCatalogCard` and `EnrolledProgramCard`, which this replaces.
 * `testID`s are the old `data-testid`s. A text node names its font, size, line height and colour because a
 * React Native `Text` inherits none of them. What React Native cannot draw (the hover lift, the grid
 * texture, the icon set) is left to the web classes that are no-ops there or to the host's `icon` node.
 */
import { useState, type ReactNode } from 'react';
import { Pressable, Text, View } from 'react-native';
import type { CatalogCardView, CatalogIcon, Translate } from '@iterahq/shell-core';
import { FOCUS_RING } from './focusRing';
import { SlashMark } from './SlashMark';
import { linkProps, PARAGRAPH } from './slots/webSemantics';

export interface ProgramCardViewProps {
  card: CatalogCardView;
  t: Translate;
  icon: (icon: CatalogIcon) => ReactNode;
  onOpen: (slug: string) => void;
  onEnroll: (programId: string) => void;
}

/** The band is 30% of the card's content width, between 112 and 136 px (it was `clamp(112px,30cqw,136px)`). */
const bandHeight = (contentWidth: number) => Math.min(136, Math.max(112, contentWidth * 0.3));

/**
 * The ring a keyboard user sees. The browser's own ring is near-black here (`rgb(16,16,16)` on a dark page): the old buttons
 * only looked green for the 150 ms of their colour transition. React Native has no `:focus-visible`: the classes do nothing there.
 */
export { FOCUS_RING };

const CTA = `h-10 w-full flex-row items-center justify-center gap-2 rounded-full px-5 ${FOCUS_RING}`;
const CTA_TEXT = 'font-sans text-base font-medium leading-normal';

function Band({ card, locked, icon }: { card: CatalogCardView; locked: boolean; icon: ProgramCardViewProps['icon'] }) {
  return (
    <View className="relative overflow-hidden rounded-[14px]" style={{ backgroundColor: card.tone.surface, height: '100%' }}>
      <View className="grid-pattern absolute inset-0 opacity-40" aria-hidden />
      <View className="absolute inset-0 rounded-[14px] border" style={{ borderColor: card.tone.edge }} aria-hidden />
      {locked && (
        <View testID="program-card-lock" className="absolute right-3 top-3 h-7 w-7 items-center justify-center rounded-full border border-border bg-obsidiana/80 text-menta">
          {icon({ kind: 'lock-badge' })}
        </View>
      )}
    </View>
  );
}

function Foot({ card, t, icon, onOpen, onEnroll }: ProgramCardViewProps) {
  const action = card.action;
  if (action.kind === 'locked') {
    const offer = action.subscribe;
    return (
      <View testID="locked-catalog-card" className="gap-2">
        {offer && (
          <Pressable role="link" testID="catalog-locked-cta" {...linkProps(offer.link)} className={`${CTA} bg-evergreen text-obsidiana hover:bg-evergreen-hi`}>
            {icon({ kind: 'lock-cta' })}
            <Text className={`${CTA_TEXT} text-obsidiana`}>{offer.label}</Text>
            {icon({ kind: 'next' })}
          </Pressable>
        )}
      </View>
    );
  }
  if (action.kind === 'enrolled') {
    const started = action.percent > 0;
    return (
      <View testID="program-card" className="gap-3">
        {started && (
          <View className="flex-row items-center gap-3">
            <View className="h-1.5 flex-1 overflow-hidden rounded-full bg-muted">
              <View className="h-full bg-evergreen" style={{ width: `${action.percent}%` }} />
            </View>
            <Text className="font-sans text-xs font-medium leading-4 text-evergreen-hi">{action.progress}</Text>
          </View>
        )}
        <Pressable
          role="button"
          testID="program-open"
          onPress={() => onOpen(card.slug)}
          className={`${CTA} ${started ? 'border border-evergreen/40 bg-evergreen-soft text-evergreen-hi hover:bg-evergreen-soft/70' : 'bg-evergreen text-obsidiana hover:bg-evergreen-hi'}`}
        >
          <Text className={`${CTA_TEXT} ${started ? 'text-evergreen-hi' : 'text-obsidiana'}`}>{t(started ? 'program.continue' : 'program.start')}</Text>
          {icon({ kind: 'next' })}
        </Pressable>
      </View>
    );
  }
  return (
    <View testID="catalog-card" data-program-slug={card.slug} className="gap-3">
      {action.kind === 'open' ? (
        <Pressable
          role="button"
          testID="catalog-open"
          onPress={() => onOpen(card.slug)}
          className={`${CTA} border border-evergreen/40 bg-evergreen-soft text-evergreen-hi hover:bg-evergreen-soft/70`}
        >
          {icon({ kind: 'open' })}
          <Text className={`${CTA_TEXT} text-evergreen-hi`}>{t('catalog.open')}</Text>
        </Pressable>
      ) : (
        <Pressable
          role="button"
          testID="catalog-enroll"
          disabled={action.pending}
          onPress={() => onEnroll(card.id)}
          className={`${CTA} bg-evergreen text-obsidiana hover:bg-evergreen-hi${action.pending ? ' opacity-50' : ''}`}
        >
          <Text className={`${CTA_TEXT} text-obsidiana`}>{action.pending ? t('catalog.enrolling') : t('catalog.enroll')}</Text>
          {!action.pending && icon({ kind: 'next' })}
        </Pressable>
      )}
      {action.kind === 'enroll' && action.failed && (
        <Text role={PARAGRAPH} testID="catalog-enroll-error" className="font-sans text-sm leading-normal text-clay">
          {t('catalog.enrollError')}
        </Text>
      )}
    </View>
  );
}

export function ProgramCardView(props: ProgramCardViewProps) {
  const { card, icon, onOpen } = props;
  const [band, setBand] = useState(112);
  const locked = card.action.kind === 'locked';
  const opens = locked || card.action.kind === 'open' || card.action.kind === 'enrolled';
  const counts: [CatalogIcon['kind'], string][] = [
    ['lessons', card.counts.lessons],
    ['units', card.counts.units],
    ['activities', card.counts.activities],
  ];

  return (
    <View testID="catalog-program-card" className="relative flex-1 rounded-3xl border border-border bg-card p-2.5 hover:border-verde-tech/50">
      <View onLayout={(e) => setBand(bandHeight(e.nativeEvent.layout.width))} style={{ height: band }}>
        {opens ? (
          <Pressable role="button" aria-label={card.headline} onPress={() => onOpen(card.slug)} className={`w-full rounded-[14px] ${FOCUS_RING}`} style={{ height: '100%' }}>
            <Band card={card} locked={locked} icon={icon} />
          </Pressable>
        ) : (
          <Band card={card} locked={locked} icon={icon} />
        )}
      </View>

      <View className="flex-1 px-3 pb-2">
        <View className="relative -mt-11 mb-4 self-start">
          <View
            className="h-[88px] w-[88px] items-center justify-center rounded-[22px] outline-solid outline-[5px] outline-card"
            style={{ backgroundColor: card.tone.accent }}
          >
            {icon({ kind: 'category', icon: card.icon })}
          </View>
        </View>

        {/* `font-display` only for its letter-spacing (-0.01em, which the web has always applied over the tracking class): the family itself comes from the base layer. */}
        <Text
          role="heading"
          aria-level={3}
          className="font-display text-[26px] font-semibold leading-[1.12] tracking-[-0.6px] md:text-[30px] lg:text-[28px] xl:text-[32px]"
          style={{ color: card.tone.accent }}
        >
          {card.headline}
        </Text>
        {card.subline !== null && (
          <View className="mt-2 flex-row items-start gap-2">
            <SlashMark className="mt-[4px] h-[15px]" />
            <Text role={PARAGRAPH} className="flex-1 font-sans text-base leading-snug text-foreground/70">
              {card.subline}
            </Text>
          </View>
        )}

        <View role="list" className="mt-3 flex-row flex-wrap items-center gap-x-4 gap-y-1">
          {counts.map(([kind, label]) => (
            <View key={kind} role="listitem" className="flex-row items-center gap-1.5 text-foreground/60">
              {icon({ kind } as CatalogIcon)}
              <Text className="font-sans text-[13px] leading-normal text-foreground/60">{label}</Text>
            </View>
          ))}
        </View>

        <View className="mt-auto pt-4">
          <View className="border-t border-border pt-3">
            <Foot {...props} />
          </View>
        </View>
      </View>
    </View>
  );
}
