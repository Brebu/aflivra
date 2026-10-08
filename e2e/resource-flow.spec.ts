import {test, expect, type Page, type Route} from '@playwright/test';
import XLSX from 'xlsx';

// Bug 3 (XML tabular): the CKAN resource reader gains a table tier — the dominant
// repeatable row set flattens into the shared table UI (search/sort/pagination/export
// come verbatim from the existing machinery), non-tabular XML stays an honestly
// labeled document, and published format variants ('XML.') load through the same tier.
// The stubs mirror /api/resource's paged state shape (resourcePage + navigation) and
// /api/resource-file's export headers (X-Aflivra-Rows). Loader truth — the dominant-row
// detection, the XXE guard and the format normalization — is pinned by the
// resource/xml-table family of scripts/verify-source-errors.mjs.

const tableResourceId='5e9f1a2b-8c3d-4e57-9b6a-7d2c3f4a5b6c';
const documentResourceId='6f0a2b3c-9d4e-4f68-8c7b-8e3d4a5b6c7d';
const variantResourceId='7a1b3c4d-0e5f-4a79-9d8c-9f4e5b6c7d8e';

const now=()=>new Date().toISOString();
const columns=['@id','@tip','Furnizor','CUI','Localitate','Adresa.Strada','Adresa.Judet'];
// 120 rows: the first 42 carry Cluj references so the search filter has a real subset.
const allRows=Array.from({length:120},(_,index)=>{const n=index+1;return [String(n),n%2?'FARM':'SPITAL','Furnizor public de verificare '+n,String(10000+n),n<=42?'Cluj-Napoca':'București','Str. Verificării '+n,n<=42?'Cluj':'București']});
const documentText=['Anunț public de verificare','Primul paragraf de verificare.','Al doilea paragraf conține cuvântul de căutat.','Notă finală de verificare.'].join('\n');

const sourceState=(id:string,data:Record<string,unknown>)=>({
  key:'resource:'+id,name:'Resursă publică · data.gov.ro',url:'https://data.gov.ro/api/3/action/resource_show?id='+id,
  adapterVersion:'resource.complete-index.v6',status:'fresh',publishedAt:'2026-10-01T00:00:00',lastSuccessAt:now(),lastAttemptAt:now(),
  nextAttemptAt:null,error:null,ttlSeconds:86400,data,
});
// Mirrors selectResourceRows + paginate: term filter over the whole row, numeric-aware
// sort on the chosen column, 50 rows per page, and the navigation envelope of resourcePage.
function tableState(id:string,q:string,page:number,sort:number,desc:boolean){
  const terms=q.trim().toLowerCase().split(/\s+/).filter(Boolean);
  const found=allRows.filter(row=>!terms.length||terms.every(term=>row.join(' ').toLowerCase().includes(term)));
  if(sort>=0){
    const numeric=(v:unknown)=>{const s=String(v??'').trim();return s&&/^-?\d+(?:[.,]\d+)?$/.test(s)?Number(s):null};
    const collator=new Intl.Collator('ro',{numeric:true});
    found.sort((a,b)=>{const left=numeric(a[sort]),right=numeric(b[sort]);return (left!==null&&right!==null?left-right:collator.compare(String(a[sort]),String(b[sort])))*(desc?-1:1)});
  }
  const pages=Math.max(1,Math.ceil(found.length/50)),current=Math.min(Math.max(0,page),pages-1);
  return sourceState(id,{
    kind:'table',indexed:true,complete:true,title:'Contracte de verificare XML',
    sourceUrl:'https://data.gov.ro/dataset/contracte-verificare/resource/export-de-verificare.xml',
    snapshot:'stub-de-verificare',
    sheets:[{name:'Contract',columns,rows:found.slice(current*50,(current+1)*50),total:allRows.length,truncated:false}],
    navigation:{total:found.length,page:current,pages,pageSize:50,sheet:0,query:q,complete:true},
  });
}
const documentState=(id:string)=>sourceState(id,{kind:'text',text:documentText,format:'XML',textComplete:true,title:'Comunicatul public de verificare',sourceUrl:'https://data.gov.ro/dataset/comunicat-verificare/resource/comunicat-de-verificare.xml'});

function stubResourceFlow(page:Page,datasetId:string,resourceId:string,stateFor:(q:string,page:number,sort:number,desc:boolean)=>Record<string,unknown>){
  const dataset={
    id:datasetId,name:datasetId,title:'Setul de date de verificare',notes:'Descrierea publică a setului de verificare.',
    url:'https://data.gov.ro/dataset/set-de-verificare',license_title:'Date deschise',metadata_modified:'2026-10-01T00:00:00',
    organization:'Organizația publică de verificare',
    resources:[{id:resourceId,name:resourceId===documentResourceId?'Comunicatul public de verificare':'Contracte de verificare XML',format:resourceId===variantResourceId?'XML.':'XML',url:'https://data.gov.ro/dataset/set-de-verificare/resource/export-de-verificare.xml',last_modified:'2026-10-01T00:00:00'}],
  };
  void page.route(/\/catalog\/index\.json\.gz$/,route=>route.fulfill({status:200,contentType:'application/json',body:JSON.stringify({fetchedAt:'2026-10-08T00:00:00Z',sourceUrl:'https://data.gov.ro',items:[{
    id:datasetId,name:datasetId,title:'Setul de date de verificare',notes:'Descrierea publică a setului de verificare.',
    organization:'Organizația publică de verificare',modified:'2026-10-01T00:00:00.000Z',license:'Licență neprecizată',
    resourceCount:1,formats:[resourceId===variantResourceId?'XML.':'XML'],categories:[],inventoryOnly:true,
  }]})}));
  void page.route(new RegExp('/catalog/datasets/'+datasetId+'\\.json\\.gz$'),route=>route.fulfill({status:200,contentType:'application/json',body:JSON.stringify(dataset)}));
  // The recovery path revalidates through the catalog snapshot: the import stub answers
  // with the same page state the reader serves, so the recovery degrades to nothing.
  void page.route(/\/api\/resource-import/,route=>route.fulfill({status:200,contentType:'application/json',body:JSON.stringify(sourceState(resourceId,{kind:'text',text:'',format:'XML',textComplete:true,title:'',sourceUrl:''}))}));
  void page.route(/\/api\/resource\?id=/,route=>{
    const p=new URL(route.request().url()).searchParams;
    const state=stateFor(p.get('q')||'',Number(p.get('page')||0),Number(p.get('sort')??-1),p.get('desc')==='1');
    return route.fulfill({status:200,contentType:'application/json',body:JSON.stringify(state)});
  });
  return dataset;
}

async function waitForClientReady(page:Page){
  await expect.poll(()=>page.evaluate(()=>localStorage.getItem('reper.v2.preferences')!==null),{timeout:30_000}).toBe(true);
}
async function openDataset(page:Page){
  await page.goto('/');
  await waitForClientReady(page);
  const card=page.locator('.catalog-workspace .live-resource').first();
  await expect(card).toBeVisible({timeout:30_000});
  await card.getByRole('button',{name:'Explorează toate resursele'}).click();
  const dialog=page.locator('.dataset-dialog');
  await expect(dialog).toBeVisible();
  return dialog;
}

test.describe('XML resource reader',()=>{
  const collectPageErrors=(page:Page)=>{const errors:string[]=[];page.on('pageerror',error=>errors.push(String(error)));return errors};

  test('the XML table tier renders rows, search, sort and pagination through the shared table machinery',async({page})=>{
    const pageErrors=collectPageErrors(page);
    stubResourceFlow(page,'b7c1d8e9-2a34-4c56-9d8e-1f2a3b4c5d6e',tableResourceId,(q,pg,sort,desc)=>tableState(tableResourceId,q,pg,sort,desc));
    await openDataset(page);

    // The dataset dialog auto-selects its resource: the XML table tier, not a document.
    const explorer=page.locator('.table-explorer');
    await expect(explorer).toBeVisible();
    await expect(page.locator('.full-document')).toHaveCount(0);
    // The sheet carries the row element's name and the flattened columns' own names.
    await expect(page.getByRole('combobox',{name:'Foaia de date'})).toContainText('Contract');
    const headers=page.locator('.dataset-table-scroll thead th');
    await expect(headers).toHaveCount(columns.length);
    await expect(headers.first()).toContainText('@id');
    await expect(headers.nth(6)).toContainText('Adresa.Judet');
    await expect(explorer).toContainText('120 de rezultate');
    await expect(explorer).toContainText('120 de înregistrări în întregul set');

    // Fifty rows per page, ordered: the first page starts at the first row.
    const rows=page.locator('.dataset-table-scroll tbody tr');
    await expect(rows).toHaveCount(50);
    await expect(rows.first()).toContainText('Furnizor public de verificare 1');
    // Pagination walks the full set: page 2 starts at row 51.
    const pagination=page.locator('.table-explorer nav.live-pagination');
    await expect(pagination).toContainText('din 3');
    await pagination.getByRole('button',{name:'Vezi mai mult'}).click();
    await expect(pagination.getByLabel('Numărul paginii')).toHaveValue('2');
    await expect(rows.first()).toContainText('Furnizor public de verificare 51');

    // Search filters server-side through the same route: Cluj keeps 42 rows.
    const search=page.getByLabel('Caută în toate înregistrările');
    await search.fill('Cluj');
    await page.getByRole('button',{name:'Caută',exact:true}).click();
    await expect(explorer).toContainText('42 de rezultate');
    await expect(rows).toHaveCount(42);
    await expect(rows.first()).toContainText('Cluj-Napoca');
    await expect(page.getByRole('button',{name:'Elimină filtrul'})).toBeVisible();
    await page.getByRole('button',{name:'Elimină filtrul'}).click();
    await expect(explorer).toContainText('120 de rezultate');

    // Sort toggles the whole set: ascending keeps row 1 first, descending brings row 120.
    const furnizorHeader=page.locator('.dataset-table-scroll thead th').nth(2);
    await furnizorHeader.getByRole('button').click();
    await expect(furnizorHeader).toHaveAttribute('aria-sort','ascending');
    await expect(rows.first()).toContainText('Furnizor public de verificare 1');
    await furnizorHeader.getByRole('button').click();
    await expect(furnizorHeader).toHaveAttribute('aria-sort','descending');
    await expect(rows.first()).toContainText('Furnizor public de verificare 120');
    expect(pageErrors,`uncaught page errors: ${pageErrors.join(' | ')}`).toEqual([]);
  });

  test('non-tabular XML stays an honestly labeled document',async({page})=>{
    const pageErrors=collectPageErrors(page);
    stubResourceFlow(page,'c8d2e9f0-3b45-4d67-8e9f-2a3b4c5d6e7f',documentResourceId,()=>documentState(documentResourceId) as unknown as Record<string,unknown>);
    await openDataset(page);

    // No table is invented: the document tier renders the full text with its own search.
    const document=page.locator('.full-document');
    await expect(document).toBeVisible();
    await expect(page.locator('.table-explorer')).toHaveCount(0);
    await expect(document).toContainText('Caută în documentul XML');
    await expect(document.locator('pre')).toContainText('Primul paragraf de verificare.');
    await expect(document).toContainText('Descarcă documentul disponibil PDF');
    // The document's own filter narrows the rendered paragraphs without altering the text.
    await page.getByLabel('Caută în documentul XML').fill('al doilea');
    await expect(document.locator('pre')).toContainText('Al doilea paragraf conține cuvântul de căutat.');
    await expect(document.locator('pre')).not.toContainText('Primul paragraf de verificare.');
    expect(pageErrors,`uncaught page errors: ${pageErrors.join(' | ')}`).toEqual([]);
  });

  test('the XML table exports CSV and XLSX from the table tier',async({page})=>{
    const pageErrors=collectPageErrors(page);
    stubResourceFlow(page,'d9e3f0a1-4c56-4e78-9f0a-3b4c5d6e7f8a',tableResourceId,(q,pg,sort,desc)=>tableState(tableResourceId,q,pg,sort,desc));
    await openDataset(page);
    await expect(page.locator('.resource-download-actions')).toBeVisible();

    const exportRequests:string[]=[];
    await page.route(/\/api\/resource-file\?id=/,async(route:Route)=>{
      const p=new URL(route.request().url()).searchParams;
      exportRequests.push(p.get('format')||'');
      if(p.get('format')==='xlsx'){
        const workbook=XLSX.utils.book_new();
        XLSX.utils.book_append_sheet(workbook,XLSX.utils.aoa_to_sheet([columns,...allRows]),'Contract');
        const bytes=XLSX.write(workbook,{type:'buffer',bookType:'xlsx'}) as Buffer;
        return route.fulfill({status:200,headers:{
          'Content-Type':'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
          'Content-Disposition':'attachment; filename="contracte-de-verificare.xlsx"',
          'X-Aflivra-Rows':String(allRows.length),'X-Aflivra-Sheets':'1',
        },body:bytes});
      }
      const csv='\uFEFF'+[columns,...allRows].map(row=>row.map(value=>'"'+value.replaceAll('"','""')+'"').join(',')).join('\r\n')+'\r\n';
      return route.fulfill({status:200,headers:{
        'Content-Type':'text/csv; charset=utf-8',
        'Content-Disposition':'attachment; filename="contracte-de-verificare.csv"',
        'X-Aflivra-Rows':String(allRows.length),
      },body:csv});
    });

    // CSV first: the export asks the server for the whole verified sheet, not the page.
    const csv=page.locator('.resource-download-actions .export-actions');
    await csv.getByRole('button',{name:'Descarcă setul complet'}).click();
    const csvDownload=await page.waitForEvent('download',{timeout:60_000});
    expect(csvDownload.suggestedFilename()).toMatch(/\.csv$/);
    await expect(csv.locator('.export-ready')).toContainText('Salvează fișierul CSV');

    // XLSX through the same flow: the full set, all sheets, Excel format.
    await csv.getByLabel('Format pentru descarcă setul complet').selectOption('xlsx');
    await csv.getByRole('button',{name:'Descarcă setul complet'}).click();
    const xlsxDownload=await page.waitForEvent('download',{timeout:60_000});
    expect(xlsxDownload.suggestedFilename()).toMatch(/\.xlsx$/);
    await expect(csv.locator('.export-ready')).toContainText('Salvează fișierul Excel (.xlsx)');
    // Both exports asked the table tier with the sheet index — the pattern of the real route.
    expect(exportRequests).toEqual(['csv','xlsx']);
    expect(pageErrors,`uncaught page errors: ${pageErrors.join(' | ')}`).toEqual([]);
  });

  test('a resource published with the XML. format variant loads through the same table tier',async({page})=>{
    const pageErrors=collectPageErrors(page);
    stubResourceFlow(page,'e0f4a1b2-5d67-4f89-8a1b-4c5d6e7f8a9b',variantResourceId,(q,pg,sort,desc)=>tableState(variantResourceId,q,pg,sort,desc));
    await openDataset(page);

    // The resource button keeps the editor's published format label, variants included.
    await expect(page.locator('.dataset-resources button').first()).toContainText('XML.');
    // The variant loads the table tier like any XML resource: rows, sheet name, columns.
    const explorer=page.locator('.table-explorer');
    await expect(explorer).toBeVisible();
    await expect(page.getByRole('combobox',{name:'Foaia de date'})).toContainText('Contract');
    await expect(explorer).toContainText('120 de rezultate');
    await expect(page.locator('.dataset-table-scroll tbody tr')).toHaveCount(50);
    expect(pageErrors,`uncaught page errors: ${pageErrors.join(' | ')}`).toEqual([]);
  });
});
