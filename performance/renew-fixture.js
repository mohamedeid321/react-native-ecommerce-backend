import {readFile,writeFile} from 'node:fs/promises';
import {getRedis} from '../src/lib/redis.js';
import {createSessionStore} from '../src/lib/sessionStore.js';
import {verifyAccessToken,signAccessToken} from '../src/utils/sessionTokens.js';
if(process.env.CI!=='true'||process.env.REDIS_URL!=='redis://127.0.0.1:6379'||process.env.MONGO_URI!=='mongodb://127.0.0.1:27017/lotta_performance')throw Error('Isolated CI only');
const f=JSON.parse(await readFile('performance/fixture.json','utf8'));
const store=createSessionStore(getRedis());
try{for(const a of f.accounts){const p=verifyAccessToken(a.access);if(p.userId!==a.id||!await store.active(p.sid,p.userId))throw Error('Invalid fixture session');a.access=signAccessToken(p.userId,p.sid);}
await writeFile('performance/fixture.json',JSON.stringify(f),{mode:0o600});
console.log('Renewed disposable test access tokens; no production authentication changes');}finally{await getRedis().quit();}
