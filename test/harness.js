// Loads the app's real code into Node with a minimal fake DOM.
const fs = require('fs'), vm = require('vm');
function fakeEl(){
  return new Proxy({classList:{add(){},remove(){},toggle(){}},style:{},value:'',textContent:'',
    innerHTML:'',appendChild(){},addEventListener(){},focus(){},setAttribute(){},
    querySelectorAll:()=>[],click(){},checked:false,dataset:{},insertAdjacentHTML(){}},
    {get(t,p){return p in t ? t[p] : (typeof p==='string' ? fakeEl()[p] : undefined);}});
}
module.exports = function load(path='index.html'){
  const els = {};
  const store = {};
  global.document = {
    getElementById: id => (els[id] = els[id] || fakeEl()),
    querySelectorAll: () => [], addEventListener(){},
    createElement: () => fakeEl(), body: fakeEl(), head: {appendChild(){}}
  };
  global.window = {crypto:{randomUUID:()=>'id-'+Math.random().toString(36).slice(2)}, addEventListener(){}};
  global.crypto = global.window.crypto;
  global.localStorage = {getItem:k=>store[k]||null, setItem:(k,v)=>store[k]=v, removeItem:k=>delete store[k]};
  global.setTimeout = () => 0; global.clearTimeout = () => {};
  global.setInterval = () => 0; global.clearInterval = () => {};
  global.Blob = function(){}; global.URL = {createObjectURL:()=>'', revokeObjectURL(){}};
  global.FileReader = function(){};
  global.Chart = function(){ this.destroy = () => {}; };
  global.fetch = () => Promise.reject('offline in tests');
  const html = fs.readFileSync(path,'utf8');
  const script = [...html.matchAll(/<script>([\s\S]*?)<\/script>/g)]
    .map(m => m[1]).reduce((a,b) => a.length > b.length ? a : b, '');
  vm.runInThisContext(script);
  return {els, store};
};
