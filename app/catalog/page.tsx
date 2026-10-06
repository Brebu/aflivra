"use client";
import '../aflivra.css';
import {LiveCatalog} from '../live-data';
import {LocationProvider,LocationCityPicker,LocationControl} from '../location';
export default function Catalog(){return <LocationProvider><main className="v2"><div className="vwrap"><a className="catalog-home" href="/">Aflivra · Înapoi la platformă</a><div className="entity-location"><LocationCityPicker/><LocationControl compact/></div><LiveCatalog browseAll/></div></main></LocationProvider>}
