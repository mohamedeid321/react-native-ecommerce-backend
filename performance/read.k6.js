import http from "k6/http";
import {check,sleep} from "k6";
import {Rate} from "k6/metrics";
import {SharedArray} from "k6/data";
const accounts=new SharedArray("accounts",()=>JSON.parse(open("./fixture.json")).accounts);
const errors=new Rate("business_errors");
const base="http://127.0.0.1:3000/api";
const target=Number(__ENV.VUS||10);
export const options={vus:target,duration:"15s",thresholds:{http_req_failed:[{threshold:"rate<0.01",abortOnFail:true,delayAbortEval:"5s"}],business_errors:["rate<0.01"],http_req_duration:["p(95)<500"]},discardResponseBodies:true};
export default function(){
 const account=accounts[(__VU-1)%accounts.length];
 const paths=["/products?limit=12","/products/search?q=apple&limit=10","/categories","/settings","/cart"];
 const path=paths[(__ITER+__VU)%paths.length];
 const params={tags:{route:path.split("?")[0]},headers:path==="/cart"?{Cookie:"lotta_access="+account.access}:{}};
 const r=http.get(base+path,params);
 errors.add(!check(r,{"status 200":r=>r.status===200}));
 sleep(0.5);
}
