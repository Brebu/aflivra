import type {ReactNode} from 'react';
import {pageMetadata} from '../seo';

export const metadata = pageMetadata({
  title: 'Catalogul de date publice ale României · Aflivra',
  description: 'Seturi de date de la instituțiile României, aduse într-un singur loc, cu sursa, licența și data fiecărei publicări la vedere.',
  path: '/catalog',
});

export default function CatalogLayout({children}: {children: ReactNode}) {
  return children;
}
