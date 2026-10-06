/** Reference-rate conversion, rounded half up to bani with integer arithmetic. */
export function convertToLei(amount:string, value:string, multiplier:string|number):string|null {
  if(!/^\d{1,9}([.,]\d{0,2})?$/.test(amount)||!/^\d+(\.\d{1,8})?$/.test(value)) return null;
  const unit=String(multiplier);
  if(!/^\d{1,6}$/.test(unit)||BigInt(unit)===0n) return null;
  const [whole,fraction='']=amount.replace(',','.').split('.');
  const [rateWhole,rateFraction='']=value.split('.');
  const cents=BigInt(whole)*100n+BigInt(fraction.padEnd(2,'0'));
  const numerator=cents*BigInt(rateWhole+rateFraction);
  const denominator=10n**BigInt(rateFraction.length)*BigInt(unit);
  const rounded=(numerator+denominator/2n)/denominator;
  return new Intl.NumberFormat('ro-RO').format(rounded/100n)+','+(rounded%100n).toString().padStart(2,'0');
}
