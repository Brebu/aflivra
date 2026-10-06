'use client';
import React from 'react';
import {Info} from 'lucide-react';
import {Tooltip,TooltipTrigger,TooltipContent} from '@/components/ui/tooltip';
import {Popover,PopoverTrigger,PopoverContent} from '@/components/ui/popover';
export function ControlHint({text,children}:{text:string;children:React.ReactElement}){return <Tooltip><TooltipTrigger asChild>{children}</TooltipTrigger><TooltipContent sideOffset={8}>{text}</TooltipContent></Tooltip>}
export function InfoHint({text,label='Mai multe informații'}:{text:string;label?:string}){return <span className="info-hint"><Popover><PopoverTrigger asChild><button type="button" aria-label={label} title={label}><Info size={17}/></button></PopoverTrigger><PopoverContent className="v2 info-popover" sideOffset={10}><p>{text}</p></PopoverContent></Popover></span>}
