import {readSource} from '@/lib/live/cache';
import {bnrLoader,weatherLoader,catalogLoader} from '@/lib/live/adapters';
import {companyLoader} from '@/lib/live/company-registries';
export const dynamic='force-dynamic';
export async function GET(){const [bnr,weather,company,catalog]=await Promise.all([readSource(bnrLoader),readSource(weatherLoader),readSource(companyLoader()),readSource(catalogLoader())]);return Response.json({bnr,weather,company,catalog,servedAt:new Date().toISOString()},{headers:{'Cache-Control':'no-store'}})}
