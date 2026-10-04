/** Integration hook only: no network requests, identifiers, cookies, or storage. */
export type MarketingEvent = 'homepage_viewed' | 'setup_cta_clicked' | 'migration_guide_clicked' | 'pricing_estimate_changed' | 'faq_opened' | 'preview_signup_clicked';
export function trackMarketing(name: MarketingEvent, properties: Record<string,string|number> = {}) {
  window.dispatchEvent(new CustomEvent('postlane:marketing', { detail: { name, properties } }));
}
