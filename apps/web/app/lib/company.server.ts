/**
 * Satıcı bilgileri (yasal sayfalar, İletişim, alt bilgi): `LEGAL_*` ortam değişkenleri. Sadece sunucuda
 * okunur; loader ile sayfaya geçer. Boş alan `null` (sayfada köşeli parantezli yer tutucu görünür).
 */
export interface CompanyInfo {
  name: string | null;
  address: string | null;
  taxOffice: string | null;
  taxNumber: string | null;
  mersis: string | null;
  phone: string | null;
  email: string | null;
  kep: string | null;
  jurisdiction: string | null;
  hosting: string | null;
}

const read = (key: string): string | null => process.env[key]?.trim() || null;

export function companyInfo(): CompanyInfo {
  return {
    name: read('LEGAL_COMPANY_NAME'),
    address: read('LEGAL_ADDRESS'),
    taxOffice: read('LEGAL_TAX_OFFICE'),
    taxNumber: read('LEGAL_TAX_NUMBER'),
    mersis: read('LEGAL_MERSIS'),
    phone: read('LEGAL_PHONE'),
    email: read('LEGAL_EMAIL'),
    kep: read('LEGAL_KEP'),
    jurisdiction: read('LEGAL_JURISDICTION'),
    hosting: read('LEGAL_HOSTING'),
  };
}
