import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { test } from 'node:test';
import vm from 'node:vm';
import ts from 'typescript';

async function moduleAt(relative, mocks = {}, globals = {}) {
  const context = vm.createContext({ console, Intl, Date, AbortController, DOMException, URLSearchParams, ...globals });
  const source = await readFile(new URL('../src/' + relative, import.meta.url), 'utf8');
  const mod = new vm.SourceTextModule(ts.transpileModule(source, { fileName: relative, compilerOptions: {
    jsx: ts.JsxEmit.ReactJSX, target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.ESNext,
  } }).outputText, { context, initializeImportMeta: meta => { meta.env = { VITE_API_URL: 'http://fixture.invalid' }; } });
  await mod.link(name => {
    const exports = mocks[name] ?? {};
    return new vm.SyntheticModule(Object.keys(exports), function () {
      for (const [key, value] of Object.entries(exports)) this.setExport(key, value);
    }, { context });
  });
  await mod.evaluate();
  return mod.namespace;
}

const model = await moduleAt('pages/dashboard/Journal/bumpix/model.ts');
const row = (id=7, teacher=null) => ({client_id:42,client_name:'Fictional',master_name:'Source master',event:{id,source_event_id:'1.100',source_client_id:'1.10',master_source_id:'1.1',teacher_user_id:teacher,start_time:'2026-10-03T23:45:00',end_time:'2026-10-04T00:45:00',status:'completed',details:{services:'Full source service',comment:'Original'},photos:[],raw_event:{},source_groups:['t1','t3']}});
test('source IDs are isolated from native IDs; source status and wall time survive', () => {
 const b=model.sourceBooking(row());
 assert.equal(b.id,-7);assert.equal(b.trainer,-1);assert.equal(b.date,'2026-10-03');
 assert.equal(b.timeStart,16.75);assert.equal(b.timeEnd,17.75);
 assert.equal(b.source.event.source_event_id,'1.100');assert.equal(b.notes,'Original');
 assert.equal(model.inGrid(b),false);assert.equal(b.attended,undefined);
});
test('mapped source master uses its real column; normal bookings remain editable', () => {
 const b=model.sourceBooking({...row(9,12),event:{...row(9,12).event,start_time:'2026-10-03T10:00:00',end_time:'2026-10-03T11:00:00'}});
 assert.equal(b.trainer,12);assert.equal(model.inGrid(b),true);
 assert.equal(model.isSource(b),true);assert.equal(model.isSource({id:9}),false);
});
test('range pagination stops on incomplete, duplicate or mismatched pages', () => {
 assert.equal(model.validateRangePage({total:3,offset:0,limit:2,items:[row(1),row(2)]},0).items.length,2);
 assert.throws(()=>model.validateRangePage({total:3,offset:0,limit:2,items:[]},0));
 assert.throws(()=>model.validateRangePage({total:3,offset:2,limit:2,items:[row()]},0));
 assert.throws(()=>model.validateRangePage({total:2,offset:0,limit:2,items:[row(1),row(1)]},0));
});

test('unknown Bumpix payment must not render a paid/free checkmark', async () => {
 const jsx=(type,props)=>({type,props});
 const marks=await moduleAt('pages/dashboard/Journal/components/lesson/VisitMarks.tsx',{
  react:{useState:()=>[null,()=>{}]},'react/jsx-runtime':{jsx,jsxs:jsx,Fragment:'Fragment'},'react-i18next':{useTranslation:()=>({t:k=>k})},'./AttendChoice':{AttendChoice:'AttendChoice'},'../../../../../components/Icons':{CardIcon:'Card',CashIcon:'Cash'}
 });
 const result=marks.PayMark({client:{booking_channel:'bumpix',debt:0,paid_amount:0,payment:null,by_subscription:false},canPay:true,onPay:()=>{}});
 assert.equal(result.props.state,'idle');
 const paid=marks.PayMark({client:{booking_channel:'bumpix',debt:0,paid_amount:2000,payment:{method:'cash'},by_subscription:false},canPay:true,onPay:()=>{}});
 assert.equal(paid.props.state,'done');
});
