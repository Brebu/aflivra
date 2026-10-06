'use client';
import {Children,isValidElement,useMemo,useState,type ComponentProps,type ReactNode} from 'react';
import {ChevronDown} from 'lucide-react';
type Option={value:string;label:ReactNode};
function options(nodes:ReactNode):Option[]{return Children.toArray(nodes).flatMap(node=>{if(!isValidElement<{value?:unknown;children?:ReactNode}>(node))return [];return node.type==='option'?[{value:String(node.props.value??node.props.children??''),label:node.props.children}]:options(node.props.children)})}
export function SelectField({children,value,defaultValue,onChange,className,...props}:ComponentProps<'select'>){
 const choices=useMemo(()=>options(children),[children]),[choice,setChoice]=useState(String(defaultValue??choices[0]?.value??''));
 const selected=String(value??choice),label=choices.find(option=>option.value===selected)?.label??selected;
 return <span className="select-field" data-disabled={props.disabled||undefined}><select {...props} aria-label={props['aria-label']} className={'select-field-control '+(className||'')} value={value} defaultValue={defaultValue} onChange={event=>{setChoice(event.target.value);onChange?.(event)}}>{children}</select><span className="select-field-label" aria-hidden="true">{label}</span><ChevronDown className="select-field-arrow" size={16} aria-hidden="true"/></span>;
}
