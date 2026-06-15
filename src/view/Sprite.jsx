// View primitives shared by the cave components.
//
// MIGRATION NOTE (Phaser -> HTML/React): Phaser tinted a sprite by setting `.setTint(color)` on a
// textured GameObject. The DOM equivalent is a CSS mask: the PNG becomes the element's mask-image
// (so only its opaque pixels paint) and `background-color` provides the tint. That reproduces the
// "single-color silhouette of a sprite" look the game leans on for every icon, the square bg, the
// connector lines and the level lines.

import GameManager from '../engine/GameManager.js';

// All sprite PNGs live under public/assets and are served from /assets at runtime.
export const asset = (file) => `/assets/${file}`;

// A PNG rendered as a flat tint via CSS masking. `w`/`h` are pixels; `color` is any CSS color.
// Extra `style` is merged last so callers can position/scale/animate.
export function Sprite({ file, w, h, color = '#fff', style, ...rest }) {
  const url = `url(${asset(file)})`;
  return (
    <div
      style={{
        width: w,
        height: h,
        backgroundColor: color,
        WebkitMaskImage: url,
        maskImage: url,
        WebkitMaskRepeat: 'no-repeat',
        maskRepeat: 'no-repeat',
        WebkitMaskPosition: 'center',
        maskPosition: 'center',
        WebkitMaskSize: 'contain',
        maskSize: 'contain',
        ...style,
      }}
      {...rest}
    />
  );
}

// Per-character colored text — the DOM replacement for Phaser's setCharacterTint, used for the
// typed word (spellstone letters get their own color) and tagged locale messages.
//
// Pass EITHER:
//   - `segments`: [{ text, color }] already grouped (e.g. one per typed square), or
//   - `text` + `colorList`: a string that may contain {COLOR=n} tags, resolved via the engine's
//     pure parser so the view honors the same tag convention the engine emits.
// `color` is the fallback color when there are no per-character colors.
export function ColoredText({ segments, text, colorList, color, style, ...rest }) {
  let parts = segments;
  if (!parts) {
    const { text: stripped, colors } = GameManager.parseColorTags(text ?? '', colorList);
    parts = colors
      ? [...stripped].map((ch, i) => ({ text: ch, color: colors[i] }))
      : [{ text: stripped, color }];
  }
  return (
    <span style={style} {...rest}>
      {parts.map((p, i) => (
        <span key={i} style={{ color: p.color ?? color }}>{p.text}</span>
      ))}
    </span>
  );
}
