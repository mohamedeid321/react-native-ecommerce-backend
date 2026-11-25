import http from "k6/http";
import {check} from "k6";
import {Rate} from "k6/metrics";
const fixture=JSON.parse(open("./fixture.json"));
const failures=new Rate("login_errors");
export const options={scenarios:{login:{executor:"per-vu-iterations",vus:10,iterations:1,maxDuration:"30s"}},thresholds:{http_req_failed:["rate==0"],login_errors:["rate==0"],http_req_duration:["p(95)<2000"]}};
export default function(){
 const r=http.post("http://127.0.0.1:3000/api/auth/web/login",JSON.stringify({identifier:fixture.accounts[__VU-1].email,password:fixture.password}),{headers:{"Content-Type":"application/json",Origin:"http://localhost:5173","X-Lotta-CSRF":"1"}});
 failures.add(!check(r,{"login successful":r=>r.status===200&&Boolean(r.cookies.lotta_access?.length)&&Boolean(r.cookies.lotta_refresh?.length)}));
}
