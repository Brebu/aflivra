// Aflivra MCP tools — the platform's public surfaces, mapped 1:1 onto the public
// JSON routes. Every tool reuses the route's own validation: an honest 400 from
// the route surfaces as the tool's error, never reinterpreted. Private surfaces
// (the watch center, push subscriptions, refresh/seed/import) stay out — they are
// per-install user state, not public data.
export type ToolQuery={path:string;query:Record<string,string>;method?:'POST';body?:Record<string,unknown>};
export type ToolDef={
  name:string;
  description:string;
  inputSchema:{type:'object';additionalProperties?:false;properties:Record<string,{type:'string'|'integer'|'number'|'boolean'|string[]|number[];description:string;enum?:string[];items?:{type:string};required?:never;maxLength?:number;minLength?:number;minimum?:number;maximum?:number}>;required?:string[]};
  build:(args:Record<string,unknown>)=>ToolQuery;
};

const str=(v:unknown)=>typeof v==='string'?v.trim():'';
const num=(v:unknown)=>typeof v==='number'&&Number.isFinite(v)?String(v):'';
const pick=(allowed:string[]|undefined,v:unknown)=>{const s=str(v);return !allowed||allowed.includes(s)?s:''};
const query=(entries:[string,string][])=>Object.fromEntries(entries.filter(([,v])=>v!=='')) as Record<string,string>;

// Categoriile publice ale inventarului național de locuri — exact cheiile
// manifestului (public/places/manifest.json), fără aliasuri: o categorie
// necunoscută se respinge la granița MCP cu -32602, parametrul numit.
const PLACES_CATEGORIES=['agricultura','bani','cultura','educatie','energie','filme','firme','justitie','local','mediu','munca','sanatate','stiri','transport'];

export const TOOLS:ToolDef[]=[
  {
    name:'search_companies',
    description:'Search Romanian companies by name through the open-knowledge registry (Wikidata, Romanian and English labels merged). Matches carrying a Romanian VAT identifier expose their CUI (fiscal identity) for the full profile; matches without one are listed honestly as such.',
    inputSchema:{type:'object',additionalProperties:false,properties:{name:{type:'string',description:'Company (part of) name, at least 2 characters, e.g. "eMAG", "Dedeman", "Banca Transilvania"'}},required:['name']},
    build:args=>({path:'/api/company',query:query([['name',str(args.name)]])}),
  },
  {
    name:'company_profile',
    description:'Full Romanian company dossier by CUI (fiscal identifier): identity, ANAF fiscal status, yearly financial statements (revenue, profit, employees), public registres (ONRC, CNAS), management and contacts, with per-field provenance.',
    inputSchema:{type:'object',additionalProperties:false,properties:{cui:{type:'string',description:'The CUI fiscal identifier, digits only, e.g. "427282"'}},required:['cui']},
    build:args=>({path:'/api/company',query:query([['cui',str(args.cui)]])}),
  },
  {
    name:'places_search',
    description:'Search live places on the interactive map: hospitals, pharmacies, schools, courts, museums and map POIs by name, category and location, with distances and contact details.',
    inputSchema:{type:'object',additionalProperties:false,properties:{q:{type:'string',description:'Free-text place query'},category:{type:'string',enum:PLACES_CATEGORIES,description:'Category filter: exact keys of the national inventory (agricultura, bani, cultura, educatie, energie, filme, firme, justitie, local, mediu, munca, sanatate, stiri, transport)'},contact:{type:'string',enum:['phone','email','website','address','openingHours'],description:'Only places carrying this contact detail'},scope:{type:'string',enum:['all','nearby'],description:'all = national match, nearby = only within the radius'},sort:{type:'string',enum:['name','recent','distance'],description:'Result ordering (distance needs lat/lon)'},lat:{type:'number',description:'Latitude of the search center'},lon:{type:'number',description:'Longitude of the search center'},radius:{type:'number',description:'Nearby radius in km, 1–100 (default 15)'},pageSize:{type:'integer',minimum:1,maximum:200,description:'Results per page, 1–200 (default 18)'},page:{type:'integer',minimum:0,description:'Zero-based result page'}},required:['q']},
    build:args=>({path:'/api/places',query:query([['q',str(args.q)],['category',pick(PLACES_CATEGORIES,args.category)],['contact',pick(['phone','email','website','address','openingHours'],args.contact)],['scope',pick(['all','nearby'],args.scope)],['sort',pick(['name','recent','distance'],args.sort)],['lat',num(args.lat)],['lon',num(args.lon)],['radius',num(args.radius)],['pageSize',num(args.pageSize)],['page',num(args.page)],['view','cards']])}),
  },
  {
    name:'directory_registry',
    description:'National Romanian registries as searchable tables: schools, health units, pharmacies, hospitals. Rows carry the official registry fields with locality filters.',
    inputSchema:{type:'object',additionalProperties:false,properties:{kind:{type:'string',enum:['schools','health','pharmacies','hospitals'],description:'Which registry to read'},q:{type:'string',description:'Free-text row filter (name, text)'},locality:{type:'string',description:'Locality name — filters rows to the locality'},county:{type:'string',description:'County name — filters rows to the county'},geoScope:{type:'string',enum:['context','local','national'],description:'Geographic scope of the filter (default national)'},page:{type:'integer',minimum:0,description:'Zero-based result page'}},required:['kind']},
    build:args=>({path:'/api/directory',query:query([['kind',pick(['schools','health','pharmacies','hospitals'],args.kind)],['q',str(args.q)],['locality',str(args.locality)],['county',str(args.county)],['geoScope',pick(['context','local','national'],args.geoScope)||'national'],['page',num(args.page)]])}),
  },
  {
    name:'localities_search',
    description:'Search Romanian localities (SIRUTA registry): official names, county, urban/rural classification. Municipalities, towns and SIRUTA-urban component villages carry the mapped lat/lon, matched strictly through the name+county pair — never by name alone; rural villages and ambiguous matches honestly carry none. Every row with a point carries pointKind: "locality" (the locality own mapped center) or "municipality-center" (the municipality point — the six Bucharest sectors share it, declared as such). Use it to resolve a locality before weather, events or transport calls.',
    inputSchema:{type:'object',additionalProperties:false,properties:{q:{type:'string',description:'Locality (part of) name'},page:{type:'integer',minimum:0,description:'Zero-based result page'}},required:['q']},
    build:args=>({path:'/api/localities',query:query([['q',str(args.q)],['page',num(args.page)]])}),
  },
  {
    name:'weather_forecast',
    description:'Current weather and short-term forecast for Romanian coordinates (open data, per-hour values).',
    inputSchema:{type:'object',additionalProperties:false,properties:{lat:{type:'number',description:'Latitude, -90..90'},lon:{type:'number',description:'Longitude, -180..180'},hours:{type:'integer',minimum:1,maximum:168,description:'Hourly forecast window to return, 1–168 hours (default 48) — the current conditions always carry'}},required:['lat','lon']},
    build:args=>({path:'/api/weather',query:query([['lat',num(args.lat)],['lon',num(args.lon)],['hours',Number.isFinite(args.hours)?String(Math.min(168,Math.max(1,Math.floor(Number(args.hours))))):'48']])}),
  },
  {
    name:'weather_alerts',
    description:'Active national weather warnings (ANM) with issue times and severity, filterable by locality/county context.',
    inputSchema:{type:'object',additionalProperties:false,properties:{locality:{type:'string',description:'Locality name to scope alerts for'},county:{type:'string',description:'County name to scope alerts for'},geoScope:{type:'string',enum:['context','local','national'],description:'Geographic scope; "national" for all warnings'}},required:['geoScope']},
    build:args=>({path:'/api/weather',query:query([['kind','alerts'],['locality',str(args.locality)],['county',str(args.county)],['geoScope',pick(['context','local','national'],args.geoScope)]])}),
  },
  {
    name:'events_search',
    description:'Performing arts and public events across Romanian institutions (theatres, opera houses, event venues), searchable by text and locality, with dates, venues and details.',
    inputSchema:{type:'object',additionalProperties:false,properties:{q:{type:'string',description:'Non-empty free-text event query — an empty string is rejected at the MCP boundary'},venue:{type:'string',description:'One validated venue calendar (e.g. "Odeon", "Opera Cluj") — exact venue names come from the registered venues registry'},locality:{type:'string',description:'Locality name'},county:{type:'string',description:'County name'},page:{type:'integer',minimum:0,description:'Zero-based result page'}},required:['q']},
    build:args=>({path:'/api/events',query:query([['q',str(args.q)],['venue',str(args.venue)],['locality',str(args.locality)],['county',str(args.county)],['page',num(args.page)]])}),
  },
  {
    name:'cinema_program',
    description:'Cinema program (Cinema City Romania) by city and date: films, showtimes and details.',
    inputSchema:{type:'object',additionalProperties:false,properties:{locality:{type:'string',description:'City with a Cinema City venue, e.g. "București"'},date:{type:'string',description:'Program date, ISO YYYY-MM-DD'},county:{type:'string',description:'County of the city'},id:{type:'string',description:'Specific cinema id, if known'},detail:{type:'string',enum:['compact','full'],description:'compact = films and showtimes only, without the source\'s full body duplicated (default); full = everything the UI renders'}},required:['locality','date']},
    build:args=>({path:'/api/cinema',query:query([['locality',str(args.locality)],['county',str(args.county)],['id',str(args.id)],['date',str(args.date)],['detail',pick(['compact','full'],args.detail)||'compact']])}),
  },
  {
    name:'transport_positions',
    description:'Live public transport of the Bucharest–Ilfov regional network (TPBI): vehicle positions on map lines, station arrival boards and network alerts. Vehicles update continuously and carry line, route and heading.',
    inputSchema:{type:'object',additionalProperties:false,properties:{kind:{type:'string',enum:['vehicles','arrivals','alerts'],description:'What the route serves: live vehicles, arrivals board, or network alerts'},locality:{type:'string',description:'Locality inside the covered region (e.g. "București")'},county:{type:'string',description:'Covered region (TPBI: Bucharest–Ilfov)'},route:{type:'string',description:'Line short name filter'},stop:{type:'string',description:'Stop id for the arrivals board'},page:{type:'integer',minimum:0,description:'Zero-based result page (arrivals/alerts)'}},required:['county','kind']},
    build:args=>({path:'/api/transport-live',query:query([['kind',pick(['vehicles','arrivals','alerts'],args.kind)],['county',str(args.county)],['locality',str(args.locality)],['route',str(args.route)],['stop',str(args.stop)],['page',num(args.page)]])}),
  },
  {
    name:'tranzy_live',
    description:'Real-time public transport through the Tranzy open-data operators (Iași SCTP, Cluj CTP, Chișinău RTEC, Botoșani Eltrans, Oradea OTL). Bucharest has no Tranzy operator today — its live transport is the TPBI tool. Positions carry line, vehicle and heading.',
    inputSchema:{type:'object',additionalProperties:false,properties:{locality:{type:'string',description:'Covered city: "Iași", "Cluj-Napoca", "Oradea", "Botoșani" or "Chișinău"'},county:{type:'string',description:'County of the city'},q:{type:'string',description:'Line filter, e.g. "b8"'},page:{type:'integer',minimum:0,description:'Zero-based result page'}},required:['locality']},
    build:args=>({path:'/api/tranzy-live',query:query([['locality',str(args.locality)],['county',str(args.county)],['q',str(args.q)],['page',num(args.page)]])}),
  },
  {
    name:'flights_status',
    description:'Romanian air traffic status (live positions summary) with flight queries.',
    inputSchema:{type:'object',additionalProperties:false,properties:{q:{type:'string',description:'Flight query (callsign, registration)'},page:{type:'integer',minimum:0,description:'Zero-based result page'}},required:['q']},
    build:args=>({path:'/api/flights',query:query([['q',str(args.q)],['page',num(args.page)]])}),
  },
  {
    name:'flight_board',
    description:'Arrivals/departures board of the Bucharest airports: Henri Coandă (OTP) and Băneasa · Aurel Vlaicu (BBU).',
    inputSchema:{type:'object',additionalProperties:false,properties:{airport:{type:'string',enum:['henri-coanda','baneasa-aurel-vlaicu'],description:'Airport board: "henri-coanda" (OTP) or "baneasa-aurel-vlaicu" (BBU)'},q:{type:'string',description:'Optional flight number filter'}},required:['airport']},
    build:args=>({path:'/api/flight-board',query:query([['airport',pick(['henri-coanda','baneasa-aurel-vlaicu'],args.airport)],['q',str(args.q)]])}),
  },
  {
    name:'trains_schedule',
    description:'Romanian rail (CFR Infra) schedule: the full station board with train numbers, routes (true route terminus as destination), times and operators. With a station id the board is served for that station (q filters trains); editions are validated against the requested date — expired operator editions appear only with edition=all.',
    inputSchema:{type:'object',additionalProperties:false,properties:{station:{type:'string',description:'Numeric station id (e.g. "44678"); omit it for the full station board with its ids'},q:{type:'string',description:'With station: filters the board by train number or category; without station: searches stations by name'},date:{type:'string',description:'Circulation date, ISO YYYY-MM-DD (default today) — the edition must be valid on it'},edition:{type:'string',enum:['current','all'],description:'current = only editions valid on the date (default); all = include expired editions (archive)'},page:{type:'integer',minimum:0,description:'Zero-based result page'}},},
    build:args=>({path:'/api/trains',query:query([['station',str(args.station)],['q',str(args.q)],['date',(typeof args.date==='string'&&/^\d{4}-\d{2}-\d{2}$/.test(args.date))?args.date:''],['edition',pick(['current','all'],args.edition)],['page',num(args.page)]])}),
  },
  {
    name:'legal_acts',
    description:'The legislation under re-verification feed (legislatie.just.ro): acts tracked by the platform with re-check status, cursor-paginated.',
    inputSchema:{type:'object',additionalProperties:false,properties:{cursor:{type:'string',description:'Pagination cursor from a previous page'}}},
    build:args=>({path:'/api/legal',query:query([['cursor',str(args.cursor)]])}),
  },
  {
    name:'court_dosar_search',
    description:'Search Romanian court files (portal.just.ro) by dosar number, party name, subject or institution, in a date range. Number format e.g. "6236/111/2017".',
    inputSchema:{type:'object',additionalProperties:false,properties:{number:{type:'string',description:'Dosar number (normalized, e.g. "6236/111/2017")'},name:{type:'string',description:'Party name, minimum 3 characters'},subject:{type:'string',description:'Subject text, up to 200 characters'},institution:{type:'string',description:'Court institution — registry id or its usual name, e.g. "TribunalulBIHOR" or "Tribunalul Bihor"; both resolve'},from:{type:'string',description:'From date, ISO YYYY-MM-DD'},to:{type:'string',description:'To date, ISO YYYY-MM-DD'},numberScope:{type:'string',enum:['all','filtered'],description:'Search the number across all sections or only the filtered one'},locality:{type:'string',description:'Locality — scopes institutions to the active zone'},county:{type:'string',description:'County — scopes institutions to the active zone'}},required:[]},
    build:args=>({path:'/api/legal',method:'POST',body:{kind:'court',number:str(args.number),name:str(args.name),subject:str(args.subject),institution:str(args.institution),from:str(args.from),to:str(args.to),numberScope:pick(['all','filtered'],args.numberScope)||'all',locality:str(args.locality),county:str(args.county)},query:{}}),
  },
  {
    name:'federated_search',
    description:'The platform-wide federated search across public domains: official announcements, films, agriculture and the connected institutional feeds — one query, ranked results.',
    inputSchema:{type:'object',additionalProperties:false,properties:{q:{type:'string',description:'Free-text query'},kind:{type:'string',enum:['stiri','agricultura','filme','munca','sanatate','educatie','justitie','energie','transport'],description:'Which feed: stiri (all institutions merged), agricultura, filme, or one institution feed'},publisher:{type:'string',description:'Filter to one publisher'},sort:{type:'string',enum:['recent','oldest','title'],description:'Result ordering'},from:{type:'string',description:'From date, ISO YYYY-MM-DD'},to:{type:'string',description:'To date, ISO YYYY-MM-DD'},page:{type:'integer',minimum:0,description:'Zero-based result page'}},required:['q','kind']},
    build:args=>({path:'/api/domain',query:query([['q',str(args.q)],['kind',pick(['stiri','agricultura','filme','munca','sanatate','educatie','justitie','energie','transport'],args.kind)],['publisher',str(args.publisher)],['sort',pick(['recent','oldest','title'],args.sort)],['from',str(args.from)],['to',str(args.to)],['page',num(args.page)],['geoScope','national']])}),
  },
  {
    name:'catalog_datasets',
    description:'The open-data catalog (CKAN/Romania): datasets by title, organization, category; each entry carries the resource files behind it.',
    inputSchema:{type:'object',additionalProperties:false,properties:{q:{type:'string',description:'Free-text dataset query'},category:{type:'string',description:'Category filter'},organization:{type:'string',description:'Publishing organization filter'},page:{type:'integer',minimum:0,description:'Zero-based result page'}},required:['q']},
    build:args=>({path:'/api/catalog',query:query([['q',str(args.q)],['category',str(args.category)],['organization',str(args.organization)],['page',num(args.page)]])}),
  },
  {
    name:'dataset_table',
    description:'Read a published dataset file as a table (CSV, XLSX, XML with table layer, JSON): sheet list, columns, paginated rows and cell values — the platform reader, honest about non-tabular documents.',
    inputSchema:{type:'object',additionalProperties:false,properties:{id:{type:'string',description:'Dataset resource id (uuid) from the catalog'},sheet:{type:'integer',minimum:0,description:'Sheet index to read'},page:{type:'integer',minimum:0,description:'Zero-based row page'},q:{type:'string',description:'Row filter'},sort:{type:'integer',minimum:0,description:'Column index to sort by'},desc:{type:'boolean',description:'Sort descending'}},required:['id']},
    build:args=>({path:'/api/resource',query:query([['id',str(args.id)],['sheet',num(args.sheet)],['page',num(args.page)],['q',str(args.q)],['sort',num(args.sort)],['desc',args.desc===true?'1':'']])}),
  },
  {
    name:'dataset_export',
    description:'Export a fully-imported verified dataset table as CSV text (for direct reading by the assistant) or XLSX. The XLSX is binary: the result carries a download resource link with MIME and file name, never the raw bytes as text. Only tables imported and verified whole support the export — the route answers 409 honestly otherwise.',
    inputSchema:{type:'object',additionalProperties:false,properties:{id:{type:'string',description:'Dataset resource id (uuid)'},format:{type:'string',enum:['csv','xlsx'],description:'Export format: csv (text, readable in conversation) or xlsx (binary, returned as a download link)'},sheet:{type:'integer',minimum:0,description:'Sheet index to read/export (default 0) — selects one sheet in both formats'}},required:['id']},
    build:args=>({path:'/api/resource-file',query:query([['id',str(args.id)],['format',pick(['csv','xlsx'],args.format)||'csv'],['sheet',num(args.sheet)],['download','1']])}),
  },
  {
    name:'news_feed',
    description:'Official institutional announcements: stiri means ALL connected feeds merged (labor ANOFM, health CNAS, education, justice, energy, transport TPBI, internal affairs), or one institution feed; agriculture (AFIR) and films are separate domains. Latest articles with links, dates and publishers.',
    inputSchema:{type:'object',additionalProperties:false,properties:{kind:{type:'string',enum:['stiri','agricultura','filme','munca','sanatate','educatie','justitie','energie','transport'],description:'stiri = all feeds merged; or one institution feed (munca=ANOFM, sanatate=CNAS, educatie, justitie, energie, transport=TPBI)'},q:{type:'string',description:'Free-text filter'},publisher:{type:'string',description:'Filter to one publisher (from the feed response)'},sort:{type:'string',enum:['recent','oldest','title'],description:'Result ordering'},from:{type:'string',description:'From date, ISO YYYY-MM-DD'},to:{type:'string',description:'To date, ISO YYYY-MM-DD'},page:{type:'integer',minimum:0,description:'Zero-based result page'}},required:['kind']},
    build:args=>({path:'/api/domain',query:query([['kind',pick(['stiri','agricultura','filme','munca','sanatate','educatie','justitie','energie','transport'],args.kind)],['q',str(args.q)],['publisher',str(args.publisher)],['sort',pick(['recent','oldest','title'],args.sort)],['from',str(args.from)],['to',str(args.to)],['page',num(args.page)],['geoScope','national']])}),
  },
  {
    name:'story_read',
    description:'Read a public-domain Romanian literary work (Wikisource) by id, with chapters.',
    inputSchema:{type:'object',additionalProperties:false,properties:{id:{type:'string',description:'Story id from the platform'}},required:['id']},
    build:args=>({path:'/api/story',query:query([['id',str(args.id)]])}),
  },
  {
    name:'lawyers_registry',
    description:'Romanian bar association (UNBR) lawyer registry: search by name, paginated, optionally scoped to a bar by locality.',
    inputSchema:{type:'object',additionalProperties:false,properties:{q:{type:'string',description:'Lawyer name query, minimum 3 characters'},locality:{type:'string',description:'Locality — anchors the bar-scoped geographic context'},county:{type:'string',description:'County — anchors the bar-scoped geographic context'},page:{type:'integer',minimum:0,description:'Zero-based result page'},sort:{type:'string',enum:['name','recent'],description:'Result ordering'}},required:['q']},
    build:args=>({path:'/api/lawyers',query:query([['q',str(args.q)],['locality',str(args.locality)],['county',str(args.county)],['page',num(args.page)],['sort',pick(['name','recent'],args.sort)]])}),
  },
  {
    name:'forensic_experts',
    description:'Romanian justice registries: forensic experts (judicial, technical) and authorized translators, filtered by county, searchable.',
    inputSchema:{type:'object',additionalProperties:false,properties:{kind:{type:'string',enum:['experti-judiciari','experti-tehnici','traducatori'],description:'Which registry to read'},locality:{type:'string',description:'Locality — anchors the geographic context the registry requires'},judet:{type:'string',description:'County (judet) filter, e.g. "Bihor"'},q:{type:'string',description:'Free-text filter'},page:{type:'integer',minimum:0,description:'Zero-based result page'}},required:['kind','locality']},
    build:args=>({path:'/api/experts',query:query([['kind',pick(['experti-judiciari','experti-tehnici','traducatori'],args.kind)],['locality',str(args.locality)],['judet',str(args.judet)],['q',str(args.q)],['page',num(args.page)],['geoScope','context'],['county',str(args.judet)]])}),
  },
  {
    name:'notaries_registry',
    description:'Romanian notaries public registry by chamber, searchable.',
    inputSchema:{type:'object',additionalProperties:false,properties:{chamber:{type:'string',description:'Chamber (e.g. county name)'},q:{type:'string',description:'Free-text filter'},page:{type:'integer',minimum:0,description:'Zero-based result page'}},required:['q']},
    build:args=>({path:'/api/notaries',query:query([['chamber',str(args.chamber)],['q',str(args.q)],['page',num(args.page)]])}),
  },
  {
    name:'anl_housing',
    description:'ANL (National Housing Agency) public housing registry by county.',
    inputSchema:{type:'object',additionalProperties:false,properties:{county:{type:'string',description:'County name'},q:{type:'string',description:'Free-text filter'},page:{type:'integer',minimum:0,description:'Zero-based result page'}},required:['q']},
    build:args=>({path:'/api/anl',query:query([['county',str(args.county)],['q',str(args.q)],['page',num(args.page)]])}),
  },
  {
    name:'ancpi_integrals',
    description:'ANCPI (Cadastre) monthly registered-mortgage dynamics for the latest published month in the dataset: totals, by property type and by county, with the period labeled. Market indicator — not individual property records or a file inventory.',
    inputSchema:{type:'object',additionalProperties:false,properties:{}},
    build:()=>({path:'/api/ancpi',query:{}}),
  },
  {
    name:'tourism_registry',
    description:'SITUR official tourist structure registries (se.situr.gov.ro Excel exports): classified licensed tourist accommodation (cazare, 32k+ rows), public food service (alimentatie) and licensed travel agencies (agentii), with operator, license/certificate number and issue date, capacity where published, locality/county and CUI where the registry carries one (cui: null is honest absence, counted in the response). A licensing and classification registry — NOT room prices, reservations, occupancy or proof of operation on the query day. exportDate (the export title) and pageDate (the index page) are kept separate. Commercial reuse license: unconfirmed — official source, personal study and verification use.',
    inputSchema:{type:'object',additionalProperties:false,properties:{kind:{type:'string',enum:['cazare','alimentatie','agentii'],description:'Registry kind: cazare (accommodation), alimentatie (public food service) or agentii (travel agencies)'},q:{type:'string',description:'Free-text filter over unit name, operator, locality, county and CUI'},locality:{type:'string',description:'Locality name filter'},county:{type:'string',description:'County name filter (any normal spelling resolves)'},page:{type:'integer',minimum:0,description:'Zero-based result page'}},required:['kind']},
    build:args=>({path:'/api/tourism',query:query([['kind',str(args.kind)],['q',str(args.q)],['locality',str(args.locality)],['county',str(args.county)],['page',num(args.page)]])}),
  },
  {
    name:'seismic_buildings',
    description:'AMCCRS official seismic classification register of Bucharest buildings (Lista Cladiri 2026): street/number/sector, construction year, height regime, apartments, expertise year and expert, with BOTH the original classification text (48 distinct source forms, kept verbatim) and the normalized class (RsI, RsII, RsIII, RsIV, consolidata, urgenta, neincadrata, neclasificabila — emergency categories stay distinct from Rs classes). Coverage: Bucharest only. A street address absent from the register means "nu am găsit o înregistrare" — never "safe building"; nothing here is a cadastral or legal verdict on an apartment. Commercial reuse license: unconfirmed — official source, personal study and verification use.',
    inputSchema:{type:'object',additionalProperties:false,properties:{q:{type:'string',description:'Non-empty street address in Bucharest (e.g. "Academiei 1", "Ionescu 4 sector 2")'},sector:{type:'string',enum:['1','2','3','4','5','6'],description:'Bucharest sector filter'},page:{type:'integer',minimum:0,description:'Zero-based result page'}},required:['q']},
    build:args=>({path:'/api/seismic',query:query([['q',str(args.q)],['sector',str(args.sector)],['page',num(args.page)]])}),
  },
  {
    name:'seismic_events',
    description:'INFP / EIDA seismic history of Romania and surroundings: felt earthquakes of magnitude >= 3 inside the audited bbox 43-49N / 20-30E, committed per year (stations of the RO network also served, kind stations). History and infrastructure — NOT real-time earthquake alerting (recent-window 204 responses were inconclusive at audit); the committed window is declared in every response and events outside it are not presumed nonexistent. Periodicity note: the bbox does not exclusively define Romanian territory. Network licenses are kept separate; commercial reuse license: unconfirmed — official source, personal study and verification use.',
    inputSchema:{type:'object',additionalProperties:false,properties:{kind:{type:'string',enum:['events','stations'],description:'events (default: magnitude >= 3 earthquake history) or stations (the RO network register)'},from:{type:'string',description:'ISO date prefix lower bound (YYYY, YYYY-MM or YYYY-MM-DD) inside the committed window'},to:{type:'string',description:'ISO date prefix upper bound inside the committed window'},minMagnitude:{type:'number',minimum:0,maximum:10,description:'Minimum magnitude filter (the corpus base is 3)'},q:{type:'string',description:'Free-text filter over location name, event type, magnitude and date'},page:{type:'integer',minimum:0,description:'Zero-based result page'}},required:[]},
    build:args=>({path:'/api/earthquakes',query:query([['kind',str(args.kind)],['from',str(args.from)],['to',str(args.to)],['minMagnitude',typeof args.minMagnitude==='number'?String(args.minMagnitude):''],['q',str(args.q)],['page',num(args.page)]])}),
  },
  {
    name:'historic_monuments',
    description:'The 2015 Historic Monuments List (Lista Monumentelor Istorice 2015) — Bucharest section, from the official Ministry of Culture PDF (published in Monitorul Oficial Partea I nr. 113 bis/15.II.2016): monument code LMI, name, locality, address, dating and the printed Monitorul Oficial folio (not the PDF page number). The 2015 base is declared: later ministerial update orders are a separate process and are not folded in; a possible heritage mention is not an automatic current legal verdict. Extraction counts are served as counts, never as a validated monument census. Commercial reuse license: unconfirmed — official source, personal study and verification use.',
    inputSchema:{type:'object',additionalProperties:false,properties:{q:{type:'string',description:'Free-text filter over code LMI, monument name and address'},page:{type:'integer',minimum:0,description:'Zero-based result page'}},required:[]},
    build:args=>({path:'/api/monuments',query:query([['q',str(args.q)],['page',num(args.page)]])}),
  },
  {
    name:'ins_series',
    description:'INS Tempo official statistical series (statistici.insse.ro) on the validated matrix POP105A: resident population at January 1 by county/territory for the latest three published years, with the unit (Numar persoane) and the per-value status the source marks typographically (revizuit = bold, provizoriu = underlined, semidefinitiv = both; ":" = missing and "c" = confidential stay null-marked, never zero). Selection ids derive from the matrix metadata at load time; yearly values, not projections. Other matrices are rejected honestly until validated separately. Commercial reuse license: unconfirmed for the direct API flow (the CKAN entry is CC BY 4.0; its reach over the direct flow remains to be verified).',
    inputSchema:{type:'object',additionalProperties:false,properties:{territory:{type:'string',description:'County or territory name exactly as the matrix carries it (e.g. "Cluj", "Brașov", "București") — localities are not part of the validated matrix'}},required:['territory']},
    build:args=>({path:'/api/ins',query:query([['territory',str(args.territory)]])}),
  },
  {
    name:'energy_offers',
    description:'ANRE / POSF public electricity-offer comparator for household clients (posf.ro): offers for a consumption profile of consumptionMonthly kWh/month (default 200) in the requested county — the zone resolves through the POSF-published county list, never hardcoded. Identical duplicate rows are deduplicated honestly (duplicateIdenticalRows served); prosumator-targeted offers are flagged, never removed and never recommended — the lowest price is not an offer available to anyone. The calculated bill (valoare_factura_furnizor_fc, billBasisLei as the comparator calculation basis, not your bill), tariff components and offer/licence windows are kept as published. The endpoint is the public web client of the comparator, not a stability-contracted API. Note: the ANRE page carries a no-copy notice; anonymous access is not proof of a commercial license.',
    inputSchema:{type:'object',additionalProperties:false,properties:{county:{type:'string',description:'County name (e.g. "București") — the comparator zone resolves from the POSF-published list'},consumptionMonthly:{type:'integer',minimum:1,maximum:20000,description:'Monthly consumption in kWh the comparator profile uses (default 200)'},currentBillLei:{type:'integer',minimum:0,maximum:1000000,description:'Reference bill in lei for the comparator calculation basis (default 300; a hypothesis, not your bill)'},q:{type:'string',description:'Free-text filter over furnizor and offer name'},page:{type:'integer',minimum:0,description:'Zero-based result page'}},required:['county']},
    build:args=>({path:'/api/energy-offers',query:query([['county',str(args.county)],['consumptionMonthly',num(args.consumptionMonthly)],['currentBillLei',num(args.currentBillLei)],['q',str(args.q)],['page',num(args.page)]])}),
  },
  {
    name:'power_system',
    description:'Transelectrica live national power system observation (SEN): production, consumption and exchange balance in MW, with the componentsMW breakdown exactly as the source publishes it (full aggregation reconciliation is not defined by the source contract — served with that note). observedAt parses the source timestamp (YY/MM/DD) on the declared Europe/Bucharest assumption, kept alongside observedAtText; observationAgeSeconds measures the observation, and 1-2 minutes of age is normal, not an outage. Power and balance are not electricity tariffs or billable quantities. Commercial reuse license: unconfirmed — official source, personal study and verification use.',
    inputSchema:{type:'object',additionalProperties:false,properties:{}},
    build:()=>({path:'/api/power',query:{}}),
  },
  {
    name:'film_detail',
    description:'The full Wikidata sheet of a Romanian film by Q-id: directors, cast, genres, runtime, release dates with all labeled claims plus Commons media with credit and license. Use federated_search with kind filme to discover Q-ids.',
    inputSchema:{type:'object',additionalProperties:false,properties:{id:{type:'string',description:'Wikidata Q-id of the film, e.g. "Q1084"'}},required:['id']},
    build:args=>({path:'/api/content',query:query([['kind','film'],['id',str(args.id)]])}),
  },
  {
    name:'article_read',
    description:'Read one official publication article in full text by URL (institutional sources: ANOFM, MAI, CNAS, MEC, MJ, energy ministry, TPBI, AFIR, Romanian Police). WordPress articles carry full text; others carry the summary the source publishes; attachments are listed. Only allowlisted institutional hosts are read.',
    inputSchema:{type:'object',additionalProperties:false,properties:{url:{type:'string',description:'Article URL from a news_feed or federated_search result',maxLength:2000}},required:['url']},
    build:args=>({path:'/api/content',query:query([['url',str(args.url)]])}),
  },
  {
    name:'transport_network',
    description:'The scheduled Bucharest–Ilfov transit network (TPBI GTFS): lines and stops with search, paging and distance sorting around a point. Scheduled data, not live positions — the live layer is the transport_positions tool.',
    inputSchema:{type:'object',additionalProperties:false,properties:{kind:{type:'string',enum:['routes','stops'],description:'Lines or stops'},q:{type:'string',description:'Free-text filter (line name, stop name)'},lat:{type:'number',description:'Latitude — sorts stops by distance'},lon:{type:'number',description:'Longitude — sorts stops by distance'},locality:{type:'string',description:'Locality inside the covered region, e.g. "București"'},county:{type:'string',description:'Covered region: Bucharest–Ilfov'},page:{type:'integer',minimum:0,description:'Zero-based result page'}},required:['kind']},
    build:args=>({path:'/api/transport',query:query([['kind',pick(['routes','stops'],args.kind)],['q',str(args.q)],['lat',num(args.lat)],['lon',num(args.lon)],['locality',str(args.locality)],['county',str(args.county)],['geoScope','context'],['page',num(args.page)]])}),
  },
  {
    name:'law_search',
    description:'Search Romanian legislation (legislatie.just.ro) by title, words in text, act number or year — paginated results with official links.',
    inputSchema:{type:'object',additionalProperties:false,properties:{title:{type:'string',description:'Words from the title (at most 160 characters)'},text:{type:'string',description:'Words from the text (at most 160 characters)'},number:{type:'string',description:'Act number, digits only (1–8 digits)'},year:{type:'string',description:'Year filter, 1800–2099 — the year from the effective date (DataVigoare) carried by the act, applied locally on the returned page (filterVerification: post-filtered); the source filter is not trusted alone'},page:{type:'integer',minimum:0,maximum:500,description:'Zero-based result page, at most 500'}},required:[]},
    build:args=>({path:'/api/legal',method:'POST',body:{kind:'law',title:str(args.title),text:str(args.text),number:str(args.number),year:str(args.year),page:Number.isFinite(args.page)?args.page:0},query:{}}),
  },
  {
    name:'law_document',
    description:'One consolidated Romanian act, verified against the official portal: title, consolidation date and shape summary (bibliography and character count, not the full text — a full act can reach 1.4 MB and does not fit a conversation). Reading a document through this tool registers it on the tracked-acts re-verification feed of the platform — the same registration the web reader performs.',
    inputSchema:{type:'object',additionalProperties:false,properties:{exactTitle:{type:'string',description:'Exact act title from a law_search result',maxLength:1200},id:{type:'string',description:'Document id from the search result, if known'},selectedType:{type:'string',description:'Document type label, if the search result offered alternatives'},selectedNumber:{type:'string',description:'Act number, if the search result offered alternatives'},selectedDate:{type:'string',description:'Act date, if the search result offered alternatives'}},required:['exactTitle']},
    build:args=>({path:'/api/legal',method:'POST',body:{kind:'law',full:true,summary:true,title:str(args.exactTitle).slice(0,160),exactTitle:str(args.exactTitle),id:str(args.id),selectedType:str(args.selectedType),selectedNumber:str(args.selectedNumber),selectedDate:str(args.selectedDate)},query:{}}),
  },
  {
    name:'cinema_sites',
    description:'The cinema locations of the operator (Cinema City Romania): id, name, city, address and coordinates for every site — the id feeds the cinema_program tool.',
    inputSchema:{type:'object',additionalProperties:false,properties:{}},
    build:()=>({path:'/api/cinemas',query:{}}),
  },
  {
    name:'stories_list',
    description:'The public-domain literary works library (Wikisource RO): 233 works with id, title and category — the id feeds the story_read tool.',
    inputSchema:{type:'object',additionalProperties:false,properties:{page:{type:'integer',minimum:0,description:'Zero-based result page, 20 per page'}}},
    build:args=>({path:'/api/stories',query:query([['page',num(args.page)]])}),
  },
];
