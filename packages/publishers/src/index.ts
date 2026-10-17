// @upvine/publishers — CMS yayın adaptörleri (WordPress, Ghost, Shopify, Webflow, Wix, webhook) ve
// kimlik bilgisi şifreleme. Hepsi aynı `Publisher` arayüzünü uygular (Bölüm 4.2).
import type { HttpClient } from '@upvine/seo';
import { GhostPublisher } from './ghost';
import { ShopifyPublisher } from './shopify';
import type { GhostCredentials, Publisher, ShopifyCredentials, WebflowCredentials, WebhookCredentials, WixCredentials, WordPressCredentials } from './types';
import { WebflowPublisher } from './webflow';
import { WebhookPublisher } from './webhook';
import { WixPublisher } from './wix';
import { WordPressPublisher } from './wordpress';

export * from './types';
export { decryptJson, encryptJson, CredentialKeyError } from './credentials';
export type { EncryptedRecord } from './credentials';
export { authorizeUrl, basicAuth, WordPressPublisher } from './wordpress';
export { SIGNATURE_HEADER, signWebhook, TIMESTAMP_HEADER, verifyWebhook, WebhookPublisher } from './webhook';
export { GHOST_KEY_PATTERN, GhostPublisher, ghostToken } from './ghost';
export { normalizeShopDomain, SHOPIFY_API_VERSION, ShopifyPublisher } from './shopify';
export { WEBFLOW_ROLE_TYPES, WebflowPublisher } from './webflow';
export type { WebflowCollection, WebflowField, WebflowSite } from './webflow';
export { WixPublisher } from './wix';

export type StoredCredentials =
  | ({ kind: 'wordpress' } & WordPressCredentials)
  | ({ kind: 'webhook' } & WebhookCredentials)
  | ({ kind: 'ghost' } & GhostCredentials)
  | ({ kind: 'shopify' } & ShopifyCredentials)
  | ({ kind: 'webflow' } & WebflowCredentials)
  | ({ kind: 'wix' } & WixCredentials);

export function createPublisher(creds: StoredCredentials, http: HttpClient): Publisher {
  switch (creds.kind) {
    case 'wordpress':
      return new WordPressPublisher(creds, http);
    case 'webhook':
      return new WebhookPublisher(creds, http);
    case 'ghost':
      return new GhostPublisher(creds, http);
    case 'shopify':
      return new ShopifyPublisher(creds, http);
    case 'webflow':
      return new WebflowPublisher(creds, http);
    case 'wix':
      return new WixPublisher(creds, http);
  }
}
