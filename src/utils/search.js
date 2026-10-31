// بحث عربي متسامح: بيتجاهل التشكيل وبيعتبر أ/إ/آ/ا نفس الحرف، وة/ه، وى/ي
const TASHKEEL = /[ً-ٰٟـ]/g; // تشكيل + تطويل
const GROUPS = [
  "اأإآٱ",
  "ةه",
  "يى",
];
const MAX_TERMS = 5;
const MAX_TERM_LENGTH = 30;

const escapeRegex = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

// حرف واحد → نمط regex
const charPattern = (ch) => {
  const group = GROUPS.find((g) => g.includes(ch));
  return group ? `[${group}]` : escapeRegex(ch);
};

// الكلمات اللي هندور بيها (بعد التنضيف)
export const searchTerms = (query) =>
  String(query ?? "")
    .replace(TASHKEEL, "")
    .trim()
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, MAX_TERMS)
    .map((t) => t.slice(0, MAX_TERM_LENGTH));

export const termRegex = (term) => new RegExp([...term].map(charPattern).join(""), "i");

// فلتر mongo: كل كلمة لازم تظهر في الاسم أو الوصف
export const buildSearchFilter = (query) => {
  const terms = searchTerms(query);
  if (!terms.length) return null;
  return {
    $and: terms.map((t) => {
      const rx = termRegex(t);
      return { $or: [{ name: rx }, { description: rx }] };
    }),
  };
};
