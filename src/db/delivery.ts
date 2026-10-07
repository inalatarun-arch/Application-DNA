import { db, newId, nowIso } from './db';
import type { DeliveryDocument, DeliveryDocumentType, DeliveryDocumentVersion, DeliveryApproval, OrganizationTemplate, DeliveryStory, RequirementTrace } from './types';

export const DEFAULT_APPROVAL_MATRIX = [
  { role: 'business-analyst' as const, label: 'Business Analyst' },
  { role: 'business-owner' as const, label: 'Business Owner' },
  { role: 'application-owner' as const, label: 'Application Owner' },
  { role: 'technical-architect' as const, label: 'Technical Architect' },
  { role: 'project-sponsor' as const, label: 'Project Sponsor' },
];
export const DEFAULT_FRD = ['# Business Overview','# Scope','# Current Process','# Future Process','# Functional Requirements','# Non-Functional Requirements','# Assumptions','# Risks','# Process Diagrams','# Security','# Reporting','# Approval Sign-off'];
export const DEFAULT_TDD = ['# Architecture','# Components','# Data Design','# APIs','# Integrations','# Error Handling','# Deployment','# Security','# Performance'];

export async function ensureDefaultTemplates(): Promise<void> {
  for (const [type, headings] of [['frd', DEFAULT_FRD], ['tdd', DEFAULT_TDD]] as const) {
    if (!(await db.organizationTemplates.where('type').equals(type).count())) {
      const now = nowIso();
      const t: OrganizationTemplate = { id:newId(), createdAt:now, updatedAt:now, name:`Default ${type.toUpperCase()} template`, type, markdownHeadings:headings.join('\n'), active:true };
      await db.organizationTemplates.add(t);
    }
  }
}

export async function createDocument(projectId:string,type:DeliveryDocumentType,title:string):Promise<DeliveryDocument>{
  const now=nowIso();
  const d:DeliveryDocument={id:newId(),projectId,type,title,version:1,content:'',status:'draft',templateId:(await db.organizationTemplates.where('type').equals(type).first())?.id ?? '',createdAt:now,updatedAt:now};
  await db.deliveryDocuments.add(d); return d;
}

export async function saveDocumentVersion(documentId:string,content:string,note:string):Promise<DeliveryDocumentVersion>{
  const d=await db.deliveryDocuments.get(documentId); if(!d) throw new Error('Document not found.');
  const now=nowIso(); const next=d.version+1;
  const v:DeliveryDocumentVersion={id:newId(),documentId,version:next,content,note,createdAt:now};
  await db.transaction('rw',[db.deliveryDocuments,db.deliveryDocumentVersions],async()=>{
    await db.deliveryDocumentVersions.add(v);
    await db.deliveryDocuments.update(documentId,{content,version:next,status:'draft',updatedAt:now});
  }); return v;
}

export async function restoreDocumentVersion(documentId:string,versionId:string):Promise<void>{
  const v=await db.deliveryDocumentVersions.get(versionId); if(!v||v.documentId!==documentId) throw new Error('Document version not found.');
  await saveDocumentVersion(documentId,v.content,`Restored version ${v.version}`);
}

export async function submitDocument(documentId:string):Promise<void>{
  const d=await db.deliveryDocuments.get(documentId); if(!d) throw new Error('Document not found.');
  await db.deliveryDocuments.update(documentId,{status:'in-review',updatedAt:nowIso()});
  const now=nowIso(); await db.deliveryApprovals.add({id:newId(),documentId,version:d.version,role:'business-analyst',approverName:'',decision:'pending',comment:'Submitted for approval.',createdAt:now,updatedAt:now});
}

export async function decideDocument(documentId:string,role:DeliveryApproval['role'],approverName:string,decision:'approved'|'rejected',comment:string):Promise<void>{
  const d=await db.deliveryDocuments.get(documentId); if(!d) throw new Error('Document not found.');
  if(!approverName.trim()) throw new Error('Approver name is required.');
  const now=nowIso();
  await db.transaction('rw',[db.deliveryDocuments,db.deliveryApprovals],async()=>{
    await db.deliveryApprovals.add({id:newId(),documentId,version:d.version,role,approverName:approverName.trim(),decision,comment:comment.trim(),decidedAt:now,createdAt:now,updatedAt:now});
    await db.deliveryDocuments.update(documentId,{status:decision==='approved'?'approved':'rejected',updatedAt:now});
  });
}

export async function generateRequirementStories(projectId:string):Promise<DeliveryStory[]> {
  const reqs=await db.requirements.where('projectId').equals(projectId).toArray(); const out:DeliveryStory[]=[];
  for(const r of reqs.filter(x=>x.status==='approved')) {
    const existing=await db.deliveryStories.where('projectId').equals(projectId).filter(s=>s.requirementIds.includes(r.id)).first();
    const story=existing ?? {id:newId(),createdAt:nowIso(),updatedAt:nowIso(),projectId,requirementIds:[r.id],title:r.title,asA:'As a user',iWant:r.description,soThat:'So that the business outcome is achieved.',acceptanceCriteria:r.acceptanceCriteria,businessRules:[],priority:r.priority??'medium',status:'backlog' as const};
    if(existing) await db.deliveryStories.update(existing.id,{...story,updatedAt:nowIso()}); else await db.deliveryStories.add(story);
    const trace:RequirementTrace={id:newId(),createdAt:nowIso(),updatedAt:nowIso(),projectId,requirementId:r.id,storyId:story.id,testCaseIds:[]};
    await db.requirementTraces.add(trace); out.push(story);
  } return out;
}
export async function buildRtm(projectId:string){ return db.requirementTraces.where('projectId').equals(projectId).toArray(); }
