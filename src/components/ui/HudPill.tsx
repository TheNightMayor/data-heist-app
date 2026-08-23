import { Pressable, StyleSheet, type PressableProps, type StyleProp, type ViewStyle } from 'react-native';

interface HudPillProps extends Omit<PressableProps, 'style'> {
  selected?: boolean;
  style?: StyleProp<ViewStyle>;
  children: React.ReactNode;
}

export function HudPill({ selected = false, style, children, ...pressableProps }: HudPillProps) {
  return (
    <Pressable
      {...pressableProps}
      style={({ pressed }) => [
        styles.pill,
        selected && styles.selected,
        pressed && styles.pressed,
        style,
      ]}
    >
      {children}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  pill: {
    paddingHorizontal: 10,
    paddingVertical: 6,
    backgroundColor: '#1e293b',
    borderWidth: 1,
    borderColor: '#475569',
  },
  selected: {
    borderColor: '#22d3ee',
    backgroundColor: '#0e7490',
  },
  pressed: {
    opacity: 0.92,
  },
});
