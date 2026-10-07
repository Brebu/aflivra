import type {ReactNode} from 'react';
import {pageMetadata} from '../seo';

export const metadata = pageMetadata({
  title: 'Termeni de utilizare · Aflivra',
  description: 'Termenii service-ului Aflivra, un agregator de date publice oficiale ale României: fără cont, fără plată și fără reclame, iar sursa oficială rămâne adevărul de referință.',
  path: '/termeni',
});

export default function TermeniLayout({children}: {children: ReactNode}) {
  return children;
}
