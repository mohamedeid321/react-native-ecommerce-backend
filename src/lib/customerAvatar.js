import {randomUUID} from 'node:crypto';
export function customerAvatar(){
 return 'https://api.dicebear.com/9.x/shapes/svg?seed='+randomUUID();
}
