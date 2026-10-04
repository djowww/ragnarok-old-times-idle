import http from 'node:http';
import { pathToFileURL } from 'node:url';

const diagnostic =
	'Assets do cliente ausentes. Coloque um DATA.INI legível e todos os GRFs que ele referencia em client-data/ e reinicie o asset-service. Este projeto não baixa arquivos do cliente.';

function createNoAssetsServer() {
	const clientPublicUrl = process.env.CLIENT_PUBLIC_URL || 'http://localhost:3338';
	return http.createServer((request, response) => {
		response.setHeader('Access-Control-Allow-Origin', clientPublicUrl);
		response.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS, HEAD');
		response.setHeader('Access-Control-Allow-Headers', 'Content-Type');
		response.setHeader('Vary', 'Origin');

		if (request.method === 'OPTIONS') {
			response.writeHead(204);
			response.end();
			return;
		}

		response.writeHead(503, { 'Content-Type': 'text/plain; charset=utf-8' });
		response.end(`${diagnostic}\n`);
	});
}

export { createNoAssetsServer };

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
	const port = Number.parseInt(process.env.PORT || '8080', 10);
	const server = createNoAssetsServer();
	server.listen(port, '0.0.0.0', () => {
		console.warn(`Modo de diagnóstico do asset-service: ${diagnostic}`);
		console.log(`Servidor HTTP de diagnóstico ouvindo na porta ${port}.`);
	});
}
