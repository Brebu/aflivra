import type {ReactNode} from 'react';
import {pageMetadata} from '../seo';

export const metadata = pageMetadata({
  title: 'Politica de confidentialitate · Aflivra',
  description: 'Cum funcționează Aflivra fără cont, fără cookie-uri și fără instrumente de urmărire: ce date pleacă de la dispozitivul tău, cui ajung, cât timp le păstrăm și cum le ștergi tu însuți.',
  path: '/confidentialitate',
});

export default function ConfidentialitateLayout({children}: {children: ReactNode}) {
  return children;
}
