// Runs a scripted volunteer through the live server and saves the run as the offline replay.
// Usage: npm start (in another terminal), then: node scripts/record-replay.mjs
import fs from 'node:fs/promises';

const base = process.env.MAPPER_URL ?? 'http://localhost:8130';
const answers = [
  'Answering new client inquiries for my consulting work. Done means they get a useful reply, and a call on my calendar if they are a fit.',
  'Someone fills out the form on my website, emails me, or calls and leaves a voicemail. Sometimes a past client tags me in a LinkedIn comment.',
  'My list of services, my standard rates, the kinds of clients I take, any past emails with them, and my calendar.',
  'Whether they are a fit: budget over five thousand and a company with at least ten people. Which service matches their problem. And whether to book a call now or send them my guide first if they are early.',
  'Draft a reply in Gmail, add or update the contact in HubSpot, then send my booking link. After the call is booked, add a prep note to the calendar event.',
  'Custom pricing questions, anyone who sounds upset, or when it is unclear what they actually want.',
  'That looks right. Keep it.',
  'Gmail, Google Calendar, and HubSpot.',
  'Yes, that works.',
  'Thanks.'
];

const messages = [];
let map = {};
const steps = [];
for (const answer of answers) {
  messages.push({role: 'user', content: answer});
  const res = await fetch(base + '/api/turn', {method: 'POST', headers: {'Content-Type': 'application/json'}, body: JSON.stringify({messages, map, locked: []})});
  const out = await res.json();
  if (!res.ok) throw new Error(out.error);
  messages.push({role: 'assistant', content: out.say});
  map = out.map;
  steps.push({user: answer, say: out.say, stage: out.stage, map: out.map});
  console.log(`\n[${out.stage}] ${out.say}  ($${out.cost ?? '?'})`);
  if (out.stage === 'complete') break;
}
await fs.writeFile(new URL('../public/replay.json', import.meta.url), JSON.stringify({recorded: new Date().toISOString(), steps}, null, 2));
console.log('\nSaved public/replay.json with', steps.length, 'steps');
