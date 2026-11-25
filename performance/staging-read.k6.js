import http from 'k6/http';
import {sleep} from 'k6';
import {Rate} from 'k6/metrics';
const base=__ENV.STAGING_BASE_URL||'';
if(__ENV.CONFIRM_STAGING!=='yes'||__ENV.STAGING_APPROVED_ORIGIN!==base||!/^https:\/\/[a-z0-9.-]+(?::443)?$/i.test(base)||!/(?:^|[.-])staging(?:[.-]|$)/i.test(base.slice(8)))throw Error('Explicitly approved HTTPS staging origin with staging in host required');
const vus=Number(__ENV.VUS||10);
if(![10,50,100,250,500,1000].includes(vus))throw Error('Unsupported load level');
const errors=new Rate('staging_business_errors');
export const options={vus,duration:'30s',gracefulStop:'5s',discardResponseBodies:false,summaryTrendStats:['avg','p(95)','p(99)','max'],thresholds:{http_req_failed:[{threshold:'rate<0.001',abortOnFail:true,delayAbortEval:'5s'}],staging_business_errors:[{threshold:'rate<0.001',abortOnFail:true,delayAbortEval:'5s'}],http_req_duration:[{threshold:'p(95)<500',abortOnFail:true,delayAbortEval:'10s'}]}};
export function setup(){for(const path of ['/api/health/live','/api/health/ready']){const r=http.get(base+path,{redirects:0,timeout:'10s'});if(r.status!==200)throw Error('Staging readiness failed');}}
export default function(){const paths=['/api/products?limit=12','/api/products/search?q=apple','/api/categories','/api/settings','/api/banners'];const path=paths[(__VU+__ITER)%paths.length];const r=http.get(base+path,{redirects:0,timeout:'5s',tags:{name:path.split('?')[0]}});let valid=false;try{valid=r.status===200&&r.json()!==null;}catch{}errors.add(!valid);sleep(1+(__VU%3)*0.5);}
