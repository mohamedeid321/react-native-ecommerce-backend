

export const round2 = (n) => Math.round(n * 100) / 100;

// سعر الوحدة بعد الخصم (نفس منطق finalPrice في الموديل)
export const unitPriceOf = (product) =>
  round2(product.price * (1 - (product.discount || 0) / 100));

// المجموع الفرعي + التوصيل + الإجمالي من عناصر فيها unitPrice و quantity
export const computeTotals = (items, {firstOrder=false} = {}) => {
  const subtotal = round2(items.reduce((sum, i) => sum + i.unitPrice * i.quantity, 0));
  const deliveryFee = items.length && !firstOrder && subtotal < 700 ? 30 : 0;
  return { subtotal, deliveryFee, total: round2(subtotal + deliveryFee) };
};
