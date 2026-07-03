/**
 * MonitorGlow — soft true radial gradients at the top and bottom of the
 * monitor bezel. Brightest at the rim, fading to transparent toward the
 * center. Renders as an absolutely-positioned SVG overlay that doesn't
 * intercept gestures.
 *
 * Self-contained: no props, no shared state, just decorative chrome.
 */

import { View } from 'react-native';
import Svg, { Defs, RadialGradient, Rect, Stop } from 'react-native-svg';

export function MonitorGlow({
  width,
  height,
}: {
  width: number;
  height: number;
}) {
  return (
    <View
      pointerEvents="none"
      style={{
        position: 'absolute',
        top: 0,
        left: 0,
        right: 0,
        bottom: 0,
        zIndex: 5,
      }}
    >
      <Svg
        width="100%"
        height="100%"
        viewBox="0 0 1 1"
        preserveAspectRatio="none"
      >
        <Defs>
          {/* Top glow: brightest at the very top edge, fading to transparent toward the middle. */}
          <RadialGradient id="topGlow" cx="0.5" cy="0" r="0.55" fx="0.5" fy="0">
            <Stop offset="0%" stopColor="rgb(34, 211, 238)" stopOpacity="0.55" />
            <Stop offset="35%" stopColor="rgb(34, 211, 238)" stopOpacity="0.28" />
            <Stop offset="75%" stopColor="rgb(34, 211, 238)" stopOpacity="0.05" />
            <Stop offset="100%" stopColor="rgb(34, 211, 238)" stopOpacity="0" />
          </RadialGradient>
          {/* Bottom glow: brightest at the very bottom edge, fading to transparent toward the middle. */}
          <RadialGradient id="bottomGlow" cx="0.5" cy="1" r="0.55" fx="0.5" fy="1">
            <Stop offset="0%" stopColor="rgb(167, 139, 250)" stopOpacity="0.55" />
            <Stop offset="35%" stopColor="rgb(167, 139, 250)" stopOpacity="0.28" />
            <Stop offset="75%" stopColor="rgb(167, 139, 250)" stopOpacity="0.05" />
            <Stop offset="100%" stopColor="rgb(167, 139, 250)" stopOpacity="0" />
          </RadialGradient>
        </Defs>
        {/* Top half rect — radial gradient masked to upper portion. */}
        <Rect x="0" y="0" width="1" height="0.5" fill="url(#topGlow)" />
        {/* Bottom rect — radial gradient masked to lower third (≈2/3 of prior height). */}
        <Rect x="0" y="0.667" width="1" height="0.333" fill="url(#bottomGlow)" />
      </Svg>
    </View>
  );
}
