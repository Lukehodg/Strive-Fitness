import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseProduct, lookupBarcode } from '../mobile/src/lib/barcode';
test('barcode nutrition preserves missing values and zero, never treats kJ as kcal', () => {
 const result = parseProduct({status:1,product:{product_name:'Milk',nutriments:{'energy-kj_100g':418.4,proteins_100g:0,carbohydrates_100g:4,fat_100g:-1}}},'12345678');
 assert.deepEqual(result.values,{calories:'100',protein:'0',carbs:'4',fat:''});
 assert.equal(parseProduct({status:1,product:{nutriments:{}}},'12345678').values.calories,'');
 assert.equal(parseProduct({status:1,product:{nutriments:{'energy-kcal_100g':0,'energy-kj_100g':100}}},'12345678').values.calories,'0');
});
test('barcode lookup rejects absent products and non-product payloads', async()=>{
 assert.throws(()=>parseProduct(null,'12345678'),/not found/);
 assert.throws(()=>parseProduct({status:0},'12345678'),/not found/);
 await assert.rejects(lookupBarcode('https://example.com'),/EAN or UPC/);
});
