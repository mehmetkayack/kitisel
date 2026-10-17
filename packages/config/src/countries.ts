/**
 * Hedef ülke seçenekleri (ISO 3166-1 alpha-2). Adlar arayüzde `Intl.DisplayNames` ile kullanıcının
 * dilinde gösterilir; bu yüzden burada sadece kodlar var. Liste hedef pazarlar öncelikli (Bölüm 2).
 */
export const COUNTRY_CODES = [
  'US', 'GB', 'CA', 'AU', 'NZ', 'IE', 'DE', 'AT', 'CH', 'ES', 'MX', 'AR', 'CO', 'CL', 'PE', 'FR', 'BE', 'LU',
  'TR', 'IT', 'PT', 'BR', 'NL', 'PL', 'SE', 'DK', 'NO', 'FI', 'CZ', 'RO', 'HU', 'GR', 'UA', 'IL', 'AE', 'SA',
  'IN', 'ID', 'JP', 'KR', 'CN', 'VN', 'TH', 'SG', 'MY', 'PH', 'ZA', 'NG', 'EG', 'AZ', 'KZ', 'CY',
] as const;
export type CountryCode = (typeof COUNTRY_CODES)[number];

export function isCountryCode(value: string): value is CountryCode {
  return (COUNTRY_CODES as readonly string[]).includes(value);
}
