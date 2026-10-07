export const topicGroups=[{id:'all',label:'Toate categoriile'},{id:'daily',label:'Viața de zi cu zi'},{id:'discover',label:'Descoperă'},{id:'business',label:'Bani și afaceri'},{id:'society',label:'Instituții și societate'}];
export const topicGroup:Record<string,string>={local:'daily',vreme:'daily',sanatate:'daily',transport:'daily',educatie:'daily',cultura:'discover',filme:'discover',povesti:'discover',mediu:'discover',bani:'business',firme:'business',munca:'business',energie:'business',agricultura:'business',justitie:'society',stiri:'society'};
export const topicSections:Record<string,{id:string;label:string}[]>={
 local:[{id:'places',label:'Servicii în apropiere'},{id:'weather',label:'Vreme locală'},{id:'transport',label:'Transport'},{id:'registry',label:'Registrul localităților'}],
 vreme:[{id:'weather',label:'Vreme și prognoză'}],
 sanatate:[{id:'places',label:'Unități și contacte'},{id:'health',label:'Furnizori CNAS'},{id:'pharmacies',label:'Farmacii CNAS'},{id:'hospitals',label:'Spitale CNAS'},{id:'news',label:'Anunțuri'}],
 educatie:[{id:'places',label:'Școli și servicii'},{id:'schools',label:'Rețeaua școlară'},{id:'news',label:'Anunțuri'}],
 transport:[{id:'network',label:'Linii, stații și orare'},{id:'vehicles',label:'Vehicule live'},{id:'arrivals',label:'Sosiri estimate'},{id:'alerts',label:'Alerte'},{id:'trains',label:'Mersul trenurilor'},{id:'places',label:'Gări și servicii'},{id:'news',label:'Anunțuri'}],
 cultura:[{id:'places',label:'Obiective și instituții'},{id:'events',label:'Spectacole'},{id:'selection',label:'Galerii de explorat'}],
 filme:[{id:'cinema',label:'Filme la cinema'},{id:'places',label:'Cinematografe'},{id:'films',label:'Film românesc'}],
 povesti:[{id:'stories',label:'Povești, basme și legende'}],
 bani:[{id:'currency',label:'Cursuri și conversii'},{id:'places',label:'Bănci și bancomate'}],
 firme:[{id:'companies',label:'Identitate și bilanțuri'},{id:'places',label:'Magazine și servicii'},{id:'compare',label:'Compară firme'}],
 munca:[{id:'news',label:'Oportunități și anunțuri'},{id:'places',label:'Ocupare și recrutare'}],
 justitie:[{id:'legal',label:'Legislație și dosare'},{id:'lawyers',label:'Avocați în tablou'},{id:'notari',label:'Notari publici'},{id:'experti',label:'Experți și traducători'},{id:'places',label:'Instituții și servicii'},{id:'news',label:'Comunicate'}],
 energie:[{id:'calculator',label:'Consumul tău'},{id:'places',label:'Încărcare și infrastructură'},{id:'news',label:'Anunțuri'}],
 agricultura:[{id:'news',label:'Finanțări și anunțuri'},{id:'places',label:'Piețe, ferme și servicii'}],
 mediu:[{id:'places',label:'Parcuri, natură și obiective'},{id:'weather',label:'Vreme și avertizări'}],
 stiri:[{id:'news',label:'Anunțuri din toate instituțiile'},{id:'places',label:'Redacții și media'}]
};
export const catalogTopic=(id:string)=>id==='vreme'?'mediu':id==='povesti'?'cultura':id;
