import { StyleSheet, View, useWindowDimensions } from 'react-native';
import Svg, { Defs, Path, Pattern, Rect } from 'react-native-svg';
import { ChamferedFrame } from './ChamferedFrame';
import { MonitorGlow } from '../flow/flowCanvas/MonitorGlow';
import { StubBranches } from '../flow/flowCanvas/StubBranches';
import { CANVAS_HEIGHT, CANVAS_WIDTH } from '@/lib/flow/layoutGraph';
import { SAMPLE_MAPS } from '@/sample-maps';

export function ScreenBackdrop() {
  const { width, height } = useWindowDimensions();
  const frameWidth = Math.max(1, width - 32);
  const frameHeight = Math.max(1, height - 32);

  return (
    <View style={[StyleSheet.absoluteFill, { opacity: 0.28, pointerEvents: 'none' }]}>
      <Svg width={width} height={height} viewBox={`0 0 ${width} ${height}`}>
        <Defs>
          <Pattern id="screenGrid" width={48} height={48} patternUnits="userSpaceOnUse">
            <Path d="M48 0H0V48" fill="none" stroke="#1e293b" strokeWidth={1} />
          </Pattern>
        </Defs>
        <Rect width={width} height={height} fill="#020617" />
        <Rect width={width} height={height} fill="url(#screenGrid)" />
      </Svg>
      <View style={[styles.circuit, { width: frameWidth, height: frameHeight }]}>
        <Svg
          width={frameWidth}
          height={frameHeight}
          viewBox={`0 0 ${CANVAS_WIDTH} ${CANVAS_HEIGHT}`}
          preserveAspectRatio="xMidYMid slice"
          opacity={0.45}
        >
          <StubBranches positionedNodes={SAMPLE_MAPS[0].nodes} positionedEdges={SAMPLE_MAPS[0].edges} />
        </Svg>
      </View>
      <View style={[styles.glow, { width: frameWidth, height: frameHeight }]}>
        <MonitorGlow width={frameWidth} height={frameHeight} />
      </View>
      <View style={styles.outerFrame}>
        <ChamferedFrame width={frameWidth} height={frameHeight} chamfer={24} stroke="#111827" strokeWidth={12} fill="transparent" />
      </View>
      <View style={styles.innerFrame}>
        <ChamferedFrame width={Math.max(1, width - 56)} height={Math.max(1, height - 56)} chamfer={12} stroke="#334155" strokeWidth={4} fill="transparent" />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  outerFrame: { position: 'absolute', top: 16, left: 16 },
  innerFrame: { position: 'absolute', top: 28, left: 28 },
  circuit: { position: 'absolute', top: 16, left: 16, overflow: 'hidden' },
  glow: { position: 'absolute', top: 16, left: 16, overflow: 'hidden' },
});
