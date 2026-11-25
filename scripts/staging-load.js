import {spawnSync} from 'node:child_process';
const base=process.env.STAGING_BASE_URL;
const stages=[10,50,100,250,500,1000];
if(!base||process.env.CONFIRM_STAGING!=='yes'||process.env.STAGING_APPROVED_ORIGIN!==base)throw Error('Explicit staging authorization required');
const url=new URL(base);
if(url.protocol!=='https:'||url.origin!==base||url.username||url.password||!/(?:^|[.-])staging(?:[.-]|$)/i.test(url.hostname))throw Error('Dedicated HTTPS staging origin required');
const max=Number(process.env.STAGING_MAX_VUS||10);
if(!stages.includes(max))throw Error('Invalid max VUs');
for(const vus of stages.filter(n=>n<=max)){
 console.log('STAGING_VUS='+vus);
 const result=spawnSync('k6',['run','performance/staging-read.k6.js'],{stdio:'inherit',env:{...process.env,VUS:String(vus)}});
 if(result.error)throw result.error;
 if(result.status!==0){console.error('Stopping escalation at failed stage');process.exit(result.status||1);}
}
console.log('Authorized staging read stages completed; authenticated writes and browser flow require separate acceptance.');
