import http from "k6/http";
import {sleep} from "k6";
import {Rate,Counter} from "k6/metrics";
import {SharedArray} from "k6/data";
const accounts=new SharedArray("accounts",()=>JSON.parse(open("./fixture.json")).accounts);
const products=new SharedArray("products",()=>JSON.parse(open("./fixture.json")).mixedProducts);
const errors=new Rate("mixed_errors"),orders=new Counter("mixed_orders"),writes=new Counter("cart_actions");
export const options={vus:1000,duration:"60s",thresholds:{http_req_failed:["rate<0.001"],mixed_errors:["rate<0.001"],mixed_orders:["count==50"],cart_actions:["count>=100"],"http_req_duration{kind:read}":["p(95)<500"],"http_req_duration{kind:write}":["p(95)<1000"],"http_req_duration{kind:checkout}":["p(95)<2000"]}};
let purchased=false;
function req(method,path,kind,status,body,key,predicate){
 const headers={Origin:"http://localhost:5173","X-Lotta-CSRF":"1","Content-Type":"application/json",Cookie:"lotta_access="+accounts[__VU-1].access};
 if(key)headers["Idempotency-Key"]=key;
 const r=http.request(method,"http://127.0.0.1:3000/api"+path,body?JSON.stringify(body):null,{headers,tags:{kind,name:kind}});
 let ok=false;try{ok=r.status===status&&(!predicate||predicate(r.json()));}catch{}
 errors.add(!ok);return ok?r:null;
}
export default function(){
 const i=__VU-1,p=products[i%20],line="/cart/"+p;
 if(i<50&&!purchased){
  sleep(2+i%15);
  if(!req("POST","/cart","write",201,{productId:p,quantity:1}))return;
  if(!req("PUT",line,"write",200,{quantity:2}))return;
  const key="mixed-checkout-"+accounts[i].id;
  const r=req("POST","/orders","checkout",201,{},key,b=>b.order.total===60);
  if(!r)return;
  const id=r.json("order._id");
  if(!req("POST","/orders","checkout",200,{},key,b=>b.order._id===id))return;
  purchased=true;orders.add(1);writes.add(2);
 }else if(i>=50&&i<150&&__ITER%4!==3){
  const n=__ITER%4;
  const r=n===0?req("POST","/cart/merge","write",200,{items:[{productId:p,quantity:1}]}):n===1?req("PUT",line,"write",200,{quantity:2}):req("DELETE",line,"write",200);
  if(r)writes.add(1);
 }else{
  const paths=["/products?limit=12","/products/search?q=apple","/categories","/settings","/cart","/products/search?q=orange","/orders/my"];
  req("GET",paths[(i+__ITER)%paths.length],"read",200);
 }
 sleep(1+i%3*0.5);
}
