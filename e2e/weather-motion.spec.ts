import {test, expect, type Page} from '@playwright/test';

// The ambient animation contract per rendered condition class from app/workspaces.css:
// what animates is keyed off the scene's own weather class, not a fixed state, so the
// legs read the class the live forecast produced and expect that class's keyframes.
const ambientContract: Record<string, {ambient: string[]; before: string[]; after: string[]}> = {
  rain: {ambient: [], before: ['aflivra-weather-rain-far'], after: ['aflivra-weather-rain-near']},
  snow: {ambient: [], before: ['aflivra-weather-snow-far'], after: ['aflivra-weather-snow-near']},
  sunny: {ambient: ['aflivra-weather-glow'], before: [], after: []},
  night: {ambient: [], before: ['aflivra-weather-night-drift', 'aflivra-weather-twinkle'], after: ['aflivra-weather-night-drift', 'aflivra-weather-twinkle']},
  cloudy: {ambient: [], before: ['aflivra-weather-drift-far'], after: ['aflivra-weather-drift-near']},
};
const animationNames = (value: string | null): string[] => value && value !== 'none' ? value.split(',').map(name => name.trim()).filter(Boolean).sort() : [];

function collectPageErrors(page: Page): string[] {
  const errors: string[] = [];
  page.on('pageerror', error => errors.push(String(error)));
  return errors;
}

async function openWeatherScene(page: Page) {
  await page.goto('/#view=domain&id=vreme');
  await expect(page.locator('.domain-hero h1')).toHaveText('Vreme și prognoză');
  await expect(page.locator('.weather-scene')).toBeVisible();
  // The scene renders its live values before motion is judged on it.
  await expect(page.locator('.weather-metric-grid article').first()).toBeVisible();
}

// Computed motion of every tracked scene element: the ambient span and its pseudo
// layers, the sky image, and the two icon populations.
async function readSceneMotion(page: Page) {
  return page.evaluate(() => {
    const scene = document.querySelector('.weather-scene');
    const ambient = scene?.querySelector('.weather-ambient') || null;
    const read = (element: Element | null, pseudo?: string) => element ? getComputedStyle(element, pseudo).animationName : null;
    return {
      condition: (scene?.className.match(/weather-scene-(rain|snow|sunny|night|cloudy)/) || [])[1] || '',
      ambient: read(ambient),
      before: read(ambient, '::before'),
      after: read(ambient, '::after'),
      img: read(scene?.querySelector('img') || null),
      metricIcon: read(document.querySelector('.weather-scene-metrics span svg')),
      gridIcon: read(document.querySelector('.weather-metric-grid article svg')),
    };
  });
}

test.describe('Weather scene motion', () => {
  test('with motion on, the ambient layers animate per the rendered condition', async ({page}) => {
    const pageErrors = collectPageErrors(page);
    await openWeatherScene(page);
    const state = await readSceneMotion(page);
    expect(['rain', 'snow', 'sunny', 'night', 'cloudy']).toContain(state.condition);
    const expected = ambientContract[state.condition];
    expect(animationNames(state.ambient)).toEqual(expected.ambient);
    expect(animationNames(state.before)).toEqual(expected.before);
    expect(animationNames(state.after)).toEqual(expected.after);
    expect(state.img).toBe('aflivra-weather-sky');
    expect(state.metricIcon).toBe('aflivra-weather-icon');
    expect(state.gridIcon).toBe('aflivra-weather-icon');
    expect(pageErrors, `uncaught page errors: ${pageErrors.join(' | ')}`).toEqual([]);
  });

  test('with prefers-reduced-motion emulated, every ambient animation computes to none', async ({page}) => {
    const pageErrors = collectPageErrors(page);
    await page.emulateMedia({reducedMotion: 'reduce'});
    await openWeatherScene(page);
    const state = await readSceneMotion(page);
    expect(['rain', 'snow', 'sunny', 'night', 'cloudy']).toContain(state.condition);
    // The scene and its ambient layers stay rendered as a static texture — nothing animates.
    expect(state.ambient).toBe('none');
    expect(state.before).toBe('none');
    expect(state.after).toBe('none');
    expect(state.img).toBe('none');
    expect(state.metricIcon).toBe('none');
    expect(state.gridIcon).toBe('none');
    expect(await page.locator('.weather-ambient').count()).toBe(1);
    expect(pageErrors, `uncaught page errors: ${pageErrors.join(' | ')}`).toEqual([]);
  });

  test('the forecast stays fully readable under prefers-reduced-motion', async ({page}) => {
    const pageErrors = collectPageErrors(page);
    await page.emulateMedia({reducedMotion: 'reduce'});
    await openWeatherScene(page);
    await expect(page.locator('.weather-scene .kicker').first()).toBeVisible();
    await expect(page.locator('.weather-scene h2')).not.toBeEmpty();
    await expect(page.locator('.weather-scene-temperature')).toContainText('°C');
    const chips = page.locator('.weather-scene-metrics > span');
    await expect(chips).toHaveCount(3);
    for (let index = 0; index < 3; index++) {
      await expect(chips.nth(index)).not.toBeEmpty();
    }
    // The current-conditions grid renders readable text in every cell.
    const gridCells = page.locator('.weather-metric-grid article');
    expect(await gridCells.count()).toBeGreaterThanOrEqual(12);
    const readable = await gridCells.evaluateAll(cells => cells.every(cell => (cell.textContent || '').trim().length > 0));
    expect(readable).toBe(true);
    // The forecast table renders its rows with the same readability.
    const rows = page.locator('.weather-workspace table tbody tr');
    await expect(rows.first()).toBeVisible();
    const forecastReadable = await rows.evaluateAll(rowList => rowList.every(row => (row.textContent || '').trim().length > 0));
    expect(forecastReadable).toBe(true);
    await expect(page.getByRole('button', {name: 'Pe zile', exact: true})).toBeVisible();
    await expect(page.getByRole('button', {name: 'Pe ore', exact: true})).toBeVisible();
    expect(pageErrors, `uncaught page errors: ${pageErrors.join(' | ')}`).toEqual([]);
  });
});
