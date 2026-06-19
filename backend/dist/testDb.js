import * as db from './db.js';
async function main() {
    await db.initDb();
    // Get recent 5 sessions
    const rows = await db.getSessions('');
    console.log(JSON.stringify(rows.slice(0, 5), null, 2));
}
main().catch(console.error);
