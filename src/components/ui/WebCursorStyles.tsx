/**
 * WebCursorStyles — web-only global cursor fix.
 *
 * React Native web renders <Pressable> as a <div> without `cursor: pointer`
 * by default, so on web the buttons look unclickable until clicked. We inject
 * a small <style> tag once at the root layout that targets every descendant
 * of a Pressable (which RN web wraps in a div with `role="button"`).
 *
 * Native (iOS/Android) is unaffected — the <style> tag is harmless there,
 * and the component returns null outside web.
 */

import { useEffect } from 'react';
import { Platform } from 'react-native';

const STYLE_ID = 'web-cursor-styles';

const CSS = `
  /* Pressable → div[role="button"] on RN web */
  div[role="button"] { cursor: pointer; }
  div[role="button"][aria-disabled="true"] { cursor: not-allowed; opacity: 0.5; }
  /* Disabled inputs shouldn't get pointer either. */
  input[disabled], textarea[disabled] { cursor: not-allowed; }
`;

export function WebCursorStyles() {
  useEffect(() => {
    if (Platform.OS !== 'web') return;
    if (typeof document === 'undefined') return;
    if (document.getElementById(STYLE_ID)) return;
    const tag = document.createElement('style');
    tag.id = STYLE_ID;
    tag.appendChild(document.createTextNode(CSS));
    document.head.appendChild(tag);
    return () => {
      // Don't remove on unmount — styles are global and harmless across screens.
    };
  }, []);

  return null;
}
