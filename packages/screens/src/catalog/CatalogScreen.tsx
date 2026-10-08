/**
 * The course catalog, written once for the web and for the shell. It replaces `src/pages/CatalogPage.tsx`;
 * the markup and the classes are the page's. It is presentational: the host reads the catalog, decides who
 * may enroll and who sees locked cards, and hands over the list already shaped for display, as a closed
 * state. The screen holds no query, no router and no session.
 * A text node names its font, size, line height and colour because a React Native `Text` inherits none of them.
 */
import type { ReactNode } from 'react';
import { Pressable, Text, View } from 'react-native';
import { lastWord, type CatalogIcon, type CatalogListState, type Translate } from '@iterahq/shell-core';
import { FOCUS_RING, ProgramCardView } from './ProgramCardView';
import { SlashMark } from './SlashMark';
import { Page, PAGE_PROPS } from './slots/page';
import { PARAGRAPH } from './slots/webSemantics';

export interface CatalogScreenProps {
  t: Translate;
  state: CatalogListState;
  onOpenProgram: (slug: string) => void;
  onEnroll: (programId: string) => void;
  onRetry: () => void;
  /** The chrome above the page (the web: the app header; the shell draws its own). */
  header?: ReactNode;
  /** The glyphs of the cards. Absent where the host has none to give: the card is drawn without them. */
  icon?: (icon: CatalogIcon) => ReactNode;
}

const noIcon = () => null;

/** A card of the list: a third of the row on a wide screen, half on a tablet, the whole row on a phone (the old `grid`). */
const CELL = 'w-full p-2.5 md:w-1/2 lg:w-1/3';
const ROW = '-m-2.5 flex-row flex-wrap';

function Skeleton() {
  return (
    <View className={ROW}>
      {[0, 1, 2].map((i) => (
        <View key={i} className={CELL}>
          <View className="ds-shimmer aspect-[16/12] w-full rounded-2xl border border-border bg-card" />
        </View>
      ))}
    </View>
  );
}

export function CatalogScreen({ t, state, onOpenProgram, onEnroll, onRetry, header, icon = noIcon }: CatalogScreenProps) {
  const title = lastWord(t('catalog.title'));

  return (
    <Page {...PAGE_PROPS}>
      {header}

      <View role="main" className="flex-1">
        <View className="mx-auto w-full max-w-[1400px] gap-8 px-4 py-5 md:px-6 md:py-8">
          <View>
            <View className="flex-row items-center gap-2">
              <SlashMark className="h-3" />
              <Text role={PARAGRAPH} className="font-mono text-[11px] uppercase leading-normal tracking-wider text-foreground/60">{t('nav.catalog')}</Text>
            </View>
            {/* `font-display` only for its letter-spacing (-0.01em, over the tracking class, as on the old page): the family itself comes from the base layer. */}
            <Text role="heading" aria-level={1} className="font-display mt-3 text-4xl font-bold leading-[1.05] tracking-[-0.5px] text-foreground md:text-5xl">
              {title.rest}
              <Text className="text-evergreen-hi">{title.last}</Text>
            </Text>
            <Text role={PARAGRAPH} className="mt-3 max-w-xl font-sans text-[17px] leading-[1.45] text-foreground/60">
              {t('catalog.subtitle')}
            </Text>
          </View>

          {state.kind === 'loading' && <Skeleton />}

          {state.kind === 'error' && (
            <View testID="catalog-error" className="items-center gap-4 py-12">
              <Text role={PARAGRAPH} className="max-w-md text-center font-sans text-base leading-normal text-muted-foreground">
                {t('catalog.error')}
              </Text>
              <Pressable role="button" onPress={onRetry} className={`h-10 flex-row items-center justify-center rounded-full bg-evergreen px-5 hover:bg-evergreen-hi ${FOCUS_RING}`}>
                <Text className="font-sans text-base font-medium leading-normal text-obsidiana">{t('common.retry')}</Text>
              </Pressable>
            </View>
          )}

          {state.kind === 'empty' && (
            <View testID="catalog-empty" className="rounded-3xl border border-dashed border-border bg-card/50 p-12">
              <Text role={PARAGRAPH} className="font-display text-center text-lg leading-7 text-foreground">
                {t('catalog.empty')}
              </Text>
              <Text role={PARAGRAPH} className="mt-2 text-center font-sans text-sm leading-5 text-muted-foreground">
                {t('catalog.emptyHint')}
              </Text>
            </View>
          )}

          {state.kind === 'ready' && (
            <View testID="catalog-grid" className={ROW}>
              {state.programs.map((card) => (
                <View key={card.id} className={CELL}>
                  <ProgramCardView card={card} t={t} icon={icon} onOpen={onOpenProgram} onEnroll={onEnroll} />
                </View>
              ))}
            </View>
          )}
        </View>
      </View>
    </Page>
  );
}
