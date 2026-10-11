import {mkdtemp,writeFile,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {migrate} from './db-migrate.mjs';

// The dev server shares the guarded migration path, including tables and indexes
// added after its local database was first created.
const temp=await mkdtemp(join(tmpdir(),'aflivra-dev-schema-'));
try{
 const config=join(temp,'wrangler.json');
 await writeFile(config,JSON.stringify({name:'aflivra-dev-schema',compatibility_date:'2026-05-15',d1_databases:[{binding:'DB',database_name:'site-creator-d1',database_id:'00000000-0000-4000-8000-000000000000'}]}));
 migrate(['d1','execute','site-creator-d1','--config',config,'--local','--persist-to','.wrangler/state'],'local dev D1');
}finally{await rm(temp,{recursive:true,force:true})}
