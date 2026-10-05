import { Pressable, StyleSheet, Text, View } from 'react-native';
import { BACK_CONFIRM_COPY } from './backConfirm';

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
  fill: { ...StyleSheet.absoluteFill, backgroundColor: '#0A0908', alignItems: 'center', justifyContent: 'center', padding: 32 },
  title: { color: '#F5F1EA', fontSize: 22, fontWeight: '600', textAlign: 'center', marginBottom: 12 },
  body: { color: '#C9C3B8', fontSize: 16, lineHeight: 22, textAlign: 'center', marginBottom: 28 },
  button: { height: 48, minWidth: 240, borderRadius: 10, alignItems: 'center', justifyContent: 'center', marginTop: 12 },
  primary: { backgroundColor: '#F5F1EA' },
  primaryText: { color: '#0A0908', fontSize: 16, fontWeight: '600' },
  secondary: { borderWidth: 1, borderColor: '#F5F1EA' },
  secondaryText: { color: '#F5F1EA', fontSize: 16 },
});
