// Structured data for the home route: WebSite (the site identity) and
// SoftwareApplication (the free, no-account web app), rendered server-side in
// the initial HTML so crawlers read it without hydration. No invented
// organization data — the publisher is the service identity with the real
// operator contact from the privacy policy.
import {SITE_URL, SITE_NAME, CONTACT_EMAIL} from './seo';

const HOME_DESCRIPTION =
  'Explorează România prin dashboarduri, hărți, galerii și comparații. Date din surse publice, cu perioada și ultima verificare vizibile.';

const graph = {
  '@context': 'https://schema.org',
  '@graph': [
    {
      '@type': 'WebSite',
      '@id': `${SITE_URL}/#website`,
      name: SITE_NAME,
      alternateName: 'Aflivra — România la îndemână',
      url: `${SITE_URL}/`,
      description: HOME_DESCRIPTION,
      inLanguage: 'ro',
    },
    {
      '@type': 'WebApplication',
      '@id': `${SITE_URL}/#app`,
      name: SITE_NAME,
      url: `${SITE_URL}/`,
      applicationCategory: 'UtilitiesApplication',
      operatingSystem: 'Web',
      inLanguage: 'ro',
      offers: {'@type': 'Offer', price: '0', priceCurrency: 'RON'},
      publisher: {
        '@type': 'Organization',
        name: SITE_NAME,
        url: `${SITE_URL}/`,
        contactPoint: {
          '@type': 'ContactPoint',
          email: CONTACT_EMAIL,
          contactType: 'customer support',
          availableLanguage: ['ro'],
        },
      },
    },
  ],
};

export function StructuredData() {
  return <script type="application/ld+json" dangerouslySetInnerHTML={{__html: JSON.stringify(graph)}}/>;
}
