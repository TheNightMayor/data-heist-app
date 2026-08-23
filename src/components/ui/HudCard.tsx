import { Pressable, StyleSheet, View, type PressableProps, type StyleProp, type ViewStyle } from 'react-native';
import { ChamferedFrame } from './ChamferedFrame';

interface HudCardProps extends Omit<PressableProps, 'style'> {
  width: number;
  height: number;
  chamfer?: number;
  stroke?: string;
  fill?: string;
  style?: StyleProp<ViewStyle>;
  children: React.ReactNode;
}

export function HudCard({
  width,
  height,
  chamfer = 16,
  stroke = '#1e293b',
  fill = '#0f172a',
  style,
  children,
  onPress,
  ...pressableProps
}: HudCardProps) {
  const content = (
    <>
      <View style={[StyleSheet.absoluteFill, { pointerEvents: 'none' }]}>
        <ChamferedFrame width={width} height={height} chamfer={chamfer} stroke={stroke} strokeWidth={2} fill={fill} />
      </View>
      {children}
    </>
  );

  if (onPress) {
    return (
      <Pressable {...pressableProps} onPress={onPress} style={[styles.card, style]}>
        {content}
      </Pressable>
    );
  }

  return <View style={[styles.card, style]}>{content}</View>;
}

const styles = StyleSheet.create({
  card: {
    position: 'relative',
  },
});
