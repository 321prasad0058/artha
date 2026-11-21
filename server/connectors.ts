// Connectors: turn each planned action into links that open the right app on a phone, with everything filled in.
// No integrations or permissions needed: WhatsApp, SMS, the dialler, Google Calendar, the user's UPI app, Maps.
// The four test people are made up, so links never carry made-up phone numbers: messages open WhatsApp with the
// text ready (you choose the chat), unless DEMO_PHONE is set, in which case everything goes to that number.
import type { Action, Contact, Persona } from './types.js';

export type Link = { kind: 'whatsapp' | 'sms' | 'call' | 'upi' | 'gcal' | 'maps'; label: string; href: string };

const demoPhone = () => (process.env.DEMO_PHONE || '').replace(/[^\d]/g, '');
const phoneOf = (c?: Contact) => (c as any)?.phone?.replace(/[^\d]/g, '') || demoPhone();

function gcalDates(iso: string, minutes = 30) {
  const a = new Date(iso), b = new Date(a.getTime() + minutes * 60e3);
  const f = (d: Date) => d.toISOString().replace(/[-:]/g, '').replace(/\.\d{3}/, '');
  return `${f(a)}/${f(b)}`;
}

export function linksFor(a: Action, p: Persona): Link[] {
  const c = p.contacts.find(x => x.id === a.contact_id);
  const phone = phoneOf(c);
  const links: Link[] = [];
  const text = a.text || a.title;
  if (a.type === 'message' && text) {
    links.push({ kind: 'whatsapp', label: 'Send on WhatsApp', href: `https://wa.me/${phone}?text=${encodeURIComponent(text)}` });
    links.push({ kind: 'sms', label: 'SMS', href: `sms:${phone ? '+' + phone : ''}?&body=${encodeURIComponent(text)}` });
  }
  if (a.type === 'call') {
    if (phone) links.push({ kind: 'call', label: 'Call now', href: `tel:+${phone}` });
    if (a.text) links.push({ kind: 'whatsapp', label: 'Message instead', href: `https://wa.me/${phone}?text=${encodeURIComponent(a.text)}` });
  }
  if ((a.type === 'calendar' || a.type === 'reminder' || a.type === 'call') && a.when_iso) {
    const title = a.type === 'calendar' || a.type === 'reminder' ? (a.title || text) : `Call ${c?.name ?? ''}`.trim();
    const details = [text, 'Added by Artha'].filter(Boolean).join('\n');
    links.push({ kind: 'gcal', label: 'Add to Google Calendar', href: `https://calendar.google.com/calendar/render?action=TEMPLATE&text=${encodeURIComponent(title)}&dates=${gcalDates(a.when_iso)}&details=${encodeURIComponent(details)}&ctz=Asia/Kolkata` });
  }
  if (a.type === 'payment' && c?.upi && a.amount_inr > 0) {
    const q = new URLSearchParams({ pa: c.upi, pn: c.name, am: a.amount_inr.toFixed(2), cu: 'INR', tn: a.title || `Paid via Artha` });
    links.push({ kind: 'upi', label: `Pay ₹${a.amount_inr.toLocaleString('en-IN')} in your UPI app`, href: `upi://pay?${q.toString()}` });
  }
  if (a.type === 'ledger' && a.amount_inr > 0 && c) {
    const nudge = `${c?.name ?? ''}, aapke khate mein ₹${a.amount_inr.toLocaleString('en-IN')} likh diya hai. Dhanyavaad!`;
    links.push({ kind: 'whatsapp', label: 'Tell them on WhatsApp', href: `https://wa.me/${phone}?text=${encodeURIComponent(nudge)}` });
  }
  return links;
}
