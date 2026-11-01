# RagIDLE na VPS Hostinger

## Objetivo

Publicar a versão atual do RagIDLE na VPS Hostinger para que o jogo continue disponível sem manter o computador local executando a stack. A implantação deve preservar o perfil e os dados de jogo existentes, proteger o acesso público e deixar os outros sites e serviços da VPS funcionando como estão.

## Entendimento confirmado

- O endereço de acesso será `https://tibia74.tech:8443`, passando pela Cloudflare já configurada para esse domínio. O IP de origem continua sendo o da VPS. Não será criada nem alterada uma entrada DNS.
- O jogo ficará protegido por uma autenticação HTTP Basic com credencial aleatória, armazenada como hash na configuração privada do Nginx e entregue ao usuário após a implantação.
- A VPS tem Ubuntu 22.04, 4 GiB de RAM, aproximadamente 1,5 GiB disponíveis, 32 GB livres em disco, nenhuma swap e serviços existentes de Nginx, MariaDB, TFS e FifaGo.
- A stack RagIDLE medida localmente usa cerca de 949 MiB em repouso e depende de aproximadamente 3,51 GB em `client-data`.
- O usuário aprovou adicionar um arquivo de swap de 2 GiB.

## Arquitetura

### Entrada web e proteção

O Nginx do host receberá HTTPS na porta 8443, usando o certificado vigente de `tibia74.tech`. O certificado e seu ciclo Certbot existentes serão reutilizados. A Cloudflare aceita HTTPS e WebSocket nessa porta; o firewall local permitirá 8443 somente a partir das faixas oficiais da Cloudflare, incluindo IPv4 e IPv6. As regras atuais das portas 80 e 443 não serão alteradas.

O Nginx aplicará autenticação HTTP Basic a toda a aplicação, incluindo API, arquivos do cliente, visualizador de mapas e handshake WebSocket. O aplicativo continuará sendo um perfil local único; a autenticação de borda impede que terceiros leiam ou alterem esse estado. A origem permitida pelo backend e pelo proxy WebSocket será `https://tibia74.tech:8443`.

Rotas do mesmo host encaminharão a interface para `idle-game`, o visualizador original para `web-client`, e as conexões WebSocket para `websocket-proxy`. Recursos do cliente continuam sendo fornecidos pelo `asset-service` através da rota de assets do jogo. A interface usará caminhos relativos ao host, sem portas de desenvolvimento embutidas.

### Containers e rede

A implantação será independente, com um nome de projeto Compose próprio, rede interna e volume de banco próprios. Os serviços web publicados para o host serão ligados somente a `127.0.0.1`; MariaDB e Hercules não terão portas públicas. O Nginx do host será o único ponto de entrada externo.

As imagens serão construídas no Docker local a partir do worktree atual, que contém alterações ainda não publicadas, e transferidas à VPS prontas para execução. Isso evita compilar Hercules no servidor de 4 GiB. O pacote incluirá o código necessário e `client-data`; não copiará o `.env` de desenvolvimento.

### Dados e segredos

Será feito um dump consistente do banco local do RagIDLE e importado para o MariaDB dedicado da nova stack. O banco MariaDB já instalado no host, usado por outros serviços, não será reaproveitado nem alterado. O volume original local continuará intacto como cópia de retorno.

Um `.env` de produção separado terá novas credenciais de banco, fora do Git. A senha de acesso web será aleatória, não será a frase usada para desbloquear a chave SSH e não será gravada no repositório.

### Memória e disco

Será criado um arquivo de swap de 2 GiB, ativado de forma persistente e com `vm.swappiness` baixo. A swap fornece margem contra picos de consumo, mas não aumenta a RAM física; se passar a ser usada continuamente, o jogo pode ficar lento e será necessário aumentar a VPS.

Antes do envio será conferido o espaço ocupado pelas imagens. A estimativa de 3,51 GB para `client-data` cabe nos 32 GB livres observados. Build e empacotamento ocorrerão localmente para reduzir carga de CPU e memória da VPS.

## Preservação dos serviços existentes

- Não editar os virtual hosts das portas 80 e 443, os sites atuais, o banco MariaDB do host, TFS, FifaGo, nem suas regras de firewall.
- Adicionar um novo virtual host Nginx em 8443 e regras UFW restritas às redes Cloudflare.
- Instalar Docker Engine pelo repositório oficial somente depois de confirmar que não há pacote ou dados Docker preexistentes. Como portas publicadas pelo Docker podem contornar UFW, todos os mapeamentos desta stack permanecerão em loopback.
- Fazer cópias de segurança das configurações Nginx/UFW tocadas e do dump de dados antes de ativar o serviço.

## Implantação e retorno seguro

1. Conferir novamente estado do repositório, Docker local, certificado, Nginx e firewall remoto.
2. Gerar imagens Linux compatíveis com a VPS e empacotar imagens e arquivos do jogo sem `.env` de desenvolvimento.
3. Transferir o pacote e os dados para uma pasta dedicada em `/opt/ragidle`; criar segredos e a stack Compose isolada.
4. Importar o dump para o novo MariaDB e validar a preservação do perfil.
5. Criar a swap, configurar o Nginx em 8443, validar `nginx -t` e então recarregar o Nginx.
6. Abrir 8443 apenas para as redes Cloudflare, iniciar a stack e inspecionar memória, logs e saúde dos serviços.
7. Fazer verificações de acesso externo, autenticação, carregamento do jogo/mapa, WebSocket, perfil e disponibilidade dos sites atuais.
8. Somente depois que o acesso remoto estiver funcional, parar os containers do projeto local `ragidle`, sem remover volume, banco, imagens ou arquivos locais.

Se a configuração Nginx ou a conectividade Cloudflare falhar, o virtual host novo e a regra UFW de 8443 serão removidos e o Nginx será recarregado com a configuração anterior. A stack local permanecerá ativa até a confirmação de sucesso. Para rollback após a publicação, parar apenas o projeto Docker remoto `ragidle-prod`; nunca usar `down -v` nem apagar o banco importado.

## Critérios de sucesso

- O endereço `https://tibia74.tech:8443` abre com TLS válido e exige a nova senha.
- A interface carrega os recursos e mapas, e as conexões WebSocket do cliente original são aceitas.
- O endpoint de saúde retorna HTTP 200 e o perfil local existente aparece no jogo.
- O serviço dedicado de banco fica inacessível externamente; as portas do jogo não são publicadas no host.
- Os serviços existentes de Nginx, MariaDB, TFS e FifaGo seguem disponíveis; as portas 80/443 conservam as regras atuais.
- A memória, uso de swap e espaço em disco são verificados após a subida; o RagIDLE local é parado sem remover seus dados somente ao final.

## Fora de escopo

Contas de jogo multiusuário, registro público, mudança de DNS, exposição pública das portas do Hercules, alteração de outros sites/serviços da VPS, wipe de perfil ou remoção das cópias locais.
