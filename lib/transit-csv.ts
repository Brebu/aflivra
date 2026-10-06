import {Unzip,UnzipInflate} from 'fflate';
export const transitFiles=[['agency','Operatori'],['feed_info','Versiunea datelor'],['routes','Toate liniile'],['stops','Toate stațiile'],['trips','Toate cursele'],['stop_times','Toate opririle și orele'],['shapes','Toate traseele'],['calendar','Calendar'],['transfers','Transferuri'],['levels','Niveluri'],['pathways','Acces în stații'],['attributions','Autori și drepturi'],['fare_attributes','Tarife'],['fare_leg_rules','Reguli de tarifare'],['fare_media','Suporturi de călătorie'],['fare_products','Produse tarifare'],['fare_transfer_rules','Reguli de transfer'],['networks','Rețele'],['route_networks','Linii și rețele'],['translations','Traduceri']] as const;
/** Decompress only the selected CSV member; honor downstream backpressure. */
export function transitCsvStream(bytes:Uint8Array,name:string):ReadableStream<Uint8Array>{
 if(!transitFiles.some(([file])=>file+'.txt'===name))throw Error('Fișier de transport invalid.');
 let at=0,done=false,found=false,failed:Error|undefined,received=0,expected:number|undefined;
 let output:ReadableStreamDefaultController<Uint8Array>;
 const unzip=new Unzip(file=>{
  if(file.name!==name)return;found=true;expected=file.originalSize;
  file.ondata=(error,data,final)=>{
   if(error){failed=error;return}received+=data.length;if(data.length)output.enqueue(data);
   if(final){if(expected!==undefined&&received!==expected)failed=Error('Fișierul de transport este incomplet.');else{done=true;output.close()}}
  };file.start();
 });unzip.register(UnzipInflate);
 return new ReadableStream<Uint8Array>({
  start(controller){output=controller;controller.enqueue(new TextEncoder().encode('\uFEFF'))},
  pull(controller){
   try{while(!done&&!failed&&at<bytes.length&&(controller.desiredSize??1)>0){const end=Math.min(at+8192,bytes.length);unzip.push(bytes.subarray(at,end),end===bytes.length);at=end}
    if(failed)throw failed;if(!done&&at>=bytes.length)throw Error(found?'Fișierul de transport este incomplet.':'Fișierul nu este inclus în această ediție.');
   }catch(e){done=true;controller.error(e)}
  },cancel(){done=true}
 });
}
