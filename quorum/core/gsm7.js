// GSM 03.38 septet counting. One character outside this alphabet switches the whole
// message to UCS-2 and cuts a segment from 160 characters to 70, so the counter is exact.

// The default alphabet, in code-table order.
export const GSM7_BASIC =
  '@£$¥èéùìòÇ\nØø\rÅåΔ_ΦΓΛΩΠΨΣΘΞ\u001bÆæßÉ !"#¤%&\'()*+,-./0123456789:;<=>?' +
  '¡ABCDEFGHIJKLMNOPQRSTUVWXYZÄÖÑÜ§¿abcdefghijklmnopqrstuvwxyzäöñüà';

// Extension table: each costs an escape plus the character, so 2 septets.
export const GSM7_EXT = '^{}\\[~]|€\f';

const BASIC = new Set(GSM7_BASIC.replace('\u001b', ''));
const EXT = new Set(GSM7_EXT);

export function analyze(text) {
  const chars = Array.from(text);
  const nonGsm = [];
  const extChars = [];
  let septets = 0;
  let index = 0;
  for (const ch of chars) {
    if (BASIC.has(ch)) septets += 1;
    else if (EXT.has(ch)) {
      septets += 2;
      extChars.push({ index, char: ch });
    } else nonGsm.push({ index, char: ch });
    index += ch.length;
  }
  if (nonGsm.length === 0) {
    const segments = septets <= 160 ? (septets === 0 ? 0 : 1) : Math.ceil(septets / 153);
    return {
      encoding: 'GSM-7',
      septets,
      units: septets,
      segments,
      perSegment: segments <= 1 ? 160 : 153,
      nonGsm,
      extChars,
    };
  }
  // UCS-2 counts UTF-16 code units (an emoji is two).
  const units = text.length;
  const segments = units <= 70 ? (units === 0 ? 0 : 1) : Math.ceil(units / 67);
  return { encoding: 'UCS-2', septets: null, units, segments, perSegment: segments <= 1 ? 70 : 67, nonGsm, extChars };
}

export function isGsm7Basic(text) {
  for (const ch of text) if (!BASIC.has(ch)) return false;
  return true;
}
