import { Pressable, StyleSheet, Text, View } from 'react-native';

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
  fill: { ...StyleSheet.absoluteFill, backgroundColor: '#0A0908', alignItems: 'center', justifyContent: 'center', padding: 32 },
  title: { color: '#F5F1EA', fontSize: 22, fontWeight: '600', textAlign: 'center', marginBottom: 12 },
  body: { color: '#C9C3B8', fontSize: 16, lineHeight: 22, textAlign: 'center', marginBottom: 28 },
  button: { height: 48, minWidth: 240, borderRadius: 10, alignItems: 'center', justifyContent: 'center', marginTop: 12 },
  primary: { backgroundColor: '#F5F1EA' },
  primaryText: { color: '#0A0908', fontSize: 16, fontWeight: '600' },
  secondary: { borderWidth: 1, borderColor: '#F5F1EA' },
  secondaryText: { color: '#F5F1EA', fontSize: 16 },
});
