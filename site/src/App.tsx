import {useCallback,useEffect,useMemo,useState} from 'react';
import type {ReactNode} from 'react';
import {DAO,ESCROW,TOKEN,TIERS,contributorRecords,explorerAccount,explorerTx,planCsv,readLive,reserveOf,runChecks,targetOf,timeOf,usd,view} from '../../shared/live.ts';
import type {ChainEvent,Check,ContributorRecord,LivePlan,LiveState,Tier} from '../../shared/live.ts';
import type {NearCampaign,NearCredit} from '../../shared/near.ts';
import {deriveLeg,formatAmount,isAccountId,parseDisplayAmount} from '../../shared/amounts.ts';
import {call,connect,connectedAccount,disconnect} from './wallet.ts';
import escrowWasmUrl from '../../contract/target/near/alltogether_escrow.wasm?url';
import tokenWasmUrl from '../../contract/target/near/alltogether_test_usd/alltogether_test_usd.wasm?url';

const REPO='https://github.com/aarash-mohsin/alltogether-near';
const RAW=`https://raw.githubusercontent.com/aarash-mohsin/alltogether-near/main/`;
const TOKEN_STORAGE='1250000000000000000000';
type Route={tab:'plans'|'people'|'start'|'dao'|'verify';plan:string|null};
const TABS:[Route['tab'],string][]=[['plans','Plans'],['people','People'],['start','Start a plan'],['dao','DAO'],['verify','Verify']];
function route():Route{
  const h=location.hash.replace(/^#\/?/,'');const m=/^plan\/(\d+)$/.exec(h);
  if(m)return {tab:'plans',plan:m[1]};
  return {tab:(TABS.some(([t])=>t===h)?h:'plans') as Route['tab'],plan:null};
}
const big=(v:string|bigint)=>BigInt(v);
const sum=(values:(string|bigint)[])=>values.reduce<bigint>((a,b)=>a+BigInt(b),0n);
const num=(v:string|bigint)=>formatAmount(v.toString()).replace(/\B(?=(\d{3})+(?!\d))/g,',');
const pct=(a:bigint,b:bigint)=>b===0n?0:Math.min(100,Number((a*1000n)/b)/10);
const shortTx=(h:string)=>h.slice(0,8)+'…';
const fmtTime=(ms:number)=>new Date(ms).toLocaleString(undefined,{day:'numeric',month:'short',hour:'2-digit',minute:'2-digit'});
const utc=(ms:number)=>new Date(ms).toISOString().replace('T',' ').slice(0,16)+' UTC';
const nsMs=(ns:string)=>timeOf(ns).getTime();
function until(ms:number,now:number){const d=ms-now;if(d<=0)return 'deadline passed';const days=Math.floor(d/86400000),hours=Math.floor(d%86400000/3600000);return days?`closes in ${days} day${days===1?'':'s'}${hours?`, ${hours} h`:''}`:`closes in ${hours} h ${Math.floor(d%3600000/60000)} min`;}
function U({v}:{v:string|bigint}){return <span className="usd">{num(v)}<small> testUSD</small></span>;}
function Acct({id}:{id:string}){return <a className="acct" href={explorerAccount(id)} target="_blank" rel="noreferrer">{id}</a>;}
function Tx({hash}:{hash:string}){return <a className="tx" href={explorerTx(hash)} target="_blank" rel="noreferrer">tx {shortTx(hash)}<span aria-hidden="true"> ↗</span></a>;}
function Badge({tier}:{tier:Tier}){return tier==='new'?null:<span className={`badge ${tier}`} title={TIERS[tier].rule}>{tier==='trusted'?'★ ':''}{TIERS[tier].label}</span>;}
function Pill({status}:{status:Check['status']|'RUN'}){return <span className={`pill ${status.toLowerCase()}`}>{status==='RUN'?<span className="dot-spin"/>:status}</span>;}
function Bar({value,max,done}:{value:bigint;max:bigint;done?:boolean}){return <div className={`bar${done?' done':''}`} role="progressbar" aria-valuemin={0} aria-valuemax={100} aria-valuenow={pct(value,max)}><i style={{width:`${pct(value,max)}%`}}/></div>;}

type Phase='open'|'awaiting'|'finalize'|'succeeded'|'failed';
function phaseOf(c:NearCampaign,now:number):Phase{
  if(c.state==='Succeeded')return 'succeeded';if(c.state==='Failed')return 'failed';
  if(now>=Number(c.terms.deadlineMs))return 'finalize';return c.state==='Open'?'open':'awaiting';
}
const PHASE:Record<Phase,[string,string]>={open:['Open for pledges','open'],awaiting:['Waiting for the DAO vote','wait'],finalize:['Deadline passed · ready to finalize','wait'],succeeded:['Succeeded · every budget funded','good'],failed:['Failed · everyone refunded','bad']};
function Status({c,now}:{c:NearCampaign;now:number}){const [label,tone]=PHASE[phaseOf(c,now)];return <span className={`status ${tone}`}>{label}</span>;}

function describe(e:ChainEvent,plans:LivePlan[]):{text:ReactNode;tone:string}{
  const plan=plans.find(p=>p.campaign.id===(e.data.campaign_id??String(e.data.credit_id??'').split(':')[0]));
  const leg=(i:number|null|undefined)=>i===null||i===undefined?'':plan?.campaign.terms.legs[i]?.title??`budget ${i+1}`;
  const credit=String(e.data.credit_id??'').split(':');
  switch(e.event){
    case 'campaign_created':return {text:<>Plan #{e.data.campaign_id} published by <Acct id={e.signer}/>, terms hash <code>{String(e.data.terms_hash).slice(0,12)}…</code></>,tone:'start'};
    case 'funds_accepted':return e.data.action==='sponsor'
      ?{text:<>DAO match arrived for plan #{e.data.campaign_id}: <U v={e.data.amount}/>, sent when the council approved proposal #{e.args?.id}</>,tone:'dao'}
      :{text:<><Acct id={e.data.sender_id}/> pledged <U v={e.data.amount}/> to {leg(e.leg)} on plan #{e.data.campaign_id}</>,tone:'in'};
    case 'pledge_removed':return {text:<><Acct id={e.signer}/> withdrew <U v={e.data.amount}/> from {leg(e.data.leg_id)} before the deadline</>,tone:'out'};
    case 'campaign_finalized':return e.data.state==='Succeeded'?{text:<>Plan #{e.data.campaign_id} finalized: <b>every budget reached its target</b>, beneficiaries can be paid</>,tone:'good'}:{text:<>Plan #{e.data.campaign_id} finalized: <b>a budget fell short</b>, nobody is paid and everyone is refunded</>,tone:'bad'};
    case 'refund_materialized':return {text:<><Acct id={e.signer}/> opened a refund of <U v={e.data.amount}/></>,tone:'out'};
    case 'transfer_started':return {text:<>Payout of <U v={e.data.amount}/> to <Acct id={e.data.recipient}/> started (attempt #{e.data.nonce})</>,tone:'quiet'};
    case 'transfer_resolved':{
      const who=credit[2]??'',kind=credit[1]==='beneficiary'?'beneficiary payout':credit[1]==='sponsor_refund'?'DAO reserve return':credit[1]==='refund'?'refund':'withdrawal';
      return e.data.success?{text:<>Paid <U v={e.data.amount}/> to <Acct id={who}/> ({kind}{credit[3]&&credit[3]!=='-'?`, ${leg(Number(credit[3]))}`:''})</>,tone:'good'}
        :{text:<>{kind[0].toUpperCase()+kind.slice(1)} of <U v={e.data.amount}/> to <Acct id={who}/> failed; the credit was restored for a retry</>,tone:'bad'};
    }
  }
  return {text:e.event,tone:'quiet'};
}

async function bytes(url:string){const r=await fetch(url,{cache:'no-store'});if(!r.ok)throw new Error(`HTTP ${r.status}`);return new Uint8Array(await r.arrayBuffer());}
interface WalletInfo {registered:boolean;balance:string;faucetClaimed:boolean;faucetLeft:number;}

export default function App(){
  const[r,setR]=useState<Route>(route());
  const[state,setState]=useState<LiveState|null>(null),[source,setSource]=useState<'live'|'snapshot'|'preview'|''>('');
  const[checks,setChecks]=useState<Check[]>([]),[shown,setShown]=useState(0),[error,setError]=useState(''),[loading,setLoading]=useState(true);
  const[account,setAccount]=useState(''),[info,setInfo]=useState<WalletInfo|null>(null);
  const[busy,setBusy]=useState(''),[notice,setNotice]=useState<{tone:'good'|'bad'|'info';text:ReactNode}|null>(null);
  const[now,setNow]=useState(Date.now());
  useEffect(()=>{const t=setInterval(()=>setNow(Date.now()),30000);return()=>clearInterval(t);},[]);
  useEffect(()=>{const f=()=>{setR(route());window.scrollTo({top:0});};addEventListener('hashchange',f);return()=>removeEventListener('hashchange',f);},[]);
  useEffect(()=>{void connectedAccount().then(setAccount);},[]);

  const load=useCallback(async(quiet=false)=>{
    if(!quiet){setLoading(true);setShown(0);setChecks([]);}setError('');
    // Show the recorded snapshot at once, then replace it with live chain data (a full read takes a few seconds).
    if(!quiet)void fetch('./snapshot.json').then(x=>x.json()).then((snap:LiveState)=>{setState(cur=>cur??snap);setSource(cur=>cur===''?'preview':cur);}).catch(()=>{});
    let value:LiveState,from:'live'|'snapshot'='live';
    try{
      value=await readLive();
      if(value.history_source==='unavailable'){const snap=await fetch('./snapshot.json').then(x=>x.json()).catch(()=>null) as LiveState|null;if(snap?.events?.length)value={...value,events:snap.events,history_source:'fastnear-tx-api',history_error:`Live history API unavailable; events from the snapshot recorded ${snap.observed_at}.`};}
    }catch(cause){
      const snap=await fetch('./snapshot.json').then(x=>x.json()).catch(()=>null) as LiveState|null;
      if(!snap){setError(`NEAR testnet RPC could not be reached: ${cause instanceof Error?cause.message:cause}`);setLoading(false);return;}
      value=snap;from='snapshot';
    }
    setState(value);setSource(from);setNow(Date.now());
    const wasm=async(raw:string,local:string)=>{try{return {bytes:await bytes(RAW+raw),from:'the GitHub repository'};}catch{try{return {bytes:await bytes(local),from:'the copy shipped with this page'};}catch{return {bytes:null,from:''};}}};
    const [e,t]=await Promise.all([wasm('contract/target/near/alltogether_escrow.wasm',escrowWasmUrl),wasm('contract/target/near/alltogether_test_usd/alltogether_test_usd.wasm',tokenWasmUrl)]);
    const result=await runChecks(value,{escrowWasm:e.bytes,tokenWasm:t.bytes,wasm_source:e.from});
    setChecks(result);if(quiet)setShown(result.length);setLoading(false);
  },[]);
  useEffect(()=>{void load();},[load]);
  useEffect(()=>{if(shown>=checks.length)return;const t=setTimeout(()=>setShown(n=>n+1),shown===0?250:140);return()=>clearTimeout(t);},[shown,checks.length]);

  const loadInfo=useCallback(async(id:string)=>{
    if(!id){setInfo(null);return;}
    try{
      const [storage,balance,faucet]=await Promise.all([view<any>(TOKEN,'storage_balance_of',{account_id:id}),view<string>(TOKEN,'ft_balance_of',{account_id:id}),view<any>(TOKEN,'get_faucet_status',{account_id:id})]);
      setInfo({registered:storage!==null,balance,faucetClaimed:Boolean(faucet?.claimed),faucetLeft:Number(faucet?.remainingAccounts??0)});
    }catch{setInfo(null);}
  },[]);
  useEffect(()=>{void loadInfo(account);},[account,loadInfo]);

  async function act(label:string,fn:()=>Promise<ReactNode>){
    setBusy(label);setNotice(null);
    try{const text=await fn();setNotice({tone:'good',text});await Promise.all([load(true),loadInfo(account)]);}
    catch(e){setNotice({tone:'bad',text:e instanceof Error?e.message:String(e)});}
    finally{setBusy('');}
  }
  async function needAccount(){if(account)return account;const id=await connect();setAccount(id);return id;}

  const records=useMemo(()=>state?contributorRecords(state):[],[state]);
  const passed=checks.filter(c=>c.status==='PASS').length,failed=checks.filter(c=>c.status==='FAIL').length;
  const totals=useMemo(()=>{
    if(!state)return null;
    const ev=state.events;
    return {
      plans:state.plans.length,
      matched:sum(ev.filter(e=>e.event==='funds_accepted'&&e.data.action==='sponsor').map(e=>e.data.amount)),
      pledged:sum(ev.filter(e=>e.event==='funds_accepted'&&e.data.action==='pledge').map(e=>e.data.amount)),
      paid:sum(state.plans.flatMap(p=>p.beneficiary_credits.map(c=>c?.paid??'0'))),
      refunded:sum(state.plans.flatMap(p=>[p.sponsor_refund?.paid??'0',...p.contributors.flatMap(x=>x.credits.filter(c=>c.kind==='refund').map(c=>c.paid))])),
      people:records.length,
    };
  },[state,records]);

  const plan=r.plan&&state?state.plans.find(p=>p.campaign.id===r.plan)??null:null;
  return <>
    <div className="strip"><span className="live-dot"/>Live on NEAR testnet · reads public RPC from your browser · nothing is signed unless you connect a wallet<span className="strip-right">ALLTOGETHER / LIVE</span></div>
    <header className="top">
      <a className="brand" href="#/plans" aria-label="AllTogether home"><span className="brand-mark" aria-hidden="true"><i/><i/><i/></span><span>AllTogether<span className="brand-dot">.</span></span></a>
      <nav aria-label="Sections">{TABS.map(([id,label])=><a key={id} href={`#/${id}`} className={r.tab===id?'active':''} aria-current={r.tab===id?'page':undefined}>{label}</a>)}<a href={REPO} target="_blank" rel="noreferrer" className="ext">Code ↗</a></nav>
      <div className="wallet">{account?<><span className="wallet-chip" title={account}><span className="live-dot"/>{account}</span>{info&&<span className="wallet-bal"><U v={info.balance}/></span>}<button className="link" disabled={Boolean(busy)} onClick={()=>void disconnect().then(()=>setAccount(''))}>Disconnect</button></>
        :<button className="btn ghost" disabled={Boolean(busy)} onClick={()=>void act('connect',async()=>{const id=await connect();setAccount(id);return <>Connected as <b>{id}</b>.</>;})}>{busy==='connect'?'Opening wallet…':'Connect testnet wallet'}</button>}</div>
    </header>
    <main>
      {error&&<p className="banner bad">{error} <button className="link" onClick={()=>void load()}>Try again</button></p>}
      {source==='preview'&&<p className="banner quiet"><span className="dot-spin"/>Showing the snapshot recorded {state&&utc(Date.parse(state.observed_at))} while live data loads from NEAR testnet…</p>}
      {source==='snapshot'&&<p className="banner">The public RPC is unreachable right now, so this page shows the snapshot recorded {state&&utc(Date.parse(state.observed_at))}. <button className="link" onClick={()=>void load()}>Retry live</button></p>}
      {notice&&<p className={`banner ${notice.tone}`} role="status">{notice.text}<button className="link close" aria-label="Dismiss" onClick={()=>setNotice(null)}>×</button></p>}

      {r.tab==='plans'&&!r.plan&&<>
        <section className="hero">
          <div>
            <p className="eyebrow">COMMUNITY FUNDING · SPUTNIK DAO MATCH · ALL OR NOTHING</p>
            <h1>Fund the whole plan, or nobody gets stranded.</h1>
            <p className="lead">A community plan needs several things at once: a venue, tools, access. AllTogether funds them together. A <b>Sputnik DAO</b> votes to match each budget, people pledge from their own wallets, and at the deadline either <b>every budget is paid</b> or <b>everyone gets their money back</b>, the DAO included.</p>
            <div className="cta-row">
              <a className="btn primary big" href={`#/plan/${state?.plans.find(p=>phaseOf(p.campaign,now)==='open')?.campaign.id??'4'}`}>Pledge from your wallet →</a>
              <button className="btn ghost big" onClick={()=>document.getElementById('demo')?.scrollIntoView({behavior:'smooth'})}>▶ Watch the 2-minute demo</button>
              <a className="btn ghost big" href="#/verify">Check the chain</a>
            </div>
            <p className="asset-id"><code>{ESCROW}</code> <a href={explorerAccount(ESCROW)} target="_blank" rel="noreferrer">explorer ↗</a></p>
          </div>
          <aside className="summary" aria-live="polite">
            <div><small>Plans on chain</small><strong>{totals?totals.plans:'…'}</strong><span className="sub">{state?`${state.plans.filter(p=>phaseOf(p.campaign,now)==='open').length} open for pledges`:''}</span></div>
            <div><small>Matched by the DAO</small><strong>{totals?<U v={totals.matched}/>:'…'}</strong><span className="sub">{state?`${state.proposals.filter(p=>p.status==='Approved').length} proposals approved`:''}</span></div>
            <div><small>Paid to beneficiaries</small><strong className="good">{totals?<U v={totals.paid}/>:'…'}</strong><span className="sub">only from plans that fully succeeded</span></div>
            <div><small>Refunded</small><strong>{totals?<U v={totals.refunded}/>:'…'}</strong><span className="sub">to contributors and the DAO</span></div>
          </aside>
        </section>
        <HowItWorks/>
        {loading&&!state&&<p className="muted pad">Reading the escrow, the DAO and every transaction from NEAR testnet…</p>}
        {state&&<>
          {state.plans.filter(p=>phaseOf(p.campaign,now)==='open').map(p=><Featured key={p.campaign.id} plan={p} now={now}/>)}
          <Demo/>
          <section className="block">
            <p className="eyebrow">PUBLIC BOARD · list_campaigns</p>
            <h2>Every plan and how it ended.</h2>
            <div className="board">{[...state.plans].reverse().map(p=><PlanCard key={p.campaign.id} plan={p} now={now}/>)}</div>
          </section>
        </>}
      </>}

      {r.tab==='plans'&&r.plan&&(!state?<p className="muted pad">Loading plan #{r.plan}…</p>:!plan?<p className="pad">There is no plan #{r.plan}. <a href="#/plans">Back to all plans</a></p>:
        <PlanPage plan={plan} state={state} records={records} now={now} account={account} info={info} busy={busy} act={act} needAccount={needAccount}/>)}

      {r.tab==='people'&&<People records={records} loading={!state}/>}
      {r.tab==='start'&&<StartPlan state={state} records={records} account={account} busy={busy} act={act} needAccount={needAccount}/>}
      {r.tab==='dao'&&<DaoPage state={state}/>}

      {r.tab==='verify'&&<section className="block">
        <div className="section-head"><div><p className="eyebrow">DATA ROOM · CHECKED LIVE IN YOUR BROWSER</p><h2>Don't trust the README. Check the chain.</h2></div><button className="btn ghost" onClick={()=>void load()} disabled={loading}>{loading?'Checking…':'Run the checks again ↻'}</button></div>
        <p className="muted wide">Each line is computed now from public NEAR testnet RPC and the escrow's transaction history: the account keys, the deployed code, the books, every plan's terms hash, the DAO proposals and every payout.</p>
        <ol className="checks">{checks.map((c,i)=><li key={c.id} className={i<shown?'in':''}><Pill status={i<shown?c.status:'RUN'}/><div><h3>{c.title}</h3><p>{c.detail}</p>{c.txs.length>0&&<p className="txs">{c.txs.slice(0,4).map(t=><Tx key={t} hash={t}/>)}</p>}</div></li>)}</ol>
        {checks.length>0&&shown>=checks.length&&<div className={`verdict ${failed?'bad':''}`}><strong>{passed} passed, {failed} failed</strong><span>The same checks run from a terminal: <code>pnpm install && npm run verify</code></span></div>}
      </section>}
    </main>
    <footer><span className="brand small"><span>AllTogether<span className="brand-dot">.</span></span></span><p>Every essential budget funded together, or everyone refunded. A real Sputnik DAO matches each plan. Built for the NEAR Hackathon, Social Money track.</p><p className="muted">Testnet only, with a valueless test token. A funded plan proves the money was raised and paid, not that the venue delivered.</p></footer>
  </>;
}

function Legs({c,compact}:{c:NearCampaign;compact?:boolean}){
  const closing=c.closing_active??c.active;
  return <div className={`legs${compact?' compact':''}`}>{c.terms.legs.map((l,i)=>{
    const have=big(closing[i]),target=big(l.communityTarget),full=have===target;
    return <div className="leg" key={i}>
      <div className="leg-head"><b>{l.title}</b>{!compact&&<span className="muted">{l.purpose}</span>}<span className="leg-num"><U v={have}/> <span className="muted">of {num(target)}</span></span></div>
      <Bar value={have} max={target} done={full}/>
      {!compact&&<p className="leg-foot"><span>DAO match <U v={l.sponsorAllocation}/></span><span>Budget <U v={l.budget}/> → <Acct id={l.beneficiary}/></span><span className={full?'good':''}>{full?'Target reached':`${num(target-have)} testUSD to go`}</span></p>}
    </div>;})}</div>;
}
function Featured({plan,now}:{plan:LivePlan;now:number}){
  const c=plan.campaign,have=sum(c.active),target=targetOf(c);
  return <section className="featured">
    <div className="featured-main">
      <p className="eyebrow">OPEN NOW · PLAN #{c.id} · {until(Number(c.terms.deadlineMs),now).toUpperCase()}</p>
      <h2>{c.terms.title}</h2>
      <p className="lead small">{c.terms.summary}</p>
      <div className="featured-total"><U v={have}/><span className="muted"> pledged of {num(target)} testUSD, plus <U v={reserveOf(c)}/> from the DAO</span></div>
      <Bar value={have} max={target}/>
      <a className="btn primary" href={`#/plan/${c.id}`}>Pledge from your wallet →</a>
      <p className="muted tiny">Free to try: connect any NEAR testnet wallet, claim 1,000 testUSD from the demo faucet, pledge to one budget.</p>
    </div>
    <Legs c={c} compact/>
  </section>;
}
function PlanCard({plan,now}:{plan:LivePlan;now:number}){
  const c=plan.campaign;
  return <a className="plan-card" href={`#/plan/${c.id}`}>
    <div className="plan-card-head"><span className="muted">#{c.id}</span><Status c={c} now={now}/></div>
    <h3>{c.terms.title}</h3>
    <p className="muted">{c.terms.legs.length} budgets · {c.participant_count} contributor{c.participant_count===1?'':'s'} · DAO match <U v={reserveOf(c)}/>{plan.proposal?` · proposal #${plan.proposal.id}`:''}</p>
    <Legs c={c} compact/>
    <p className="muted tiny">Organizer {c.terms.organizer} · deadline {utc(Number(c.terms.deadlineMs))}</p>
  </a>;
}

interface PlanProps {plan:LivePlan;state:LiveState;records:ContributorRecord[];now:number;account:string;info:WalletInfo|null;busy:string;act:(label:string,fn:()=>Promise<ReactNode>)=>Promise<void>;needAccount:()=>Promise<string>;}
function PlanPage({plan,state,records,now,account,info,busy,act,needAccount}:PlanProps){
  const c=plan.campaign,phase=phaseOf(c,now);
  const[leg,setLeg]=useState(()=>{const i=c.terms.legs.findIndex((l,j)=>big(c.active[j])<big(l.communityTarget));return i<0?0:i;});
  const[amount,setAmount]=useState('100');
  const mine=plan.contributors.find(x=>x.account_id===account);
  const events=state.events.filter(e=>(e.data.campaign_id??String(e.data.credit_id??'').split(':')[0])===c.id&&e.event!=='transfer_started').reverse();
  const remaining=big(c.terms.legs[leg].communityTarget)-big(c.active[leg]);
  const claimable:{credit:NearCredit;label:ReactNode}[]=[
    ...plan.beneficiary_credits.flatMap((cr,i)=>cr&&big(cr.available)>0n&&big(cr.pending)===0n?[{credit:cr,label:<><span>Pay {num(cr.available)} testUSD to {c.terms.legs[i].title}</span><small>{cr.recipient}</small></>}]:[]),
    ...(plan.sponsor_refund&&big(plan.sponsor_refund.available)>0n?[{credit:plan.sponsor_refund,label:<><span>Return {num(plan.sponsor_refund.available)} testUSD to the DAO</span><small>{plan.sponsor_refund.recipient}</small></>}]:[]),
  ];
  const myCredits=(mine?.credits??[]).filter(cr=>(cr.kind==='refund'||cr.kind==='withdrawal')&&big(cr.available)>0n);
  const myRefundable=phase==='failed'&&(mine?.positions??[]).some(p=>!p.refund_consumed&&big(p.active)>0n);
  const claim=(cr:NearCredit)=>act(`claim-${cr.id}`,async()=>{await needAccount();const res=await call(ESCROW,{method:'claim_credit',args:{credit_key:cr.id},deposit:'1',gas:'120000000000000'});return <>Payout sent: <U v={cr.available}/> to {cr.recipient}. <Tx hash={res.hash}/></>;});
  function download(){const url=URL.createObjectURL(new Blob([planCsv(state,c.id)],{type:'text/csv'}));const a=document.createElement('a');a.href=url;a.download=`alltogether-plan-${c.id}.csv`;a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);}

  return <>
    <section className="plan-hero">
      <a className="back" href="#/plans">← All plans</a>
      <div className="plan-title"><div><p className="eyebrow">PLAN #{c.id} · {c.terms.legs.length} BUDGETS · ONE DEADLINE</p><h1>{c.terms.title}</h1></div><Status c={c} now={now}/></div>
      <p className="lead">{c.terms.summary}</p>
      {c.terms.detail&&<p className="muted wide">{c.terms.detail}</p>}
      <dl className="facts">
        <div><dt>Deadline</dt><dd>{utc(Number(c.terms.deadlineMs))}<span className="muted"> · {until(Number(c.terms.deadlineMs),now)}</span></dd></div>
        <div><dt>Organizer</dt><dd><Acct id={c.terms.organizer}/> {(()=>{const o=records.find(x=>x.account_id===c.terms.organizer);return o?<><Badge tier={o.tier}/><span className="muted tiny"> · organized {o.organized}, {o.organized_completed} completed</span></>:null;})()}</dd></div>
        <div><dt>DAO match</dt><dd><U v={reserveOf(c)}/>{plan.proposal&&<span className="muted"> · proposal #{plan.proposal.id} {plan.proposal.status}</span>}</dd></div>
        <div><dt>Terms hash</dt><dd><code title={c.terms_hash}>{c.terms_hash.slice(0,16)}…</code></dd></div>
      </dl>
    </section>
    <div className="plan-grid">
      <section className="panel">
        <h3>Budgets</h3>
        <p className="muted">Each budget has its own target. The plan pays out only if <b>all</b> of them are reached by the deadline.</p>
        <Legs c={c}/>
      </section>
      <aside className="panel action">
        {phase==='open'&&<>
          <h3>Pledge from your wallet</h3>
          <ol className="steps">
            <li className={account?'done':''}><span>1</span><div><b>Connect a NEAR testnet wallet</b>{account?<p className="muted">Connected as {account}</p>:<button className="btn ghost" disabled={Boolean(busy)} onClick={()=>void act('connect',async()=>{const id=await needAccount();return <>Connected as <b>{id}</b>.</>;})}>Connect wallet</button>}</div></li>
            <li className={info&&info.registered&&big(info.balance)>0n?'done':''}><span>2</span><div><b>Get testUSD</b>{!account?<p className="muted">Register with the test token, then claim 1,000 testUSD once from its demo faucet.</p>
              :!info?<p className="muted">Reading your balance…</p>
              :!info.registered?<button className="btn ghost" disabled={Boolean(busy)} onClick={()=>void act('register',async()=>{const res=await call(TOKEN,{method:'storage_deposit',args:{account_id:account,registration_only:true},deposit:TOKEN_STORAGE,gas:'30000000000000'});return <>Registered with testUSD (0.00125 NEAR storage). <Tx hash={res.hash}/></>;})}>{busy==='register'?'Waiting for wallet…':'Register with testUSD (0.00125 NEAR)'}</button>
              :!info.faucetClaimed?<button className="btn ghost" disabled={Boolean(busy)} onClick={()=>void act('faucet',async()=>{const res=await call(TOKEN,{method:'demo_faucet',args:{},deposit:'1',gas:'100000000000000'});return <>1,000 testUSD claimed from the demo faucet. <Tx hash={res.hash}/></>;})}>{busy==='faucet'?'Waiting for wallet…':'Claim 1,000 testUSD'}</button>
              :<p className="muted">You hold <U v={info.balance}/>. The faucet gives each account 1,000 once.</p>}</div></li>
            <li><span>3</span><div><b>Pledge to one budget</b>
              <label className="field">Budget<select value={leg} onChange={e=>setLeg(Number(e.target.value))}>{c.terms.legs.map((l,i)=><option key={i} value={i} disabled={big(c.active[i])>=big(l.communityTarget)}>{l.title} · {num(big(l.communityTarget)-big(c.active[i]))} to go</option>)}</select></label>
              <label className="field">Amount (testUSD)<input inputMode="decimal" value={amount} onChange={e=>setAmount(e.target.value)}/></label>
              <button className="btn primary" disabled={Boolean(busy)||!account||!info?.registered} onClick={()=>void act('pledge',async()=>{
                const units=parseDisplayAmount(amount);
                if(big(units)<=0n)throw new Error('Enter a positive amount.');
                if(big(units)>remaining)throw new Error(`${c.terms.legs[leg].title} only needs ${num(remaining)} more testUSD. A larger pledge would be returned by the token in full.`);
                if(info&&big(units)>big(info.balance))throw new Error(`You hold ${num(info.balance)} testUSD.`);
                const res=await call(TOKEN,{method:'ft_transfer_call',args:{receiver_id:ESCROW,amount:units,memo:`AllTogether campaign ${c.id}`,msg:JSON.stringify({v:1,action:'pledge',campaign_id:c.id,terms_hash:c.terms_hash,leg_id:leg})},deposit:'1',gas:'150000000000000'});
                if(res.value==='0')throw new Error('The escrow returned the pledge in full (the budget filled up or the deadline passed). Your testUSD is back in your wallet.');
                return <>Pledged <U v={units}/> to {c.terms.legs[leg].title}. It counts only if every budget is reached; otherwise it comes back to you. <Tx hash={res.hash}/></>;
              })}>{busy==='pledge'?'Waiting for wallet…':`Pledge to ${c.terms.legs[leg].title}`}</button>
              <p className="muted tiny">Signs <code>ft_transfer_call</code> on testUSD with the plan's terms hash. Over-target or late pledges are returned automatically.</p>
            </div></li>
          </ol>
          {mine&&mine.positions.some(p=>big(p.active)>0n)&&<div className="mine"><h4>Your pledges</h4>{mine.positions.map((p,i)=>big(p.active)>0n&&<p key={i}><span>{c.terms.legs[i].title}: <U v={p.active}/></span><button className="link" disabled={Boolean(busy)} onClick={()=>void act('withdraw',async()=>{
            const res=await call(ESCROW,{method:'remove_pledge',args:{campaign_id:c.id,leg_id:i,amount:p.active},deposit:'0'});
            const back=await call(ESCROW,{method:'claim_credit',args:{credit_key:`${c.id}:withdrawal:${account}:-`},deposit:'1',gas:'120000000000000'});
            return <>Withdrew <U v={p.active}/> and sent it back to your wallet. <Tx hash={res.hash}/> <Tx hash={back.hash}/></>;
          })}>Withdraw before the deadline</button></p>)}</div>}
        </>}
        {phase==='awaiting'&&<><h3>Waiting for the DAO</h3><p className="muted">This plan opens only when the DAO's matching reserve actually arrives in the escrow. A proposal being approved is not enough on its own.</p>
          {plan.proposal?<p className="muted">DAO proposal #{plan.proposal.id}: <b>{plan.proposal.status}</b>. The council votes on it in the DAO.</p>
          :<button className="btn primary" disabled={Boolean(busy)} onClick={()=>void act('proposal',async()=>{const id=await needAccount();const rec=records.find(x=>x.account_id===id);const res=await fileProposal(c,rec);return <>DAO proposal #{String(res.value)} filed. The council can now vote on it. <Tx hash={res.hash}/></>;})}>{busy==='proposal'?'Waiting for wallet…':'File the DAO match proposal (1 NEAR bond)'}</button>}</>}
        {phase==='finalize'&&<><h3>Anyone can finalize</h3><p className="muted">The deadline has passed. Finalizing locks the result: if every budget reached its target, each beneficiary is owed its full budget; otherwise every contributor and the DAO get their money back.</p>
          <p className="muted">Right now: {c.terms.legs.every((l,i)=>c.active[i]===l.communityTarget)?<b className="good">every budget is full, so this plan will succeed.</b>:<b className="bad">at least one budget is short, so this plan will fail and refund.</b>}</p>
          <button className="btn primary" disabled={Boolean(busy)} onClick={()=>void act('finalize',async()=>{await needAccount();const res=await call(ESCROW,{method:'finalize',args:{campaign_id:c.id},deposit:'0'});return <>Plan #{c.id} finalized. <Tx hash={res.hash}/></>;})}>{busy==='finalize'?'Waiting for wallet…':'Finalize this plan'}</button></>}
        {(phase==='succeeded'||phase==='failed')&&<>
          <h3>{phase==='succeeded'?'Every budget was funded':'A budget fell short'}</h3>
          <p className="muted">{phase==='succeeded'?'Each beneficiary is owed exactly its budget: the community pledges plus the DAO match. Anyone can trigger a payout; it can only go to the fixed beneficiary.':'No beneficiary is paid. Each contributor can take back exactly what they pledged, and the DAO\'s reserve goes back to the DAO.'}</p>
          {claimable.length>0?claimable.map(x=><button key={x.credit.id} className="btn primary block" disabled={Boolean(busy)} onClick={()=>void claim(x.credit)}>{busy===`claim-${x.credit.id}`?'Waiting for wallet…':x.label}</button>)
            :<p className="good small-note">{phase==='succeeded'?'All payouts have been sent.':'The DAO reserve has been returned.'}</p>}
          {myRefundable&&<button className="btn primary block" disabled={Boolean(busy)} onClick={()=>void act('refund',async()=>{
            const res=await call(ESCROW,{method:'materialize_refund',args:{campaign_id:c.id},deposit:'0'});
            const back=await call(ESCROW,{method:'claim_credit',args:{credit_key:`${c.id}:refund:${account}:-`},deposit:'1',gas:'120000000000000'});
            return <>Your refund is back in your wallet. <Tx hash={res.hash}/> <Tx hash={back.hash}/></>;})}>Get my refund</button>}
          {myCredits.map(cr=><button key={cr.id} className="btn primary block" disabled={Boolean(busy)} onClick={()=>void claim(cr)}><span>Send my {num(cr.available)} testUSD back to my wallet</span></button>)}
        </>}
      </aside>
    </div>
    <section className="block">
      <div className="section-head"><div><p className="eyebrow">CONTRIBUTORS · get_account_campaign</p><h2>Who backed it.</h2></div><button className="btn ghost" onClick={download}>Download CSV</button></div>
      {plan.contributors.length===0?<p className="muted">No pledges yet. Be the first.</p>:
      <div className="table-wrap"><table><thead><tr><th>Account</th>{c.terms.legs.map(l=><th key={l.legId}>{l.title}</th>)}<th>Outcome</th></tr></thead><tbody>
        {plan.contributors.map(x=>{const refund=x.credits.find(cr=>cr.kind==='refund');return <tr key={x.account_id}><td><a href={`#/people`} onClick={()=>sessionStorage.setItem('alltogether.person',x.account_id)}>{x.account_id}</a> {(()=>{const o=records.find(y=>y.account_id===x.account_id);return o?<Badge tier={o.tier}/>:null;})()}</td>
          {x.positions.map((p,i)=><td key={i}>{big(p.accepted_total)>0n?<U v={phase==='failed'?p.accepted_total:p.active}/>:<span className="muted">—</span>}</td>)}
          <td>{phase==='succeeded'?<span className="good">Paid to beneficiaries</span>:phase==='failed'?(refund&&big(refund.paid)>0n?<span>Refunded <U v={refund.paid}/></span>:<span className="muted">Refund waiting to be claimed</span>):<span className="muted">Active until the deadline</span>}</td></tr>;})}
      </tbody></table></div>}
    </section>
    <section className="block">
      <p className="eyebrow">ACTIVITY · {events.length} EVENTS FROM THE ESCROW</p>
      <h2>The plan's history, newest first.</h2>
      <ol className="events">{events.map((e,i)=>{const d=describe(e,state.plans);return <li key={e.tx+i} className={d.tone}><div><p className="meta">{fmtTime(nsMs(e.at))} · signed by {e.signer} · <code>{e.method}</code></p><p>{d.text}</p></div><Tx hash={e.tx}/></li>;})}</ol>
    </section>
  </>;
}

function People({records,loading}:{records:ContributorRecord[];loading:boolean}){
  const[query,setQuery]=useState(()=>sessionStorage.getItem('alltogether.person')??'');
  const[open,setOpen]=useState<string>(()=>sessionStorage.getItem('alltogether.person')??'');
  useEffect(()=>{sessionStorage.removeItem('alltogether.person');},[]);
  const found=query.trim()?records.find(x=>x.account_id===query.trim().toLowerCase()):null;
  return <section className="block">
    <p className="eyebrow">CONTRIBUTOR RECORDS · NAMED ACCOUNTS · FROM CHAIN EVENTS</p>
    <h2>Every backer's track record.</h2>
    <p className="muted wide">A named NEAR account's history across all plans: what it backed, which plans it helped complete, and what came back from plans that failed. Rebuilt from the escrow's pledge events and each account's live position. No profile, no sign-up.</p>
    <Reputation/>
    <form className="lookup-row" onSubmit={e=>{e.preventDefault();setOpen(query.trim().toLowerCase());}}><input value={query} onChange={e=>setQuery(e.target.value)} placeholder="account.testnet" aria-label="Account to look up"/><button className="btn ghost">Look up</button></form>
    {query.trim()&&!found&&!loading&&<p className="muted">No pledges from <b>{query.trim()}</b> yet.</p>}
    {loading?<p className="muted">Reading pledge events…</p>:
    <div className="people">{records.map(x=><article key={x.account_id} className={`person${open===x.account_id?' open':''}`}>
      <button className="person-head" onClick={()=>setOpen(open===x.account_id?'':x.account_id)} aria-expanded={open===x.account_id}>
        <span className="person-name">{x.account_id} <Badge tier={x.tier}/></span>
        <span className="person-stats">{x.organized>0&&<span><b>{x.organized}</b> organized</span>}<span><b>{x.backed}</b> backed</span><span className="good"><b>{x.succeeded}</b> completed</span><span><b>{x.failed}</b> refunded</span>{x.open>0&&<span><b>{x.open}</b> open</span>}</span>
        <span className="person-money"><U v={x.paid_to_beneficiaries}/> <small className="muted">reached beneficiaries</small></span>
      </button>
      {open===x.account_id&&<div className="person-body">
        <p className="muted">Pledged <U v={x.pledged}/> in total · <U v={x.paid_to_beneficiaries}/> went to beneficiaries of completed plans · <U v={x.refunded}/> refunded{big(x.refund_waiting)>0n&&<> · <U v={x.refund_waiting}/> refund still to claim</>}</p>
        <ul>{x.contributions.map((c,i)=><li key={c.tx+i}><a href={`#/plan/${c.campaign_id}`}>#{c.campaign_id} {c.title}</a><span>{c.leg_title}</span><U v={c.amount}/><span className={`status ${c.state==='Succeeded'?'good':c.state==='Failed'?'bad':'open'}`}>{c.state==='Succeeded'?'completed':c.state==='Failed'?'refunded':'open'}</span><Tx hash={c.tx}/></li>)}</ul>
      </div>}
    </article>)}</div>}
  </section>;
}

function DaoPage({state}:{state:LiveState|null}){
  return <section className="block">
    <p className="eyebrow">SPUTNIK DAO · {DAO}</p>
    <h2>Leave the multisig alone. Build what the community does with it.</h2>
    <p className="muted wide">AllTogether does not fork or extend the DAO. It uses a stock Sputnik DAO v2 exactly as deployed, and adds the funding rules around it in a separate, keyless escrow.</p>
    <div className="compare">
      <div className="panel"><h3>Already in Sputnik DAO, used as is</h3><ul>
        <li>The DAO account holds the community treasury (testUSD)</li>
        <li>Roles and policy: a council group whose majority approves (threshold 1/2)</li>
        <li><code>add_proposal</code>, open to everyone, with a 1 NEAR bond</li>
        <li><code>act_proposal</code> <code>VoteApprove</code> / <code>VoteReject</code> by the council</li>
        <li>The <code>FunctionCall</code> proposal kind, executed by the DAO on approval</li>
        <li>Proposal expiry after 7 days</li>
      </ul></div>
      <div className="panel accent"><h3>Added by AllTogether</h3><ul>
        <li>Plan terms are hashed; the proposal and every pledge must quote that hash</li>
        <li>A match counts only when the tokens <b>arrive</b>: approval alone does not open a plan</li>
        <li>All-or-nothing across up to three budgets with one deadline</li>
        <li>On failure the DAO's reserve becomes a credit that can only go back to the DAO</li>
        <li>Exact contributor refunds; over-target and late pledges returned by the token resolver</li>
        <li>Payouts are separate and retryable, and pay exactly once</li>
        <li>This public board, per-account records and a CSV per plan</li>
      </ul></div>
    </div>
    <h3 className="spaced">Proposals on chain</h3>
    {!state?<p className="muted">Reading proposals…</p>:<div className="table-wrap"><table><thead><tr><th>#</th><th>Plan</th><th>Asks the DAO to send</th><th>Votes</th><th>Status</th><th>Executed in</th></tr></thead><tbody>
      {[...state.proposals].reverse().map(p=>{const plan=state.plans.find(x=>x.campaign.id===p.campaign_id);const exec=state.events.find(e=>e.event==='funds_accepted'&&e.data.action==='sponsor'&&e.data.campaign_id===p.campaign_id&&e.args?.id===p.id);
        return <tr key={p.id}><td>{p.id}</td><td>{plan?<a href={`#/plan/${plan.campaign.id}`}>#{plan.campaign.id} {plan.campaign.terms.title}</a>:<span className="muted">—</span>}</td><td>{p.amount?<U v={p.amount}/>:<span className="muted">other</span>} {p.terms_hash&&<span className="muted tiny">terms {p.terms_hash.slice(0,10)}…</span>}</td><td>{Object.entries(p.votes).map(([who,v])=><span key={who} className="vote">{who.split('.')[0]}: {v}</span>)}</td><td><span className={`status ${p.status==='Approved'?'good':p.status==='InProgress'?'open':'bad'}`}>{p.status}</span></td><td>{exec?<Tx hash={exec.tx}/>:<span className="muted">—</span>}</td></tr>;})}
    </tbody></table></div>}
    <p className="muted tiny note">Council: <Acct id="at-rel-council-mw4f9nmo.testnet"/> · policy: a proposal passes with more than half of the council (one member on testnet) · bond 1 NEAR, returned on approval.</p>
  </section>;
}

function HowItWorks(){
  const steps:[string,string,string][]=[
    ['1','An organizer publishes a plan','Up to three budgets, each with a fixed beneficiary, and one deadline. The terms are hashed and can never change.'],
    ['2','The DAO votes to match it','A Sputnik DAO proposal sends the exact match to the escrow. The plan opens only when that money arrives.'],
    ['3','People pledge from their wallets','Each pledge goes to one budget and quotes the terms hash. Too much, or too late, comes straight back.'],
    ['4','One deadline decides','Every budget full: every beneficiary is paid. Any budget short: everyone is refunded, the DAO included.'],
  ];
  return <section className="how" aria-label="How it works">{steps.map(([n,t,d])=><div key={n}><span>{n}</span><h3>{t}</h3><p>{d}</p></div>)}</section>;
}
function Demo(){
  const[ok,setOk]=useState(true);
  if(!ok)return null;
  return <section className="block demo" id="demo">
    <div className="demo-text"><p className="eyebrow">THE DEMO · 2 MINUTES · REAL TESTNET DATA</p><h2>See a plan fail, a plan pay out, and the DAO vote that opened them.</h2>
      <p className="muted">Every screen in the video is this page reading NEAR testnet. Then try it yourself: connect a wallet, claim 1,000 testUSD and pledge to the open plan.</p></div>
    <video controls preload="none" poster="./demo-poster.jpg" src="./demo.mp4" onError={()=>setOk(false)} aria-label="AllTogether demo video, captions burned in"/>
  </section>;
}
function Reputation(){
  return <div className="rep">{(['new','backer','trusted'] as Tier[]).map(t=><div key={t} className={`rep-tier ${t}`}><p className="rep-name">{t==='new'?<span className="badge none">New</span>:<Badge tier={t}/>}</p><p><b>{TIERS[t].rule}.</b></p><p className="muted">Unlocks: {TIERS[t].unlocks}.</p></div>)}</div>;
}
async function fileProposal(c:NearCampaign,rec:ContributorRecord|undefined){
  const policy=await view<any>(DAO,'get_policy');
  const reserve=c.terms.legs.reduce((n,l)=>n+big(l.sponsorAllocation),0n).toString();
  const inner={receiver_id:ESCROW,amount:reserve,memo:`AllTogether campaign ${c.id}`,msg:JSON.stringify({v:1,action:'sponsor',campaign_id:c.id,terms_hash:c.terms_hash})};
  let raw='';for(const b of new TextEncoder().encode(JSON.stringify(inner)))raw+=String.fromCharCode(b);
  const record=rec?`Organizer record (from chain events): ${rec.organized} organized, ${rec.organized_completed} completed; ${rec.succeeded} completed plans backed; tier ${TIERS[rec.tier].label}.`:'Organizer record: no plans yet.';
  const description=`${rec?.tier==='trusted'?'[Trusted organizer] ':''}AllTogether ${c.id}: ${c.terms.title}\nTerms SHA-256: ${c.terms_hash}\nOne deadline: ${c.terms.deadlineMs}\nAll earmarked budgets must succeed.\n${c.terms.legs.map(l=>`${l.title}: ${l.budget} base units to ${l.beneficiary}`).join('\n')}\n${record}`;
  return call(DAO,{method:'add_proposal',args:{proposal:{description,kind:{FunctionCall:{receiver_id:TOKEN,actions:[{method_name:'ft_transfer_call',args:btoa(raw),deposit:'1',gas:'100000000000000'}]}}}},deposit:policy.proposal_bond,gas:'100000000000000'});
}
interface LegDraft {title:string;purpose:string;beneficiary:string;budget:string;cap:string;}
interface StartProps {state:LiveState|null;records:ContributorRecord[];account:string;busy:string;act:(label:string,fn:()=>Promise<ReactNode>)=>Promise<void>;needAccount:()=>Promise<string>;}
function StartPlan({state,records,account,busy,act,needAccount}:StartProps){
  const me=records.find(x=>x.account_id===account);const tier:Tier=me?.tier??'new';
  const[title,setTitle]=useState('');const[summary,setSummary]=useState('');
  const[deadline,setDeadline]=useState(()=>new Date(Date.now()+14*86400000).toISOString().slice(0,10));
  const[legs,setLegs]=useState<LegDraft[]>([{title:'Venue',purpose:'',beneficiary:'',budget:'600',cap:'200'},{title:'Equipment',purpose:'',beneficiary:'',budget:'300',cap:'100'}]);
  const[made,setMade]=useState<NearCampaign|null>(null);
  const setLeg=(i:number,k:keyof LegDraft,v:string)=>setLegs(ls=>ls.map((l,j)=>j===i?{...l,[k]:v}:l));
  function build(){
    if(!title.trim()||!summary.trim())throw new Error('Give the plan a title and a one-line summary.');
    const ms=Date.parse(deadline+'T00:00:00Z');if(!(ms>Date.now()+3600000))throw new Error('Choose a deadline in the future.');
    return {title:title.trim(),summary:summary.trim(),detail:'',deadline_ms:String(ms),legs:legs.map((l,i)=>{
      if(!l.title.trim())throw new Error(`Budget ${i+1} needs a title.`);
      if(!isAccountId(l.beneficiary.trim())||l.beneficiary.trim()===ESCROW)throw new Error(`Budget ${i+1} needs a valid beneficiary account (not the escrow).`);
      const budget=parseDisplayAmount(l.budget),cap=parseDisplayAmount(l.cap);deriveLeg(budget,cap);
      return {title:l.title.trim(),purpose:l.purpose.trim(),beneficiary:l.beneficiary.trim(),budget,declared_sponsor_cap:cap};})};
  }
  return <section className="block">
    <p className="eyebrow">REPUTATION-BASED ACCESS · FROM YOUR ON-CHAIN RECORD</p>
    <h2>Start a plan, once you've helped one finish.</h2>
    <p className="muted wide">Anyone can pledge. Starting a plan and asking the DAO to match it is unlocked by your track record: back or organize a plan that completes. Your record goes into the DAO proposal, so the council sees it when it votes. The gate is this page's; the escrow contract itself stays open to every account.</p>
    <Reputation/>
    {!account?<div className="panel gate"><h3>Connect a wallet to see your access</h3><p className="muted">Your tier comes from your account's pledges and plans on chain.</p><button className="btn primary" disabled={Boolean(busy)} onClick={()=>void act('connect',async()=>{const id=await needAccount();return <>Connected as <b>{id}</b>.</>;})}>Connect wallet</button></div>
    :tier==='new'?<div className="panel gate"><h3>{account}: <span className="badge none">New</span></h3><p className="muted">No completed plan yet, so starting a plan is locked. Pledge to an open plan; if it completes, you become a Backer and this unlocks.</p><a className="btn primary" href={`#/plan/${state?.plans.find(p=>p.campaign.state==='Open'&&Number(p.campaign.terms.deadlineMs)>Date.now())?.campaign.id??'4'}`}>Back the open plan →</a></div>
    :made?<div className="panel gate"><h3>Plan #{made.id} is published</h3><p className="muted">Its terms hash is <code>{made.terms_hash.slice(0,16)}…</code>. It opens when the DAO approves the match and the reserve arrives.</p><a className="btn primary" href={`#/plan/${made.id}`}>Open plan #{made.id} →</a></div>
    :<div className="panel start">
      <h3>{account} <Badge tier={tier}/></h3>
      <p className="muted">{me?`${me.organized} organized (${me.organized_completed} completed) · ${me.succeeded} completed plan${me.succeeded===1?'':'s'} backed · reputation ${me.score}`:''}</p>
      <div className="form-grid">
        <label className="field">Plan title<input value={title} maxLength={80} onChange={e=>setTitle(e.target.value)} placeholder="Riverside Repair Café, December"/></label>
        <label className="field">Deadline (00:00 UTC)<input type="date" value={deadline} onChange={e=>setDeadline(e.target.value)}/></label>
        <label className="field wide-field">One-line summary<input value={summary} maxLength={500} onChange={e=>setSummary(e.target.value)} placeholder="What the community gets if every budget is funded"/></label>
      </div>
      {legs.map((l,i)=><div className="leg-draft" key={i}><b>Budget {i+1}</b>
        <label className="field">Title<input value={l.title} maxLength={60} onChange={e=>setLeg(i,'title',e.target.value)}/></label>
        <label className="field">Beneficiary account<input value={l.beneficiary} onChange={e=>setLeg(i,'beneficiary',e.target.value)} placeholder="venue.testnet"/></label>
        <label className="field">Budget (testUSD)<input inputMode="decimal" value={l.budget} onChange={e=>setLeg(i,'budget',e.target.value)}/></label>
        <label className="field">DAO match cap<input inputMode="decimal" value={l.cap} onChange={e=>setLeg(i,'cap',e.target.value)}/></label>
        {legs.length>1&&<button className="link" onClick={()=>setLegs(ls=>ls.filter((_,j)=>j!==i))}>Remove</button>}</div>)}
      {legs.length<3&&<button className="link" onClick={()=>setLegs(ls=>[...ls,{title:'Access',purpose:'',beneficiary:'',budget:'150',cap:'75'}])}>+ Add a budget</button>}
      <p className="muted tiny">The DAO matches each budget up to its cap, at most half the budget; the community raises the rest. Your wallet signs two transactions and needs about 4 test NEAR: the plan's storage deposit (2.6 to 2.9 NEAR, kept by the escrow for the plan's records) and the DAO's 1 NEAR proposal bond, returned unless the council removes the proposal.</p>
      <button className="btn primary" disabled={Boolean(busy)} onClick={()=>void act('publish',async()=>{
        const input=build();const quote=await view<any>(ESCROW,'quote_campaign_storage',{leg_count:input.legs.length});
        const res=await call(ESCROW,{method:'create_campaign',args:{input},deposit:quote.required_yocto,gas:'30000000000000'});
        const campaign=res.value as NearCampaign;if(!campaign?.id)throw new Error('The plan was published but its id could not be read. Check the board.');
        setMade(campaign);
        const prop=await fileProposal(campaign,me);
        return <>Plan #{campaign.id} published <Tx hash={res.hash}/> and DAO proposal #{String(prop.value)} filed <Tx hash={prop.hash}/>.</>;
      })}>{busy==='publish'?'Waiting for wallet…':'Publish the plan and file the DAO proposal'}</button>
    </div>}
  </section>;
}
