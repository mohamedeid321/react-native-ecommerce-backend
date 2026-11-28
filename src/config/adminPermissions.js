export const adminJobs=['مدير التشغيل','مشرف الطلبات','خدمة العملاء','منسّق التوصيل','مدير المخزون','مسؤول المشتريات','مدير المنتجات','مسؤول التسويق','محاسب'];
export const adminPermissions=[
 'dashboard','orders.read','orders.update','orders.cancel','orders.delete','dispatch.read','dispatch.assign','dispatch.approve',
 'couriers.read','couriers.create','couriers.edit','couriers.delete','products.read','products.create','products.edit','products.delete',
 'stock.read','stock.edit','purchases.read','purchases.edit','finance.read','finance.edit','customers.read',
 'tracking.read','tracking.edit','offers.read','offers.edit','offers.delete','delivery.edit','settings.edit','notifications.read',
];

export const isOwnerAdmin=user=>user?.role==='admin'&&user.adminPermissions==null;
export const hasAdminPermission=(user,...keys)=>isOwnerAdmin(user)||
 (user?.role==='admin'&&Array.isArray(user.adminPermissions)&&keys.some(key=>user.adminPermissions.includes(key)));

const rules=[
 ['GET',/^\/api\/admin\/dashboard$/,'dashboard'],
 ['GET',/^\/api\/admin\/customers(?:\/[^/]+)?$/,'customers.read'],
 ['GET',/^\/api\/admin\/guest-tracking-requests$/,'tracking.read','tracking.edit'],
 ['PATCH',/^\/api\/admin\/guest-tracking-requests\/[^/]+$/,'tracking.edit'],
 ['GET',/^\/api\/orders$/,'orders.read','orders.update','orders.cancel','orders.delete','dispatch.read','dispatch.assign','dispatch.approve'],
 ['DELETE',/^\/api\/orders\/[^/]+$/,'orders.delete'],
 ['PATCH',/^\/api\/orders\/[^/]+\/assign$/,'dispatch.assign'],
 ['PATCH',/^\/api\/orders\/[^/]+\/approve-delivery$/,'dispatch.approve'],
 ['GET',/^\/api\/orders\/couriers$/,'couriers.read','couriers.create','couriers.edit','couriers.delete','dispatch.read','dispatch.assign','dispatch.approve'],
 ['POST',/^\/api\/orders\/couriers$/,'couriers.create'],
 ['PATCH',/^\/api\/orders\/couriers\/[^/]+(?:\/disabled)?$/,'couriers.edit'],
 ['DELETE',/^\/api\/orders\/couriers\/[^/]+$/,'couriers.delete'],
 ['GET',/^\/api\/(?:products|categories)\/admin$/,'products.read','products.create','products.edit','products.delete'],
 ['POST',/^\/api\/products$/,'products.create'],
 ['PUT',/^\/api\/(?:products|categories)\/[^/]+$/,'products.edit'],
 ['PATCH',/^\/api\/products\/[^/]+\/(?:visibility|featured)$/,'products.edit'],
 ['DELETE',/^\/api\/products\/[^/]+$/,'products.delete'],
 ['GET',/^\/api\/banners\/admin$/,'offers.read','offers.edit','offers.delete'],
 ['POST',/^\/api\/banners$/,'offers.edit'],
 ['PATCH',/^\/api\/banners\/[^/]+$/,'offers.edit'],
 ['PUT',/^\/api\/banners\/[^/]+\/image$/,'offers.edit'],
 ['DELETE',/^\/api\/banners\/[^/]+$/,'offers.delete'],
 ['GET',/^\/api\/inventory(?:\/movements)?$/,'stock.read','stock.edit'],
 ['POST',/^\/api\/inventory\/movements$/,'stock.edit'],
 ['GET',/^\/api\/purchases$/,'purchases.read','purchases.edit'],
 ['PUT',/^\/api\/purchases\/[^/]+\/[^/]+$/,'purchases.edit'],
 ['GET',/^\/api\/(?:finance(?:\/expenses)?|stats)$/,'finance.read','finance.edit'],
 ['POST',/^\/api\/finance\/(?:expenses|orders\/[^/]+\/freeze-cost)$/,'finance.edit'],
 ['PATCH',/^\/api\/finance\/expenses\/[^/]+\/void$/,'finance.edit'],
];

export function canUseAdminRoute(req){
 if(isOwnerAdmin(req.user))return true;
 const path=(req.baseUrl+req.path).toLowerCase().replace(/\/+$/,'');
 const method=req.method==='HEAD'?'GET':req.method;
 if(method==='PATCH'&&/^\/api\/orders\/[^/]+\/status$/.test(path))
  return hasAdminPermission(req.user,req.body?.status==='cancelled'?'orders.cancel':'orders.update');
 if(method==='PATCH'&&path==='/api/settings'){
  const keys=Object.keys(req.body||{});
  const delivery=['deliveryFee','freeDeliveryThreshold','firstOrderFree','deliveryAreas'];
  const operations=['acceptingOrders','cutoffHour'];
  return keys.length>0&&keys.every(key=>(delivery.includes(key)&&hasAdminPermission(req.user,'delivery.edit'))||
   (operations.includes(key)&&hasAdminPermission(req.user,'settings.edit')));
 }
 const rule=rules.find(([verb,pattern])=>verb===method&&pattern.test(path));
 return !!rule&&hasAdminPermission(req.user,...rule.slice(2));
}
