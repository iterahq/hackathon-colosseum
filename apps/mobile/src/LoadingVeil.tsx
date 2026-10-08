import { useEffect, useRef, useState } from 'react';
import { AccessibilityInfo, Animated, Image, StyleSheet, useWindowDimensions, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { hiddenProps, veilMotion } from './chromeA11y';
import { chromeStrings } from './chromeCopy';
import { VEIL_STYLES } from './shellTheme';
import SPLASH_LOGO from '../assets/splash-icon.png';
import { VEIL_FADE_MS } from './shellChromeState';

/**
 * Covers the WebView until the document has loaded: the launch screen's logo, where the launch screen drew it, and a thin bar sliding along the top.
 * The logo is the splash asset at the splash size, centred on the SCREEN (the veil sits inside the safe area, so it shifts by half the inset difference):
 * the hand-off from the launch screen to the veil moves nothing.
 * The fade is VEIL_FADE_MS; once it has finished the veil unmounts, so it never sits on a touch.
 * A screen reader reads it as one progress bar named "Carregando" (not the logo); with reduce-motion on the bar rests and the fade is instant.
 */
export function LoadingVeil({ visible }: { visible: boolean }) {
  const opacity = useRef(new Animated.Value(visible ? 1 : 0)).current;
  const slide = useRef(new Animated.Value(0)).current;
  const [mounted, setMounted] = useState(visible);
  const { width } = useWindowDimensions();
  const insets = useSafeAreaInsets();
  const reduceMotion = useReduceMotion();
  const motion = veilMotion(reduceMotion, width, VEIL_FADE_MS);

  useEffect(() => {
    if (visible) setMounted(true);
    Animated.timing(opacity, { toValue: visible ? 1 : 0, duration: motion.fadeMs, useNativeDriver: true }).start(({ finished }) => {
      if (finished && !visible) setMounted(false);
    });
  }, [visible, opacity, motion.fadeMs]);

  useEffect(() => {
    if (!mounted || !motion.loop) return undefined;
    const loop = Animated.loop(Animated.timing(slide, { toValue: 1, duration: 1200, useNativeDriver: true }));
    loop.start();
    return () => loop.stop();
  }, [mounted, motion.loop, slide]);

  if (!mounted) return null;
  return (
    <Animated.View
      pointerEvents={visible ? 'auto' : 'none'}
      style={[styles.fill, { opacity }]}
      testID="shell-veil"
      accessible={visible}
      accessibilityRole="progressbar"
      accessibilityLabel={chromeStrings().veilLabel}
      {...hiddenProps(!visible)}
    >
      <Animated.View
        style={[
          styles.bar,
          { width: motion.barWidth },
          motion.loop && { transform: [{ translateX: slide.interpolate({ inputRange: [0, 1], outputRange: [-motion.barWidth, width] }) }] },
        ]}
      />
      <View style={styles.center} importantForAccessibility="no-hide-descendants" accessibilityElementsHidden>
        <Image source={SPLASH_LOGO} style={[styles.logo, { transform: [{ translateY: (insets.bottom - insets.top) / 2 }] }]} resizeMode="contain" />
      </View>
    </Animated.View>
  );
}

// `SPLASH_LOGO`: same file and width as the `expo-splash-screen` entry of app.json.
const SPLASH_LOGO_SIZE = 200;

const styles = StyleSheet.create({
  fill: { ...StyleSheet.absoluteFill, ...VEIL_STYLES.fill },
  bar: { position: 'absolute', top: 0, left: 0, height: 2, ...VEIL_STYLES.bar },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  logo: { width: SPLASH_LOGO_SIZE, height: SPLASH_LOGO_SIZE },
});

/** Whether the system asks for less motion; follows the setting while the veil is up. */
function useReduceMotion(): boolean {
  const [reduce, setReduce] = useState(false);
  useEffect(() => {
    let live = true;
    void AccessibilityInfo.isReduceMotionEnabled().then((on) => live && setReduce(on));
    const subscription = AccessibilityInfo.addEventListener('reduceMotionChanged', setReduce);
    return () => {
      live = false;
      subscription.remove();
    };
  }, []);
  return reduce;
}
