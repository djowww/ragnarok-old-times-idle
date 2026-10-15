# Publicação no GitHub

Este é um repositório público. Antes de criar commits, branches, pull requests, merges ou pushes:

1. Revise os arquivos que serão enviados e versione somente os caminhos da tarefa.
2. Execute `python3 tools/check-publication.py`, `python3 tools/check-publication.py --history` e `gitleaks git --log-opts=--all --redact=100 --no-banner` no ambiente autorizado. Corrija qualquer achado antes de publicar; nunca imprima o valor encontrado.
3. Mantenha credenciais, endereços pessoais da infraestrutura, caminhos pessoais, configurações reais de hospedagem, bancos, backups e evidências operacionais fora do Git. Use variáveis de ambiente, localhost e exemplos reservados nos testes e documentos públicos.
4. Preserve progresso e dados reais. Faça testes e builds no ambiente autorizado pelo usuário.
5. Após uma limpeza de histórico, parta de um clone atualizado; não mescle branches antigas que possam reintroduzir conteúdo removido.
6. Revise também descrições, comentários, links, logs e arquivos anexados às publicações do GitHub.

Instale os hooks com `git config core.hooksPath .githooks`. As regras se aplicam também a publicações feitas por conectores e APIs, que não executam hooks locais.
