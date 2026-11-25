import http from 'k6/http';
import {sleep} from 'k6';
import {Rate} from 'k6/metrics';
import {SharedArray} from 'k6/data';
const f=JSON.parse(open('./fixture.json'));
const accounts=new SharedArray('accounts',()=>f.accounts);
const products=f.mixedProducts;
const errors=new Rate('soak_errors');
export const options={vus:1000,duration:'10m',thresholds:{http_req_failed:['rate<0.001'],soak_errors:['rate<0.001'],'http_req_duration{kind:read}':['p(95)<500'],'http_req_duration{kind:write}':['p(95)<1000']}};
export default function(){
const i=__VU-1,p=products[i%20],phase=__ITER%4;
const headers={Origin:'http://localhost:5173','X-Lotta-CSRF':'1','Content-Type':'application/json',Cookie:'lotta_access='+accounts[i].access};
let method='GET',body=null,kind='read';
const paths=['/products?limit=12','/products/search?q=apple','/categories','/settings','/cart','/orders/my'];
let path=paths[(i+__ITER)%paths.length];
if(i>=50&&i<150&&phase!==3){kind='write';if(phase===0){method='POST';path='/cart/merge';body={items:[{productId:p,quantity:1}]};}else{method=phase===1?'PUT':'DELETE';path='/cart/'+p;if(phase===1)body={quantity:2};}}
const r=http.request(method,'http://127.0.0.1:3000/api'+path,body?JSON.stringify(body):null,{headers,tags:{kind,name:kind}});
let ok=r.status===200;try{if(ok&&kind==='write'){const c=r.json('cart');ok=phase===2?c.items.length===0:c.items.length===1&&(phase!==1||c.items[0].quantity===2);}}catch{ok=false;}
errors.add(!ok);sleep(1+i%3*0.5);
}
