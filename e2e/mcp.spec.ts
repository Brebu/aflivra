import {expect,test} from '@playwright/test';

// MCP end to end: the protocol layer is pinned offline (scripts/verify-mcp.mjs);
// this leg proves the real wiring — the /api/mcp route against the actual route
// modules on the dev server, with seed-backed tools plus the honest error path.
// Network-bound tools are not called here: their sources carry their own
// fault-matrix families.

test.describe('MCP endpoint', () => {
  test('initialize → notifications → tools/list → seeded tools/call, honestly', async ({request}) => {
    const endpoint='/api/mcp';

    const init=await request.post(endpoint,{data:{jsonrpc:'2.0',id:1,method:'initialize',params:{protocolVersion:'2025-06-18',capabilities:{},clientInfo:{name:'e2e',version:'0'}}}});
    expect(init.status()).toBe(200);
    const initialized=await init.json();
    expect(initialized.result.protocolVersion).toBe('2025-06-18');
    expect(initialized.result.serverInfo.name).toBe('aflivra');
    expect(initialized.result.serverInfo.websiteUrl).toBe('https://aflivra.brebu.workers.dev/');

    const notification=await request.post(endpoint,{data:{jsonrpc:'2.0',method:'notifications/initialized'}});
    expect(notification.status()).toBe(202);

    const list=await request.post(endpoint,{data:{jsonrpc:'2.0',id:2,method:'tools/list'}});
    expect(list.status()).toBe(200);
    const tools=(await list.json()).result.tools as Array<{name:string}>;
    expect(tools.length).toBeGreaterThanOrEqual(27);
    const names=tools.map(tool=>tool.name);
    for (const expected of ['search_companies','company_profile','localities_search','dataset_table','court_dosar_search','ancpi_integrals'])expect(names).toContain(expected);

    // Seeded tool call: the SIRUTA locality registry serves offline data.
    const localities=await request.post(endpoint,{data:{jsonrpc:'2.0',id:3,method:'tools/call',params:{name:'localities_search',arguments:{q:'Câmpulung'}}}});
    expect(localities.status()).toBe(200);
    const localitiesBody=await localities.json();
    expect(localitiesBody.result.isError).toBe(false);
    expect(localitiesBody.result.structuredContent.data.items.length).toBeGreaterThan(0);

    // The honest route error surfaces as isError with the route's own message.
    const badWeather=await request.post(endpoint,{data:{jsonrpc:'2.0',id:4,method:'tools/call',params:{name:'weather_forecast',arguments:{lat:999,lon:26}}}});
    expect(badWeather.status()).toBe(200);
    const badWeatherBody=await badWeather.json();
    expect(badWeatherBody.result.isError).toBe(true);
    expect(JSON.stringify(badWeatherBody.result.content)).toContain('coordonate');

    // Boundary validation: unknown tool → JSON-RPC -32602.
    const unknownTool=await request.post(endpoint,{data:{jsonrpc:'2.0',id:5,method:'tools/call',params:{name:'not_a_tool',arguments:{}}}});
    expect(unknownTool.status()).toBe(200);
    expect((await unknownTool.json()).error.code).toBe(-32602);

    // Parse error and GET rejection stay protocol-honest at the transport layer.
    const parseError=await request.post(endpoint,{data:'not json',headers:{'content-type':'application/json'}});
    expect(parseError.status()).toBe(400);
    const get=await request.get(endpoint);
    expect(get.status()).toBe(405);
  });
});
