// Manual triggers share one daily allowance across isolates and MCP/HTTP clients.
// This bounds update work; it is not a cap on the provider's total monthly bill.
export const refreshTriggerLimits={sources:20,corpora:4} as const;
export async function takeRefreshBudget(db:D1Database,kind:keyof typeof refreshTriggerLimits,now=Date.now()){
 const windowStart=Math.floor(now/86400000)*86400000,limit=refreshTriggerLimits[kind];
 const row=await db.prepare(`INSERT INTO source_budget (key,window_start,used) VALUES (?,?,1)
  ON CONFLICT(key) DO UPDATE SET window_start=excluded.window_start,
  used=CASE WHEN source_budget.window_start=excluded.window_start THEN source_budget.used+1 ELSE 1 END
  WHERE source_budget.window_start<>excluded.window_start OR source_budget.used<? RETURNING used`)
  .bind('operator-refresh:'+kind,windowStart,limit).first<{used:number}>();
 return {allowed:!!row,used:row?.used??limit,limit,retryAfterSeconds:Math.max(1,Math.ceil((windowStart+86400000-now)/1000))};
}
