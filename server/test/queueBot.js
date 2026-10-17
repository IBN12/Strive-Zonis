import { io } from "socket.io-client";

// Requires ALLOW_Guest=true in .env
const bot = io('http://localhost:3000', {
    auth: { guestId: 'bot_' + Date.now(), name: 'QueueBot' } 
});

bot.on('connected', (p) => {
    console.log('Bot connected as', p.name);
    bot.emit('queue:join', {
        deck: [{ id: 1 }, { id: 4 }, { id: 8 }, { id: 9 }]
    }, (res) => console.log('queue:', res));
});

bot.on('match:found', (d) => console.log('Matched vs', d.opponent.name));
bot.on('match:begin', () => { console.log('Battle started'); bot.close(); });
bot.on('connect_error', (e) => console.error('Error:', e.message));