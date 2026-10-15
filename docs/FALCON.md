# Falcão do Caçador e do Atirador de Elite

## Como usar

1. Aprenda **Falcoaria**.
2. Na cidade, abra **Habilidades** e escolha **Alugar falcão · 2.500 zeny**. O valor é fixo; Desconto não o altera.
3. Equipe um arco e aprenda **Ataque Aéreo** para habilitar os ataques automáticos. Não é necessário colocar a habilidade na rotação para o proc automático.
4. Use a rotação para o Ataque Aéreo manual ou Assalto do Falcão. Essas conjurações têm seus próprios custos e atrasos.
5. **Detectar ao redor** revela ocultação em um quadrado de 7 × 7 células. A opção automática só consome SP quando há ocultação válida nessa área.

O falcão alugado acompanha o personagem até ser dispensado. Aprender Falcoaria não equivale a alugá-lo. Reconectar ou morrer não remove o companheiro; renascer ou mudar para uma classe incompatível remove essa opção. Uma conjuração iniciada legalmente ainda termina se o falcão for dispensado durante o cast.

## Dano e tempo

A parcela base é `2 × (trunc(DEX/10) + trunc(INT/2) + 3 × Garras de Aço + 40)`.

- Ataque Aéreo manual entrega uma a cinco parcelas a cada alvo da área de 3 × 3 células.
- O automático divide a parcela pelo número de alvos antes de multiplicar os hits. O nível é limitado pelo nível aprendido e por `floor(Job/10) + 1`, até cinco.
- Assalto do Falcão concentra cinco parcelas em um hit, multiplicado por `(150 + 70 × nível)/100`.
- O dano é Neutro e ignora DEF e esquiva. DEX/INT efetivos contam; o percentual de dano de arma de Visão Real não conta.
- O automático só pode ocorrer após um ataque básico positivo que deixa o alvo principal vivo. A chance nativa usa `raw1000 <= LUK efetiva × 3`, incluindo a borda zero.
- O proc não consome SP, poção, cooldown ou outra ação do jogador. O dano final é capturado no lançamento e aplicado após o amotion; reconectar não sorteia nem aplica novamente.

Os sprites de Caçador e Atirador e os sons são carregados dos arquivos de cliente fornecidos pelo operador. **Efeitos** liga os sons separadamente da música. O companheiro tem voo e direção próprios, sem sombra no chão nem animação de ataque herdada de um monstro.

## Base e adaptações

Referência de regras: Hercules pré-renovação [`410b9738`](https://github.com/HerculesWS/Hercules/tree/410b9738c049ab1825d67b36b072d837c1d0b33a). O exportador verifica os hashes das fontes e configurações no manifesto.

- O aluguel preserva os 2.500 zeny do [Falcon Breeder](https://github.com/HerculesWS/Hercules/blob/410b9738c049ab1825d67b36b072d837c1d0b33a/npc/merchants/renters.txt#L166), com acesso pela interface da cidade em Prontera; o NPC de referência fica em Hugel.
- Detectar é centrado no personagem nesta simulação solo. O alcance nativo para escolher um ponto distante não é exposto por essa ação.
- Não há atualmente habilidade de monstro implementada que produza Pneuma. O campo defensivo do jogador não é aplicado artificialmente aos inimigos.
- O voo segue o [roBrowser fixado](https://github.com/MrAntares/roBrowserLegacy/tree/d88a3cd4acde0582530e3fc1908532a92e9accea): ações ACT 0/8, velocidade de ataque de 35 ms/célula, prolongamento de cinco células e retorno após 432 ms. Esses tempos visuais não alteram os relógios de combate.
- Spring Trap e remoção de armadilhas continuam indisponíveis até existir o ciclo completo de unidades persistentes; exigir falcão não significa que essas habilidades já estejam implementadas.
