import { Pressable, StyleSheet, Text, View } from 'react-native';

interface Props {
  version: string;
  url: string;
  /** The description of the last WebView load error, or null. */
  failure: string | null;
  onRetry: () => void;
}

/**
 * Dev-only strip over the page: shell version, the URL the WebView is on and, after a load error, a
 * working retry. It takes no touches while there is no error, so it never sits on a lesson button.
 */
export function DevOverlay({ version, url, failure, onRetry }: Props) {
  return (
    <View pointerEvents="box-none" style={styles.wrap}>
      <View pointerEvents={failure === null ? 'none' : 'auto'} style={styles.strip}>
        <Text style={styles.text}>{`Shell ${version}`}</Text>
        <Text style={styles.text} numberOfLines={2}>{`URL ${url}`}</Text>
        {failure !== null ? (
          <View style={styles.row}>
            <Text style={[styles.text, styles.error]} numberOfLines={2}>{`Erro: ${failure}`}</Text>
            <Pressable accessibilityRole="button" onPress={onRetry} style={styles.retry}>
              <Text style={styles.retryText}>Tentar de novo</Text>
            </Pressable>
          </View>
        ) : null}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { position: 'absolute', left: 0, right: 0, bottom: 0 },
  strip: { backgroundColor: 'rgba(10, 9, 8, 0.85)', paddingHorizontal: 8, paddingVertical: 4 },
  text: { color: '#F5F1EA', fontSize: 11 },
  error: { flex: 1, color: '#FF8A7A' },
  row: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  retry: { minHeight: 32, justifyContent: 'center', paddingHorizontal: 10, backgroundColor: '#F5F1EA', borderRadius: 6 },
  retryText: { color: '#0A0908', fontSize: 12 },
});
