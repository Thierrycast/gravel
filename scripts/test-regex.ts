const haystack = "pagseguro internet instituicao de pagamento s/a";
const target = "inter";
console.log(haystack.includes(target)); // true
console.log(new RegExp(`\\b${target}\\b`, 'i').test(haystack)); // false
