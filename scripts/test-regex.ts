import { deriveInstitutionFromNames } from "../lib/domain/utils";
import { normalizeText } from "../lib/domain/projectors/shared";
const haystack = "pagseguro internet instituicao de pagamento s/a";
const target = "inter";
console.log(haystack.includes(target)); // true
console.log(new RegExp(`\\b${target}\\b`, 'i').test(haystack)); // false
