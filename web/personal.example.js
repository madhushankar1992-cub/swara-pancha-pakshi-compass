/* Copy this file to personal.js (git-ignored) and fill in YOUR details.
   lagna / rasi / moonRasi: 0 = Mesham ... 11 = Meenam
   nak: 0 = Ashwini ... 26 = Revathi
   tithi: 0 = Shukla Prathamai ... 14 = Pournami, 15 = Krishna Prathamai ... 29 = Amavasai
   paksha at birth: 's' = waxing (Valarpirai), 'k' = waning (Theipirai)
   nameVowel: vowel row of your name's first letter: 'a' | 'i' | 'u' | 'e' | 'o'          */
window.PAKSHI_PERSONAL = {
  name: 'Your Name',
  birthLine: 'Born DD-MM-YYYY, HH:MM, Your City',
  birth: { paksha: 's', nameVowel: 'a', lagna: 0, rasi: 0, nak: 0, tithi: 0 },
  natal: { moonRasi: 0, nak: 0 },            // for Chandrashtamam and Tara bala
  labels: { name: 'Name', lagna: 'Lagna', rasi: 'Rasi', nakshatra: 'Star', tithi: 'Tithi' },
  nameBirdNote: 'Name bird',
  // Optional notes per bird (V, O, C, K, P) from your own course:
  // { ta, element: [waxing, waning], time, ring, worship, family, guard, upasana,
  //   padu: [[days], [days]], authority: [[...], [...]], traits: ['...'] }
  profiles: {},
};
