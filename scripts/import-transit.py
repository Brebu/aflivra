#!/usr/bin/env python3
"""Export every TPBI GTFS route, trip, stop time and shape for on-site readers."""
import argparse, csv, datetime, hashlib, io, json, pathlib, shutil, tempfile, zipfile, collections

def main():
    p=argparse.ArgumentParser();p.add_argument('--zip',required=True);p.add_argument('--checks',required=True);p.add_argument('--output',default='public/transit');a=p.parse_args()
    source=pathlib.Path(a.zip);metadata=next(x for x in json.loads(pathlib.Path(a.checks).read_text()) if x['name']=='gtfs' and x.get('http')==200)
    archive=zipfile.ZipFile(source);source_fields={}
    def rows(name):
        if name not in archive.namelist():return iter(())
        stream=io.TextIOWrapper(archive.open(name),encoding='utf-8-sig',newline='');reader=csv.DictReader(stream);source_fields[name]=reader.fieldnames
        return reader
    stops={r['stop_id']:r for r in rows('stops.txt')};agencies={r['agency_id']:r for r in rows('agency.txt')};routes={r['route_id']:r for r in rows('routes.txt')}
    trips={r['trip_id']:r for r in rows('trips.txt')};times=collections.defaultdict(list);time_count=0
    reader=rows('stop_times.txt');time_fields=source_fields['stop_times.txt'];time_index={k:i for i,k in enumerate(time_fields)}
    for r in reader:
        if r['trip_id'] not in trips:raise RuntimeError('Unknown trip in stop_times')
        if r['stop_id'] not in stops:raise RuntimeError('Unknown stop in stop_times')
        times[r['trip_id']].append([r[k] for k in time_fields]);time_count+=1
    for r in times.values():r.sort(key=lambda x:int(x[time_index['stop_sequence']]))
    shapes=collections.defaultdict(list)
    for r in rows('shapes.txt'):shapes[r['shape_id']].append(r)
    for r in shapes.values():r.sort(key=lambda x:int(x['shape_pt_sequence']))
    extras={name:list(rows(name)) for name in archive.namelist() if name.endswith('.txt') and name not in ('stops.txt','routes.txt','trips.txt','stop_times.txt','shapes.txt')}
    if len(stops)<1000 or len(routes)<100 or len(trips)<10000 or time_count<100000:raise RuntimeError('Incomplete regional GTFS')
    output=pathlib.Path(a.output);stage=pathlib.Path(tempfile.mkdtemp(prefix='transit-',dir=output.parent));(stage/'routes').mkdir()
    def write(path,value):
        raw=json.dumps(value,ensure_ascii=False,separators=(',',':')).encode()
        if len(raw)>24_000_000:raise RuntimeError('Oversized route asset')
        path.write_bytes(raw);return {'bytes':len(raw),'sha256':hashlib.sha256(raw).hexdigest()}
    route_trips=collections.defaultdict(list)
    for t in trips.values():route_trips[t['route_id']].append(t)
    index=[];route_stats={};trip_lookup={}
    type_labels={'0':'Tramvai','1':'Metrou','2':'Tren','3':'Autobuz','11':'Troleibuz'}
    for rid,r in routes.items():
        selected=route_trips[rid];stop_ids={row[time_index['stop_id']] for t in selected for row in times[t['trip_id']]};shape_ids={t.get('shape_id') for t in selected if t.get('shape_id')};variant_groups=collections.defaultdict(list)
        for t in selected:
            key=(t.get('direction_id',''),t.get('trip_headsign',''),tuple(row[time_index['stop_id']] for row in times[t['trip_id']]))
            variant_groups[key].append(t['trip_id']);trip_lookup[t['trip_id']]=rid
        variants=[{'direction':direction,'headsign':headsign,'stopIds':list(sids),'tripIds':ids} for (direction,headsign,sids),ids in variant_groups.items()]
        key=hashlib.sha256(rid.encode()).hexdigest()[:24];path=f'routes/{key}.json'
        data={'route':r,'agency':agencies.get(r.get('agency_id'),{}),'stops':{i:stops[i] for i in stop_ids},'trips':selected,'stopTimeFields':time_fields,'stopTimes':{t['trip_id']:times[t['trip_id']] for t in selected},'shapes':{i:shapes[i] for i in shape_ids},'variants':variants,'calendar':extras.get('calendar.txt',[]),'calendarDates':extras.get('calendar_dates.txt',[]),'frequencies':extras.get('frequencies.txt',[])}
        route_stats[rid]={'file':path,**write(stage/path,data),'trips':len(selected),'stopTimes':sum(len(times[t['trip_id']]) for t in selected),'variants':len(variants)}
        index.append({'id':rid,'name':r.get('route_short_name') or r.get('route_long_name'),'longName':r.get('route_long_name'),'operator':agencies.get(r.get('agency_id'),{}).get('agency_name',''),'type':type_labels.get(r.get('route_type'),'Transport public'),'file':path,'tripCount':len(selected),'stopCount':len(stop_ids),'variants':len(variants),'details':r})
    stop_routes=collections.defaultdict(list)
    for r in index:
        for sid in {x[time_index['stop_id']] for t in route_trips[r['id']] for x in times[t['trip_id']]}:stop_routes[sid].append(r['id'])
    network_proof=write(stage/'network.json',{'routes':sorted(index,key=lambda x:x['name']),'stops':[{**r,'routes':stop_routes[sid]} for sid,r in stops.items()],'agencies':list(agencies.values()),'extras':extras,'sourceFields':source_fields})
    # Keep the exact original export, including every extension and all fields.
    shutil.copyfile(source,stage/'TPBI_GTFS.zip')
    manifest={'schema':'aflivra-transit-v1','source':'TPBI · București–Ilfov','sourceUrl':'https://gtfs.tpbi.ro/regional/','downloadUrl':metadata['url'],'fetchedAt':metadata['fetchedAt'],'publishedAt':metadata.get('modified'),'sha256':hashlib.sha256(source.read_bytes()).hexdigest(),'bytes':source.stat().st_size,'counts':{'routes':len(routes),'stops':len(stops),'trips':len(trips),'stopTimes':time_count,'shapes':len(shapes)},'network':network_proof,'routes':route_stats,'tripRoutes':trip_lookup,'termsUrl':'https://mo-bi.ro/node/17','note':'Orar planificat din exportul operatorului. Pozițiile, sosirile estimate și alertele se citesc separat din fluxurile GTFS Realtime. Nu se revând datele TPBI.'}
    write(stage/'manifest.json',manifest)
    if output.exists():shutil.rmtree(output)
    stage.rename(output);print(json.dumps(manifest['counts']),flush=True)

if __name__=='__main__':main()
