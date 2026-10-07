import { useEffect } from 'react';
import { AccessibilityInfo, Pressable, StyleSheet, Text, View } from 'react-native';
import { cardAnnouncement, hiddenProps } from './chromeA11y';
import { chromeStrings } from './chromeCopy';
import { CARD_STYLES } from './shellTheme';

interface Props {
  title: string;
  body: string;
  onRetry: () => void;
  onOpenBrowser: () => void;
  /** The leave card is over this one: a screen reader skips it. */
  covered?: boolean;
}

/** The failure card: no network at start, a document that answers HTTP 400 or more, a load that timed out. Both buttons work. Modal for a screen reader, announced once when it appears. */
export function OfflineCard({ title, body, onRetry, onOpenBrowser, covered = false }: Props) {
  useEffect(() => {
    AccessibilityInfo.announceForAccessibility(cardAnnouncement(title, body));
    // Once per appearance: the card mounts when it appears; a later body change is not a new card.
  }, []);
  const t = chromeStrings();
  return (
    <View style={styles.fill} testID="shell-card" accessibilityViewIsModal {...hiddenProps(covered)}>
      <Text style={styles.title} accessibilityRole="header">{title}</Text>
      <Text style={styles.body}>{body}</Text>
      <Pressable accessibilityRole="button" onPress={onRetry} style={[styles.button, styles.primary]} testID="shell-card-retry">
        <Text style={styles.primaryText}>{t.tryAgain}</Text>
      </Pressable>
      <Pressable accessibilityRole="button" onPress={onOpenBrowser} style={[styles.button, styles.secondary]} testID="shell-card-browser">
        <Text style={styles.secondaryText}>{t.openInBrowser}</Text>
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
