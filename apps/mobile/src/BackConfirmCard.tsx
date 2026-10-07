import { useEffect } from 'react';
import { AccessibilityInfo, Pressable, StyleSheet, Text, View } from 'react-native';
import { backConfirmCopy } from './backConfirm';
import { cardAnnouncement } from './chromeA11y';
import { CARD_STYLES } from './shellTheme';

/** Shown on Android back at the root of an installed app (src/backConfirm.ts). Both buttons act: stay closes the card, leave exits the app. Modal for a screen reader, announced once when it opens. */
export function BackConfirmCard({ onStay, onLeave }: { onStay: () => void; onLeave: () => void }) {
  const copy = backConfirmCopy();
  useEffect(() => {
    AccessibilityInfo.announceForAccessibility(cardAnnouncement(copy.title, copy.body));
  }, []);
  return (
    <View style={styles.fill} testID="shell-back-confirm" accessibilityViewIsModal>
      <Text style={styles.title} accessibilityRole="header">{copy.title}</Text>
      <Text style={styles.body}>{copy.body}</Text>
      <Pressable accessibilityRole="button" onPress={onStay} style={[styles.button, styles.primary]} testID="shell-back-confirm-stay">
        <Text style={styles.primaryText}>{copy.stay}</Text>
      </Pressable>
      <Pressable accessibilityRole="button" accessibilityHint={copy.leaveHint} onPress={onLeave} style={[styles.button, styles.secondary]} testID="shell-back-confirm-leave">
        <Text style={styles.secondaryText}>{copy.leave}</Text>
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
