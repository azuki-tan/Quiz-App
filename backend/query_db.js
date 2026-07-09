import sqlite3 from 'sqlite3';
import { open } from 'sqlite';

async function main() {
  const db = await open({
    filename: 'e:/Project/quiz-app/quiz-data/user_data.db',
    driver: sqlite3.Database
  });

  console.log('--- Last 5 Sessions ---');
  const sessions = await db.all('SELECT * FROM sessions ORDER BY id DESC LIMIT 5');
  console.log(JSON.stringify(sessions, null, 2));

  console.log('--- Total Session Count ---');
  const count = await db.get('SELECT COUNT(*) as count FROM sessions');
  console.log(count);
}

main().catch(console.error);
