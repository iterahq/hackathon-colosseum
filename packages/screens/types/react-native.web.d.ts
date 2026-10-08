/**
 * The React Native surface a universal screen uses, as the WEB typecheck sees it.
 *
 * The root install has no `react-native` (PLAN ADR-1: the shell keeps its own install), and
 * react-native-web ships no types. The root `tsc` resolves `react-native` to this file
 * (`paths` in `tsconfig.app.json` and in `packages/screens/tsconfig.json`).
 *
 * It is a lower bound, not the authority: `apps/mobile` typechecks the same screens against the
 * real `react-native` and `uniwind/types`. A prop that exists here and not there fails the shell
 * job; one that exists there and not here fails the web job until it is added on purpose.
 * Keep it to what a screen in `src/` imports.
 */
import type { ComponentType, ReactNode } from 'react';

export type Role = 'button' | 'contentinfo' | 'heading' | 'link' | 'list' | 'listitem' | 'main' | 'paragraph';

interface PrimitiveProps {
  children?: ReactNode;
  className?: string;
  role?: Role;
  testID?: string;
  'aria-label'?: string;
  'aria-hidden'?: boolean;
  style?: object;
}

export interface LayoutChangeEvent {
  nativeEvent: { layout: { width: number; height: number } };
}

export interface ViewProps extends PrimitiveProps {
  onLayout?: (event: LayoutChangeEvent) => void;
}

export interface PressableProps extends PrimitiveProps {
  disabled?: boolean;
  onPress?: () => void;
}

export interface TextProps extends PrimitiveProps {
  'aria-level'?: number;
  numberOfLines?: number;
  onPress?: () => void;
}

export interface TextInputProps extends PrimitiveProps {
  value?: string;
  onChangeText?: (text: string) => void;
  onSubmitEditing?: () => void;
  placeholder?: string;
  placeholderTextColor?: string;
  maxLength?: number;
  inputMode?: 'numeric' | 'text';
}

export interface ImageProps extends PrimitiveProps {
  source: { uri: string };
  resizeMode?: 'cover';
}

export interface ScrollViewProps extends PrimitiveProps {
  contentContainerClassName?: string;
  keyboardShouldPersistTaps?: 'handled';
}

export const View: ComponentType<ViewProps>;
export const Text: ComponentType<TextProps>;
export const Pressable: ComponentType<PressableProps>;
export const TextInput: ComponentType<TextInputProps>;
export const Image: ComponentType<ImageProps>;
/** Only a slot uses it, and only off the web: there the document scrolls. */
export const ScrollView: ComponentType<ScrollViewProps>;
export const Platform: { readonly OS: 'ios' | 'android' | 'macos' | 'windows' | 'web' };
