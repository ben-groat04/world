// Person -> text features: pronouns, voice, names. Pure; works on any plain person record.
// Reads (all optional): firstName,lastName,nickname,sex('F'|'M'),pronouns('she'|'he'|'they'|{...}),age,segment,job,mood(0..1),traits{},kids/children,voice.
const FORMS = {
  she: { they: 'she', them: 'her', their: 'her', theirs: 'hers', self: 'herself', plural: false },
  he: { they: 'he', them: 'him', their: 'his', theirs: 'his', self: 'himself', plural: false },
  they: { they: 'they', them: 'them', their: 'their', theirs: 'theirs', self: 'themself', plural: true },
};
export function pronounsOf(p) {
  if (!p) return FORMS.they;
  if (p.pronouns && typeof p.pronouns === 'object') return { ...FORMS.they, ...p.pronouns };
  const k = p.pronouns || (p.sex === 'F' ? 'she' : p.sex === 'M' ? 'he' : 'they');
  return FORMS[k] || FORMS.they;
}
const hasKids = (p) => (Array.isArray(p.children) ? p.children.length : p.children || p.kids || 0) > 0;
/** Voice bucket used by grammars: teen | student | young_pro | parent | retiree | adult */
export function voiceOf(p) {
  if (!p) return 'adult';
  if (p.voice) return p.voice;
  const a = p.age ?? 35, s = p.segment || '';
  if (a < 18) return 'teen';
  if (/student/.test(s) || (a < 23 && !/family|parent/.test(s))) return 'student';
  if (a >= 65 || /retire|older|long_term/.test(s) && a >= 60) return 'retiree';
  if (hasKids(p) || /family|parent|lone/.test(s)) return 'parent';
  if (a < 36 || /sharer|early|young/.test(s)) return 'young_pro';
  return 'adult';
}
export function moodBand(m) { return m == null ? 'ok' : m < 0.25 ? 'low' : m < 0.45 ? 'flat' : m < 0.7 ? 'ok' : 'high'; }
export function titleOf(p) { return p.title || (p.pronouns === 'they' || (!p.sex && !p.pronouns) ? 'Mx' : p.sex === 'M' || p.pronouns === 'he' ? 'Mr' : 'Ms'); }
export function nameOf(p) { return p ? `${p.firstName || 'Someone'}${p.lastName ? ' ' + p.lastName : ''}` : 'someone'; }
export function ageBand(age) { return age == null ? '' : age < 13 ? 'child' : age < 18 ? 'teen' : age < 30 ? '20s' : age < 45 ? '30s' : age < 65 ? 'mid' : 'old'; }
