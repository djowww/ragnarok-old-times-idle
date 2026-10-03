import { WebSocketServer, WebSocket } from 'ws';
import net from 'node:net';

const redirects = new Map([
	['/127.0.0.1:6900', { host: 'hercules', port: 6900 }],
	['/127.0.0.1:6121', { host: 'hercules', port: 6121 }],
	['/127.0.0.1:5121', { host: 'hercules', port: 5121 }],
]);

const allowedOrigins = new Set(
	(process.env.WS_ALLOWED_ORIGINS ?? 'http://localhost:3338,http://127.0.0.1:3338')
		.split(',')
		.map((origin) => origin.trim())
		.filter(Boolean),
);
const port = Number(process.env.PORT ?? 5999);

if (!Number.isInteger(port) || port < 1 || port > 65535) {
	throw new Error(`Invalid WebSocket proxy port: ${process.env.PORT}`);
}

const wss = new WebSocketServer({
	port,
	verifyClient: ({ origin, req }) => {
		const originAllowed = allowedOrigins.has(origin);
		const targetAllowed = redirects.has(req.url);
		if (!originAllowed || !targetAllowed) {
			console.warn(`[wsProxy] Rejected origin=${origin || '(missing)'} target=${req.url}`);
		}
		return originAllowed && targetAllowed;
	},
});

console.log(`[wsProxy] Listening on port ${port}`);
console.log('[wsProxy] Allowed origins:', [...allowedOrigins]);

wss.on('connection', (ws, req) => {
	const { host, port: targetPort } = redirects.get(req.url);
	const tcp = net.createConnection({ host, port: targetPort });
	tcp.setNoDelay(true);

	ws.on('message', (message) => {
		if (tcp.writable) tcp.write(message);
	});

	tcp.on('data', (data) => {
		if (ws.readyState === WebSocket.OPEN) ws.send(data);
	});

	const close = () => {
		tcp.destroy();
		if (ws.readyState === WebSocket.OPEN) ws.close();
	};

	ws.on('close', close);
	ws.on('error', close);
	tcp.on('close', close);
	tcp.on('error', (error) => {
		console.error(`[wsProxy] Hercules connection failed: ${error.message}`);
		if (ws.readyState === WebSocket.OPEN) ws.close(1011, 'Game server unavailable');
		close();
	});
});
