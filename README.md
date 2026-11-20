# Helmet Library

Extensão CEP para o Adobe Premiere Pro que transforma pastas do computador em bibliotecas de recursos (vídeos, sons, imagens, MOGRTs, templates) acessíveis direto num painel, com preview e inserção na timeline por arrastar ou por um clique. A ideia é a mesma do "User Library" do Animation Composer.

Usa a mesma identidade visual do Helmet DL e do Helmet Cutter: tema Clássico (Violet Terminal com degradês sutis), Geo em caixa alta no nome e Roboto no resto.

Versão atual: **1.3.3** (o que mudou está no [CHANGELOG.md](CHANGELOG.md)). Testada como referência no Premiere Pro 26.x no Windows.

## Instalação

### Jeito fácil (Windows)

1. Feche o Premiere.
2. Dê dois cliques no **`instalar.bat`** (fica ao lado da pasta `premiere-helmet-library`). Ele:
   1. copia a extensão para `%APPDATA%\Adobe\CEP\extensions\premiere-helmet-library` (sem o arquivo de depuração `.debug`);
   2. libera extensões não assinadas (`PlayerDebugMode`) e confere se deu certo;
   3. avisa se existe uma cópia antiga em `C:\Program Files (x86)\Common Files\Adobe\CEP\extensions` (ela deixaria o painel duplicado).

   Não precisa de administrador. Suas bibliotecas e configurações não são apagadas.
3. No Premiere: **Janela › Extensões › Helmet Library** (*Window › Extensions › Helmet Library*).

### Jeito manual

1. Feche o Premiere.
2. Copie a pasta `premiere-helmet-library` para `C:\Users\<você>\AppData\Roaming\Adobe\CEP\extensions\` (sem o arquivo `.debug`, se ele existir).
3. Dê dois cliques em **`Add Keys.reg`** se ainda não tiver feito isso para outra extensão Helmet (faz o mesmo que o passo 2 do instalador).
4. No Premiere: **Janela › Extensões › Helmet Library**.

### Primeiro uso

Clique em **Adicionar pasta** (embaixo, na barra da esquerda) e escolha uma pasta do computador com seus sons, vídeos, imagens, MOGRTs… Pode adicionar quantas pastas quiser; as subpastas aparecem na árvore do lado esquerdo.

## Como usar

- **Adicionar pasta** (embaixo, na barra lateral): escolha uma pasta do computador. Ela vira uma biblioteca, e as subpastas aparecem na árvore. Pode adicionar quantas quiser.
- Clique numa pasta da árvore para ver os arquivos dela. Os cards de subpasta e o caminho no topo também navegam.
- **Preview:** clicar num arquivo abre o preview embaixo (áudio e vídeo tocam sozinhos, o que pode ser desligado). Clicar de novo no mesmo arquivo fecha o preview. Vídeos e imagens ganham um preview maior, e a barra de progresso mostra a minutagem exata (passe o mouse para ver o tempo de qualquer ponto, arraste para buscar). O preview só aparece com algum arquivo selecionado: clicar no vazio da grade ou apertar Esc fecha. Ao passar o mouse, só os GIFs animam no card; vídeos e MOGRTs mostram a miniatura parada.
- **Para usar no projeto:**
  - arraste o card (ou vários selecionados) para a **timeline** ou o painel **Project**. Ao começar a arrastar um **vídeo**, ele já é importado na bin **Helmet Library** em segundo plano (o Premiere só traz imagem e som de um vídeo arrastado quando ele já está no projeto); o painel Project pode aparecer por um instante e o Helmet Library volta para a frente. Se você soltar o vídeo no painel Project, a cópia da bin é retirada em alguns segundos para não ficar duplicada (só se ela não estiver em nenhuma sequência). Se desistir do arrasto, o vídeo fica na bin. Áudio e imagem entram arrastando sem isso. MOGRT não entra arrastando: use **Adicionar**;
  - ou **Adicionar** / Enter / duplo clique: coloca na timeline, na posição da agulha, na primeira trilha livre (se não houver, cria uma trilha);
  - ou **Só no projeto** / Shift+Enter: importa sem mexer na timeline.
- **Favoritos:** a estrela no card (aparece ao passar o mouse) ou o menu de clique direito.
- **Busca:** procura na pasta aberta e em todas as subpastas. Para buscar na biblioteca inteira, clique no nome da biblioteca na árvore antes. O seletor ao lado filtra por tipo.
- **Subpastas juntas:** o botão de camadas, ao lado do contador, mostra numa grade só os arquivos da pasta e de todas as subpastas.
- **Pitch e Reverse:** mudam só o preview do áudio, nunca o arquivo nem o clipe na timeline.
- O tamanho das miniaturas fica no controle do canto inferior esquerdo, e a barra lateral pode ser redimensionada arrastando a borda dela.

Atalhos: setas para navegar, Ctrl+clique e Shift+clique para selecionar vários, Ctrl+A, Espaço toca e pausa, Ctrl+F vai para a busca, Backspace volta para a pasta de cima, Esc limpa a busca (ou a seleção).

### Formatos

| Tipo | Com preview | Sem preview (aparecem com ícone e podem ser adicionados) |
|---|---|---|
| Vídeo | MP4, M4V, MOV (H.264), WebM | MOV ProRes/outros codecs, AVI, MXF, MKV, WMV, MPG, MTS |
| Áudio | WAV, MP3, M4A, AAC, OGG, FLAC (forma de onda) | AIF/AIFF, WMA |
| Imagem | JPG, PNG, GIF (animado), BMP, WebP, SVG | PSD, AI, EPS, TIFF, TGA, EXR, DPX |
| MOGRT | miniatura e vídeo de preview de dentro do `.mogrt`, com o nome em pt-BR quando o template tiver | — |
| Outros | — | AEP, PRPROJ, AEGRAPHIC, FFX, CUBE, SRT, XML |

Com "Mostrar outros arquivos" ligado nas configurações, a grade lista também o que o Premiere não importa. A lista de formatos fica em `client/js/config.js`.

## Configurações (ícone de controles no topo)

- **Onde salvar os previews:**
  - *Dentro da biblioteca* (padrão): numa pasta oculta `.helmet-previews` na raiz de cada biblioteca. A chave usa o caminho relativo, então se você copiar a biblioteca para outro HD ou PC, os previews vão junto.
  - *Cache do sistema*: em `%LOCALAPPDATA%\Helmet Library\cache`, sem gravar nada nas pastas da biblioteca. Use esta opção se a biblioteca estiver numa pasta só de leitura (o painel avisa quando não consegue gravar).
  - *Limpar previews*: pede confirmação, mostra quantos arquivos e quanto espaço, e apaga só os arquivos de preview criados pela extensão (seus vídeos, sons e imagens nunca são tocados). Os previews são refeitos quando as pastas forem abertas de novo.
- **Importar numa bin "Helmet Library"** e **Recriar as pastas como bins** (ex.: `Helmet Library › SFX › Whooshes`). O mesmo arquivo nunca é importado duas vezes: se já estiver na bin, ele é reaproveitado.
- **Duplo clique:** escolhe entre adicionar na timeline e importar só no projeto.
- **Tocar ao selecionar** e **Mostrar outros arquivos**.

As pastas são vigiadas: arquivos novos aparecem sozinhos (o botão de atualizar força a releitura).

## Seus dados

- As bibliotecas, os favoritos e as configurações ficam em `%APPDATA%\Helmet Library\config.json`, que não é apagado ao reinstalar.
- Cada gravação é feita num arquivo temporário e só depois troca o original (uma queda de energia não deixa o arquivo pela metade), e a versão anterior fica guardada em `config.json.bak`.
- Se o `config.json` estragar, o painel avisa, guarda o arquivo estragado como `config.corrompido-<data>.json` (nada é apagado) e recupera o backup. Sem backup, começa vazio.
- Se não der para salvar (disco cheio, sem permissão), aparece um aviso na barra de baixo.

## HD externo, pasta de rede e bibliotecas grandes

- Uma biblioteca cuja pasta sumiu (HD desligado, rede fora, pasta movida ou renomeada) aparece marcada na árvore e, ao clicar, o painel explica o que fazer. Quando o HD ou a rede voltam, ela volta sozinha (o painel confere ao abrir, ao clicar, ao atualizar e quando você volta para o painel).
- Favoritos que não foram encontrados são contados num aviso.
- Nada disso trava o painel: as leituras do disco não bloqueiam a tela, e os previews são gerados só para os cards que aparecem na tela, dois por vez.
- A busca e o "Subpastas juntas" mostram no máximo 20.000 arquivos (com aviso). O resultado fica guardado por 30 segundos, então digitar na busca não relê o disco a cada letra.

## Limitações conhecidas

- **MOGRT só no projeto:** algumas versões do Premiere não importam `.mogrt` direto no painel Project por script. Nesse caso a extensão avisa, e o MOGRT pode ir para a timeline normalmente (botão Adicionar ou duplo clique; arrastar MOGRT o Premiere não aceita).
- **Duração do MOGRT:** o espaço livre na trilha é conferido em 1 s a partir da agulha, porque a duração do template só é conhecida depois de inserido.
- **Áudio acima de 300 MB:** não ganha forma de onda e toca pelo player simples, sem Pitch e Reverse (decodificar o arquivo inteiro pesaria demais na memória).
- **Vídeo com trilhas desencontradas:** um vídeo precisa de V e A livres com o mesmo número. Exemplo: numa sequência com só V1/A1, com a agulha parada, adicionar dois áudios (o segundo cria a A2) e depois um vídeo dá "Não há trilha livre na posição da agulha", porque a extensão cria V2/A3 e procura o par V2/A2. Para contornar, mova a agulha ou crie uma trilha de vídeo à mão. Comportamento antigo, mantido de propósito nesta versão (item P1 da `AUDITORIA.md`).
- **Assinatura:** a extensão ainda não é assinada (`.zxp`), por isso o instalador liga o `PlayerDebugMode`.

## Estrutura

```
premiere-helmet-library/
  CSXS/manifest.xml        manifesto CEP (Node ligado: --enable-nodejs e --mixed-context)
  client/index.html        painel (com Content-Security-Policy: nada de script embutido nem da internet)
  client/css/style.css     identidade Violet Terminal
  client/js/
    config.js              versão, tipos de arquivo, padrões, limites e tempos; HL.log / HL.warn
    bridge.js              ponte única painel → Premiere (JSON nos dois sentidos)
    library.js             parte Node: config.json, leitura das pastas, atalhos, cache, leitor de .mogrt, vigia, programas do Windows
    demo.js                biblioteca de exemplo quando aberto fora do Premiere (navegador comum)
    previews.js            miniaturas, frames de vídeo e formas de onda (fila com 2 por vez)
    player.js              player de baixo (Web Audio para pitch/reverse, <video>, <img>)
    app.js                 base da interface: estado, elementos, barra de status, favoritos
    tree.js                árvore da barra lateral
    grid.js                grade: listagem, cards, seleção, teclado, arrastar
    host.js                adicionar ao Premiere
    libraries.js           bibliotecas: adicionar, remover, vigiar, desconectadas, limpar previews
    menus.js               menus de clique direito e diálogo de confirmação
    settings.js            janela de configurações
    main.js                barra superior e início do painel
  host/index.jsx           ExtendScript: importa na bin, coloca na timeline (trilha livre), importMGT para MOGRT
  icons/                   ícones do painel
instalar.bat               instalador (Windows)
Add Keys.reg               libera extensões não assinadas (alternativa manual)
empacotar.ps1              gera o .zip para distribuir
tests/                     testes automáticos (Node)
TESTES.md                  roteiro de testes no Premiere
AUDITORIA.md               auditoria de segurança e limpeza (1.3.0) e correções da 1.3.1 a 1.3.3
```

## Para quem mexe no código

### Testes automáticos

Precisa do [Node.js](https://nodejs.org). Na pasta do projeto:

```bash
node tests/run-tests.js
```

Testam o que dá para testar fora do Premiere: configuração (backup, arquivo estragado), pastas e atalhos, cache, leitor de `.mogrt` (inclusive arquivos danificados), ponte com o Premiere com nomes difíceis e o `host/index.jsx` rodando num "Premiere de mentira" (`tests/premiere-mock.js`). O que só dá para ver no Premiere está no [TESTES.md](TESTES.md).

### Gerar o pacote

```bash
powershell -ExecutionPolicy Bypass -File .\empacotar.ps1
```

Gera `dist\HelmetLibrary-<versão>.zip` com a extensão, o `instalar.bat`, o `Add Keys.reg`, este README e o CHANGELOG. Para com erro se as quatro versões não baterem (as duas do `manifest.xml`, `CLIENT_VERSION` em `client/js/config.js` e `HL_HOST_VERSION` em `host/index.jsx`) ou se achar certificado, chave ou `.debug`.

### Regras que a extensão segue

- Texto de arquivo (nomes, títulos de MOGRT) entra na tela só como texto (`textContent`), nunca como HTML.
- Tudo que vai para o Premiere passa pelo `bridge.js` em JSON; o `index.jsx` responde sempre `{ ok, data, error }`.
- Programas do Windows (Explorer, `attrib`) são chamados pelo caminho completo, com argumentos em lista, sem prompt de comando.
- Atalhos (links) só são seguidos se apontarem para dentro da mesma biblioteca; a pasta de previews nunca pode ser um atalho.
- Nada de `eval`, de `innerHTML` com dados ou de arquivos da internet.

### Depuração

- **Console:** em `client/js/config.js`, `DEBUG: true` mostra no console do painel detalhes que normalmente ficam escondidos (falhas de preview, arrastar, vigia de pastas). Volte para `false` antes de distribuir.
- **Porta de depuração:** o arquivo `premiere-helmet-library/.debug` liga a porta 8099 (com o painel aberto, acesse `http://localhost:8099` no Chrome). Ele **não fica no git e não vai na instalação**: com o Node ligado, quem se conecta nessa porta consegue rodar programas no computador. Para depurar na sua máquina, crie o arquivo com o conteúdo abaixo e copie a pasta da extensão à mão (o `instalar.bat` apaga o `.debug`).

```xml
<?xml version="1.0" encoding="UTF-8"?>
<ExtensionList>
    <Extension Id="com.seuestudio.helmetlibrary.panel">
        <HostList>
            <Host Name="PPRO" Port="8099" />
        </HostList>
    </Extension>
</ExtensionList>
```

Aberto direto num navegador, o `client/index.html` entra em modo de demonstração com uma biblioteca de exemplo, útil para mexer no layout.
