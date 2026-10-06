import expandedPlaces from '@/public/places/exploration.json';
export type Place={id:string;name:string;kind:string;city:string;region:string;tag:string;lat:number;lon:number;images:string[];summary:string;description:string;website:string;features:string[];interests:string[];sourceUrl?:string;recordId?:string;recordChunk?:string;cityApproximate?:boolean};
const originalPlaces:Place[]=[
  {
    "id": "peles",
    "name": "Castelul Peleș",
    "kind": "Castel & muzeu",
    "city": "Sinaia",
    "region": "Prahova",
    "tag": "O poveste regală",
    "lat": 45.359828,
    "lon": 25.54302,
    "images": [
      "peles-main",
      "peles-detail"
    ],
    "summary": "Arhitectură, istorie și liniștea pădurii, în inima Carpaților.",
    "description": "Reședință regală din Sinaia, Castelul Peleș aduce împreună arhitectura și artele decorative. Explorează imaginile, pune locul în colecția ta și consultă muzeul pentru condițiile actuale de vizitare.",
    "website": "https://peles.ro/",
    "features": [
      "Patrimoniu",
      "Arhitectură",
      "Muzeu",
      "Peisaj montan"
    ],
    "interests": [
      "cultura",
      "natura"
    ]
  },
  {
    "id": "bran",
    "name": "Castelul Bran",
    "kind": "Castel & muzeu",
    "city": "Bran",
    "region": "Brașov",
    "tag": "Dincolo de legendă",
    "lat": 45.51502,
    "lon": 25.36726,
    "images": [
      "bran-main",
      "bran-detail"
    ],
    "summary": "Un castel pe stâncă, povești și priveliști spre Țara Bârsei.",
    "description": "Castelul Bran este un reper al peisajului cultural din zona Bran. Pagina leagă galeria de fotografii, localizarea, sursa oficială și un plan personal de vizită.",
    "website": "https://bran-castle.com/",
    "features": [
      "Patrimoniu",
      "Muzeu",
      "Arhitectură",
      "Panoramă"
    ],
    "interests": [
      "cultura",
      "natura"
    ]
  },
  {
    "id": "turda",
    "name": "Salina Turda",
    "kind": "Experiență subterană",
    "city": "Turda",
    "region": "Cluj",
    "tag": "O altă lume, sub pământ",
    "lat": 46.588833,
    "lon": 23.787632,
    "images": [
      "turda-main",
      "turda-detail"
    ],
    "summary": "Un peisaj subteran spectaculos, construit în jurul istoriei sării.",
    "description": "Salina Turda transformă o fostă exploatare de sare într-un spațiu de vizitare. Fotografiile prezintă spațiile reale; activitățile disponibile și condițiile de acces se verifică pe site-ul administratorului.",
    "website": "https://www.salinaturda.eu/",
    "features": [
      "Patrimoniu industrial",
      "Geologie",
      "Fotografie",
      "Interior"
    ],
    "interests": [
      "cultura",
      "natura"
    ]
  },
  {
    "id": "delta",
    "name": "Delta Dunării",
    "kind": "Natură & biodiversitate",
    "city": "Tulcea",
    "region": "Tulcea",
    "tag": "În ritmul naturii",
    "lat": 45.08333,
    "lon": 29.5,
    "images": [
      "delta-main",
      "delta-detail"
    ],
    "summary": "Canale, păsări și apă cât vezi cu ochii. Un loc de explorat cu grijă.",
    "description": "Delta Dunării este un peisaj de ape și zone umede. Poziția de pe hartă este un reper al regiunii, nu un punct de îmbarcare. Permisele și regulile de acces se verifică la Administrația Rezervației.",
    "website": "https://ddbra.ro/",
    "features": [
      "Biodiversitate",
      "Peisaj",
      "Zone umede",
      "Observarea păsărilor"
    ],
    "interests": [
      "natura",
      "mediu"
    ]
  },
  {
    "id": "ateneu",
    "name": "Ateneul Român",
    "kind": "Cultură & arhitectură",
    "city": "București",
    "region": "București",
    "tag": "Orașul care se ascultă",
    "lat": 44.4413,
    "lon": 26.0972,
    "images": [
      "ateneu-main"
    ],
    "summary": "Un reper cultural în centrul Bucureștiului.",
    "description": "Ateneul Român este asociat vieții muzicale a capitalei și Filarmonicii George Enescu. Consultă programul instituției pentru evenimente și acces; platforma nu vinde bilete.",
    "website": "https://www.fge.org.ro/",
    "features": [
      "Muzică",
      "Arhitectură",
      "Cultură",
      "Urban"
    ],
    "interests": [
      "cultura",
      "local"
    ]
  },
  {
    "id": "brasov",
    "name": "Piața Sfatului",
    "kind": "Spațiu urban & patrimoniu",
    "city": "Brașov",
    "region": "Brașov",
    "tag": "La pas, prin Brașov",
    "lat": 45.642,
    "lon": 25.589,
    "images": [
      "brasov-main"
    ],
    "summary": "Un punct de plecare pentru descoperirea centrului istoric.",
    "description": "Piața Sfatului se află în centrul istoric al Brașovului. Folosește pagina ca punct de pornire pentru o colecție personală de locuri și o explorare a informațiilor despre oraș.",
    "website": "https://www.brasovcity.ro/",
    "features": [
      "Spațiu public",
      "Patrimoniu",
      "Urban",
      "Fotografie"
    ],
    "interests": [
      "cultura",
      "local"
    ]
  }
];
export const places:Place[]=[...originalPlaces,...expandedPlaces];
export const domains=[
  {
    "id": "local",
    "name": "Orașul tău",
    "short": "Localitate",
    "icon": "MapPin",
    "accent": "#526278",
    "items": [
      "populatie",
      "buget",
      "servicii",
      "harta"
    ],
    "source": "SIRUTA / INS / administrații locale",
    "intro": "Servicii, adrese, contacte, vreme și transport în jurul localității tale."
  },
  {
    "id": "vreme",
    "name": "Vreme și prognoză",
    "short": "Vreme",
    "icon": "CloudSun",
    "accent": "#0877ed",
    "items": [
      "acum",
      "ore",
      "zile",
      "avertizari"
    ],
    "source": "ANM / Open-Meteo",
    "intro": "Temperatură, ploaie, vânt, umiditate, prognoză detaliată și avertizări."
  },
  {
    "id": "bani",
    "name": "Bani & economie",
    "short": "Economie",
    "icon": "Coins",
    "accent": "#b77b28",
    "items": [
      "curs",
      "serii",
      "convertor",
      "surse"
    ],
    "source": "Banca Națională a României",
    "intro": "Ultima publicație BNR, convertor și evoluția cursurilor."
  },
  {
    "id": "firme",
    "name": "Firme, pe înțeles",
    "short": "Firme",
    "icon": "Building2",
    "accent": "#677ca4",
    "items": [
      "identitate",
      "bilant",
      "trend",
      "comparatie"
    ],
    "source": "ANAF",
    "intro": "Verifică un CUI, identitatea fiscală și ultimele raportări ANAF."
  },
  {
    "id": "mediu",
    "name": "Natură și mediu",
    "short": "Mediu",
    "icon": "Leaf",
    "accent": "#556a87",
    "items": [
      "meteo",
      "calitate-aer",
      "harta",
      "serii"
    ],
    "source": "ANM / data.gov.ro",
    "intro": "Parcuri, grădini, peșteri, vârfuri și informații publice despre mediu."
  },
  {
    "id": "transport",
    "name": "În mișcare",
    "short": "Transport",
    "icon": "TrainFront",
    "accent": "#4b8196",
    "items": [
      "rute",
      "statii",
      "orar",
      "accesibilitate"
    ],
    "source": "Operatori locali / date de infrastructură",
    "intro": "Stații și linii de transport, surse de orare și informații de călătorie."
  },
  {
    "id": "sanatate",
    "name": "Sănătate aproape",
    "short": "Sănătate",
    "icon": "HeartPulse",
    "accent": "#b86c77",
    "items": [
      "institutie",
      "specialitati",
      "contact",
      "program"
    ],
    "source": "Ministerul Sănătății / CNAS",
    "intro": "Spitale, clinici, cabinete și farmacii, cu adrese, contacte și date publicate."
  },
  {
    "id": "educatie",
    "name": "Educație & viitor",
    "short": "Educație",
    "icon": "GraduationCap",
    "accent": "#8873a3",
    "items": [
      "scoala",
      "oferta",
      "rezultate",
      "dotari"
    ],
    "source": "Ministerul Educației / data.gov.ro",
    "intro": "Caută școli după localitate și urmărește informațiile Ministerului Educației."
  },
  {
    "id": "cultura",
    "name": "Cultură și turism",
    "short": "Cultură",
    "icon": "Landmark",
    "accent": "#b58b52",
    "items": [
      "obiective",
      "galerii",
      "evenimente",
      "trasee"
    ],
    "source": "Instituții culturale / Wikimedia Commons",
    "intro": "Muzee, teatre, obiective turistice, spectacole, imagini și informații de vizitare."
  },
  {
    "id": "munca",
    "name": "Muncă & oportunități",
    "short": "Muncă",
    "icon": "BriefcaseBusiness",
    "accent": "#588da0",
    "items": [
      "ocupatii",
      "oferte",
      "tendinte",
      "competente"
    ],
    "source": "ANOFM / INS",
    "intro": "Anunțuri ANOFM și acces la căutarea oficială a locurilor de muncă."
  },
  {
    "id": "justitie",
    "name": "Lege & administrație",
    "short": "Justiție",
    "icon": "Scale",
    "accent": "#7c8192",
    "items": [
      "document",
      "versiuni",
      "cronologie",
      "institutii"
    ],
    "source": "Portal instanțe / Portal legislativ",
    "intro": "Informații oficiale și acces la dosare, legislație și servicii publice."
  },
  {
    "id": "energie",
    "name": "Energie & consum",
    "short": "Energie",
    "icon": "Zap",
    "accent": "#aa792e",
    "items": [
      "oferta",
      "consum",
      "cost-total",
      "comparatie"
    ],
    "source": "ANRE / POSF / Transelectrica",
    "intro": "Calculează costul consumului și consultă informații oficiale despre energie."
  },
  {
    "id": "agricultura",
    "name": "Pământ & agricultură",
    "short": "Agricultură",
    "icon": "Sprout",
    "accent": "#466085",
    "items": [
      "parcela",
      "categorie-teren",
      "culturi",
      "finantari"
    ],
    "source": "APIA / AFIR / data.gov.ro",
    "intro": "Anunțuri AFIR, finanțări și informații pentru fermieri."
  },
  {
    "id": "filme",
    "name": "Filme și cinematografe",
    "short": "Filme",
    "icon": "Film",
    "accent": "#85619b",
    "items": [
      "film",
      "distributie",
      "galerie",
      "unde-vezi"
    ],
    "source": "Wikidata / catalog licențiat separat",
    "intro": "Program de cinema, postere, trailere și catalogul cinematografiei românești."
  },
  {
    "id": "povesti",
    "name": "Povești și lectură",
    "short": "Povești",
    "icon": "BookOpen",
    "accent": "#0877ed",
    "items": [
      "basme",
      "povesti",
      "legende",
      "autori"
    ],
    "source": "Wikisource",
    "intro": "Povești, basme și legende de citit integral, cu autori și căutare în text."
  },
  {
    "id": "stiri",
    "name": "Știri & actualitate",
    "short": "Știri",
    "icon": "Newspaper",
    "accent": "#5d7898",
    "items": [
      "articol",
      "sursa",
      "cronologie",
      "subiect"
    ],
    "source": "Comunicate oficiale / publicații autorizate",
    "intro": "Informații și anunțuri recente publicate de instituții."
  }
];
export const cityPositions=[{"id":"bucuresti","name":"București","lat":44.4268,"lon":26.1025,"station":"BUCURESTI FILARET"},{"id":"cluj","name":"Cluj-Napoca","lat":46.7712,"lon":23.6236,"station":"CLUJ-NAPOCA"},{"id":"brasov","name":"Brașov","lat":45.6579,"lon":25.6012,"station":"BRASOV GHIMBAV"},{"id":"iasi","name":"Iași","lat":47.1585,"lon":27.6014,"station":"IASI"},{"id":"timisoara","name":"Timișoara","lat":45.7489,"lon":21.2087,"station":"TIMISOARA"},{"id":"constanta","name":"Constanța","lat":44.1598,"lon":28.6348,"station":"CONSTANTA"},{"id":"sibiu","name":"Sibiu","lat":45.7983,"lon":24.1256,"station":"SIBIU"}];
export const norm=(s:string)=>s.normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase();
const numberFormats=new Map<number,Intl.NumberFormat>();
export const format=(n:number,d=0)=>{let formatter=numberFormats.get(d);if(!formatter){formatter=new Intl.NumberFormat('ro-RO',{maximumFractionDigits:d});numberFormats.set(d,formatter)}return formatter.format(n)};
