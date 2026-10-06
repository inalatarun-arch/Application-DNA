import { db } from '@/db/db';
export type SearchEntity = 'application'|'screen'|'api'|'story'|'test-case'|'defect'|'module'|'functionality';
export interface SearchHit {kind:SearchEntity;id:string;name:string;description:string;to:string;score:number;}
export async function searchAllEntities(query:string,limit=50):Promise<SearchHit[]>{
 const [apps,screens,components,requirements,tests,defects,mods,funcs]=await Promise.all([db.applications.toArray(),db.screens.toArray(),db.technicalComponents.toArray(),db.requirements.toArray(),db.testCases.toArray(),db.defects.toArray(),db.modules.toArray(),db.functionalities.toArray()]);
 const tokens=query.toLowerCase().split(/\s+/).filter(Boolean);
 const score=(text:string)=>tokens.reduce((n,t)=>n+(text.toLowerCase().includes(t)?1:0),0);
 const hits:SearchHit[]=[];
 for(const x of apps){const s=score(JSON.stringify(x));if(s)hits.push({kind:'application',id:x.id,name:x.name,description:x.description,to:'/applications/'+x.id,score:s});}
 for(const x of screens){const s=score(JSON.stringify(x));if(s)hits.push({kind:'screen',id:x.id,name:x.name,description:x.purpose,to:`/applications/${x.applicationId}/screens/${x.id}`,score:s});}
 for(const x of components){const s=score(JSON.stringify(x));if(s&&(x.kind==='api'||x.kind==='rest'||x.kind==='soap'))hits.push({kind:'api',id:x.id,name:x.name,description:x.description,to:`/applications/${x.applicationId}/technical/${x.id}`,score:s});}
 for(const x of requirements){if(x.kind!=='user-story')continue;const s=score(JSON.stringify(x));if(s)hits.push({kind:'story',id:x.id,name:x.title,description:x.description,to:`/projects/${x.projectId}?tab=requirements`,score:s});}
 for(const x of tests){const s=score(JSON.stringify(x));if(s)hits.push({kind:'test-case',id:x.id,name:x.scenario,description:x.expectedResult,to:'/testing',score:s});}
 for(const x of defects){const s=score(JSON.stringify(x));if(s)hits.push({kind:'defect',id:x.id,name:x.title,description:x.description,to:'/testing',score:s});}
 for(const x of mods){const s=score(JSON.stringify(x));if(s)hits.push({kind:'module',id:x.id,name:x.name,description:x.description,to:`/applications/${x.applicationId}`,score:s});}
 for(const x of funcs){const s=score(JSON.stringify(x));if(s)hits.push({kind:'functionality',id:x.id,name:x.name,description:x.description,to:`/applications/${x.applicationId}/screens/${x.screenId}?tab=functionalities&open=${x.id}`,score:s});}
 return hits.sort((a,b)=>b.score-a.score||a.name.localeCompare(b.name)).slice(0,limit);
}