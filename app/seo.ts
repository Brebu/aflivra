import type {Metadata} from 'next';

// The pinned canonical origin — the same absolute base the deploy/relay
// scripts use (aflivra.brebu.workers.dev). Canonical, og:url and the sitemap
// all resolve against it, so every environment emits the published URLs.
export const SITE_URL = 'https://aflivra.brebu.workers.dev';
export const SITE_NAME = 'Aflivra';
export const CONTACT_EMAIL = 'contactretetesecrete@gmail.com';
export const OG_IMAGE_PATH = '/og-image.png';
export const OG_IMAGE_WIDTH = 1200;
export const OG_IMAGE_HEIGHT = 630;
// Describes the actual composed share image (brand + tagline), not the page.
export const OG_IMAGE_ALT = 'Aflivra — România la îndemână: date publice oficiale, verificări la vedere.';

const HOME_DESCRIPTION =
  'Explorează România prin dashboarduri, hărți, galerii și comparații. Date din surse publice, cu perioada și ultima verificare vizibile.';

export const HOME_METADATA: Metadata = pageMetadata({
  title: 'Aflivra — România la îndemână',
  description: HOME_DESCRIPTION,
  path: '/',
});

// One builder for every route's head: title, description, canonical,
// the full Open Graph set (image 1200×630, ro_RO) and the Twitter card.
// Titles arrive here already final (no template indirection).
export function pageMetadata({title, description, path}: {title: string; description: string; path: string}): Metadata {
  const url = `${SITE_URL}${path}`;
  return {
    metadataBase: new URL(SITE_URL),
    title,
    description,
    alternates: {canonical: path},
    robots: {index: true, follow: true},
    openGraph: {
      type: 'website',
      siteName: SITE_NAME,
      locale: 'ro_RO',
      url,
      title,
      description,
      images: [{url: OG_IMAGE_PATH, width: OG_IMAGE_WIDTH, height: OG_IMAGE_HEIGHT, alt: OG_IMAGE_ALT}],
    },
    twitter: {
      card: 'summary_large_image',
      title,
      description,
      images: [`${SITE_URL}${OG_IMAGE_PATH}`],
    },
  };
}
