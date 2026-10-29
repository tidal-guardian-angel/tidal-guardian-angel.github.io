'use strict';
import { initPlaces, searchPlaces as searchCityRecords, getTimezones } from './places.js';
import { initTimezones } from './timezone.js';
import { calculate as calculateChart } from './calculator.js';
import { renderResult, recordText, resultImage } from './result-view.js';

const dataBase = new URL('./data/', document.baseURI).href;
const $ = id => document.getElementById(id);
const signs = ['白羊座','金牛座','双子座','巨蟹座','狮子座','处女座','天秤座','天蝎座','射手座','摩羯座','水瓶座','双鱼座'];
const planets = ['sun','moon','mercury','venus','mars','jupiter','saturn'];
const rulers = ['mars','venus','mercury','moon','sun','mercury','venus','mars','jupiter','saturn','saturn','jupiter'];
const labels = {sun:'太阳',moon:'月亮',mercury:'水星',venus:'金星',mars:'火星',jupiter:'木星',saturn:'土星',ascendant:'上升',mc:'天顶',syzygy:'朔望',eleventhCusp:'十一宫头',target:'选定行星'};
const configs = {
  five:{title:'五生命点取字',note:'五个点位，按昼夜排序',copy:'从太阳、月亮、上升、福点与出生前朔望取字，查看完整推导。'},
  ascendant:{title:'命主星法',note:'从上升星座找到命主星',copy:'采用七颗古典行星的本垣守护关系，先确定命主星，再按所选起点取字。'},
  moon:{title:'月座法',note:'月座的下一星座与其守护星',copy:'沿黄道顺序找到月亮所在星座的下一个星座，使用该星座守护星的实际位置取字。'},
  angles:{title:'角宫法',note:'四角点的本质尊贵计分',copy:'对上升、天底、下降、天顶四个角点计分，选出最高分行星；并列候选分别构名。'},
  eleventh:{title:'第十一宫法',note:'善灵宫的宫主星或宫头计分',copy:'选择第十一宫宫主星，或对宫头度数计算本质尊贵；不同候选分别保留。'},
  name:{title:'姓名计算法',note:'逐字加权，拆数构名',copy:'使用你确定的字母拼写，展示每个字母的数值、权重、拆分与名号组成。'},
  almuten:{title:'胜利星取字',note:'手动选星',copy:'填写你已经确定的胜利星。网站依据所选行星的位置继续取字，不自动判断胜利星。'},
  luminary:{title:'日月取字',note:'手动选择太阳或月亮',copy:'根据你采用的判断选择太阳或月亮，网站负责后续的位置换算、取字与构名。'},
};
const escapeHTML = value => String(value ?? '').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
let method = null, mode = 'auto', currentResult = null, aggregate = null;
let dirty = false, busy = false, exporting = false, requestVersion = 0;
let places = [], placeIndex = -1, selectedPlace = null, placeTimer, searchVersion = 0, toastTimer;
let placesReady = false, locationLoading = null;

function clearError() {
  $('form-error').hidden = true;
  document.querySelectorAll('[aria-invalid="true"]').forEach(el=>el.removeAttribute('aria-invalid'));
}
function showError(message,field) {
  $('form-error').textContent = message; $('form-error').hidden = false;
  if(field){field.setAttribute('aria-invalid','true'); const details=field.closest('details'); if(details)details.open=true; field.focus();}
  else $('form-error').focus();
}
function fail(message,field){showError(message,field); return null;}
function syncResultActions(){
  for(const id of ['save-image','print-result','copy-result']) $(id).disabled=!currentResult||dirty||busy||(id==='save-image'&&exporting);
  const select=$('candidate-choice'); if(select)select.disabled=dirty||busy||exporting;
}
function markDirty(){
  if(currentResult){dirty=true;$('stale-notice').hidden=false;syncResultActions();}
}
function setBusy(value){
  busy=value; syncResultActions();
  for(const id of ['auto-submit','manual-submit','name-submit']){
    const button=$(id); if(!button)continue; button.disabled=value;
    const span=button.querySelector('span');if(span)span.textContent=value?'正在计算…':'计算名号';
  }
  $('busy-status').textContent=value?'正在核对点位与取字记录…':'';
  document.querySelector('.result-panel').setAttribute('aria-busy',String(value));
}
function setMode(value,focus=false){
  if(busy||method==='name')return;
  mode=value;
  for(const type of ['auto','manual']){
    const active=type===mode;
    $('tab-'+type).classList.toggle('active',active);
    $('tab-'+type).setAttribute('aria-selected',String(active));
    $('tab-'+type).tabIndex=active?0:-1;
    $(type+'-form').hidden=!active;
  }
  updateFields();clearError();closePlaces();markDirty();
  if(mode==='auto')initLocationData();
  if(focus)$('tab-'+mode).focus();
}
for(const type of ['auto','manual']){
  $('tab-'+type).addEventListener('click',()=>setMode(type));
  $('tab-'+type).addEventListener('keydown',event=>{
    if(['ArrowLeft','ArrowRight','Home','End'].includes(event.key)){
      event.preventDefault();setMode(event.key==='Home'?'auto':event.key==='End'?'manual':mode==='auto'?'manual':'auto',true);
    }
  });
  $(type+'-form').addEventListener('input',()=>{clearError();markDirty();});
  $(type+'-form').addEventListener('change',()=>{clearError();markDirty();updateFields();});
}

const allPoints=[...planets,'ascendant','mc','syzygy','eleventhCusp','target'];
for(const key of allPoints){
  const row=document.createElement('div');row.className='point-row';row.id='point-row-'+key;
  row.innerHTML='<span class="point-label">'+labels[key]+'</span><select id="'+key+'-sign" aria-label="'+labels[key]+'星座">'+signs.map((sign,i)=>'<option value="'+i+'">'+sign+'</option>').join('')+'</select>'+
    ['degree','minute','second'].map((part,i)=>'<label class="dms-field"><input id="'+key+'-'+part+'" aria-label="'+labels[key]+['度','分','秒'][i]+'" type="number" min="0" max="'+[29,59,59.999999999999][i]+'" step="'+(i===2?'any':'1')+'" inputmode="'+(i===2?'decimal':'numeric')+'" '+(i?'value="0"':'placeholder="0"')+' required><span class="unit-label" aria-hidden="true">'+['度','分','秒'][i]+'</span></label>').join('');
  $('point-inputs').append(row);
}
function selectField(id,label,options,hint=''){
  return '<div class="field"><label for="'+id+'">'+label+'</label><select id="'+id+'">'+options.map(([value,text])=>'<option value="'+value+'">'+text+'</option>').join('')+'</select>'+(hint?'<span class="field-hint">'+hint+'</span>':'')+'</div>';
}
function renderSettings(){
  let html='';
  if(method!=='five'&&method!=='name'){
    if(method==='almuten'||method==='luminary'){
      const allowed=method==='luminary'?['sun','moon']:planets;
      html+=selectField('star-choice',method==='luminary'?'你选择的发光体':'你确定的胜利星',[['','请选择'],...allowed.map(key=>[key,labels[key]])],'选星由你确认；出生资料模式可以自动取得这颗星的位置。');
    }
    html+=selectField('letter-origin','字母起算点',[['ascendant','从上升所在整数行起布字'],['aries','从白羊座 0° 起布字']],'相对上升时，分别取行星与上升所在整数行，再计算顺行差。');
    if(method==='eleventh'){
      html+=selectField('eleventh-selection','第十一宫取星方式',[['ruler','第十一宫的本垣宫主星'],['dignity','第十一宫宫头的尊贵计分']]);
      html+='<div id="house-system-field">'+selectField('house-system','排盘宫制',[['','请选择与你的排盘一致的宫制'],['porphyry','波菲利制 Porphyry'],['regiomontanus','雷吉奥蒙塔努斯制 Regiomontanus'],['placidus','普拉西德制 Placidus'],['whole','整宫制 Whole Sign']],'宫制会影响十一宫宫头，请按你的课程或原星盘选择。')+'</div>';
    }
    if(method==='angles'||method==='eleventh'){
      html+='<div id="triplicity-field">'+selectField('triplicity-choice','三分主星计分',[['sect','按昼夜当令主星计 3 分'],['all','昼、夜、共管主星各计 3 分']],'采用课件的多罗修斯三分、埃及界与面；入庙 5、耀升 4、三分 3、界 2、面 1。')+'</div>';
    }
  }
  $('method-settings').innerHTML=html;
  $('method-settings').hidden=!html;
}
$('method-settings').addEventListener('change',event=>{
  if(event.target.id==='star-choice')$('target-degree').value='';
  clearError();markDirty();updateFields();
});
$('manual-form').addEventListener('change',event=>{
  const changesRuler=(method==='ascendant'&&event.target.id==='ascendant-sign')||(method==='moon'&&event.target.id==='moon-sign')||(method==='eleventh'&&event.target.id==='eleventhCusp-sign');
  if(changesRuler)$('target-degree').value='';
});
function option(id,fallback=''){return $(id)?.value??fallback;}
function targetPlanet(){
  if(method==='ascendant')return rulers[Number($('ascendant-sign').value)];
  if(method==='moon')return rulers[(Number($('moon-sign').value)+1)%12];
  if(method==='eleventh')return rulers[Number($('eleventhCusp-sign').value)];
  return option('star-choice');
}
function requiredPoints(){
  if(method==='five')return ['sun','moon','ascendant','syzygy'];
  const relative=option('letter-origin')==='ascendant';
  let keys=[];
  if(method==='ascendant')keys=['ascendant','target'];
  if(method==='moon')keys=['moon',...(targetPlanet()==='moon'?[]:['target'])];
  if(method==='almuten'||method==='luminary')keys=['target'];
  if(method==='angles')keys=['ascendant','mc',...planets];
  if(method==='eleventh')keys=['eleventhCusp',...(option('eleventh-selection')==='dignity'?planets:['target'])];
  if(relative&&!keys.includes('ascendant'))keys.push('ascendant');
  return [...new Set(keys)];
}
function updateFields(){
  if(!method)return;
  const nameMode=method==='name';
  document.querySelector('.input-panel-top').hidden=nameMode;
  $('name-form').hidden=!nameMode;$('auto-form').hidden=nameMode||mode!=='auto';$('manual-form').hidden=nameMode||mode!=='manual';
  const scored=method==='angles'||(method==='eleventh'&&option('eleventh-selection')==='dignity');
  if($('house-system-field'))$('house-system-field').hidden=mode!=='auto';
  if($('triplicity-field'))$('triplicity-field').hidden=!scored;
  const required=requiredPoints();
  for(const key of allPoints)$('point-row-'+key).hidden=!required.includes(key);
  document.querySelector('.sect-control').hidden=method!=='five'&&!scored;
  const chosen=targetPlanet();
  $('point-row-target').querySelector('.point-label').textContent=chosen?labels[chosen]+'位置':'选定行星';
  for(const [part,unit]of [['sign','星座'],['degree','度'],['minute','分'],['second','秒']])$('target-'+part).setAttribute('aria-label',(chosen?labels[chosen]:'选定行星')+unit);
  $('manual-example').textContent=method==='five'?'填入课堂示例':'填入示例点位';
  $('manual-description').textContent=method==='five'?'使用回归黄道位置。福点由太阳、月亮、上升与昼夜自动计算。':'填写下列回归黄道位置；未要求的点位无需填写。';
  $('manual-hint').textContent=method==='five'?'朔望填写出生前最近一次新月或满月时的月亮位置。计算福点时保留分秒，查字时不四舍五入。':method==='angles'?'下降与天底由上升、天顶的对点推导。四角点指实际天文轴线。':method==='eleventh'?'十一宫头按你的原星盘抄入；采用的宫制以原盘为准。':'若按上升起布字，请同时填写上升。行星和上升分别取整数行后计算差值。';
}
$('name-form').innerHTML='<div class="form-heading"><h2>填写姓名字母</h2><button id="name-example" class="small-link" type="button">试用示例</button></div>'+
  '<p class="form-description">先确定你要采用的字母拼写。中文姓名请自行确定转写；这里不会自动转拼音或按笔画计数。</p>'+
  '<div class="two-fields">'+selectField('name-input-script','输入字母体系',[['latin','拉丁字母 A–Z'],['hebrew','希伯来字母'],['arabic','阿拉伯字母']])+selectField('name-output-script','构名字母体系',[['hebrew','希伯来大数表（至 900）'],['arabic','阿拉伯大数表（含 1000）']],'两种文字分别按各自数表构名；希伯来表不含 1000。')+'</div>'+
  '<div class="field"><label for="name-text">用于计算的完整字母拼写</label><input id="name-text" type="text" maxlength="120" autocomplete="off" spellcheck="false" placeholder="例如 ALICE" required><span class="field-hint">最多 40 个字母；空格、连字符和撇号不参与计序。</span></div>'+
  selectField('name-suffix','名号后缀',[['el','el · 数值 31'],['ayl','Ayl · 数值 41']])+
  '<details class="location-details"><summary>查看拆数约定或手动填写拆分</summary><p class="field-hint">姓名连写后，从 1 开始连续加权。扣除后缀后，按百、十、个位拆分；千位组先拆，再记 1000。11–19 按 10＋个位处理。这是本工具采用的计算约定，所有步骤会列入结果。</p><div class="field"><label for="name-components">自定义拆分数值（可选）</label><input id="name-components" type="text" inputmode="numeric" autocomplete="off" placeholder="例如 40, 1, 1000, 800, 50, 4"><span class="field-hint">留空使用自动拆分；自填时会检查是否与扣除后缀后的数值一致。</span></div></details>'+
  '<button class="primary-button" id="name-submit" type="submit"><span>计算名号</span></button>';
$('name-form').addEventListener('input',()=>{clearError();markDirty();});
$('name-form').addEventListener('change',()=>{clearError();markDirty();});
$('name-example').addEventListener('click',()=>{
  $('name-text').value='ALICE';$('name-input-script').value='latin';$('name-output-script').value='hebrew';$('name-suffix').value='el';$('name-components').value='';
  clearError();markDirty();toast('已填入姓名示例，点击“计算名号”查看结果。');
});

function showRoute(push=false,next=null){
  const requested=next??new URL(location.href).searchParams.get('method');
  const chosen=Object.hasOwn(configs,requested)?requested:null;
  requestVersion++;setBusy(false);if(chosen!==method)$('target-degree').value='';method=chosen;currentResult=null;aggregate=null;dirty=false;
  $('home-view').hidden=Boolean(method);$('tool-view').hidden=!method;
  $('result').hidden=true;$('empty-state').hidden=false;clearError();closePlaces();
  if(push){const url=new URL(location.href);url.search='';url.hash='';if(method)url.searchParams.set('method',method);history.pushState({},'',url);}
  if(method){
    const config=configs[method];$('tool-title').textContent=config.title;$('tool-note').textContent=config.note;$('tool-copy').textContent=config.copy;
    document.title=config.title+'｜潮汐纪年社';renderSettings();updateFields();
    $('rules-copy').textContent=method==='five'?'五点取字，按昼夜排列，添加 el 后缀。':method==='name'?'按所选字母数值连续加权，扣除后缀、拆数，再加回相同后缀。':'先选星，再按所选起点取一个根字母，添加 el 后缀。';
    $('empty-title').textContent='名号将从这里展开';
    $('empty-copy').textContent=method==='name'?'填写姓名字母或试用示例，查看逐字加权与拆数记录。':'填写资料或试用示例，查看选星依据、取字位置与完整名号。';
    document.querySelector('.five-point-mark').hidden=method!=='five';
    document.querySelector('.empty-steps').hidden=method!=='five';
    if(method!=='name'&&mode==='auto')initLocationData();
  }else document.title='守护天使名号工具箱｜潮汐纪年社';
  document.querySelector('.skip-link').href=method?'#calculator':'#home-view';
  syncResultActions();
  if(push){window.scrollTo({top:0,behavior:'auto'});$(method?'tool-title':'home-title').setAttribute('tabindex','-1');$(method?'tool-title':'home-title').focus({preventScroll:true});}
}
document.addEventListener('click',event=>{
  const a=event.target.closest('a.drawer-enter,a.back-link,a.brand');
  if(!a||event.button!==0||event.ctrlKey||event.metaKey||event.shiftKey||event.altKey)return;
  const url=new URL(a.href);if(url.origin!==location.origin)return;
  event.preventDefault();showRoute(true,url.searchParams.get('method')||'');
});
window.addEventListener('popstate',()=>showRoute());

function closePlaces() {
  $('place-list').hidden = true;
  $('place-search').setAttribute('aria-expanded','false');
  $('place-search').removeAttribute('aria-activedescendant');
  placeIndex = -1;
}
function highlightPlace(index) {
  if (!places.length) return;
  placeIndex = (index + places.length) % places.length;
  document.querySelectorAll('.place-option').forEach((el, i) => el.setAttribute('aria-selected', String(i === placeIndex)));
  const target = $(`place-option-${placeIndex}`);
  $('place-search').setAttribute('aria-activedescendant', target.id);
  target.scrollIntoView({block:'nearest'});
}
function selectPlace(index) {
  const place = places[index];
  if (!place) return;
  selectedPlace = place;
  $('place-search').value = place.label;
  $('latitude').value = place.latitude;
  $('longitude').value = place.longitude;
  $('timezone').value = place.timezone;
  $('place-hint').textContent = `已选择 ${place.name}；使用城市中心坐标，可在下方调整。`;
  $('time-fold').value = '';
  $('fold-panel').hidden = true;
  closePlaces(); clearError(); markDirty();
}
async function searchPlaces(query) {
  const version = ++searchVersion;
  try {
    if (!placesReady) $('place-hint').textContent = '正在载入城市资料，首次打开可能需要片刻…';
    await initPlaces(dataBase);
    placesReady = true;
    const data = { places: await searchCityRecords(query) };
    if (version !== searchVersion || document.activeElement !== $('place-search')) return;
    places = data.places;
    $('place-hint').textContent = '请选择匹配的城市；未收录的地点可在下方填写坐标与时区。';
    placeIndex = -1;
    $('place-list').innerHTML = places.length ? places.map((place,i) => `<li id="place-option-${i}" class="place-option" role="option" aria-selected="false" data-index="${i}"><strong>${escapeHTML(place.name)}</strong><span>${escapeHTML(place.label)} · ${escapeHTML(place.timezone)}</span></li>`).join('') : '<li class="place-empty" role="presentation">没有找到这个地点。可尝试附近城市，或在下方填写经纬度与时区。</li>';
    $('place-list').hidden = false;
    $('place-search').setAttribute('aria-expanded','true');
    $('place-search').removeAttribute('aria-activedescendant');
  } catch {
    if (version === searchVersion) $('place-hint').textContent = '城市数据未能加载，请刷新重试，或在下方填写经纬度与时区。';
  }
}
$('place-search').addEventListener('input', () => {
  selectedPlace = null;
  $('latitude').value = ''; $('longitude').value = ''; $('timezone').value = '';
  $('place-hint').textContent = '请选择搜索结果；未收录的地点可在下方填写坐标与时区。';
  $('fold-panel').hidden = true; $('time-fold').value = '';
  searchVersion++;
  closePlaces();
  clearTimeout(placeTimer);
  const query = $('place-search').value;
  placeTimer = setTimeout(() => searchPlaces(query), 180);
});
$('place-search').addEventListener('focus', () => { if (!selectedPlace) searchPlaces($('place-search').value); });
$('place-list').addEventListener('mousedown', event => event.preventDefault());
$('place-list').addEventListener('click', event => {
  const option = event.target.closest('[data-index]');
  if (option) selectPlace(Number(option.dataset.index));
});
$('place-search').addEventListener('keydown', event => {
  if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
    event.preventDefault();
    if ($('place-list').hidden) searchPlaces($('place-search').value);
    else highlightPlace(placeIndex + (event.key === 'ArrowDown' ? 1 : -1));
  } else if (event.key === 'Enter' && !$('place-list').hidden) {
    event.preventDefault();
    if (placeIndex >= 0) selectPlace(placeIndex);
  } else if (event.key === 'Escape') closePlaces();
});
document.addEventListener('click', event => { if (!event.target.closest('.place-field')) closePlaces(); });
$('place-search').addEventListener('blur', () => setTimeout(closePlaces, 100));
for (const id of ['birth-date','birth-time','timezone']) $(id).addEventListener('input', () => {
  $('time-fold').value = ''; $('fold-panel').hidden = true;
});


function fillPoint(key,sign,degree,minute,second=0){
  for(const [part,value] of Object.entries({sign,degree,minute,second}))$(key+'-'+part).value=value;
}
function fillLongitude(key,value){
  const total=((Math.round(value*3600000)%1296000000)+1296000000)%1296000000;
  const d=Math.floor(total/3600000),m=Math.floor((total%3600000)/60000),second=(total%60000)/1000;
  fillPoint(key,Math.floor(d/30),d%30,m,second);
}
$('manual-example').addEventListener('click',()=>{
  const example={sun:279.95,moon:60.9,mercury:299.35,venus:330.2,mars:20.5,jupiter:95.7,saturn:270.25,ascendant:174+35/60,mc:83+19/60,syzygy:268.2,eleventhCusp:113+11/60+35/3600,target:299.35};
  for(const [key,value]of Object.entries(example))fillLongitude(key,value);
  if($('star-choice')&&!$('star-choice').value)$('star-choice').value=method==='luminary'?'moon':'mercury';
  if(method==='luminary'||method==='almuten')fillLongitude('target',example[$('star-choice').value]);
  if(method==='eleventh'&&option('eleventh-selection')==='ruler')fillLongitude('target',example.moon);
  document.querySelector('input[name="sect"][value="night"]').checked=true;
  updateFields();clearError();markDirty();toast('已填入示例点位，点击“计算名号”查看结果。');
});
$('auto-example').addEventListener('click',async()=>{
  $('birth-date').value='2000-01-01';$('birth-time').value='12:00:00';$('place-search').value='北京';
  try{
    await initLocationData();places=await searchCityRecords('北京');if(!places.length)throw new Error();selectPlace(0);
    toast('已填入北京示例资料，点击“计算名号”查看结果。');
  }catch{showError('示例地点未能载入，请刷新后重试。');}
});
function readOptions(){
  const options={origin:option('letter-origin','aries'),selection:option('eleventh-selection','dignity'),triplicity:option('triplicity-choice','sect')};
  if((method==='almuten'||method==='luminary')&&!option('star-choice'))return fail('请先手动选择要用于取字的行星。',$('star-choice'));
  if(method==='eleventh'&&mode==='auto'&&!option('house-system'))return fail('请选择与你的排盘一致的宫制。',$('house-system'));
  return {method,options,selectedPlanet:option('star-choice')||undefined};
}
function readAuto(){
  if(!$('birth-date').value||!$('birth-date').checkValidity())return fail('请填写有效公历日期，范围为 1800—2100 年。',$('birth-date'));
  if(!$('birth-time').value||!$('birth-time').checkValidity())return fail('请填写有效出生时间。',$('birth-time'));
  for(const [id,label] of [['latitude','纬度'],['longitude','经度']]){
    if($(id).value===''||!$(id).checkValidity()||!Number.isFinite(Number($(id).value)))return fail('请搜索并选择地点，或手动填写有效'+label+'。',$(id));
  }
  if(!$('timezone').value.trim())return fail('请选择出生地历史时区，例如 Asia/Shanghai。',$('timezone'));
  if(!$('fold-panel').hidden&&$('time-fold').value==='')return fail('请选择重复时刻的第一次或第二次。',$('time-fold'));
  const changed=selectedPlace&&(Number($('latitude').value)!==selectedPlace.latitude||Number($('longitude').value)!==selectedPlace.longitude);
  return {mode:'auto',date:$('birth-date').value,time:$('birth-time').value,latitude:Number($('latitude').value),longitude:Number($('longitude').value),timezone:$('timezone').value.trim(),fold:$('time-fold').value===''?null:Number($('time-fold').value),houseSystem:method==='eleventh'?option('house-system'):null,place:($('place-search').value.trim()||'手动坐标')+(changed?'（已调整坐标）':'')};
}
function readManual(){
  const positions={};
  for(const key of requiredPoints()){
    const dms={};
    for(const part of ['sign','degree','minute','second']){
      const input=$(key+'-'+part);
      if(input.value===''||!input.checkValidity()||!Number.isFinite(Number(input.value)))return fail('请检查'+labels[key]+'的星座、度、分、秒。',input);
      dms[part]=input.value;
    }
    positions[key]=dms;
  }
  return {mode:'manual',positions,sect:document.querySelector('input[name="sect"]:checked').value};
}
function readName(){
  const text=$('name-text').value.trim();
  if(!text)return fail('请填写用于计算的姓名字母。',$('name-text'));
  const raw=$('name-components').value.trim();let components;
  if(raw){
    const parts=raw.split(/[\s,，、;；]+/);
    if(parts.some(value=>!/^\d{1,4}$/.test(value)))return fail('拆分项请用整数，以逗号或空格分隔。',$('name-components'));
    components=parts.map(Number);
  }
  return {method:'name',mode:'name',nameInput:{text,inputScript:$('name-input-script').value,outputScript:$('name-output-script').value,suffix:$('name-suffix').value,components}};
}
function readPayload(){
  if(method==='name')return readName();
  const common=readOptions();if(!common)return null;
  const input=mode==='auto'?readAuto():readManual();return input?{...input,...common}:null;
}
function inputSnapshot(){
  return JSON.stringify({method,mode,fields:[...document.querySelectorAll('#tool-view input,#tool-view select')].map(el=>[el.id||el.name,el.type==='radio'?el.checked:el.value])});
}
function showCandidate(index){
  const items=aggregate.candidates?.length?aggregate.candidates:[aggregate];
  const selected=items[index]||items[0];
  currentResult={...selected,candidateLabel:items.length>1?'并列候选 '+(index+1)+'/'+items.length+(selected.selectedPlanet?' · '+labels[selected.selectedPlanet]:''):'',candidateSummary:items.length>1?'并列候选：'+items.map(item=>(labels[item.selectedPlanet]||'候选')+' '+item.name.hebrew).join('；'):''};
  renderResult(currentResult);
  $('stale-notice').hidden=!dirty;syncResultActions();
  let chooser=$('candidate-chooser');
  if(!chooser){chooser=document.createElement('div');chooser.id='candidate-chooser';chooser.className='field candidate-chooser';document.querySelector('.name-display').before(chooser);}
  chooser.hidden=items.length<2;
  chooser.innerHTML=items.length>1?'<label for="candidate-choice">查看并列候选</label><select id="candidate-choice">'+items.map((item,i)=>'<option value="'+i+'"'+(i===index?' selected':'')+'>'+(labels[item.selectedPlanet]||'候选')+' · '+escapeHTML(item.name.transliteration)+'</option>').join('')+'</select>':'';
  if($('candidate-choice'))$('candidate-choice').addEventListener('change',event=>showCandidate(Number(event.target.value)));
  syncResultActions();
}
async function calculate(event){
  event.preventDefault();if(busy)return;clearError();closePlaces();
  const payload=readPayload();if(!payload)return;
  const snapshot=inputSnapshot(),version=++requestVersion;setBusy(true);
  try{
    const data=await calculateChart(payload,dataBase);
    if(version!==requestVersion)return;
    aggregate=data;dirty=inputSnapshot()!==snapshot;showCandidate(0);
    if(window.innerWidth<=800)document.querySelector('.result-panel').scrollIntoView({behavior:matchMedia('(prefers-reduced-motion: reduce)').matches?'auto':'smooth',block:'start'});
  }catch(error){
    if(version!==requestVersion)return;
    if(error.code==='ambiguous_time'){
      $('fold-panel').hidden=false;$('time-fold').innerHTML='<option value="">请选择对应的那一次</option>'+error.choices.map(choice=>'<option value="'+choice.fold+'">'+escapeHTML(choice.label)+'</option>').join('');
      $('fold-hint').textContent='请选择与出生记录对应的一次，再重新计算。';showError(error.message,$('time-fold'));
    }else showError(error.message||'计算未能完成，请检查输入。');
  }finally{if(version===requestVersion)setBusy(false);}
}
for(const id of ['auto-form','manual-form','name-form'])$(id).addEventListener('submit',calculate);
function toast(message){clearTimeout(toastTimer);$('toast').textContent=message;$('toast').hidden=false;toastTimer=setTimeout(()=>{$('toast').hidden=true;},4200);}
$('copy-result').addEventListener('click',async()=>{
  if(!currentResult||dirty||busy)return;const text=recordText(currentResult);
  try{await navigator.clipboard.writeText(text);toast('计算记录已复制。');}
  catch{const area=document.createElement('textarea');area.value=text;document.body.append(area);area.select();const copied=document.execCommand('copy');area.remove();toast(copied?'计算记录已复制。':'复制未完成，请保存结果图或打印。');}
});
$('print-result').addEventListener('click',()=>{
  if(!currentResult||dirty||busy)return;
  const wasOpen=$('meta-details').open;$('meta-details').open=true;window.print();$('meta-details').open=wasOpen;
});
$('save-image').addEventListener('click',async()=>{
  if(!currentResult||dirty||busy||exporting)return;
  const data=currentResult;exporting=true;syncResultActions();
  try{
    const blob=await resultImage(data);
    if(currentResult!==data||dirty){toast('资料已修改，请重新计算后保存。');return;}
    const link=document.createElement('a');link.href=URL.createObjectURL(blob);link.download='潮汐纪年社_'+data.method+(data.selectedPlanet?'_'+labels[data.selectedPlanet]:'')+'.png';link.click();setTimeout(()=>URL.revokeObjectURL(link.href),1000);toast('带水印的结果图已生成。');
  }catch(error){toast(error.message||'图片未能生成，请使用打印保存。');}
  finally{exporting=false;syncResultActions();}
});
function connectDialog(buttonId,dialogId,closeId){
  const button=$(buttonId),dialog=$(dialogId);
  button.addEventListener('click',()=>dialog.showModal());$(closeId).addEventListener('click',()=>dialog.close());
  dialog.addEventListener('close',()=>button.focus({preventScroll:true}));
  dialog.addEventListener('click',event=>{if(event.target!==dialog)return;const rect=dialog.getBoundingClientRect();if(event.clientX<rect.left||event.clientX>rect.right||event.clientY<rect.top||event.clientY>rect.bottom)dialog.close();});
}
connectDialog('help-button','help-dialog','close-help');connectDialog('contact-button','contact-dialog','close-contact');
function initLocationData(){
  if(locationLoading)return locationLoading;
  $('place-hint').textContent='正在载入城市资料，首次打开可能需要片刻…';
  locationLoading=Promise.all([initPlaces(dataBase),initTimezones(dataBase)]).then(async()=>{
    placesReady=true;const zones=await getTimezones();$('timezone-options').innerHTML=zones.map(zone=>'<option value="'+escapeHTML(zone)+'"></option>').join('');
    if(!selectedPlace&&!$('place-search').value)$('place-hint').textContent='中文、英文均可搜索，请选择匹配的城市。';
  }).catch(error=>{locationLoading=null;$('place-hint').textContent='城市或历史时区数据未能载入，请刷新重试。手动点位模式仍可使用。';throw error;});
  locationLoading.catch(()=>{});return locationLoading;
}
showRoute();
