/**
 * NodeOverlay — pressable, positionable wrapper around a single
 * `FlowNode` view. Handles:
 *  - Absolute positioning at the node's `x`/`y` (top-left of a 100x100 box).
 *  - Visual "active" lift (grows up 18px and scales 1.05× on hover).
 *  - Reachable gating: in Game mode, unreachable nodes are dimmed.
 *  - Selection ring: a 3px cyan border when `selected` is true.
 *  - Press dispatch to the parent.
 *
 * The actual node visuals are passed in as `children` — the parent
 * provides a mode-aware `FlowNodeView`.
 */

import { useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import type { FlowNode } from '@/lib/flow/types';
import { NODE_WIDTH } from '@/lib/flow/layoutGraph';

interface NodeOverlayProps {
  node: FlowNode;
  reachable: boolean;
  selected: boolean;
  active: boolean;
  mode: 'build' | 'game';
  onPress: () => void;
  children: React.ReactNode;
}

export function NodeOverlay({
  node,
  reachable,
  selected,
  active,
  mode,
  onPress,
  children,
}: NodeOverlayProps) {
  const [hovered, setHovered] = useState(false);
  const growUp = active;
  return (
    <Pressable
      onHoverIn={() => setHovered(true)}
      onHoverOut={() => setHovered(false)}
      onPress={() => {
        setHovered(false);
        onPress();
      }}
      style={[
        styles.nodeWrapper,
        growUp && styles.nodeWrapperActive,
        {
          left: node.x,
          top: node.y - (growUp ? 18 : 0),
          opacity: mode === 'game' && !reachable ? 0.4 : 1,
        },
      ]}
    >
      <View style={{ transform: [{ scale: hovered ? 1.05 : 1 }] }}>
        {children}
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  nodeWrapper: {
    position: 'absolute',
    width: NODE_WIDTH,
    height: NODE_WIDTH,
    alignItems: 'center',
    justifyContent: 'center',
  },
  nodeWrapperActive: {
    height: NODE_WIDTH + 18,
  },
});
