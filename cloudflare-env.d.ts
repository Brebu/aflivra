declare namespace Cloudflare {
  interface Env {
    ASSETS?: Fetcher;
    DB?: D1Database;
    BUCKET?: R2Bucket;
    REFRESH_TOKEN?: string;
    TRANZY_API_KEY?: string;
  }
}
