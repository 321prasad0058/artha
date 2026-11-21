// Stage 2a (code): turn Devanagari, Telugu or Tamil script into rough Roman letters,
// so names, dates and amounts can be matched the same way whatever script the transcript came back in.

type Table = { vowels: Record<string, string>; matras: Record<string, string>; cons: Record<string, string>; signs: Record<string, string>; virama: string; nukta?: string; dropFinalA: boolean };

const DEVA: Table = {
  vowels: { 'अ': 'a', 'आ': 'aa', 'इ': 'i', 'ई': 'ee', 'उ': 'u', 'ऊ': 'oo', 'ऋ': 'ri', 'ए': 'e', 'ऐ': 'ai', 'ओ': 'o', 'औ': 'au', 'ऍ': 'e', 'ऑ': 'o' },
  matras: { 'ा': 'aa', 'ि': 'i', 'ी': 'ee', 'ु': 'u', 'ू': 'oo', 'ृ': 'ri', 'े': 'e', 'ै': 'ai', 'ो': 'o', 'ौ': 'au', 'ॅ': 'e', 'ॉ': 'o' },
  cons: { 'क': 'k', 'ख': 'kh', 'ग': 'g', 'घ': 'gh', 'ङ': 'n', 'च': 'ch', 'छ': 'chh', 'ज': 'j', 'झ': 'jh', 'ञ': 'n', 'ट': 't', 'ठ': 'th', 'ड': 'd', 'ढ': 'dh', 'ण': 'n', 'त': 't', 'थ': 'th', 'द': 'd', 'ध': 'dh', 'न': 'n', 'प': 'p', 'फ': 'ph', 'ब': 'b', 'भ': 'bh', 'म': 'm', 'य': 'y', 'र': 'r', 'ल': 'l', 'ळ': 'l', 'व': 'v', 'श': 'sh', 'ष': 'sh', 'स': 's', 'ह': 'h',
    'क़': 'q', 'ख़': 'kh', 'ग़': 'g', 'ज़': 'z', 'ड़': 'd', 'ढ़': 'rh', 'फ़': 'f', 'य़': 'y' },
  signs: { 'ं': 'n', 'ँ': 'n', 'ः': 'h', '।': '.', '॥': '.', 'ॐ': 'om' },
  virama: '्', nukta: '़', dropFinalA: true,
};
const NUKTA_MAP: Record<string, string> = { 'क': 'q', 'ख': 'kh', 'ग': 'g', 'ज': 'z', 'ड': 'd', 'ढ': 'rh', 'फ': 'f' };

const TELU: Table = {
  vowels: { 'అ': 'a', 'ఆ': 'aa', 'ఇ': 'i', 'ఈ': 'ee', 'ఉ': 'u', 'ఊ': 'oo', 'ఋ': 'ru', 'ఎ': 'e', 'ఏ': 'e', 'ఐ': 'ai', 'ఒ': 'o', 'ఓ': 'o', 'ఔ': 'au' },
  matras: { 'ా': 'aa', 'ి': 'i', 'ీ': 'ee', 'ు': 'u', 'ూ': 'oo', 'ృ': 'ru', 'ె': 'e', 'ే': 'e', 'ై': 'ai', 'ొ': 'o', 'ో': 'o', 'ౌ': 'au' },
  cons: { 'క': 'k', 'ఖ': 'kh', 'గ': 'g', 'ఘ': 'gh', 'ఙ': 'n', 'చ': 'ch', 'ఛ': 'chh', 'జ': 'j', 'ఝ': 'jh', 'ఞ': 'n', 'ట': 't', 'ఠ': 'th', 'డ': 'd', 'ఢ': 'dh', 'ణ': 'n', 'త': 't', 'థ': 'th', 'ద': 'd', 'ధ': 'dh', 'న': 'n', 'ప': 'p', 'ఫ': 'ph', 'బ': 'b', 'భ': 'bh', 'మ': 'm', 'య': 'y', 'ర': 'r', 'ఱ': 'r', 'ల': 'l', 'ళ': 'l', 'వ': 'v', 'శ': 'sh', 'ష': 'sh', 'స': 's', 'హ': 'h' },
  signs: { 'ం': 'n', 'ః': 'h', 'ఁ': 'n' },
  virama: '్', dropFinalA: false,
};

const TAMIL: Table = {
  vowels: { 'அ': 'a', 'ஆ': 'aa', 'இ': 'i', 'ஈ': 'ee', 'உ': 'u', 'ஊ': 'oo', 'எ': 'e', 'ஏ': 'e', 'ஐ': 'ai', 'ஒ': 'o', 'ஓ': 'o', 'ஔ': 'au' },
  matras: { 'ா': 'aa', 'ி': 'i', 'ீ': 'ee', 'ு': 'u', 'ூ': 'oo', 'ெ': 'e', 'ே': 'e', 'ை': 'ai', 'ொ': 'o', 'ோ': 'o', 'ௌ': 'au' },
  cons: { 'க': 'k', 'ங': 'n', 'ச': 's', 'ஞ': 'n', 'ட': 't', 'ண': 'n', 'த': 'th', 'ந': 'n', 'ப': 'p', 'ம': 'm', 'ய': 'y', 'ர': 'r', 'ல': 'l', 'வ': 'v', 'ழ': 'zh', 'ள': 'l', 'ற': 'r', 'ன': 'n', 'ஜ': 'j', 'ஷ': 'sh', 'ஸ': 's', 'ஹ': 'h' },
  signs: { 'ஃ': 'h' },
  virama: '்', dropFinalA: false,
};

const DIGITS: Record<string, string> = {};
['०१२३४५६७८९', '౦౧౨౩౪౫౬౭౮౯', '௦௧௨௩௪௫௬௭௮௯'].forEach(set => [...set].forEach((d, i) => (DIGITS[d] = String(i))));

function tableFor(ch: string): Table | null {
  const c = ch.codePointAt(0)!;
  if (c >= 0x0900 && c <= 0x097f) return DEVA;
  if (c >= 0x0c00 && c <= 0x0c7f) return TELU;
  if (c >= 0x0b80 && c <= 0x0bff) return TAMIL;
  return null;
}

/** Rough, readable romanisation. Good enough for matching, not for display to linguists. */
/** Bengali and Gurmukhi mirror the Devanagari block (same order, offset 0x80 / 0x100), so map them across first. */
function toDeva(s: string): string {
  return s.replace(/[\u0980-\u09FF\u0A00-\u0A7F]/g, ch => {
    const c = ch.codePointAt(0)!;
    if (c === 0x0A70) return 'ं';          // Gurmukhi tippi
    if (c === 0x0A71) return '';           // addak (doubles the next consonant)
    if (c === 0x0A72) return 'अ'; if (c === 0x0A73) return 'उ';
    if (c === 0x09CE) return 'त्';         // Bengali khanda ta
    return String.fromCodePoint(c - (c < 0x0A00 ? 0x80 : 0x100));
  });
}

export function romanize(input: string): string {
  const chars = [...toDeva(input.normalize('NFC'))];
  let out = '';
  for (let i = 0; i < chars.length; i++) {
    const ch = chars[i];
    if (DIGITS[ch]) { out += DIGITS[ch]; continue; }
    const t = tableFor(ch);
    if (!t) { out += ch; continue; }
    if (t.vowels[ch]) { out += t.vowels[ch]; continue; }
    if (t.signs[ch]) { out += t.signs[ch]; continue; }
    let cons = t.cons[ch];
    if (cons === undefined) continue; // unknown mark: skip
    let j = i + 1;
    if (t.nukta && chars[j] === t.nukta) { cons = NUKTA_MAP[ch] ?? cons; j++; }
    const next = chars[j];
    if (next === t.virama) { out += cons; i = j; continue; }
    if (next && t.matras[next]) { out += cons + t.matras[next]; i = j; continue; }
    // inherent "a": Hindi/Marathi drop it at the end of a word (शाम → shaam) and in the middle
    // before a consonant that carries a vowel sign (परसों → parson, मेहता → mehtaa), but never in the first syllable.
    const after = next ?? ' ';
    const endsWord = !tableFor(after) || /\s/.test(after);
    const prev = chars[i - 1];
    const firstInWord = !prev || !tableFor(prev);
    const nextHasMatra = !!(next && t.cons[next] !== undefined && chars[j + 1] && t.matras[chars[j + 1]]);
    const drop = t.dropFinalA && (endsWord || (!firstInWord && nextHasMatra));
    out += cons + (drop ? '' : 'a');
    i = j - 1;
  }
  return out;
}

/** Lower-case, Roman, punctuation-light text for matching. */
export function toMatchText(input: string): string {
  return romanize(input).toLowerCase().replace(/[“”"'’‘`]/g, '').replace(/[,.;:!?()।]/g, ' ').replace(/\s+/g, ' ').trim();
}
