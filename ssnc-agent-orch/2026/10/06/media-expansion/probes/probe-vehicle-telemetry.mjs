// RED→GREEN probe — the vehicle telemetry labels the live map renders must come
// from the shipped lib/transit-view.ts helpers (Romanian cardinal from bearing,
// km/h from the GTFS m/s speed, occupancy labels from the GTFS enum names).
// RED before the map-heading change: the module exports none of these.
import fs from 'node:fs';
import path from 'node:path';
import {pathToFileURL} from 'node:url';
import ts from 'typescript';

const root = path.resolve(import.meta.dirname, '../../../../../../');
const source = fs.readFileSync(path.join(root, 'lib/transit-view.ts'), 'utf8');
const transpiled = ts.transpileModule(source, {
  compilerOptions: {target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.ES2022},
}).outputText;
const modulePath = path.join(root, '.next/probe-vehicle-telemetry.mjs');
fs.mkdirSync(path.dirname(modulePath), {recursive: true});
fs.writeFileSync(modulePath, transpiled);
const view = await import(pathToFileURL(modulePath));

let failures = 0;
const check = (actual, expected, label) => {
  if (actual !== expected) {
    failures++;
    console.error(`FAIL ${label}: expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`);
  }
};

// Bearing → Romanian 8-point cardinal. 0°=nord, clockwise; wraparound must fold
// into [0,360) before the nearest-of-8 rounding.
const cardinals = [0, 45, 90, 135, 180, 225, 270, 315];
const names = ['nord', 'nord-est', 'est', 'sud-est', 'sud', 'sud-vest', 'vest', 'nord-vest'];
for (let i = 0; i < cardinals.length; i++) {
  check(view.bearingText(cardinals[i]), 'spre ' + names[i], 'bearingText(' + cardinals[i] + ')');
}
check(view.bearingText(359), 'spre nord', 'bearingText(359) folds to nord');
check(view.bearingText(375), 'spre nord', 'bearingText(375) wraps to 15°, nearest nord');
check(view.bearingText(-90), 'spre vest', 'bearingText(-90) negative bearing');
check(view.bearingText(null), null, 'bearingText(null)');
check(view.bearingText(undefined), null, 'bearingText(undefined)');
check(view.bearingText(NaN), null, 'bearingText(NaN)');

// Speed comes from the feed in metres/second (GTFS position.speed) and is
// displayed in km/h with one decimal — the same format the transit record list
// already uses next to the map.
check(view.speedText(12.5), '45.0 km/h', 'speedText(12.5 m/s)');
check(view.speedText(0), '0.0 km/h', 'speedText(0)');
check(view.speedText(null), null, 'speedText(null)');
check(view.speedText(undefined), null, 'speedText(undefined)');
check(view.speedText(-3), null, 'speedText(-3) negative rejected');

// Occupancy: GTFS occupancy_status enum names, Romanian labels; the operator's
// percentage estimate is appended when present and inside 0–100.
check(view.occupancyText('FEW_SEATS_AVAILABLE', 45), 'Puține locuri libere · ocupare 45%', 'occupancyText FEW+45');
check(view.occupancyText('FEW_SEATS_AVAILABLE', 45.4), 'Puține locuri libere · ocupare 45%', 'occupancyText rounds the percentage');
check(view.occupancyText('MANY_SEATS_AVAILABLE', null), 'Multe locuri libere', 'occupancyText MANY, no percentage');
check(view.occupancyText('STANDING_ROOM_ONLY'), 'Doar în picioare', 'occupancyText STANDING');
check(view.occupancyText('CRUSHED_STANDING_ROOM_ONLY'), 'Aglomerat, doar în picioare', 'occupancyText CRUSHED');
check(view.occupancyText('FULL'), 'Plin', 'occupancyText FULL');
check(view.occupancyText('EMPTY'), 'Fără călători', 'occupancyText EMPTY');
check(view.occupancyText('NOT_ACCEPTING_PASSENGERS'), 'Nu mai urcă călători', 'occupancyText NOT_ACCEPTING');
check(view.occupancyText('NOT_BOARDABLE'), 'Fără îmbarcare', 'occupancyText NOT_BOARDABLE');
check(view.occupancyText('NO_DATA_AVAILABLE'), null, 'occupancyText NO_DATA stays silent');
check(view.occupancyText(null, 50), null, 'occupancyText(null status) silent');
check(view.occupancyText('UNKNOWN_ENUM'), null, 'occupancyText unknown enum silent');

console.log(`bearingText/speedText/occupancyText contracts: ${failures === 0 ? 'ALL PASS' : failures + ' FAILURES'}`);
process.exit(failures ? 1 : 0);
