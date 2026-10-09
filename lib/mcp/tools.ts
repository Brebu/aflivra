// Aflivra MCP tools — the platform's public surfaces, mapped 1:1 onto the public
// JSON routes. Every tool reuses the route's own validation: an honest 400 from
// the route surfaces as the tool's error, never reinterpreted. Private surfaces
// (the watch center, push subscriptions, refresh/seed/import) stay out — they are
// per-install user state, not public data.
export type ToolQuery={path:string;query:Record<string,string>;method?:'POST';body?:Record<string,unknown>};
export type ToolDef={
  name:string;
  description:string;
  inputSchema:{type:'object';properties:Record<string,{type:string|number|boolean|string[]|number[];description:string;enum?:string[];items?:{type:string};required?:never;maxLength?:number}>;required?:string[]};
  build:(args:Record<string,unknown>)=>ToolQuery;
};

const str=(v:unknown)=>typeof v==='string'?v.trim():'';
const num=(v:unknown)=>typeof v==='number'&&Number.isFinite(v)?String(v):'';
const bool=(v:unknown)=>typeof v==='boolean'?String(v):'';
const pick=(allowed:string[]|undefined,v:unknown)=>{const s=str(v);return !allowed||allowed.includes(s)?s:''};
const query=(entries:[string,string][])=>Object.fromEntries(entries.filter(([,v])=>v!=='')) as Record<string,string>;

export const TOOLS:ToolDef[]=[
  {
    name:'search_companies',
    description:'Search Romanian companies by name through the open-knowledge registry (Wikidata, Romanian and English labels merged). Matches carrying a Romanian VAT identifier expose their CUI (fiscal identity) for the full profile; matches without one are listed honestly as such.',
    inputSchema:{type:'object',properties:{name:{type:'string',description:'Company (part of) name, at least 2 characters, e.g. "eMAG", "Dedeman", "Banca Transilvania"'}},required:['name']},
    build:args=>({path:'/api/company',query:query([['name',str(args.name)]])}),
  },
  {
    name:'company_profile',
    description:'Full Romanian company dossier by CUI (fiscal identifier): identity, ANAF fiscal status, yearly financial statements (revenue, profit, employees), public registres (ONRC, CNAS), management and contacts, with per-field provenance.',
    inputSchema:{type:'object',properties:{cui:{type:'string',description:'The CUI fiscal identifier, digits only, e.g. "427282"'}},required:['cui']},
    build:args=>({path:'/api/company',query:query([['cui',str(args.cui)]])}),
  },
  {
    name:'places_search',
    description:'Search live places on the interactive map: hospitals, pharmacies, schools, courts, museums and map POIs by name, category and location, with distances and contact details.',
    inputSchema:{type:'object',properties:{q:{type:'string',description:'Free-text place query'},category:{type:'string',description:'Category filter, from the national inventory (e.g. sanatate, educatie, cultura, administratie, comert, transport, sport)'},contact:{type:'string',enum:['phone','email','website','address','openingHours'],description:'Only places carrying this contact detail'},scope:{type:'string',enum:['all','nearby'],description:'all = national match, nearby = only within the radius'},sort:{type:'string',enum:['name','recent','distance'],description:'Result ordering (distance needs lat/lon)'},lat:{type:'number',description:'Latitude of the search center'},lon:{type:'number',description:'Longitude of the search center'},radius:{type:'number',description:'Nearby radius in km, 1–100 (default 15)'},pageSize:{type:'number',description:'Results per page, 1–200 (default 18)'},page:{type:'number',description:'Zero-based result page'}},required:['q']},
    build:args=>({path:'/api/places',query:query([['q',str(args.q)],['category',str(args.category)],['contact',pick(['phone','email','website','address','openingHours'],args.contact)],['scope',pick(['all','nearby'],args.scope)],['sort',pick(['name','recent','distance'],args.sort)],['lat',num(args.lat)],['lon',num(args.lon)],['radius',num(args.radius)],['pageSize',num(args.pageSize)],['page',num(args.page)],['view','cards']])}),
  },
  {
    name:'directory_registry',
    description:'National Romanian registries as searchable tables: schools, health units, pharmacies, hospitals. Rows carry the official registry fields with locality filters.',
    inputSchema:{type:'object',properties:{kind:{type:'string',enum:['schools','health','pharmacies','hospitals'],description:'Which registry to read'},q:{type:'string',description:'Free-text row filter (name, locality)'},page:{type:'number',description:'Zero-based result page'}},required:['kind']},
    build:args=>({path:'/api/directory',query:query([['kind',pick(['schools','health','pharmacies','hospitals'],args.kind)],['q',str(args.q)],['page',num(args.page)],['geoScope','national']])}),
  },
  {
    name:'localities_search',
    description:'Search Romanian localities (SIRUTA registry): official names, county, urban/rural classification, coordinates. Use it to resolve a locality name before weather, events or transport calls.',
    inputSchema:{type:'object',properties:{q:{type:'string',description:'Locality (part of) name'},page:{type:'number',description:'Zero-based result page'}},required:['q']},
    build:args=>({path:'/api/localities',query:query([['q',str(args.q)],['page',num(args.page)]])}),
  },
  {
    name:'weather_forecast',
    description:'Current weather and short-term forecast for Romanian coordinates (open data, per-hour values).',
    inputSchema:{type:'object',properties:{lat:{type:'number',description:'Latitude, -90..90'},lon:{type:'number',description:'Longitude, -180..180'}},required:['lat','lon']},
    build:args=>({path:'/api/weather',query:query([['lat',num(args.lat)],['lon',num(args.lon)]])}),
  },
  {
    name:'weather_alerts',
    description:'Active national weather warnings (ANM) with issue times and severity, filterable by locality/county context.',
    inputSchema:{type:'object',properties:{locality:{type:'string',description:'Locality name to scope alerts for'},county:{type:'string',description:'County name to scope alerts for'},geoScope:{type:'string',enum:['context','local','national'],description:'Geographic scope; "national" for all warnings'}},required:['geoScope']},
    build:args=>({path:'/api/weather',query:query([['kind','alerts'],['locality',str(args.locality)],['county',str(args.county)],['geoScope',pick(['context','local','national'],args.geoScope)]])}),
  },
  {
    name:'events_search',
    description:'Performing arts and public events across Romanian institutions (theatres, opera houses, event venues), searchable by text and locality, with dates, venues and details.',
    inputSchema:{type:'object',properties:{q:{type:'string',description:'Free-text event query'},venue:{type:'string',description:'One validated venue calendar (e.g. "Odeon", "Opera Cluj") — exact venue names come from the registered venues registry'},locality:{type:'string',description:'Locality name'},county:{type:'string',description:'County name'},page:{type:'number',description:'Zero-based result page'}},required:['q']},
    build:args=>({path:'/api/events',query:query([['q',str(args.q)],['venue',str(args.venue)],['locality',str(args.locality)],['county',str(args.county)],['page',num(args.page)]])}),
  },
  {
    name:'cinema_program',
    description:'Cinema program (Cinema City Romania) by city and date: films, showtimes and details.',
    inputSchema:{type:'object',properties:{locality:{type:'string',description:'City with a Cinema City venue, e.g. "București"'},date:{type:'string',description:'Program date, ISO YYYY-MM-DD'},county:{type:'string',description:'County of the city'},id:{type:'string',description:'Specific cinema id, if known'}},required:['locality','date']},
    build:args=>({path:'/api/cinema',query:query([['locality',str(args.locality)],['county',str(args.county)],['id',str(args.id)],['date',str(args.date)]])}),
  },
  {
    name:'transport_positions',
    description:'Live public transport of the Bucharest–Ilfov regional network (TPBI): vehicle positions on map lines, station arrival boards and network alerts. Vehicles update continuously and carry line, route and heading.',
    inputSchema:{type:'object',properties:{kind:{type:'string',enum:['vehicles','arrivals','alerts'],description:'What the route serves: live vehicles, arrivals board, or network alerts'},locality:{type:'string',description:'Locality inside the covered region (e.g. "București")'},county:{type:'string',description:'Covered region (TPBI: Bucharest–Ilfov)'},route:{type:'string',description:'Line short name filter'},stop:{type:'string',description:'Stop id for the arrivals board'},page:{type:'number',description:'Zero-based result page (arrivals/alerts)'}},required:['county','kind']},
    build:args=>({path:'/api/transport-live',query:query([['kind',pick(['vehicles','arrivals','alerts'],args.kind)],['county',str(args.county)],['locality',str(args.locality)],['route',str(args.route)],['stop',str(args.stop)],['page',num(args.page)]])}),
  },
  {
    name:'tranzy_live',
    description:'Real-time public transport through the Tranzy open-data operators (Iași SCTP, Cluj CTP, Chișinău RTEC, Botoșani Eltrans, Oradea OTL). Bucharest has no Tranzy operator today — its live transport is the TPBI tool. Positions carry line, vehicle and heading.',
    inputSchema:{type:'object',properties:{locality:{type:'string',description:'Covered city: "Iași", "Cluj-Napoca", "Oradea", "Botoșani" or "Chișinău"'},county:{type:'string',description:'County of the city'},q:{type:'string',description:'Line filter, e.g. "b8"'},page:{type:'number',description:'Zero-based result page'}},required:['locality']},
    build:args=>({path:'/api/tranzy-live',query:query([['locality',str(args.locality)],['county',str(args.county)],['q',str(args.q)],['page',num(args.page)]])}),
  },
  {
    name:'flights_status',
    description:'Romanian air traffic status (live positions summary) with flight queries.',
    inputSchema:{type:'object',properties:{q:{type:'string',description:'Flight query (callsign, registration)'},page:{type:'number',description:'Zero-based result page'}},required:['q']},
    build:args=>({path:'/api/flights',query:query([['q',str(args.q)],['page',num(args.page)]])}),
  },
  {
    name:'flight_board',
    description:'Arrivals/departures board of the Bucharest airports: Henri Coandă (OTP) and Băneasa · Aurel Vlaicu (BBU).',
    inputSchema:{type:'object',properties:{airport:{type:'string',enum:['henri-coanda','baneasa-aurel-vlaicu'],description:'Airport board: "henri-coanda" (OTP) or "baneasa-aurel-vlaicu" (BBU)'},q:{type:'string',description:'Optional flight number filter'}},required:['airport']},
    build:args=>({path:'/api/flight-board',query:query([['airport',pick(['henri-coanda','baneasa-aurel-vlaicu'],args.airport)],['q',str(args.q)]])}),
  },
  {
    name:'trains_schedule',
    description:'Romanian rail (CFR Infra) schedule: the full station board with train numbers, routes, times and operators; optionally filtered to one station by its numeric id.',
    inputSchema:{type:'object',properties:{station:{type:'string',description:'Numeric station id (e.g. "44678"); omit it for the full station board with its ids'},q:{type:'string',description:'Optional train number filter'},page:{type:'number',description:'Zero-based result page'}},},
    build:args=>({path:'/api/trains',query:query([['station',str(args.station)],['q',str(args.q)],['page',num(args.page)]])}),
  },
  {
    name:'legal_acts',
    description:'The legislation under re-verification feed (legislatie.just.ro): acts tracked by the platform with re-check status, cursor-paginated.',
    inputSchema:{type:'object',properties:{cursor:{type:'string',description:'Pagination cursor from a previous page'}}},
    build:args=>({path:'/api/legal',query:query([['cursor',str(args.cursor)]])}),
  },
  {
    name:'court_dosar_search',
    description:'Search Romanian court files (portal.just.ro) by dosar number, party name, subject or institution, in a date range. Number format e.g. "6236/111/2017".',
    inputSchema:{type:'object',properties:{number:{type:'string',description:'Dosar number (normalized, e.g. "6236/111/2017")'},name:{type:'string',description:'Party name, minimum 3 characters'},subject:{type:'string',description:'Subject text, up to 200 characters'},institution:{type:'string',description:'Court institution (e.g. "Curtea de Apel București")'},from:{type:'string',description:'From date, ISO YYYY-MM-DD'},to:{type:'string',description:'To date, ISO YYYY-MM-DD'},numberScope:{type:'string',enum:['all','filtered'],description:'Search the number across all sections or only the filtered one'},locality:{type:'string',description:'Locality — scopes institutions to the active zone'},county:{type:'string',description:'County — scopes institutions to the active zone'}},required:[]},
    build:args=>({path:'/api/legal',method:'POST',body:{kind:'court',number:str(args.number),name:str(args.name),subject:str(args.subject),institution:str(args.institution),from:str(args.from),to:str(args.to),numberScope:pick(['all','filtered'],args.numberScope)||'all'},query:{}}),
  },
  {
    name:'federated_search',
    description:'The platform-wide federated search across public domains: official announcements, films, agriculture and the connected institutional feeds — one query, ranked results.',
    inputSchema:{type:'object',properties:{q:{type:'string',description:'Free-text query'},kind:{type:'string',enum:['stiri','agricultura','filme','munca','sanatate','educatie','justitie','energie','transport'],description:'Which feed: stiri (all institutions merged), agricultura, filme, or one institution feed'},publisher:{type:'string',description:'Filter to one publisher'},sort:{type:'string',enum:['recent','oldest','title'],description:'Result ordering'},from:{type:'string',description:'From date, ISO YYYY-MM-DD'},to:{type:'string',description:'To date, ISO YYYY-MM-DD'},page:{type:'number',description:'Zero-based result page'}},required:['q','kind']},
    build:args=>({path:'/api/domain',query:query([['q',str(args.q)],['kind',pick(['stiri','agricultura','filme','munca','sanatate','educatie','justitie','energie','transport'],args.kind)],['publisher',str(args.publisher)],['sort',pick(['recent','oldest','title'],args.sort)],['from',str(args.from)],['to',str(args.to)],['page',num(args.page)],['geoScope','national']])}),
  },
  {
    name:'catalog_datasets',
    description:'The open-data catalog (CKAN/Romania): datasets by title, organization, category; each entry carries the resource files behind it.',
    inputSchema:{type:'object',properties:{q:{type:'string',description:'Free-text dataset query'},category:{type:'string',description:'Category filter'},organization:{type:'string',description:'Publishing organization filter'},page:{type:'number',description:'Zero-based result page'}},required:['q']},
    build:args=>({path:'/api/catalog',query:query([['q',str(args.q)],['category',str(args.category)],['organization',str(args.organization)],['page',num(args.page)]])}),
  },
  {
    name:'dataset_table',
    description:'Read a published dataset file as a table (CSV, XLSX, XML with table layer, JSON): sheet list, columns, paginated rows and cell values — the platform reader, honest about non-tabular documents.',
    inputSchema:{type:'object',properties:{id:{type:'string',description:'Dataset resource id (uuid) from the catalog'},sheet:{type:'number',description:'Sheet index to read'},page:{type:'number',description:'Zero-based row page'},q:{type:'string',description:'Row filter'},sort:{type:'number',description:'Column index to sort by'},desc:{type:'boolean',description:'Sort descending'}},required:['id']},
    build:args=>({path:'/api/resource',query:query([['id',str(args.id)],['sheet',num(args.sheet)],['page',num(args.page)],['q',str(args.q)],['sort',num(args.sort)],['desc',bool(args.desc)]])}),
  },
  {
    name:'dataset_export',
    description:'Export a fully-imported verified dataset table as CSV text (for direct reading by the assistant) or XLSX. Only tables imported and verified whole support the export — the route answers 409 honestly otherwise.',
    inputSchema:{type:'object',properties:{id:{type:'string',description:'Dataset resource id (uuid)'},format:{type:'string',enum:['csv','xlsx'],description:'Export format: csv (text, readable in conversation) or xlsx'},sheet:{type:'number',description:'Sheet index to export (default 0)'}},required:['id']},
    build:args=>({path:'/api/resource-file',query:query([['id',str(args.id)],['format',pick(['csv','xlsx'],args.format)||'csv'],['sheet',num(args.sheet)],['download','1']])}),
  },
  {
    name:'news_feed',
    description:'Official institutional announcements: stiri means ALL connected feeds merged (labor ANOFM, health CNAS, education, justice, energy, transport TPBI, internal affairs), or one institution feed; agriculture (AFIR) and films are separate domains. Latest articles with links, dates and publishers.',
    inputSchema:{type:'object',properties:{kind:{type:'string',enum:['stiri','agricultura','filme','munca','sanatate','educatie','justitie','energie','transport'],description:'stiri = all feeds merged; or one institution feed (munca=ANOFM, sanatate=CNAS, educatie, justitie, energie, transport=TPBI)'},q:{type:'string',description:'Free-text filter'},publisher:{type:'string',description:'Filter to one publisher (from the feed response)'},sort:{type:'string',enum:['recent','oldest','title'],description:'Result ordering'},from:{type:'string',description:'From date, ISO YYYY-MM-DD'},to:{type:'string',description:'To date, ISO YYYY-MM-DD'},page:{type:'number',description:'Zero-based result page'}},required:['kind']},
    build:args=>({path:'/api/domain',query:query([['kind',pick(['stiri','agricultura','filme','munca','sanatate','educatie','justitie','energie','transport'],args.kind)],['q',str(args.q)],['publisher',str(args.publisher)],['sort',pick(['recent','oldest','title'],args.sort)],['from',str(args.from)],['to',str(args.to)],['page',num(args.page)],['geoScope','national']])}),
  },
  {
    name:'story_read',
    description:'Read a public-domain Romanian literary work (Wikisource) by id, with chapters.',
    inputSchema:{type:'object',properties:{id:{type:'string',description:'Story id from the platform'}},required:['id']},
    build:args=>({path:'/api/story',query:query([['id',str(args.id)]])}),
  },
  {
    name:'lawyers_registry',
    description:'Romanian bar association (UNBR) lawyer registry: search by name, paginated, optionally scoped to a bar by locality.',
    inputSchema:{type:'object',properties:{q:{type:'string',description:'Lawyer name query, minimum 3 characters'},locality:{type:'string',description:'Locality — anchors the bar-scoped geographic context'},county:{type:'string',description:'County — anchors the bar-scoped geographic context'},page:{type:'number',description:'Zero-based result page'},sort:{type:'string',enum:['name','recent'],description:'Result ordering'}},required:['q']},
    build:args=>({path:'/api/lawyers',query:query([['q',str(args.q)],['locality',str(args.locality)],['county',str(args.county)],['page',num(args.page)],['sort',pick(['name','recent'],args.sort)]])}),
  },
  {
    name:'forensic_experts',
    description:'Romanian justice registries: forensic experts (judicial, technical) and authorized translators, filtered by county, searchable.',
    inputSchema:{type:'object',properties:{kind:{type:'string',enum:['experti-judiciari','experti-tehnici','traducatori'],description:'Which registry to read'},locality:{type:'string',description:'Locality — anchors the geographic context the registry requires'},judet:{type:'string',description:'County (judet) filter, e.g. "Bihor"'},q:{type:'string',description:'Free-text filter'},page:{type:'number',description:'Zero-based result page'}},required:['kind','locality']},
    build:args=>({path:'/api/experts',query:query([['kind',pick(['experti-judiciari','experti-tehnici','traducatori'],args.kind)],['locality',str(args.locality)],['judet',str(args.judet)],['q',str(args.q)],['page',num(args.page)],['geoScope','context'],['county',str(args.judet)]])}),
  },
  {
    name:'notaries_registry',
    description:'Romanian notaries public registry by chamber, searchable.',
    inputSchema:{type:'object',properties:{chamber:{type:'string',description:'Chamber (e.g. county name)'},q:{type:'string',description:'Free-text filter'},page:{type:'number',description:'Zero-based result page'}},required:['q']},
    build:args=>({path:'/api/notaries',query:query([['chamber',str(args.chamber)],['q',str(args.q)],['page',num(args.page)]])}),
  },
  {
    name:'anl_housing',
    description:'ANL (National Housing Agency) public housing registry by county.',
    inputSchema:{type:'object',properties:{county:{type:'string',description:'County name'},q:{type:'string',description:'Free-text filter'},page:{type:'number',description:'Zero-based result page'}},required:['q']},
    build:args=>({path:'/api/anl',query:query([['county',str(args.county)],['q',str(args.q)],['page',num(args.page)]])}),
  },
  {
    name:'ancpi_integrals',
    description:'ANCPI (Cadastre) published integral registry files, listed by kind and period — the honest integral downloads.',
    inputSchema:{type:'object',properties:{}},
    build:()=>({path:'/api/ancpi',query:{}}),
  },
  {
    name:'film_detail',
    description:'The full Wikidata sheet of a Romanian film by Q-id: directors, cast, genres, runtime, release dates with all labeled claims plus Commons media with credit and license. Use federated_search with kind filme to discover Q-ids.',
    inputSchema:{type:'object',properties:{id:{type:'string',description:'Wikidata Q-id of the film, e.g. "Q1084"'}},required:['id']},
    build:args=>({path:'/api/content',query:query([['kind','film'],['id',str(args.id)]])}),
  },
  {
    name:'article_read',
    description:'Read one official publication article in full text by URL (institutional sources: ANOFM, MAI, CNAS, MEC, MJ, energy ministry, TPBI, AFIR, Romanian Police). WordPress articles carry full text; others carry the summary the source publishes; attachments are listed. Only allowlisted institutional hosts are read.',
    inputSchema:{type:'object',properties:{url:{type:'string',description:'Article URL from a news_feed or federated_search result',maxLength:2000}},required:['url']},
    build:args=>({path:'/api/content',query:query([['url',str(args.url)]])}),
  },
  {
    name:'transport_network',
    description:'The scheduled Bucharest–Ilfov transit network (TPBI GTFS): lines and stops with search, paging and distance sorting around a point. Scheduled data, not live positions — the live layer is the transport_positions tool.',
    inputSchema:{type:'object',properties:{kind:{type:'string',enum:['routes','stops'],description:'Lines or stops'},q:{type:'string',description:'Free-text filter (line name, stop name)'},lat:{type:'number',description:'Latitude — sorts stops by distance'},lon:{type:'number',description:'Longitude — sorts stops by distance'},locality:{type:'string',description:'Locality inside the covered region, e.g. "București"'},county:{type:'string',description:'Covered region: Bucharest–Ilfov'},page:{type:'number',description:'Zero-based result page'}},required:['kind']},
    build:args=>({path:'/api/transport',query:query([['kind',pick(['routes','stops'],args.kind)],['q',str(args.q)],['lat',num(args.lat)],['lon',num(args.lon)],['locality',str(args.locality)],['county',str(args.county)],['geoScope','context'],['page',num(args.page)]])}),
  },
  {
    name:'law_search',
    description:'Search Romanian legislation (legislatie.just.ro) by title, words in text, act number or year — paginated results with official links.',
    inputSchema:{type:'object',properties:{title:{type:'string',description:'Words from the title (at most 160 characters)'},text:{type:'string',description:'Words from the text (at most 160 characters)'},number:{type:'string',description:'Act number, digits only (1–8 digits)'},year:{type:'string',description:'Publication year, 1800–2099'},page:{type:'number',description:'Zero-based result page, at most 500'}},required:[]},
    build:args=>({path:'/api/legal',method:'POST',body:{kind:'law',title:str(args.title),text:str(args.text),number:str(args.number),year:str(args.year),page:Number.isFinite(args.page)?args.page:0},query:{}}),
  },
  {
    name:'law_document',
    description:'One consolidated Romanian act, verified against the official portal: title, consolidation date and shape summary (bibliography and character count, not the full text — a full act can reach 1.4 MB and does not fit a conversation). Reading a document through this tool registers it on the tracked-acts re-verification feed of the platform — the same registration the web reader performs.',
    inputSchema:{type:'object',properties:{exactTitle:{type:'string',description:'Exact act title from a law_search result',maxLength:1200},id:{type:'string',description:'Document id from the search result, if known'},selectedType:{type:'string',description:'Document type label, if the search result offered alternatives'},selectedNumber:{type:'string',description:'Act number, if the search result offered alternatives'},selectedDate:{type:'string',description:'Act date, if the search result offered alternatives'}},required:['exactTitle']},
    build:args=>({path:'/api/legal',method:'POST',body:{kind:'law',full:true,summary:true,title:str(args.exactTitle).slice(0,160),exactTitle:str(args.exactTitle),id:str(args.id),selectedType:str(args.selectedType),selectedNumber:str(args.selectedNumber),selectedDate:str(args.selectedDate)},query:{}}),
  },
  {
    name:'cinema_sites',
    description:'The cinema locations of the operator (Cinema City Romania): id, name, city, address and coordinates for every site — the id feeds the cinema_program tool.',
    inputSchema:{type:'object',properties:{}},
    build:()=>({path:'/api/cinemas',query:{}}),
  },
  {
    name:'stories_list',
    description:'The public-domain literary works library (Wikisource RO): 233 works with id, title and category — the id feeds the story_read tool.',
    inputSchema:{type:'object',properties:{page:{type:'number',description:'Zero-based result page, 20 per page'}}},
    build:args=>({path:'/api/stories',query:query([['page',num(args.page)]])}),
  },
];
