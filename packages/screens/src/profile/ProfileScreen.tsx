/**
 * The learner's own profile, written once for the web and for the shell. It replaces
 * `src/pages/ProfilePage.tsx`; the markup and the classes are the page's. It is presentational: the host
 * reads and writes the profile and hands over a closed state. The screen holds no query, no router and
 * no session. A text node names its font, size and colour because a React Native `Text` inherits none.
 */
import type { ReactNode } from 'react';
import { Pressable, Text, View } from 'react-native';
import { LEGAL_HELP_PAGES_LIVE, type LegalHelpLinkId, type NavigationIntent, type PersonalizationView, type ProfileFormState, type ProfileIcon, type ProfileImage, type Translate } from '@iterahq/shell-core';
import { FOCUS_RING } from '../catalog/focusRing';
import { IdentityForm } from './IdentityForm';
import { LegalHelpCard } from './LegalHelpCard';
import { PersonalizationCard } from './PersonalizationCard';
import { PageScroll } from './slots/PageScroll';
import { PARAGRAPH } from './slots/webSemantics';

export interface ProfileScreenProps {
  t: Translate;
  state: ProfileFormState;
  onRetry: () => void;
  onEditName: (name: string) => void;
  /** Absent where the host offers no icons. */
  onPickPreset?: (url: string) => void;
  onRevert: () => void;
  onSave: () => void;
  onUploadPhoto?: () => void;
  onUseLearnPhoto?: () => void;
  /** The cast of the exercises. Absent where the host does not hold it: the card is left out. */
  personalization?: PersonalizationView;
  onChangePersonalization?: (fieldId: string, text: string) => void;
  onSavePersonalization?: () => void;
  /** Privacy, terms and support. Drawn only once the pages exist (`LEGAL_HELP_PAGES_LIVE`). */
  legalHelp: Record<LegalHelpLinkId, NavigationIntent>;
  /** The chrome above the page (the web: the app header; the shell draws its own). */
  header?: ReactNode;
  /** What only the web host owns, drawn between the identity card and the cast. The shell passes nothing. */
  webOnly?: ReactNode;
  /** The glyphs. Absent where the host has none to give. */
  icon?: (icon: ProfileIcon) => ReactNode;
  /** The pictures, where the host keeps its own element. Absent: the screen draws them. */
  image?: (image: ProfileImage) => ReactNode;
}

const noIcon = () => null;
const noop = () => {};

export function ProfileScreen(props: ProfileScreenProps) {
  const { t, state, onRetry, personalization, onChangePersonalization = noop, onSavePersonalization = noop, legalHelp, header, webOnly, icon = noIcon } = props;

  return (
    <View className="min-h-screen flex-1 bg-background">
      {header}
      <PageScroll className="mx-auto w-full max-w-2xl px-4 py-8 md:py-12">
        <View role="main" testID="profile-page">
          <Text role="heading" aria-level={1} className="font-display text-3xl text-foreground">
            {t('profile.title')}
          </Text>
          <Text role={PARAGRAPH} className="mt-1.5 font-sans text-sm text-muted-foreground">
            {t('profile.subtitle')}
          </Text>

          {state.kind === 'loading' && (
            <View testID="profile-loading" aria-busy className="mt-8 gap-4">
              <View className="ds-shimmer h-24 w-full rounded-2xl border border-border bg-card" />
              <View className="ds-shimmer h-40 w-full rounded-2xl border border-border bg-card" />
            </View>
          )}

          {state.kind === 'error' && (
            <View testID="profile-error" className="mt-8">
              <Text role={PARAGRAPH} className="font-sans text-base text-destructive">
                {t('profile.loadError')}
              </Text>
              <Pressable role="button" onPress={onRetry} className={`mt-3 h-10 flex-row items-center self-start rounded-full border border-border px-4 hover:border-clay/60 ${FOCUS_RING}`}>
                <Text className="font-sans text-sm text-foreground">{t('common.retry')}</Text>
              </Pressable>
            </View>
          )}

          {state.kind === 'ready' && <IdentityForm {...props} form={state.form} icon={icon} />}

          {webOnly}
          {personalization && <PersonalizationCard t={t} view={personalization} onChange={onChangePersonalization} onSave={onSavePersonalization} />}
          {LEGAL_HELP_PAGES_LIVE && <LegalHelpCard t={t} links={legalHelp} icon={icon} />}
        </View>
      </PageScroll>
    </View>
  );
}
