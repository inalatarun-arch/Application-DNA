import { Plus, Trash2 } from 'lucide-react';
import type { ScreenUiElement } from '@/db/types';

export default function UiElementsEditor({ items, onChange }: { items: ScreenUiElement[]; onChange: (items: ScreenUiElement[]) => void }) {
  const update = (index:number, patch:Partial<ScreenUiElement>) => onChange(items.map((item,i)=>i===index?{...item,...patch}:item));
  return (
    <div className="space-y-3">
      {items.length === 0 && <p className="text-body-md text-on-surface-variant">No UI elements detected yet. Analyze a screenshot or add one manually.</p>}
      {items.map((item,i)=>(
        <div key={i} className="grid gap-2 rounded border border-outline-variant p-3 md:grid-cols-[1.2fr_130px_1.6fr_1.4fr_auto]">
          <input className="input" value={item.name} placeholder="Label / element" onChange={e=>update(i,{name:e.target.value})}/>
          <select className="input" value={item.type} onChange={e=>update(i,{type:e.target.value as ScreenUiElement['type']})}>
            <option value="field">Field</option><option value="input">Input</option><option value="button">Button</option><option value="link">Link</option><option value="table">Table</option><option value="other">Other</option>
          </select>
          <input className="input" value={item.description} placeholder="What it captures/displays" onChange={e=>update(i,{description:e.target.value})}/>
          <input className="input" value={item.action} placeholder="Action / behaviour" onChange={e=>update(i,{action:e.target.value})}/>
          <div className="flex items-center gap-1">
            <label className="flex items-center gap-1 text-label-md"><input type="checkbox" checked={item.required} onChange={e=>update(i,{required:e.target.checked})}/>Required</label>
            <button type="button" className="icon-btn" aria-label={`Remove UI element ${i+1}`} onClick={()=>onChange(items.filter((_,idx)=>idx!==i))}><Trash2 size={15}/></button>
          </div>
        </div>
      ))}
      <button type="button" className="btn btn-secondary" onClick={()=>onChange([...items,{name:'',type:'field',description:'',action:'',required:false}])}><Plus size={14}/>Add UI element</button>
    </div>
  );
}
