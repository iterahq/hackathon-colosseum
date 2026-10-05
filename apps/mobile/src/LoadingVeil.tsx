import { useEffect, useRef, useState } from 'react';
import { Animated, StyleSheet, Text, useWindowDimensions, View } from 'react-native';
import { VEIL_FADE_MS } from './shellChromeState';

/**
 * Covers the WebView until the document has loaded: monogram and a thin bar sliding along the top.
 * The fade is VEIL_FADE_MS; once it has finished the veil unmounts, so it never sits on a touch.
 */
export function LoadingVeil({ visible }: { visible: boolean }) {
  const opacity = useRef(new Animated.Value(visible ? 1 : 0)).current;
  const slide = useRef(new Animated.Value(0)).current;
  const [mounted, setMounted] = useState(visible);
  const { width } = useWindowDimensions();

  useEffect(() => {
    if (visible) setMounted(true);
    Animated.timing(opacity, { toValue: visible ? 1 : 0, duration: VEIL_FADE_MS, useNativeDriver: true }).start(({ finished }) => {
      if (finished && !visible) setMounted(false);
    });
  }, [visible, opacity]);

  useEffect(() => {
    if (!mounted) return undefined;
    const loop = Animated.loop(Animated.timing(slide, { toValue: 1, duration: 1200, useNativeDriver: true }));
    loop.start();
    return () => loop.stop();
  }, [mounted, slide]);

  if (!mounted) return null;
  const bar = width * 0.4;
  return (
    <Animated.View pointerEvents={visible ? 'auto' : 'none'} style={[styles.fill, { opacity }]} testID="shell-veil">
      <Animated.View
        style={[styles.bar, { width: bar, transform: [{ translateX: slide.interpolate({ inputRange: [0, 1], outputRange: [-bar, width] }) }] }]}
      />
      <View style={styles.center}>
        <Text style={styles.monogram}>i</Text>
      </View>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  fill: { ...StyleSheet.absoluteFill, backgroundColor: '#0A0908' },
  bar: { position: 'absolute', top: 0, left: 0, height: 2, backgroundColor: '#F5F1EA' },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  monogram: { color: '#F5F1EA', fontSize: 64, fontWeight: '700' },
});
