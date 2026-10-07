import { Alert, Linking, Pressable, StyleSheet, Text, View } from 'react-native';
import { createOpenReporter } from './openExternal';
import { OPEN_FAILED_NOTICE } from './shellChromeState';
import type { UpdateCardCopy } from './shellGate';

// A store link the system refuses is not a silent tap: one short notice, never the URL.
const OPENS = createOpenReporter((notice) => Alert.alert(notice), Date.now, OPEN_FAILED_NOTICE);

/** Full-screen "update the app": a shell older than `minShellVersion`. The store button exists only when the config gave a vetted URL for this platform; "Tentar de novo" reads the config again. */
export function UpdateNowCard({ copy, onRetry }: { copy: UpdateCardCopy; onRetry: () => void }) {
  const { url } = copy;
  return (
    <View style={styles.fill} testID="shell-update-now">
      <Text style={styles.title}>{copy.title}</Text>
      <Text style={styles.body}>{copy.body}</Text>
      {url !== null && copy.button !== null ? (
        <Pressable accessibilityRole="button" onPress={() => void OPENS.attempt(() => Linking.openURL(url))} style={styles.button} testID="shell-update-now-button">
          <Text style={styles.buttonText}>{copy.button}</Text>
        </Pressable>
      ) : (
        <Text style={styles.detail}>{copy.detail}</Text>
      )}
      <Pressable accessibilityRole="button" onPress={onRetry} style={styles.retry} testID="shell-update-now-retry">
        <Text style={styles.retryText}>{copy.retry}</Text>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  fill: { ...StyleSheet.absoluteFill, backgroundColor: '#0A0908', alignItems: 'center', justifyContent: 'center', padding: 32 },
  title: { color: '#F5F1EA', fontSize: 22, fontWeight: '600', textAlign: 'center', marginBottom: 12 },
  body: { color: '#C9C3B8', fontSize: 16, lineHeight: 22, textAlign: 'center' },
  detail: { color: '#8F897E', fontSize: 14, lineHeight: 20, textAlign: 'center', marginTop: 24 },
  button: { height: 48, minWidth: 240, borderRadius: 10, alignItems: 'center', justifyContent: 'center', marginTop: 28, backgroundColor: '#F5F1EA' },
  buttonText: { color: '#0A0908', fontSize: 16, fontWeight: '600' },
  retry: { height: 48, minWidth: 240, borderRadius: 10, alignItems: 'center', justifyContent: 'center', marginTop: 12, borderWidth: 1, borderColor: '#F5F1EA' },
  retryText: { color: '#F5F1EA', fontSize: 16 },
});
