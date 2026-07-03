import React from 'react';
import Svg, { Path } from 'react-native-svg';

interface ChamferedFrameProps {
  width: number;
  height: number;
  chamfer?: number;
  stroke?: string;
  strokeWidth?: number;
  fill?: string;
  openCenter?: boolean;
}

/**
 * A reusable component that renders a rectangle with chamfered (clipped 45-degree) corners.
 * Optionally supports "open centers" (HUD bracket style).
 */
export const ChamferedFrame = ({
  width,
  height,
  chamfer = 10,
  stroke = '#22d3ee',
  strokeWidth = 2,
  fill = 'transparent',
  openCenter = false
}: ChamferedFrameProps) => {
  const w = width;
  const h = height;
  const c = chamfer;

  // Path data for a full chamfered rectangle
  const fullPath = `
    M ${c},0 
    H ${w - c} L ${w},${c} 
    V ${h - c} L ${w - c},${h} 
    H ${c} L 0,${h - c} 
    V ${c} Z
  `;

  // Path data for brackets (HUD style)
  const gap = 0.25; // How much of the side to show
  const bracketPath = `
    M 0,${h * gap} V ${c} L ${c},0 H ${w * gap}
    M ${w * (1 - gap)},0 H ${w - c} L ${w},${c} V ${h * gap}
    M 0,${h * (1 - gap)} V ${h - c} L ${c},${h} H ${w * gap}
    M ${w * (1 - gap)},${h} H ${w - c} L ${w},${h - c} V ${h * (1 - gap)}
  `;

  return (
    <Svg width={width} height={height} viewBox={`0 0 ${width} ${height}`}>
      <Path
        d={openCenter ? bracketPath : fullPath}
        fill={fill}
        stroke={stroke}
        strokeWidth={strokeWidth}
        strokeLinejoin="miter"
      />
    </Svg>
  );
};
