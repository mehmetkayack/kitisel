import type { Locale } from '@upvine/config';

import enCommon from './en/common.json';
import enAuth from './en/auth.json';
import enApp from './en/app.json';
import enErrors from './en/errors.json';
import enEmail from './en/email.json';
import enMarketing from './en/marketing.json';
import enDevui from './en/devui.json';
import enAdmin from './en/admin.json';
import enSites from './en/sites.json';
import enAnalysis from './en/analysis.json';
import enContent from './en/content.json';
import deCommon from './de/common.json';
import deAuth from './de/auth.json';
import deApp from './de/app.json';
import deErrors from './de/errors.json';
import deEmail from './de/email.json';
import deMarketing from './de/marketing.json';
import deDevui from './de/devui.json';
import deAdmin from './de/admin.json';
import deSites from './de/sites.json';
import deAnalysis from './de/analysis.json';
import deContent from './de/content.json';
import esCommon from './es/common.json';
import esAuth from './es/auth.json';
import esApp from './es/app.json';
import esErrors from './es/errors.json';
import esEmail from './es/email.json';
import esMarketing from './es/marketing.json';
import esDevui from './es/devui.json';
import esAdmin from './es/admin.json';
import esSites from './es/sites.json';
import esAnalysis from './es/analysis.json';
import esContent from './es/content.json';
import frCommon from './fr/common.json';
import frAuth from './fr/auth.json';
import frApp from './fr/app.json';
import frErrors from './fr/errors.json';
import frEmail from './fr/email.json';
import frMarketing from './fr/marketing.json';
import frDevui from './fr/devui.json';
import frAdmin from './fr/admin.json';
import frSites from './fr/sites.json';
import frAnalysis from './fr/analysis.json';
import frContent from './fr/content.json';
import trCommon from './tr/common.json';
import trAuth from './tr/auth.json';
import trApp from './tr/app.json';
import trErrors from './tr/errors.json';
import trEmail from './tr/email.json';
import trMarketing from './tr/marketing.json';
import trDevui from './tr/devui.json';
import trAdmin from './tr/admin.json';
import trSites from './tr/sites.json';
import trAnalysis from './tr/analysis.json';
import trContent from './tr/content.json';

/**
 * Tüm çeviriler. Dosyalar `locales/{locale}/{namespace}.json` altındadır.
 * Referans dil İngilizcedir; `pnpm i18n:check` diğer dillerde eksik/fazla anahtar olursa başarısız olur.
 */
export const NAMESPACES = ['common', 'auth', 'app', 'errors', 'email', 'marketing', 'devui', 'admin', 'sites', 'analysis', 'content'] as const;
export type Namespace = (typeof NAMESPACES)[number];

export const resources = {
  en: { common: enCommon, auth: enAuth, app: enApp, errors: enErrors, email: enEmail, marketing: enMarketing, devui: enDevui, admin: enAdmin, sites: enSites, analysis: enAnalysis, content: enContent },
  de: { common: deCommon, auth: deAuth, app: deApp, errors: deErrors, email: deEmail, marketing: deMarketing, devui: deDevui, admin: deAdmin, sites: deSites, analysis: deAnalysis, content: deContent },
  es: { common: esCommon, auth: esAuth, app: esApp, errors: esErrors, email: esEmail, marketing: esMarketing, devui: esDevui, admin: esAdmin, sites: esSites, analysis: esAnalysis, content: esContent },
  fr: { common: frCommon, auth: frAuth, app: frApp, errors: frErrors, email: frEmail, marketing: frMarketing, devui: frDevui, admin: frAdmin, sites: frSites, analysis: frAnalysis, content: frContent },
  tr: { common: trCommon, auth: trAuth, app: trApp, errors: trErrors, email: trEmail, marketing: trMarketing, devui: trDevui, admin: trAdmin, sites: trSites, analysis: trAnalysis, content: trContent },
} satisfies Record<Locale, Record<Namespace, unknown>>;

export type Resources = (typeof resources)['en'];
