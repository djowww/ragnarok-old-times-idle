import http from 'node:http';
import { pathToFileURL } from 'node:url';

const diagnostic =
	'Assets do cliente ausentes. Coloque um DATA.INI legível e todos os GRFs que ele referencia em client-data/ e reinicie o asset-service. Este projeto não baixa arquivos do cliente.';

function createNoAssetsServer() {
	return http.createServer((_request, response) => {
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
