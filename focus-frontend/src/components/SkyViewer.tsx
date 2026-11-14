import { useEffect, useRef, useState } from 'react';
import type { PointerEvent } from 'react';
import type { Frame, Tile, Candidate } from '../data/types';
import type { Annotation } from '../lib/storage';
import type { View } from '../lib/render';
import { screenToImage } from '../lib/geometry';
import { Icon } from './Icons';
import FrameCanvas from './FrameCanvas';

interface Props {tile:Tile;frame:Frame;view:View;smooth:boolean;combine:number;zoom:number;invert:boolean;contrast:number;mask:boolean;marking:boolean;annotations:Annotation[];candidate?:Candidate;onZoom:(n:number)=>void;onMark:(x:number,y:number)=>void;pan:{x:number;y:number};onPan:(p:{x:number;y:number})=>void;}
const labels:Record<View,string>={science:'ONE EXPOSURE',residual:'WHAT CHANGED',colour:'ALL EXPOSURES COMBINED',motion:'MOTION MAP'};
const MAX_ZOOM=12;

export default function SkyViewer(p:Props){
 const wrap=useRef<HTMLDivElement>(null);
 const [size,setSize]=useState(400);
 const drag=useRef<{x:number;y:number;px:number;py:number;moved:boolean}|null>(null);
 const zoomRef=useRef(p.zoom);zoomRef.current=p.zoom;const onZoom=useRef(p.onZoom);onZoom.current=p.onZoom;
 const {manifest:m}=p.tile;
 const scale=size/m.width_px*p.zoom;const pan={x:p.pan.x*scale,y:p.pan.y*scale};const u=m.width_px/512/p.zoom;
 useEffect(()=>{if(!wrap.current)return;const ro=new ResizeObserver(entries=>{const r=entries[0].contentRect;setSize(Math.min(r.width,r.height*m.width_px/m.height_px))});ro.observe(wrap.current);return()=>ro.disconnect()},[m.width_px,m.height_px]);
 // The wheel zooms the picture; a native listener is needed to stop the page from scrolling under it.
 useEffect(()=>{const el=wrap.current;if(!el)return;const wheel=(e:WheelEvent)=>{e.preventDefault();onZoom.current(Math.max(1,Math.min(MAX_ZOOM,+(zoomRef.current*(e.deltaY<0?1.2:1/1.2)).toFixed(2))))};el.addEventListener('wheel',wheel,{passive:false});return()=>el.removeEventListener('wheel',wheel)},[]);
 function down(e:PointerEvent){if(e.button!==0)return;drag.current={x:e.clientX,y:e.clientY,px:p.pan.x,py:p.pan.y,moved:false};e.currentTarget.setPointerCapture(e.pointerId)}
 function move(e:PointerEvent){const d=drag.current;if(!d||p.marking)return;const dx=e.clientX-d.x,dy=e.clientY-d.y;if(Math.abs(dx)+Math.abs(dy)>4)d.moved=true;p.onPan({x:d.px+dx/scale,y:d.py+dy/scale})}
 function up(e:PointerEvent){const d=drag.current;drag.current=null;if(!d||d.moved||!p.marking||!wrap.current)return;const pt=screenToImage(e.clientX,e.clientY,wrap.current.getBoundingClientRect(),m.width_px,m.height_px,p.zoom,pan);if(pt)p.onMark(pt.x,pt.y)}
 const positions=p.candidate?.positions.filter(x=>x.frame_id===p.frame.frame_id)||[];
 const maxAngle=m.pixel_scale_arcsec?110*m.pixel_scale_arcsec/scale:0;
 const angularScale=[1,2,5,10,20,30,60,120,300].filter(a=>a<=maxAngle).at(-1)||maxAngle;
 return <div className={'sky-wrap '+(p.marking?'marking':'')} ref={wrap} onPointerDown={down} onPointerMove={move} onPointerUp={up} onDoubleClick={()=>p.onZoom(p.zoom>=MAX_ZOOM?1:Math.min(MAX_ZOOM,p.zoom*2))}>
  <div className="sky-label"><span className="record-dot"/>{labels[p.view]}</div>
  <div className="sky-image" style={{width:size,height:size*m.height_px/m.width_px,transform:`translate(calc(-50% + ${pan.x}px),calc(-50% + ${pan.y}px)) scale(${p.zoom})`}}>
   <FrameCanvas tile={p.tile} k={p.frame.cube_index??0} options={{view:p.view,smooth:p.smooth,combine:p.combine,mask:p.mask}} style={{filter:`contrast(${p.contrast}) ${p.invert?'invert(1)':''}`}} label={`${labels[p.view].toLowerCase()}, ${m.title}, ${p.frame.observed_at_utc}`}/>
   <svg className="image-overlays" viewBox={`0 0 ${m.width_px} ${m.height_px}`}><g transform="translate(.5 .5)">
    {p.annotations.filter(x=>x.tile_id===m.tile_id&&(x.frame_id===p.frame.frame_id||x.linked_positions?.some(pos=>pos.frame_id===p.frame.frame_id))).map(x=>{const pos=x.linked_positions?.find(pos=>pos.frame_id===p.frame.frame_id)||x;return <g key={x.id}><circle cx={pos.x_px} cy={pos.y_px} r={10*u} fill="none" stroke="#ffcf80" strokeWidth={1.5*u}/><text x={pos.x_px+13*u} y={pos.y_px-8*u} fill="#ffcf80" fontSize={10*u}>{x.label}</text></g>})}
    {positions.map(x=><g key={x.frame_id} opacity={x.detected===false?.45:1}><circle cx={x.x_px} cy={x.y_px} r={26*u} fill="none" stroke="#78ecdb" strokeDasharray={x.detected===false?`${4*u} ${3*u}`:undefined} strokeWidth={1.6*u}/></g>)}
   </g></svg>
  </div>
  <div className="viewer-scale">{m.pixel_scale_arcsec&&<><div style={{width:angularScale/m.pixel_scale_arcsec*scale}}/>{angularScale}″</>}<span>N UP · E LEFT</span></div>
  <div className="viewer-zoom"><button title="Zoom out" aria-label="Zoom out" onPointerDown={e=>e.stopPropagation()} onClick={()=>p.onZoom(Math.max(1,p.zoom/1.5))}><Icon name="minus" size={15}/></button><span>{p.zoom.toFixed(1)}×</span><button title="Zoom in" aria-label="Zoom in" onPointerDown={e=>e.stopPropagation()} onClick={()=>p.onZoom(Math.min(MAX_ZOOM,p.zoom*1.5))}><Icon name="plus" size={15}/></button><button title="Reset view" aria-label="Reset view" onPointerDown={e=>e.stopPropagation()} onClick={()=>{p.onPan({x:0,y:0});p.onZoom(1)}}><Icon name="reset" size={15}/></button></div>
  {p.marking?<div className="mark-hint">Click a source to add a note</div>:p.zoom===1&&<div className="mark-hint zoom-hint">Scroll or double-click to zoom · drag to move</div>}
 </div>
}
