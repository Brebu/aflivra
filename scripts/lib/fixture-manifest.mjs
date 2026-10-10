// Fixture-manifest validation for the offline import mode (N01): a local --input-dir run
// must first prove every file it is about to read matches the bytes and SHA-256 recorded
// in the evidence manifest of the verification package — an import born from an
// unverified file is not an import of verified data. Standard library only.
import {readFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {join} from 'node:path';

const sha256=bytes=>createHash('sha256').update(bytes).digest('hex');

export async function validateFixtureManifest({manifestPath,inputDir,names}){
 const manifest=JSON.parse(await readFile(manifestPath,'utf8'));
 if(!Array.isArray(manifest.files)||!manifest.files.length)throw Error('Manifestul '+manifestPath+' nu are intrări — fixture-urile nu pot fi validate înainte de import.');
 for(const name of names){
  const entry=manifest.files.find(item=>item.path===name||item.path.endsWith('/'+name));
  if(!entry)throw Error('Fixture-ul '+name+' nu figurează în manifestul '+manifestPath+' — importul offline refuză sursele neverificate.');
  const bytes=await readFile(join(inputDir,name));
  if(bytes.length!==entry.bytes)throw Error('Fixture-ul '+name+' are '+bytes.length+' bytes; manifestul așteaptă '+entry.bytes+'.');
  if(sha256(bytes)!==entry.sha256)throw Error('Fixture-ul '+name+' nu coincide cu amprenda SHA-256 din manifest — datele locale nu sunt cele verificate.');
 }
 return manifest;
}
