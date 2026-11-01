# Plano: DC_WINKCHARM (Wink of Charm)

## Objetivo

Disponibilizar Wink of Charm para caça solo conforme o Hercules pré-renewal fixado no catálogo, sem inventar controle sobre ataques básicos dos monstros.

## Contrato da fonte

- `skill_db.conf`: nível 1, alvo inimigo a 9 células, conjuração 1000 ms, pós-conjuração 2000 ms, duração 10000 ms e 40 SP.
- `skill.c`: só afeta monstros comuns de raça Demônio, Demi-humano ou Anjo cujo nível seja menor que o do personagem; chance 70%.
- `status.c`: durante SC_DC_WINKCHARM, o monstro não inicia habilidade especial e tenta caminhar até o cantor em alcance 3. A adaptação usa somente monstros com habilidades NPC modeladas e mantém os ataques básicos.

## Etapas

1. Escrever testes RED de elegibilidade, custo, chance, duração, bloqueio de habilidade NPC e expiração.
2. Implementar alvo automático e aplicação/expiração do status no relógio de combate.
3. Integrar o bloqueio no resolvedor de habilidades NPC, preservando ataques físicos e eventos já comprometidos.
4. Atualizar exportador, catálogo, manifesto, cobertura e regressões de hashes/contagem.
5. Rodar testes focados, suíte completa, typecheck, build e revisão independente. Manter o pacote local até concluir a meta maior; sem wipe ou publicação individual.
