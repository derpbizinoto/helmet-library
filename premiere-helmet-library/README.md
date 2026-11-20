# Helmet Library

Extensão CEP para o Adobe Premiere Pro que transforma pastas do computador em bibliotecas de recursos (vídeos, sons, imagens, MOGRTs, templates) acessíveis direto num painel, com preview e inserção na timeline por arrastar ou por um clique. A ideia é a mesma do "User Library" do Animation Composer.

Usa a mesma identidade visual do Helmet DL e do Helmet Cutter: tema Clássico (Violet Terminal com degradês sutis), Geo em caixa alta no nome e Roboto no resto.

## Instalação

1. Feche o Premiere.
2. Rode `instalar.bat` (fica uma pasta acima desta). Ele copia a extensão para `%APPDATA%\Adobe\CEP\extensions\` e libera extensões não assinadas (`PlayerDebugMode`).
   Alternativa manual: copiar esta pasta para `C:\Program Files (x86)\Common Files\Adobe\CEP\extensions\` e rodar `Add Keys.reg`.
3. No Premiere: **Window › Extensions › Helmet Library**.

## Como usar

- **Adicionar pasta** (embaixo, na barra lateral): escolha uma pasta do computador. Ela vira uma biblioteca, e as subpastas aparecem na árvore. Pode adicionar quantas quiser.
- Clique numa pasta da árvore para ver os arquivos dela. Os cards de subpasta e o caminho no topo também navegam.
- **Preview:** clicar num arquivo abre o preview embaixo (áudio e vídeo tocam sozinhos, o que pode ser desligado). Clicar de novo no mesmo arquivo para a reprodução, e um terceiro clique toca de novo. Vídeos e imagens ganham um preview maior, e a barra de progresso mostra a minutagem exata (passe o mouse para ver o tempo de qualquer ponto, arraste para buscar). O preview só aparece com algum arquivo selecionado: clicar no vazio da grade, no X ou apertar Esc fecha. Ao passar o mouse, só os GIFs animam no card; vídeos e MOGRTs mostram a miniatura parada.
- **Para usar no projeto:**
  - arraste o card (ou vários selecionados) para a **timeline** ou o painel **Project**;
  - ou **Adicionar** / Enter / duplo clique: coloca na timeline, na posição da agulha, na primeira trilha livre (se não houver, cria uma trilha);
  - ou **Só no projeto** / Shift+Enter: importa sem mexer na timeline.
- **Favoritos:** a estrela no card (aparece ao passar o mouse) ou o menu de clique direito.
- **Busca:** procura na pasta aberta e em todas as subpastas. O seletor ao lado filtra por tipo.
- **Subpastas juntas:** o botão de camadas, ao lado do contador, mostra numa grade só os arquivos da pasta e de todas as subpastas.
- **Pitch e Reverse:** mudam só o preview do áudio, nunca o arquivo nem o clipe na timeline.
- O tamanho das miniaturas fica no controle do canto inferior esquerdo, e a barra lateral pode ser redimensionada arrastando a borda dela.

Atalhos: setas para navegar, Ctrl+clique e Shift+clique para selecionar vários, Ctrl+A, Espaço toca e pausa, Ctrl+F vai para a busca, Backspace volta para a pasta de cima, Esc limpa a busca.

### Formatos

| Tipo | Com preview | Sem preview (aparecem com ícone e podem ser adicionados) |
|---|---|---|
| Vídeo | MP4, M4V, MOV (H.264), WebM | MOV ProRes/outros codecs, AVI, MXF, MKV, WMV, MPG, MTS |
| Áudio | WAV, MP3, M4A, AAC, OGG, FLAC (forma de onda) | AIF/AIFF, WMA |
| Imagem | JPG, PNG, GIF (animado), BMP, WebP, SVG | PSD, AI, EPS, TIFF, TGA, EXR, DPX |
| MOGRT | miniatura e vídeo de preview de dentro do `.mogrt`, com o nome em pt-BR quando o template tiver | — |
| Outros | — | AEP, PRPROJ, AEGRAPHIC, FFX, CUBE, SRT, XML |

Com "Mostrar outros arquivos" ligado nas configurações, a grade lista também o que o Premiere não importa.

## Configurações (ícone de controles no topo)

- **Onde salvar os previews:**
  - *Dentro da biblioteca* (padrão): numa pasta oculta `.helmet-previews` na raiz de cada biblioteca. A chave usa o caminho relativo, então se você copiar a biblioteca para outro HD ou PC, os previews vão junto.
  - *Cache do sistema*: em `%LOCALAPPDATA%\Helmet Library\cache`, sem gravar nada nas pastas da biblioteca.
  - *Limpar previews*: apaga o cache do modo atual. Os previews são refeitos quando as pastas forem abertas de novo.
- **Importar numa bin "Helmet Library"** e **Recriar as pastas como bins** (ex.: `Helmet Library › SFX › Whooshes`). O mesmo arquivo nunca é importado duas vezes: se já estiver na bin, ele é reaproveitado.
- **Duplo clique:** escolhe entre adicionar na timeline e importar só no projeto.
- **Tocar ao selecionar** e **Mostrar outros arquivos**.

As bibliotecas, os favoritos e as configurações ficam em `%APPDATA%\Helmet Library\config.json`, que não é apagado ao reinstalar. As pastas são vigiadas: arquivos novos aparecem sozinhos (o botão de atualizar força a releitura).

## Estrutura

```
premiere-helmet-library/
  CSXS/manifest.xml       manifesto CEP (Node habilitado)
  client/index.html       painel
  client/css/style.css    identidade Violet Terminal (base do Helmet DL + componentes próprios)
  client/js/library.js    config, leitura das pastas, tipos, cache, leitor de .mogrt (zip), vigia de pastas
  client/js/previews.js   gera miniaturas, frames de vídeo e formas de onda (fila com 2 por vez)
  client/js/player.js     player de baixo (Web Audio para pitch/reverse, <video>, <img>)
  client/js/main.js       interface: árvore, grade, seleção, arrastar, menus, configurações
  client/js/demo.js       biblioteca de exemplo quando aberto fora do Premiere (navegador comum)
  host/index.jsx          ExtendScript: importa na bin, coloca na timeline (trilha livre), importMGT para MOGRT
  icons/                  ícones do painel
```

## Limitações conhecidas

- **MOGRT só no projeto:** algumas versões do Premiere não importam `.mogrt` direto no painel Project por script. Nesse caso a extensão avisa, e o MOGRT pode ir para a timeline normalmente (botão Adicionar, duplo clique ou arrastando).
- **Duração do MOGRT:** o espaço livre na trilha é conferido em 1 s a partir da agulha, porque a duração do template só é conhecida depois de inserido.
- **Formas de onda:** arquivos de áudio acima de 300 MB não ganham forma de onda, para não pesar a memória.

## Depuração

Com o painel aberto, acesse `http://localhost:8099` no Chrome (arquivo `.debug`). Aberto direto num navegador, o `client/index.html` entra em modo de demonstração com uma biblioteca de exemplo, útil para mexer no layout.
