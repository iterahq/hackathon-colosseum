import { Pressable, StyleSheet, Text, View } from 'react-native';
import { BACK_CONFIRM_COPY } from './backConfirm';
import { CARD_STYLES } from './shellTheme';

/** Shown on Android back at the root of an installed app (src/backConfirm.ts). Both buttons act: stay closes the card, leave exits the app. */
export function BackConfirmCard({ onStay, onLeave }: { onStay: () => void; onLeave: () => void }) {
  return (
    <View style={styles.fill} testID="shell-back-confirm">
      <Text style={styles.title}>{BACK_CONFIRM_COPY.title}</Text>
      <Text style={styles.body}>{BACK_CONFIRM_COPY.body}</Text>
      <Pressable accessibilityRole="button" onPress={onStay} style={[styles.button, styles.primary]} testID="shell-back-confirm-stay">
        <Text style={styles.primaryText}>{BACK_CONFIRM_COPY.stay}</Text>
      </Pressable>
      <Pressable accessibilityRole="button" onPress={onLeave} style={[styles.button, styles.secondary]} testID="shell-back-confirm-leave">
        <Text style={styles.secondaryText}>{BACK_CONFIRM_COPY.leave}</Text>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  fill: { ...StyleSheet.absoluteFill, ...CARD_STYLES.fill },
  title: CARD_STYLES.title,
  body: { ...CARD_STYLES.body, marginBottom: 28 },
  button: CARD_STYLES.button,
  primary: CARD_STYLES.primary,
  primaryText: CARD_STYLES.primaryText,
  secondary: CARD_STYLES.secondary,
  secondaryText: CARD_STYLES.secondaryText,
});
