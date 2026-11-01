# Serviços de Prontera — desenho

## Objetivo

Adicionar à HUD um acesso claro de retorno à cidade e reunir em Prontera os serviços que já existem ou foram pedidos: loja, ferreiro, estilista e um quadro de quests reservado para uma etapa futura.

## Experiência

- Um botão compacto com brasão/fonte de Prontera fica dentro da HUD do personagem.
- Fora da cidade, o botão inicia o comando existente de retirada/retorno; enquanto a retirada está em andamento, informa esse estado e não abre serviços.
- Em Prontera, o mesmo botão abre a janela movível **Serviços de Prontera**. A loja abre a loja existente; Ferreiro e Estilista abrem painéis no mesmo sistema de janelas. A loja e os serviços não ficam disponíveis no campo.
- O quadro **Quests** aparece no hub com um estado visual “Em breve”; não cria nem altera quests existentes.
- O ferreiro vende Oridecon (984) e Elunium (985), usando os preços e validações de compra atuais. Também lista equipamentos identificados, elegíveis e refináveis, mostra minério, custo e chance, e chama a regra `refine` já existente. O refino continua exigindo estar na cidade, material e zeny, mantendo os limites, probabilidades e eventos atuais.
- O estilista permite selecionar hairstyle, cor de cabelo e cor de roupa. As faixas são hairstyle 0–27, cabelo 0–8 e roupa 0–4 conforme Hercules. A interface mostra uma prévia instantânea. Salvar é gratuito nesta versão, limitado a Prontera, e persiste no perfil.
- Aparência antiga ausente no JSON recebe valores padrão na leitura; não há wipe nem migração destrutiva.
- Os sprites usam o recurso do hairstyle correspondente e paletas `.pal` do cliente local. Paleta faltante não pode impedir entrar no jogo: fallback usa o sprite/paleta original e informa indisponibilidade visual quando aplicável. Não redistribuir nem embutir GRFs.

## Contratos

- `GameState.appearance`: `hairStyle`, `hairColor`, `clothesColor`, com defaults 0.
- Novo comando `changeAppearance` com os três valores; validação na API e no engine, e regra de Prontera no servidor. A alteração é atômica.
- `loadActor` recebe aparência opcional, altera a cabeça do personagem e aplica as paletas de cabelo e roupa antes da composição. O cache de ator inclui a aparência.
- `ActorPreview` recebe aparência opcional; a cena principal, seleção de personagem e previews do equipamento do jogador passam a aparência. Sprites de NPCs/monstros ficam inalterados.
- Normalização na decodificação do repositório preserva perfis criados antes da nova propriedade.

## Fora de escopo

- Não implementar quests novas, mudar mapas/NPCs originais, alterar preços de refino ou probabilidades, resetar personagens, remover serviços existentes, instalar GRFs ou publicar/deploy remoto.

## Critérios de aceite

1. O botão da HUD leva o jogador do campo à cidade pelo fluxo de retirada existente e abre o hub quando estiver em Prontera.
2. O hub oferece Loja existente, Ferreiro, Estilista e Quests “Em breve”, sem controles de serviço acessíveis em hunt.
3. O ferreiro compra os dois minérios com as validações do servidor e refina todos os itens que a regra atual permite.
4. O estilista pré-visualiza e salva as três opções em faixas válidas; após recarregar/reconectar, o perfil e o sprite conservam a aparência.
5. Perfil legado sem aparência continua legível, sem perda dos demais campos.
6. Se recursos de paleta não estiverem no cliente montado, a aplicação conserva o jogo funcional e a aparência original em vez de produzir sprites quebrados.

## Riscos e decisões

- Os recursos de mapa/sprite são fornecidos pelo GRF local e não estão versionados. Resolver paletas pelo serviço de assets existente e preservar fallback.
- Os serviços são comandos de estado persistido, não botões meramente cosméticos: validação de localização e intervalos deve ser feita no servidor.
- Arquivos de sessão anteriores já têm alterações locais. Limitar as mudanças a interfaces necessárias e não reformatar/restaurar arquivos globais.
