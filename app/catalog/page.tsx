"use client";
import '../aflivra.css';
import {LiveCatalog} from '../live-data';
import {LocationProvider,LocationCityPicker,LocationControl} from '../location';
import {SiteFooter} from '../site-footer';
export default function Catalog(){return <LocationProvider><main className="v2"><div className="vwrap"><a className="catalog-home" href="/">Aflivra · Înapoi la platformă</a><div className="page-intro"><span className="kicker">DATE DESCHISE, LA ÎNDEMÂNĂ</span><h1>Catalogul de date publice ale României</h1><p>Seturi de date de la instituțiile României, aduse într-un singur loc, cu sursa, licența și data fiecărei publicări la vedere.</p></div><div className="entity-location"><LocationCityPicker/><LocationControl compact/></div><LiveCatalog browseAll/></div></main><SiteFooter/></LocationProvider>}
