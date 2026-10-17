/**
 * Makale üretim dilleri (Bölüm 2). Arayüz dilinden bağımsızdır; makaleler hedef dilde
 * sıfırdan yazılır, çevrilmez. Yeni dil eklemek için bu listeye satır eklemek yeterlidir.
 */
export interface ContentLanguage {
  /** BCP 47 dil kodu */
  code: string;
  /** Dilin kendi adı */
  nativeName: string;
  /** İngilizce adı (prompt'larda kullanılır) */
  englishName: string;
  rtl?: boolean;
}

export const CONTENT_LANGUAGES = [
  { code: 'en', nativeName: 'English', englishName: 'English' },
  { code: 'de', nativeName: 'Deutsch', englishName: 'German' },
  { code: 'es', nativeName: 'Español', englishName: 'Spanish' },
  { code: 'fr', nativeName: 'Français', englishName: 'French' },
  { code: 'tr', nativeName: 'Türkçe', englishName: 'Turkish' },
  { code: 'it', nativeName: 'Italiano', englishName: 'Italian' },
  { code: 'pt', nativeName: 'Português', englishName: 'Portuguese' },
  { code: 'nl', nativeName: 'Nederlands', englishName: 'Dutch' },
  { code: 'pl', nativeName: 'Polski', englishName: 'Polish' },
  { code: 'sv', nativeName: 'Svenska', englishName: 'Swedish' },
  { code: 'da', nativeName: 'Dansk', englishName: 'Danish' },
  { code: 'nb', nativeName: 'Norsk bokmål', englishName: 'Norwegian' },
  { code: 'fi', nativeName: 'Suomi', englishName: 'Finnish' },
  { code: 'cs', nativeName: 'Čeština', englishName: 'Czech' },
  { code: 'ro', nativeName: 'Română', englishName: 'Romanian' },
  { code: 'hu', nativeName: 'Magyar', englishName: 'Hungarian' },
  { code: 'el', nativeName: 'Ελληνικά', englishName: 'Greek' },
  { code: 'ru', nativeName: 'Русский', englishName: 'Russian' },
  { code: 'uk', nativeName: 'Українська', englishName: 'Ukrainian' },
  { code: 'ar', nativeName: 'العربية', englishName: 'Arabic', rtl: true },
  { code: 'he', nativeName: 'עברית', englishName: 'Hebrew', rtl: true },
  { code: 'hi', nativeName: 'हिन्दी', englishName: 'Hindi' },
  { code: 'id', nativeName: 'Bahasa Indonesia', englishName: 'Indonesian' },
  { code: 'ja', nativeName: '日本語', englishName: 'Japanese' },
  { code: 'ko', nativeName: '한국어', englishName: 'Korean' },
  { code: 'zh-CN', nativeName: '简体中文', englishName: 'Chinese (Simplified)' },
  { code: 'vi', nativeName: 'Tiếng Việt', englishName: 'Vietnamese' },
  { code: 'th', nativeName: 'ไทย', englishName: 'Thai' },
] as const satisfies readonly ContentLanguage[];

export type ContentLanguageCode = (typeof CONTENT_LANGUAGES)[number]['code'];
