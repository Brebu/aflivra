export type SourceState<T=any>={key:string;name:string;url:string;adapterVersion:string;status:'fresh'|'cached'|'stale'|'unavailable';data:T|null;publishedAt:string|null;lastSuccessAt:string|null;lastAttemptAt:string|null;nextAttemptAt:string|null;error:string|null;ttlSeconds:number;portalNextAttemptAt?:string|null};
export type Loaded<T=any>={data:T;publishedAt:string|null;warning?:string;retryAfterSeconds?:number};
export type Loader<T=any>={key:string;name:string;url:string;version:string;ttl:number;load:()=>Promise<Loaded<T>>};
export type LiveBundle={bnr:SourceState;weather:SourceState;company:SourceState;catalog:SourceState;servedAt:string};
