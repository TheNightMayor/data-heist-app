import { Pressable, StyleSheet, View, type PressableProps, type StyleProp, type ViewStyle } from 'react-native';
import { ChamferedFrame } from './ChamferedFrame';

interface HudButtonProps extends Omit<PressableProps, 'style'> {
  width: number;
  height: number;
  chamfer?: number;
  stroke?: string;
  fill?: string;
  pressedFill?: string;
  style?: StyleProp<ViewStyle>;
  children: React.ReactNode | ((state: { pressed: boolean }) => React.ReactNode);
}

export function HudButton({
  width,
  height,
  chamfer = 6,
  stroke = '#22d3ee',
  fill = '#0e7490',
  pressedFill = '#155e75',
  style,
  children,
  ...pressableProps
}: HudButtonProps) {
  return (
    <Pressable
      {...pressableProps}
      style={({ pressed }) => [styles.button, style, pressed && styles.pressed]}
    >
      {({ pressed }) => (
        <>
          <View style={[StyleSheet.absoluteFill, { pointerEvents: 'none' }]}>
            <ChamferedFrame
              width={width}
              height={height}
              chamfer={chamfer}
              stroke={stroke}
              fill={pressed ? pressedFill : fill}
            />
          </View>
          {typeof children === 'function' ? children({ pressed }) : children}
        </>
      )}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  button: {
    alignItems: 'center',
    justifyContent: 'center',
    position: 'relative',
  },
  pressed: {
    opacity: 0.92,
  },
});
