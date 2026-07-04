/** WCAG relative-luminance contrast maths (deterministic — the same input always
 *  yields the same ratio, so a payout can be gated on it). */

const NAMED: Record<string, [number, number, number]> = {
  black: [0, 0, 0], white: [255, 255, 255], red: [255, 0, 0], green: [0, 128, 0],
  blue: [0, 0, 255], gray: [128, 128, 128], grey: [128, 128, 128],
  silver: [192, 192, 192], yellow: [255, 255, 0], orange: [255, 165, 0],
  navy: [0, 0, 128], teal: [0, 128, 128],
}

export function parseColor(value: string | undefined): [number, number, number] | null {
  if (!value) return null
  const v = value.trim().toLowerCase()
  if (NAMED[v]) return NAMED[v]
  let m = v.match(/^#([0-9a-f]{3})$/)
  if (m) {
    const h = m[1]
    return [parseInt(h[0] + h[0], 16), parseInt(h[1] + h[1], 16), parseInt(h[2] + h[2], 16)]
  }
  m = v.match(/^#([0-9a-f]{6})$/)
  if (m) {
    const h = m[1]
    return [parseInt(h.slice(0, 2), 16), parseInt(h.slice(2, 4), 16), parseInt(h.slice(4, 6), 16)]
  }
  m = v.match(/^rgba?\(\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)\s*(?:,\s*[\d.]+\s*)?\)$/)
  if (m) return [Number(m[1]), Number(m[2]), Number(m[3])]
  return null
}

function luminance([r, g, b]: [number, number, number]): number {
  const chan = (c: number) => {
    const s = c / 255
    return s <= 0.03928 ? s / 12.92 : Math.pow((s + 0.055) / 1.055, 2.4)
  }
  return 0.2126 * chan(r) + 0.7152 * chan(g) + 0.0722 * chan(b)
}

export function contrastRatio(fg: [number, number, number], bg: [number, number, number]): number {
  const l1 = luminance(fg)
  const l2 = luminance(bg)
  const hi = Math.max(l1, l2)
  const lo = Math.min(l1, l2)
  return (hi + 0.05) / (lo + 0.05)
}

/** Pick black or white — whichever contrasts better against `bg`. */
export function bestContrastColor(bg: [number, number, number]): string {
  return contrastRatio([0, 0, 0], bg) >= contrastRatio([255, 255, 255], bg) ? '#000000' : '#ffffff'
}
