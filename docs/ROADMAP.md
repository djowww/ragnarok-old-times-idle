# Roadmap

[Projeto](../README.md) · [Cobertura de habilidades](SKILL_COVERAGE.md)

Este documento separa o que está implementado do que depende de trabalho futuro. Não define datas de entrega.

## v1.0 — primeira publicação pública

- [x] Contas próprias, login, personagem salvo e ranking.
- [x] Caça AFK com deslocamento, monstros persistentes e respawn.
- [x] 38 áreas, 40 classes nas árvores e renascimento.
- [x] 298 habilidades marcadas como suportadas no catálogo.
- [x] Conjuração, recargas e prioridades automáticas.
- [x] Inventário, equipamentos, cartas, raridades e identificação em lote.
- [x] Loja, ferreiro e estilista em Prontera.
- [x] 81 desafios e 8 missões de progressão no catálogo.
- [x] Progresso offline de até 12 horas.
- [x] HUD reposicionável, diário e chat global.
- [x] Administração autenticada com auditoria.
- [x] Pacotes Windows para preview e execução local com Docker.

Os itens marcados representam funcionalidades existentes, não ausência de bugs ou fidelidade integral ao RO.

## Próximas frentes

### Qualidade da caça

- [ ] Expandir a validação visual de ataques, armas, direções e conjurações.
- [ ] Refinar navegação, seleção de alvos e situações com múltiplos inimigos.
- [ ] Medir desempenho em navegadores e GPUs reais, além de ambientes de teste.
- [ ] Ampliar balanceamento e testes de regressão de progressão/economia.

### Habilidades e sistemas

- [ ] Implementar as 50 habilidades ainda indisponíveis, conforme seus pré-requisitos reais.
- [ ] Completar efeitos que dependem de células, unidades persistentes e parceiros.
- [ ] Desenvolver grupos, guildas e comércio entre personagens.
- [ ] Projetar PvP/WoE com regras e validações próprias.
- [ ] Expandir quests de NPCs, eventos e objetivos de longo prazo.

A lista completa e as razões atuais estão em [SKILL_COVERAGE.md](SKILL_COVERAGE.md). A publicação não retoma automaticamente a implementação dessas habilidades.

### Distribuição e operação

- [ ] Ampliar testes do instalador local em configurações Windows reais.
- [ ] Melhorar diagnóstico de recursos de cliente incompatíveis ou ausentes.
- [ ] Aprimorar observabilidade, documentação de hospedagem e recuperação.
- [ ] Avaliar distribuição sem configuração manual de recursos, respeitando suas licenças.

## Como participar

Use as [issues](https://github.com/djowww/ragnarok-old-times-idle/issues) e siga o [guia de contribuição](../CONTRIBUTING.md). Relatos com passos reproduzíveis ajudam a priorizar correções.
