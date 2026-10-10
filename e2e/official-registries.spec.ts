import {test, expect} from '@playwright/test';

// Registrele oficiale (U01): fiecare tool MCP „surse românești" are și o suprafață UI
// pe aceeași rută publică — workspace-ul „Registre oficiale". Smoke-ul nu parchează
// răspunsurile live (porțile de integrare au rutele acoperite prin stub-uri
// complete); aici se probează că suprafața există, se navighează pe tab-uri, că
// panoul de turism cheamă ruta publică pe corpus comis, iar SEN afișează ori
// observația, ori degradarea ei onestă — niciodată minciună.

test.describe('Registre oficiale workspace', () => {
  test('vederea deschide workspace-ul cu toate panourile', async ({page}) => {
    await page.goto('/#view=registre');
    await expect(page.getByRole('heading', {name: /Registre publice, la îndemână/i})).toBeVisible();
    for (const tab of ['Turism', 'Clădiri seismice', 'Cutremure', 'Monumente', 'Statistici INS', 'Energie']) {
      await expect(page.getByRole('tab', {name: new RegExp(tab, 'i')}), 'tab-ul „' + tab + '" există').toBeVisible();
    }
  });

  test('panoul de turism cere registrul prin ruta publică', async ({page}) => {
    const tourism = page.waitForResponse(response => response.url().includes('/api/tourism') && response.status() === 200, {timeout: 20000});
    await page.goto('/#view=registre');
    await tourism;
    await expect(page.getByText(/înregistrări în selecție/i).first()).toBeVisible({timeout: 10000});
    await expect(page.getByRole('table').first()).toBeVisible();
  });

  test('panoul seismic nu întreabă ruta fără adresă, ca la MCP', async ({page}) => {
    let asked = 0;
    page.on('request', request => {if (request.url().includes('/api/seismic')) asked++;});
    await page.goto('/#view=registre');
    await page.getByRole('tab', {name: /clădiri seismice/i}).click();
    const section = page.getByLabel('Încadrarea seismică a clădirilor din București');
    await expect(section).toBeVisible();
    await expect(section.getByRole('status')).toHaveCount(0);
    expect(asked, 'adresa vidă nu declanșează apelul — q obligatoriu, ca în contractul MCP').toBe(0);
  });

  test('panoul de energie arată SEN: observație ori degradare onestă', async ({page}) => {
    await page.goto('/#view=registre');
    await page.getByRole('tab', {name: /energie/i}).click();
    await expect(page.getByRole('heading', {name: /sistemul energetic național, acum/i})).toBeVisible();
    // observația live sau eroarea sursă cu reîncercare — niciodată valori inventate
    await expect(page.getByText(/MW producție|Reîncearcă/).first()).toBeVisible({timeout: 25000});
    const powers = await page.getByText(/MW (producție|consum|sold de schimb)/).count();
    if (powers > 0) await expect(page.getByText(/fusul declarat ca presupunere/i).first()).toBeVisible();
  });
});
