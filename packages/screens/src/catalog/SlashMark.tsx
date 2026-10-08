/**
 * The evergreen "/" brand bar, the shape of the one in `Logo.tsx`: the stem of the "/" in Barlow Condensed 700
 * (height 700, stem 141, slant 17.9°) drawn as a skewed bar, because React Native draws no SVG. The box has
 * the 36.77:70 proportion of the glyph, so it takes the room the glyph took. Decorative.
 */
import { View } from 'react-native';

export function SlashMark({ className = '' }: { className?: string }) {
  return (
    <View aria-hidden className={`shrink-0 ${className}`} style={{ aspectRatio: 36.77 / 70 }}>
      <View className="absolute inset-y-0 rounded-[1px] bg-evergreen -skew-x-[17.9deg]" style={{ left: '30.8%', width: '38.3%' }} />
    </View>
  );
}
