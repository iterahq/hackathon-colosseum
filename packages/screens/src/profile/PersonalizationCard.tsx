import { Pressable, Text, TextInput, View } from 'react-native';
import type { PersonalizationView, Translate } from '@iterahq/shell-core';
import { FOCUS_RING } from '../catalog/focusRing';
import { DISABLED_CURSOR, KEEP_FOCUS_ON_ENTER, PARAGRAPH, PLACEHOLDER_COLOR } from './slots/webSemantics';

export interface PersonalizationCardProps {
  t: Translate;
  view: PersonalizationView;
  onChange: (fieldId: string, text: string) => void;
  onSave: () => void;
}

/** Where the learner sees and changes the whole cast the exercises use. An emptied field goes back to its example name. */
export function PersonalizationCard({ t, view, onChange, onSave }: PersonalizationCardProps) {
  return (
    <View testID="personalization-section" className="mt-6 rounded-3xl border border-border bg-card p-6 md:p-8">
      <Text role="heading" aria-level={2} className="font-display text-xl text-foreground">
        {t('personalization.section')}
      </Text>
      <Text role={PARAGRAPH} className="mt-1.5 font-sans text-sm text-muted-foreground">
        {t('personalization.sectionHint')}
      </Text>

      <View className="mt-6">
        <View className="-m-2 flex-row flex-wrap">
          {view.fields.map((field) => (
            <View key={field.id} className="w-full p-2 sm:w-1/2">
              <Text className="translate-y-[2px] font-mono text-xs uppercase leading-6 tracking-wider text-muted-foreground">{field.label}</Text>
              <TextInput
                testID={`personalization-input-${field.id}`}
                aria-label={field.label}
                value={field.value}
                onChangeText={(text) => onChange(field.id, text)}
                inputMode={field.numeric ? 'numeric' : 'text'}
                {...KEEP_FOCUS_ON_ENTER}
                placeholder={field.placeholder}
                placeholderTextColor={PLACEHOLDER_COLOR}
                className="mt-1.5 w-full rounded-xl border border-border bg-background px-4 py-3 font-sans text-base leading-normal text-foreground outline-none focus:border-clay/60"
              />
            </View>
          ))}
        </View>
      </View>

      {view.saved && (
        <Text role={PARAGRAPH} testID="personalization-saved" className="mt-5 font-sans text-sm text-evergreen-hi">
          {t('personalization.saved')}
        </Text>
      )}

      <Pressable
        role="button"
        testID="personalization-save"
        disabled={!view.canSave}
        onPress={onSave}
        className={`mt-5 h-12 w-full items-center justify-center rounded-full bg-evergreen hover:bg-evergreen-hi ${FOCUS_RING} ${view.canSave ? '' : `opacity-40 ${DISABLED_CURSOR}`}`}
      >
        <Text className="font-sans text-base font-medium text-obsidiana">{view.saving ? t('personalization.saving') : t('profile.save')}</Text>
      </Pressable>
    </View>
  );
}
