import Dexie from 'dexie';
import { db, newId, nowIso } from './db';
import type { Project, Requirement, Artifact, DeliveryStory, DeliveryDocument, DeliveryApproval } from './types';

const LEGACY_DB = 'eih-delivery';
const MARKER = 'migration.delivery.v1';
const idMap = (prefix:string,id:unknown) => `legacy-${prefix}-${String(id)}`;

async function openLegacy():Promise<Dexie|null>{
  try { const legacy=new Dexie(LEGACY_DB); await legacy.open(); return legacy; } catch { return null; }
}
async function rows(legacy:Dexie,name:string):Promise<Record<string,unknown>[]>{
  const t=legacy.tables.find(x=>x.name===name); return t ? await t.toArray() as Record<string,unknown>[] : [];
}
const str=(v:unknown)=>typeof v==='string'?v:'';

export async function migrateLegacyDelivery():Promise<{migrated:boolean;projects:number;requirements:number;documents:number;stories:number}>{
  if((await db.settings.get(MARKER))?.value===true) return {migrated:false,projects:0,requirements:0,documents:0,stories:0};
  const legacy=await openLegacy(); if(!legacy){ await db.settings.put({key:MARKER,value:true,updatedAt:nowIso()}); return {migrated:false,projects:0,requirements:0,documents:0,stories:0}; }
  try {
    const [ps,rs,ss,ds,vs,as,ims]=await Promise.all(['projects','requirements','stories','documents','docVersions','approvals','impactReports'].map(n=>rows(legacy,n)));
    const projects:Project[]=[]; const projectMap=new Map<string,string>(); const requirementMap=new Map<string,string>(); const documentMap=new Map<string,string>();
    await db.transaction('rw',[db.projects,db.requirements,db.deliveryStories,db.deliveryDocuments,db.deliveryDocumentVersions,db.deliveryApprovals,db.artifacts,db.settings],async()=>{
      for(const p of ps){
        const name=str(p.name).trim(); if(!name) continue;
        let current=await db.projects.where('name').equalsIgnoreCase(name).first();
        if(!current){const now=nowIso(); current={id:newId(),createdAt:str(p.createdAt)||now,updatedAt:str(p.updatedAt)||now,name,description:str(p.description),status:'draft',priority:'medium',owner:'',sponsor:'',targetDate:'',applicationIds:[],moduleIds:[],functionalityIds:[],notes:[]}; await db.projects.add(current); projects.push(current);}
        if(p.id!=null) projectMap.set(String(p.id),current.id);
      }
      for(const r of rs){const pid=projectMap.get(String(r.projectId)); if(!pid) continue; const now=nowIso(); const req:Requirement={id:idMap('req',r.id),createdAt:str(r.createdAt)||now,updatedAt:str(r.updatedAt)||now,projectId:pid,kind:'functional',title:str(r.title)||'Migrated requirement',description:str(r.text),acceptanceCriteria:[],status:r.status==='Approved'?'approved':r.status==='Rejected'?'rejected':'draft',functionalityIds:[]}; if(!(await db.requirements.get(req.id))) await db.requirements.add(req); requirementMap.set(String(r.id),req.id);}
      for(const s of ss){const pid=projectMap.get(String(s.projectId)); if(!pid) continue; const reqIds=(Array.isArray(s.requirementIds)?s.requirementIds:[]).map((x)=>requirementMap.get(String(x))).filter((x):x is string=>!!x); const now=nowIso(); const story:DeliveryStory={id:idMap('story',s.id),createdAt:str(s.createdAt)||now,updatedAt:str(s.updatedAt)||now,projectId:pid,requirementIds:reqIds,title:str(s.title),asA:str(s.asA),iWant:str(s.iWant),soThat:str(s.soThat),acceptanceCriteria:Array.isArray(s.acceptanceCriteria)?s.acceptanceCriteria.filter((x):x is string=>typeof x==='string'):[],businessRules:Array.isArray(s.businessRules)?s.businessRules.filter((x):x is string=>typeof x==='string'):[],priority:String(s.priority).toLowerCase()==='must'?'high':String(s.priority).toLowerCase()==='could'?'low':'medium',status:'backlog'}; if(!(await db.deliveryStories.get(story.id))) await db.deliveryStories.add(story);}
      for(const d of ds){const pid=projectMap.get(String(d.projectId)); if(!pid) continue; const type=d.type==='TDD'?'tdd':'frd'; const now=nowIso(); const doc:DeliveryDocument={id:idMap('doc',d.id),createdAt:str(d.createdAt)||now,updatedAt:str(d.updatedAt)||now,projectId:pid,type,title:str(d.title)||`Migrated ${type.toUpperCase()}`,version:Number(d.version)||1,content:str(d.content),status:Number(d.stageIndex)>0?'in-review':'draft',templateId:''}; if(!(await db.deliveryDocuments.get(doc.id))) await db.deliveryDocuments.add(doc); documentMap.set(String(d.id),doc.id);}
      for(const v of vs){const did=documentMap.get(String(v.documentId)); if(!did) continue; const item={id:idMap('docver',v.id),documentId:did,version:Number(v.version)||1,content:str(v.content),note:str(v.note),createdAt:str(v.savedAt)||nowIso()}; if(!(await db.deliveryDocumentVersions.get(item.id))) await db.deliveryDocumentVersions.add(item);}
      for(const a of as){const did=documentMap.get(String(a.documentId)); if(!did) continue; const item:DeliveryApproval={id:idMap('approval',a.id),documentId:did,version:Number(a.version)||1,role:'business-analyst',approverName:str(a.reviewerName),decision:a.decision==='Approved'?'approved':a.decision==='Rejected'?'rejected':'pending',comment:str(a.comments),createdAt:str(a.timestamp)||nowIso(),updatedAt:str(a.timestamp)||nowIso(),decidedAt:str(a.timestamp)||undefined}; if(!(await db.deliveryApprovals.get(item.id))) await db.deliveryApprovals.add(item);}
      for(const i of ims){const pid=projectMap.get(String(i.projectId)); if(!pid) continue; const now=nowIso(); const a:Artifact={id:idMap('impact',i.id),createdAt:str(i.createdAt)||now,updatedAt:str(i.createdAt)||now,projectId:pid,kind:'impact-assessment',title:'Migrated impact assessment',content:JSON.stringify(i.report??{}),version:1,status:'draft',approvals:[]}; if(!(await db.artifacts.get(a.id))) await db.artifacts.add(a);}
      await db.settings.put({key:MARKER,value:true,updatedAt:nowIso()});
    });
    return {migrated:true,projects:projects.length,requirements:rs.length,documents:ds.length,stories:ss.length};
  } finally { legacy.close(); }
}
