import { Pressable, StyleSheet, Text, View } from 'react-native';
import { CARD_STYLES } from './shellTheme';

interface Props {
  title: string;
  body: string;
  onRetry: () => void;
  onOpenBrowser: () => void;
}

/** The failure card: no network at start, a document that answers HTTP 400 or more, a load that timed out. Both buttons work. */
export function OfflineCard({ title, body, onRetry, onOpenBrowser }: Props) {
  return (
    <View style={styles.fill} testID="shell-card">
      <Text style={styles.title}>{title}</Text>
      <Text style={styles.body}>{body}</Text>
      <Pressable accessibilityRole="button" onPress={onRetry} style={[styles.button, styles.primary]} testID="shell-card-retry">
        <Text style={styles.primaryText}>Tentar de novo</Text>
      </Pressable>
      <Pressable accessibilityRole="button" onPress={onOpenBrowser} style={[styles.button, styles.secondary]} testID="shell-card-browser">
        <Text style={styles.secondaryText}>Abrir no navegador</Text>
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
