#!/bin/sh
set -eu

resources_dir=/app/resources
data_ini="$resources_dir/DATA.INI"

start_diagnostic_server() {
	printf '%s\n' "O asset-service não consegue ler os dados obrigatórios do cliente: $1" >&2
	exec node /app/no-assets-server.js
}

if [ ! -d "$resources_dir" ] || [ ! -r "$resources_dir" ]; then
	start_diagnostic_server 'crie client-data/ e permita a leitura.'
fi

if [ ! -f "$data_ini" ] || [ ! -r "$data_ini" ]; then
	start_diagnostic_server 'coloque um DATA.INI legível em client-data/.'
fi

if ! DATA_INI_PATH="$data_ini" node --input-type=module <<'NODE'
import fs from 'node:fs';
import { readDataIni } from '/app/src/utils/dataIni.js';

const dataIniPath = process.env.DATA_INI_PATH;
try {
	const { entries, grfPaths } = readDataIni(dataIniPath);
	if (entries.length === 0) {
		throw new Error('DATA.INI does not list any GRF files.');
	}

	for (const [index, grfPath] of grfPaths.entries()) {
		const stat = fs.statSync(grfPath);
		if (!stat.isFile()) throw new Error(`Not a file: ${entries[index]}`);
		fs.accessSync(grfPath, fs.constants.R_OK);
	}
} catch (error) {
	console.error(`A validação dos dados do cliente falhou: ${error.message}`);
	process.exitCode = 1;
}
NODE
then
	start_diagnostic_server 'verifique o DATA.INI e confirme que todos os GRFs referenciados estão presentes e legíveis em client-data/.'
fi

set_optional_asset_dir() {
	local_name="$1"
	local_dir="$resources_dir/$2"
	if [ -e "$local_dir" ]; then
		if [ ! -d "$local_dir" ] || [ ! -r "$local_dir" ]; then
			start_diagnostic_server "confirme que $2/ é um diretório legível em client-data/."
		fi
		export "$local_name=$local_dir"
	fi
}

set_optional_asset_dir DATA_OVERRIDE_PATH data
set_optional_asset_dir SYSTEM_PATH System
set_optional_asset_dir BGM_PATH BGM
set_optional_asset_dir AI_PATH AI

exec node /app/index.js
