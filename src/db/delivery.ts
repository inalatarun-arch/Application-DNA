import { db, newId, nowIso } from './db';
import { defaultFrdHeadings } from '@/lib/fddTemplate';
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

/** Keeps the stored FRD template on the five-section FDD headings; a template the user edited is left alone. */
export async function ensureDefaultTemplates(): Promise<void> {
  const fdd = defaultFrdHeadings().join('\n');
  for (const [type, headings] of [['frd', fdd], ['tdd', DEFAULT_TDD.join('\n')]] as const) {
    const existing = await db.organizationTemplates.where('type').equals(type).first();
    const now = nowIso();
    if (!existing) {
      const t: OrganizationTemplate = { id:newId(), createdAt:now, updatedAt:now, name:type==='frd'?'Default FDD template':'Default TDD template', type, markdownHeadings:headings, active:true };
      await db.organizationTemplates.add(t);
    } else if (type === 'frd' && existing.markdownHeadings.trim() === DEFAULT_FRD.join('\n')) {
      await db.organizationTemplates.update(existing.id, { markdownHeadings: headings, name: 'Default FDD template', updatedAt: now });
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

export interface StoryDraft { requirementId: string; title: string; asA: string; iWant: string; soThat: string; acceptanceCriteria: string[]; businessRules: string[]; priority: 'low'|'medium'|'high' }

/** Saves stories written by the AI and links each to its requirement. Existing stories with the same title are kept as they are. */
export async function saveGeneratedStories(projectId:string,drafts:StoryDraft[]):Promise<{created:number;skipped:number}> {
  let created=0, skipped=0;
  await db.transaction('rw',[db.deliveryStories,db.requirementTraces],async()=>{
    const have=await db.deliveryStories.where('projectId').equals(projectId).toArray();
    const seen=new Set(have.map(s=>s.title.trim().toLowerCase()));
    for(const d of drafts){
      const key=d.title.trim().toLowerCase();
      if(!key||seen.has(key)){skipped++;continue;}
      seen.add(key);
      const now=nowIso();
      const story:DeliveryStory={id:newId(),createdAt:now,updatedAt:now,projectId,requirementIds:[d.requirementId],title:d.title.trim(),asA:d.asA,iWant:d.iWant,soThat:d.soThat,acceptanceCriteria:d.acceptanceCriteria,businessRules:d.businessRules,priority:d.priority,status:'backlog'};
      await db.deliveryStories.add(story);
      const trace:RequirementTrace={id:newId(),createdAt:now,updatedAt:now,projectId,requirementId:d.requirementId,storyId:story.id,testCaseIds:[]};
      await db.requirementTraces.add(trace);
      created++;
    }
  });
  return {created,skipped};
}
export async function buildRtm(projectId:string){ return db.requirementTraces.where('projectId').equals(projectId).toArray(); }
