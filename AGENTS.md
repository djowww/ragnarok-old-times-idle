# Publicação no GitHub

Este é um repositório público. Antes de criar commits, branches, pull requests, merges ou pushes:

1. Revise os arquivos que serão enviados e versione somente os caminhos da tarefa.
2. Execute `python3 tools/check-publication.py`, `python3 tools/check-publication.py --history` e `gitleaks git --log-opts=--all --redact=100 --no-banner` no ambiente autorizado. Corrija qualquer achado antes de publicar; nunca imprima o valor encontrado.
3. Mantenha credenciais, endereços privados da infraestrutura, caminhos pessoais, configurações reais de hospedagem, bancos, backups e evidências operacionais fora do Git. A URL pública do jogo, autorizada pelo responsável e declarada em `tools/publication-policy.json`, pode aparecer somente nos READMEs indicados nessa política. Essa exceção não autoriza SSH, outros endereços, portas, segredos ou configurações reais. Use localhost e exemplos reservados nos demais testes e documentos.
4. Preserve progresso e dados reais. Faça testes e builds no ambiente autorizado pelo usuário.
5. Após uma limpeza de histórico, parta de um clone atualizado; não mescle branches antigas que possam reintroduzir conteúdo removido.
6. Revise também descrições, comentários, links, logs e arquivos anexados às publicações do GitHub.

Instale os hooks com `git config core.hooksPath .githooks`. As regras se aplicam também a publicações feitas por conectores e APIs, que não executam hooks locais.
