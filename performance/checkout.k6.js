import http from "k6/http";
import {check} from "k6";
import {Rate,Counter} from "k6/metrics";
import {SharedArray} from "k6/data";
const accounts=new SharedArray("checkout accounts",()=>JSON.parse(open("./fixture.json")).accounts.slice(0,60));
const invalid=new Rate("checkout_errors");
const accepted=new Counter("checkout_accepted");
const rejected=new Counter("checkout_stock_rejected");
const base="http://127.0.0.1:3000/api/orders";
http.setResponseCallback(http.expectedStatuses(200,201,409));
export const options={scenarios:{checkout:{executor:"per-vu-iterations",vus:60,iterations:1,maxDuration:"60s"}},thresholds:{http_req_failed:["rate==0"],checkout_errors:["rate==0"],checkout_accepted:["count==30"],checkout_stock_rejected:["count==30"],http_req_duration:["p(95)<2000"]}};
export default function(){
 const account=accounts[__VU-1];
 const params={headers:{"Content-Type":"application/json",Origin:"http://localhost:5173","X-Lotta-CSRF":"1",Cookie:"lotta_access="+account.access,"Idempotency-Key":"perf-checkout-"+account.id},tags:{route:"checkout"}};
 const [a,b]=http.batch([["POST",base,"{}",params],["POST",base,"{}",params]]);
 const success=[a.status,b.status].sort().join(",")==="200,201";
 const same=success&&a.json("order._id")&&a.json("order._id")===b.json("order._id");
 const soldOut=a.status===409&&b.status===409;
 invalid.add(!check({same,soldOut},{"one order or stock rejection":x=>Boolean(x.same||x.soldOut)}));
 if(same)accepted.add(1);
 if(soldOut)rejected.add(1);
}
