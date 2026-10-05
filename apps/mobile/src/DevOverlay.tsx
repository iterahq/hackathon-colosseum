import { StyleSheet, Text, View } from 'react-native';

interface Props {
  version: string;
  url: string;
  /** How many console errors the page forwarded since the shell opened (the forwarder of consoleMessage.ts). */
  forwardedErrors: number;
}

/**
 * Dev-only strip over the page: shell version, the URL the WebView is on and the count of forwarded
 * errors. It takes no touches, so it never sits on a lesson button.
 */
export function DevOverlay({ version, url, forwardedErrors }: Props) {
  return (
    <View pointerEvents="none" style={styles.wrap}>
      <View style={styles.strip}>
        <Text style={styles.text}>{`Shell ${version}`}</Text>
        <Text style={styles.text} numberOfLines={2}>{`URL ${url}`}</Text>
        <Text style={[styles.text, forwardedErrors > 0 && styles.error]}>{`Erros encaminhados: ${forwardedErrors}`}</Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { position: 'absolute', left: 0, right: 0, bottom: 0 },
  strip: { backgroundColor: 'rgba(10, 9, 8, 0.85)', paddingHorizontal: 8, paddingVertical: 4 },
  text: { color: '#F5F1EA', fontSize: 11 },
  error: { color: '#FF8A7A' },
});
