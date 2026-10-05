import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { test } from 'node:test';
import vm from 'node:vm';
import ts from 'typescript';
const source = await readFile(new URL('../src/pages/dashboard/Clients/utils/fitFilters.ts', import.meta.url), 'utf8');
const module = new vm.SourceTextModule(ts.transpileModule(source, {compilerOptions: {module: ts.ModuleKind.ESNext}}).outputText);
await module.link(() => {}); await module.evaluate();
const fit = (...args) => JSON.parse(JSON.stringify(module.namespace.fitFilters(...args)));
test('wide row preserves all full labels', () => assert.deepEqual(fit(400,[100,90,100],[40,40,40],40,1),{compact:false,visible:[0,1,2]}));
test('icons preserve all filters when labels do not fit', () => assert.deepEqual(fit(150,[100,90,100],[40,40,40],40,1),{compact:true,visible:[0,1,2]}));
test('overflow reserves space for More and retains the active filter', () => {
 const layout=fit(130,[100,90,100,100],[40,40,40,40],40,3);
 assert.deepEqual(layout,{compact:true,visible:[0,3]});
 assert.ok(layout.visible.reduce((n,i)=>n+40+4,0)+40 <= 130);
});
test('a tiny row retains a usable More button and hides no filters permanently', () => assert.deepEqual(fit(40,[100,100],[40,40],40,1),{compact:true,visible:[]}));
