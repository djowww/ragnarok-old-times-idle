# Segurança

Este repositório é público. Não envie credenciais, bancos de dados, backups, arquivos privados de hospedagem ou recursos de cliente em issues e pull requests.

## Relatar uma vulnerabilidade

Use a opção privada **Security → Report a vulnerability**, quando disponível. Se não estiver disponível, procure um canal privado do mantenedor antes de compartilhar detalhes exploráveis. Não publique senhas, tokens, dados de contas ou provas contendo informações de jogadores.

A preview é um ambiente de testes. Não há promessa de prazo de resposta ou suporte comercial.

## Publicação

- Arquivos públicos e histórico passam pelo verificador de publicação e pelo Gitleaks.
- Pacotes são montados somente com arquivos rastreados e uma lista explícita de caminhos.
- `.env`, recursos de cliente, bancos, caches e evidências operacionais ficam fora dos pacotes.
- A exceção de endereço público é limitada aos READMEs e à política de publicação.
- Inicializadores locais geram senhas aleatórias e preservam configurações existentes.

## Administração

A chave administrativa é privada, opcional e deve ser definida pelo operador. Ela não acompanha a release. Concessões administrativas são autenticadas e auditadas. Consulte [SETUP.md](docs/SETUP.md).
