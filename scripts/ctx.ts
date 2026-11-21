// Query a user's context space.
//   npx tsx scripts/ctx.ts <user> stats | people | facts | turns | book | habits | expiring
//   npx tsx scripts/ctx.ts <user> card <entity-id>
//   npx tsx scripts/ctx.ts <user> search "doctor ki report"      (meaning search, any language)
//   npx tsx scripts/ctx.ts <user> sql "SELECT * FROM v_people"
import { loadState } from '../server/store.ts';
import { personCard, space } from '../server/context/space.ts';
import { embedPending, embedQuery, recall } from '../server/context/embed.ts';
process.loadEnvFile('.env');
const [user, cmd = 'stats', arg] = process.argv.slice(2);
if (!user) { console.log('usage: ctx.ts <user> <stats|people|facts|turns|book|habits|expiring|card|search|sql> [arg]'); process.exit(1); }
await loadState(user);
const db = space(user);
await embedPending(db);
const q = (sql: string) => db.prepare(sql).all();
const show = (rows: unknown[]) => console.table(rows);
switch (cmd) {
  case 'stats': show(q(`SELECT 'people' t, COUNT(*) n FROM entity UNION ALL SELECT 'aliases', COUNT(*) FROM alias UNION ALL SELECT 'facts', COUNT(*) FROM fact UNION ALL SELECT 'turns', COUNT(*) FROM turn UNION ALL SELECT 'actions', COUNT(*) FROM action UNION ALL SELECT 'events', COUNT(*) FROM event UNION ALL SELECT 'calendar', COUNT(*) FROM cal UNION ALL SELECT 'khata', COUNT(*) FROM book UNION ALL SELECT 'habits', COUNT(*) FROM habit UNION ALL SELECT 'vectors', COUNT(*) FROM vec WHERE emb IS NOT NULL`)); break;
  case 'people': show(q(`SELECT id, name, rel, source, interactions, called, khata_due, habits FROM v_people`)); break;
  case 'facts': show(q(`SELECT kind, subject, substr(text,1,70) text, uses, datetime(expires_at/1000,'unixepoch') expires FROM fact`)); break;
  case 'turns': show(q(`SELECT t.id, datetime(t.at/1000,'unixepoch') at, substr(t.said,1,50) said, (SELECT group_concat(type||':'||status, ' ') FROM action a WHERE a.turn_id=t.id) actions FROM turn t ORDER BY t.at`)); break;
  case 'book': show(q(`SELECT day, kind, party, item, amount, status FROM book ORDER BY at`)); show(q(`SELECT * FROM v_book_daily`)); break;
  case 'habits': show(q(`SELECT * FROM habit ORDER BY n DESC`)); break;
  case 'expiring': show(q(`SELECT * FROM v_expiring LIMIT 20`)); break;
  case 'card': console.dir(personCard(db, arg), { depth: 5 }); break;
  case 'search': { const v = await embedQuery(arg, 5000); if (v) show(recall(db, v, { k: 8, minSim: 0.2 }).map(h => ({ kind: h.kind, sim: h.sim.toFixed(2), score: h.score.toFixed(2), text: h.text.replace(/\n/g, ' · ').slice(0, 90) }))); break; }
  case 'sql': show(q(arg)); break;
  default: console.log('unknown command');
}
