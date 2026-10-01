import { test } from "node:test";
import assert from "node:assert/strict";
import { portionTotals } from "../shared/nutrition";
test("portion calculation distinguishes label basis and rounds after scaling",()=>{
  const nutrients={calories:125,protein:8.2,carbs:12.1,fat:4.3};
  assert.deepEqual(portionTotals({basis:"100ml",amount:250,nutrients}),{calories:313,protein:20.5,carbs:30.3,fat:10.8});
  assert.deepEqual(portionTotals({basis:"serving",amount:0.5,nutrients}),{calories:63,protein:4.1,carbs:6.1,fat:2.2});
});
