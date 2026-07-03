/**
 * StubBranches — renders the decorative PCB trace stub set produced by
 * `generateStubs`. Each trace is a path with an outer + inner via
 * circle at its tip and a small dot at every 90° corner.
 *
 * Stable per-map-id (the generator is seeded from positioned node
 * coords), so the same map always shows the same decoration.
 */

import { useEffect, useMemo } from 'react';
import Svg, { Circle, G, Path } from 'react-native-svg';
import Animated, { 
  useSharedValue, 
  withRepeat, 
  withTiming, 
  useAnimatedProps,
  Easing,
  type SharedValue
} from 'react-native-reanimated';
import type { FlowNode, FlowEdge } from '@/lib/flow/types';
import { generateStubs } from './generateStubs';

const AnimatedPath = Animated.createAnimatedComponent(Path);

function StubTraceView({ 
  s, 
  index, 
  pulseInternal, 
  travelInternal 
}: { 
  s: any; 
  index: number; 
  pulseInternal: SharedValue<number>; 
  travelInternal: SharedValue<number>; 
}) {
  const animatedProps = useAnimatedProps(() => {
    const offset = (index * 17) % 52;
    return {
      opacity: pulseInternal.value,
      strokeDashoffset: -(travelInternal.value + offset),
    } as any;
  });

  return (
    <AnimatedPath
      d={s.d}
      stroke="#7dd3fc"
      strokeWidth={2.5}
      fill="none"
      strokeDasharray="12, 40"
      strokeLinecap="round"
      animatedProps={animatedProps}
    />
  );
}

export function StubBranches({ 
  positionedNodes, 
  positionedEdges 
}: { 
  positionedNodes: FlowNode[];
  positionedEdges: FlowEdge[];
}) {
  const sessionSeed = useMemo(() => Math.random().toString(36).substring(7), []);

  const stubs = useMemo(() => {
    try {
      return generateStubs(positionedNodes ?? [], positionedEdges ?? [], sessionSeed);
    } catch {
      return [];
    }
  }, [positionedNodes, positionedEdges, sessionSeed]);

  const pulseInternal = useSharedValue(0.1);
  const travelInternal = useSharedValue(0);

  useEffect(() => {
    pulseInternal.value = withRepeat(
      withTiming(0.5, { duration: 2000, easing: Easing.inOut(Easing.ease) }),
      -1,
      true
    );
    travelInternal.value = withRepeat(
      withTiming(52, { duration: 2500, easing: Easing.linear }),
      -1,
      false
    );
  }, []);

  return (
    <G>
      {stubs.map((stub, i) => (
        <G key={`stub-${i}`}>
          {/* First Pass: All paths (bottom layer) */}
          {stub.traces.map((s, k) => (
            <Path
              key={`path-${i}-${k}`}
              d={s.d}
              stroke="#334155"
              strokeWidth={2}
              fill="none"
              strokeLinecap="round"
              strokeLinejoin="round"
              opacity={0.3}
            />
          ))}

          {/* Pulse Pass: Glowing "Current" layer */}
          {stub.traces.map((s, k) => (
            <StubTraceView 
              key={`glow-${i}-${k}`} 
              s={s} 
              index={i + k} 
              pulseInternal={pulseInternal} 
              travelInternal={travelInternal} 
            />
          ))}

          {/* Second Pass: All vias (top layer) */}
          {stub.traces.map((s, k) => (
            <G key={`vias-${i}-${k}`} opacity={0.4}>
              {/* Start via */}
              {s.corners.length > 0 && (
                <G key="v-start">
                  <Circle
                    cx={s.corners[0].x}
                    cy={s.corners[0].y}
                    r={6}
                    fill="#020617"
                    stroke="#475569"
                    strokeWidth={2}
                  />
                  <Circle
                    cx={s.corners[0].x}
                    cy={s.corners[0].y}
                    r={2.5}
                    fill="#475569"
                  />
                </G>
              )}
              {/* End via */}
              {s.corners.length > 1 && (
                <G key="v-end">
                  <Circle
                    cx={s.corners[s.corners.length - 1].x}
                    cy={s.corners[s.corners.length - 1].y}
                    r={6}
                    fill="#020617"
                    stroke="#475569"
                    strokeWidth={2}
                  />
                  <Circle
                    cx={s.corners[s.corners.length - 1].x}
                    cy={s.corners[s.corners.length - 1].y}
                    r={2.5}
                    fill="#475569"
                  />
                </G>
              )}
            </G>
          ))}
        </G>
      ))}
    </G>
  );
}
