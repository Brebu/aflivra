declare namespace Cloudflare {
  interface Env {
    ASSETS?: Fetcher;
    DB?: D1Database;
    BUCKET?: R2Bucket;
    REFRESH_TOKEN?: string;
    REFRESH_QUEUE?: Queue<{jobId:string}>;
    CORPORA_GITHUB_TOKEN?: string;
    TRANZY_API_KEY?: string;
    VAPID_PUBLIC?: string;
    VAPID_PRIVATE?: string;
  }
}
