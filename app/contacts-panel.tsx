'use client';
import {Phone,Mail,Globe,MapPin} from 'lucide-react';
import {publicContacts} from '@/lib/live/contacts';
const icons={phone:Phone,email:Mail,website:Globe,address:MapPin};
const labels={phone:'Telefon',email:'E-mail',website:'Website',address:'Adresă'};
export function ContactsPanel({data,title='Contacte publicate'}:{data:unknown;title?:string}){const contacts=publicContacts(data);if(!contacts.length)return null;return <section className="contacts-panel"><h3>{title}</h3><div className="contacts-grid">{contacts.map(contact=>{const Icon=icons[contact.kind];return <div className="contact-item" key={contact.kind+contact.value}><Icon size={20} aria-hidden="true"/><div><span>{labels[contact.kind]}</span>{contact.href?<a href={contact.href} {...(contact.kind==='website'?{target:'_blank',rel:'noreferrer'}:{})}>{contact.value}</a>:<p>{contact.value}</p>}<small>Câmp furnizat: {contact.field}</small></div></div>})}</div></section>}
