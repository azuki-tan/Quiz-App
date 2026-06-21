import * as db from './db.js';
async function main() {
    await db.initDb();
    const sessions = await db.userDb.all('SELECT id, quizTargetId, learningMode, openCode, examStarted FROM sessions');
    console.log('Sessions:', sessions);
    // Call local API endpoint to see the returned response
    try {
        const res = await fetch('http://localhost:3000/api/sessions/2');
        console.log('API Response for session 2:', await res.json());
    }
    catch (err) {
        console.error('Failed to call API:', err.message);
    }
}
main().catch(console.error);
