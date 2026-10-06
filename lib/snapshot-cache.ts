/** Budget serialized bytes as well as entry count; parsed JSON is substantially larger. */
export class SnapshotCache{
 private entries=new Map<string,{data:any;bytes:number}>();private bytes=0;
 constructor(private maxBytes=4000000,private maxEntries=8){}
 get(key:string){const value=this.entries.get(key);if(value){this.entries.delete(key);this.entries.set(key,value)}return value?.data}
 set(key:string,data:any,bytes:number){
  this.delete(key);if(bytes>this.maxBytes||bytes<0)return;
  this.entries.set(key,{data,bytes});this.bytes+=bytes;
  while(this.bytes>this.maxBytes||this.entries.size>this.maxEntries)this.delete(this.entries.keys().next().value!);
 }
 delete(key:string){const value=this.entries.get(key);if(value){this.bytes-=value.bytes;this.entries.delete(key)}}
 get size(){return this.entries.size}get retainedBytes(){return this.bytes}
}
