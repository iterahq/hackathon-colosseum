/**
 * The learner's dashboard, written once for the web and for the shell. It replaces `src/pages/HomePage.tsx`;
 * the markup and the classes are the page's. It is presentational: the host reads the programs, the counts
 * and the medals, decides who is a visitor, and hands over a closed view. The screen holds no query, no
 * router and no session. The program cards are the catalog screen's (`../catalog/ProgramCardView`).
 * A text node names its font, size, line height and colour because a React Native `Text` inherits none of them.
 *
 * Two parts stay with the host, as slots: `live` (the live class in progress and the next scheduled one:
 * they follow the realtime stack of the live class, a DOM zone) and `aside` (what replaces the welcome panel
 * for a visitor: the web's offer, which is commerce and is never drawn in the shell).
 */
import type { ReactNode } from 'react';
import { Pressable, Text, View } from 'react-native';
import type { CatalogIcon, CatalogListState, HomeIcon, HomeView, Translate } from '@iterahq/shell-core';
import { FOCUS_RING, ProgramCardView } from '../catalog/ProgramCardView';
import { CELL, ROW } from '../catalog/grid';
import { Page, PAGE_PROPS } from '../catalog/slots/page';
import { BadgeMedals } from './BadgeMedals';
import { StatsPanel } from './StatsPanel';
import { HERO_TITLE_SIZE, PARAGRAPH } from './slots/webSemantics';

export interface HomeScreenProps {
  t: Translate;
  view: HomeView;
  onOpenProgram: (slug: string) => void;
  onBrowseCatalog: () => void;
  onRetry: () => void;
  /** The chrome above the page (the web: the app header; the shell draws its own). */
  header?: ReactNode;
  /** The live class blocks, between the hero and the programs. Absent where the host has no live class. */
  live?: ReactNode;
  /** A visitor's panel beside the hero. Absent where the host offers nothing. */
  aside?: ReactNode;
  /** The glyphs. Absent where the host has none to give: the screen is drawn without them. */
  icon?: (icon: HomeIcon | CatalogIcon) => ReactNode;
}

const noIcon = () => null;
const noop = () => {};

const PILL = `h-10 flex-row items-center justify-center gap-2 rounded-full bg-evergreen px-5 hover:bg-evergreen-hi ${FOCUS_RING}`;
const PILL_TEXT = 'font-sans text-base font-medium leading-normal text-obsidiana';

function Section({ title, subtitle, children }: { title: string; subtitle?: string; children: ReactNode }) {
  return (
    <View>
      <View className="mb-5 flex-row items-end justify-between">
        <View className="flex-1">
          <Text role="heading" aria-level={3} className="font-display text-base font-bold leading-6 text-foreground">
            {title}
          </Text>
          {subtitle !== undefined && (
            <Text role={PARAGRAPH} className="mt-1 font-sans text-sm leading-5 text-muted-foreground">
              {subtitle}
            </Text>
          )}
        </View>
      </View>
      {children}
    </View>
  );
}

interface ProgramsProps extends Pick<HomeScreenProps, 't' | 'onOpenProgram' | 'onBrowseCatalog' | 'onRetry'> {
  state: CatalogListState;
  visitor: boolean;
  icon: NonNullable<HomeScreenProps['icon']>;
}

function Programs({ state, visitor, t, icon, onOpenProgram, onBrowseCatalog, onRetry }: ProgramsProps) {
  if (state.kind === 'loading') {
    return (
      <View testID="programs-loading" aria-busy className={ROW}>
        {[0, 1, 2].map((i) => (
          <View key={i} className={CELL}>
            <View className="ds-shimmer aspect-16/13 w-full rounded-2xl border border-border bg-card" />
          </View>
        ))}
      </View>
    );
  }
  if (state.kind === 'error') {
    return (
      <View testID="programs-error" className="items-center gap-4 py-12">
        <Text role={PARAGRAPH} className="max-w-md text-center font-sans text-base leading-normal text-muted-foreground">
          {t(visitor ? 'catalog.error' : 'home.error')}
        </Text>
        <Pressable role="button" onPress={onRetry} className={PILL}>
          <Text className={PILL_TEXT}>{t('common.retry')}</Text>
        </Pressable>
      </View>
    );
  }
  if (state.kind === 'empty') {
    return (
      <View testID="programs-empty" className="rounded-3xl border border-dashed border-border bg-card/50 p-12">
        <Text role={PARAGRAPH} className="font-display text-center text-lg leading-7 text-foreground">
          {t(visitor ? 'catalog.empty' : 'home.empty')}
        </Text>
        <Text role={PARAGRAPH} className="mt-2 text-center font-sans text-sm leading-5 text-muted-foreground">
          {t(visitor ? 'catalog.emptyHint' : 'home.emptyHint')}
        </Text>
        {!visitor && (
          <Pressable role="button" testID="programs-empty-browse" onPress={onBrowseCatalog} className={`${PILL} mt-5 self-center`}>
            <View className="text-obsidiana">{icon({ kind: 'browse' })}</View>
            <Text className={PILL_TEXT}>{t('nav.catalog')}</Text>
          </Pressable>
        )}
      </View>
    );
  }
  return (
    <View testID={visitor ? 'programs-grid-locked' : 'programs-grid'} className={ROW}>
      {state.programs.map((card) => (
        <View key={card.id} className={CELL}>
          <ProgramCardView card={card} t={t} icon={icon} onOpen={onOpenProgram} onEnroll={noop} />
        </View>
      ))}
    </View>
  );
}

export function HomeScreen({ t, view, onOpenProgram, onBrowseCatalog, onRetry, header, live, aside, icon = noIcon }: HomeScreenProps) {
  const visitor = view.kind === 'visitor';
  const programs = { state: view.programs, visitor, t, icon, onOpenProgram, onBrowseCatalog, onRetry };

  return (
    <Page {...PAGE_PROPS}>
      {header}

      <View role="main" className="flex-1">
        <View className="mx-auto w-full max-w-[1400px] gap-8 px-4 py-5 md:gap-12 md:px-6 md:py-8">
          <View className="gap-6 lg:flex-row">
            {/* The share of the row is on a box with no border: a flex item never gets narrower than its own border, and the hero would take that pixel from the panel beside it. */}
            <View className="lg:flex-[1.5]">
              <View className="relative flex-1 overflow-hidden rounded-3xl border border-border">
                <View className="relative min-h-[220px] justify-end bg-obsidiana p-6 md:min-h-[260px] md:p-10">
                  <View aria-hidden className="grid-pattern absolute inset-0 opacity-30" />
                  <View className="relative max-w-lg">
                    <View className="flex-row flex-wrap items-center gap-2">
                      <View className="flex-row items-center gap-1.5 rounded-full border border-evergreen/30 bg-evergreen-soft px-2.5 py-1 text-evergreen-hi">
                        {icon({ kind: 'hero' })}
                        <Text className="font-mono text-[11px] uppercase leading-[16.5px] tracking-wider text-evergreen-hi">Itera</Text>
                      </View>
                    </View>
                    <Text
                      role="heading"
                      aria-level={1}
                      className="font-display mt-3 text-[28px] font-bold leading-[1.1] text-foreground md:text-[32px] lg:text-[40px] xl:text-[44px]"
                      style={HERO_TITLE_SIZE}
                    >
                      {t('home.heroTitle')} <Text className="text-gradient">{t('home.heroAccent')}</Text>
                    </Text>
                    <Text role={PARAGRAPH} className="mt-3 max-w-md font-sans text-sm leading-5 text-muted-foreground md:text-base md:leading-6">
                      {t('home.heroSubtitle')}
                    </Text>
                  </View>
                </View>
              </View>
            </View>

            <View className="lg:flex-1">{view.kind === 'member' ? <StatsPanel stats={view.stats} t={t} icon={icon} /> : aside}</View>
          </View>

          {!visitor && live}

          {view.kind === 'visitor' ? (
            <Section title={t('home.visitor.programsTitle')} subtitle={view.hint}>
              <Programs {...programs} />
            </Section>
          ) : (
            <>
              <Section title={t('home.yourPrograms')} subtitle={t('home.programsSubtitle')}>
                <Programs {...programs} />
              </Section>

              <Section title={t('badges.title')} subtitle={t('badges.subtitle')}>
                <View className="rounded-3xl border border-border bg-card p-6 md:p-8">
                  <BadgeMedals state={view.badges} t={t} icon={icon} />
                </View>
              </Section>
            </>
          )}
        </View>
      </View>

      <View role="contentinfo" className="mt-auto shrink-0 border-t border-border">
        <View className="mx-auto w-full max-w-[1400px] flex-row items-center justify-center gap-2 px-4 py-6 md:px-6">
          <Text className="font-sans text-sm leading-5 text-muted-foreground">{t('home.footerBrand')}</Text>
          <Text className="font-sans text-sm leading-5 text-verde-tech">/</Text>
          <Text className="font-sans text-sm leading-5 text-muted-foreground">{t('home.footerBy')}</Text>
        </View>
      </View>
    </Page>
  );
}
