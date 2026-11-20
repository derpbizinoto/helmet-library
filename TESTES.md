# Roteiro de testes no Premiere — Helmet Library 1.3.4

> **Reteste da 1.3.4.** Instale a 1.3.4 (`instalar.bat`). Ela junta a tentativa da 1.3.3 (painel de volta) com o arrastar de MOGRT. Confira só isto:
>
> - [ ] **M1** Arraste um **MOGRT** para a timeline e solte. Por um instante aparece uma imagem cinza com o nome dele; em até uns 2 segundos ela vira o **MOGRT**, no mesmo lugar e na mesma trilha. A barra de baixo diz "“nome” na trilha V…".
> - [ ] **M2** Depois do M1, no painel Project **não** sobra nenhuma imagem cinza (`.png` com o nome do MOGRT) nem bin "Helmet Library - removendo…".
> - [ ] **M3** Arraste **dois MOGRTs** selecionados juntos: os dois viram MOGRT.
> - [ ] **M4** Arraste um MOGRT para o **painel Project**: uns 5 segundos depois a imagem cinza some e o MOGRT é importado na bin (ou aparece o aviso "Esta versão do Premiere só aceita MOGRT direto na timeline").
> - [ ] **M5** Comece a arrastar um MOGRT e desista (solte de volta no painel ou aperte Esc): nada aparece no projeto.
> - [ ] **M6** Arraste um MOGRT com nome difícil (acento, emoji): o nome do clipe na timeline fica certo.
>
> - [ ] **R1b** Arraste um **vídeo** que ainda não está no projeto para a timeline e solte. Em até 1 segundo depois de soltar, o painel **Helmet Library volta para a frente** sozinho. Anote se: (a) não volta; (b) volta, mas só depois de um tempo grande; (c) o painel recarrega (perde a pasta aberta ou a seleção).
> - [ ] **R2b** Repita R3 (soltar no Project) e R5 (vários vídeos): continuam funcionando.
> - Se o R1b falhar, o Premiere não deixa a extensão voltar para a frente. Saída sem código: encaixe o Helmet Library num grupo de painéis diferente do Project (arraste a aba dele para outro canto da janela), assim os dois ficam visíveis.

> **Reteste da 1.3.2.** Resultado: R2 a R5 passaram; no R1 o painel Project continuou abrindo.
>
> - [ ] **R1** Arraste um **vídeo** que ainda não está no projeto para a timeline: entra com imagem e som no primeiro arrasto, e o painel **Helmet Library volta para a frente** sozinho (o Project pode aparecer por um instante). Anote se ele não voltar. ***- O painel Project continua abrindo igual antes.***
> - [x] **R2** Arraste um **áudio** e uma **imagem** para a timeline: entram certo e o painel Project **não** abre (eles não são mais pré-importados).
> - [x] **R3** Arraste um vídeo que ainda não está no projeto para o **painel Project**: em até uns 5 segundos fica **uma cópia só** (a que você soltou). A bin Helmet Library não fica vazia sobrando, e não aparece nenhuma bin "Helmet Library - removendo…".
> - [x] **R4** Arraste o mesmo vídeo para a timeline e depois para o Project: o clipe da timeline continua lá, sem ficar offline.
> - [x] **R5** Arraste vários vídeos selecionados juntos para a timeline: entram todos com imagem e som.
> - Já sabido: arrastar MOGRT continua não funcionando (use **Adicionar**); arrastar e desistir deixa o vídeo na bin Helmet Library (combinado deixar assim por enquanto).
>
> **Resultado do reteste da 1.3.1:** 2.5, 8.2, seção 5, 8.5 e 2.13 passaram. Vídeo arrastado entra com imagem e som já no primeiro arrasto. Problemas que a 1.3.2 corrige: o painel Project abria sozinho ao arrastar, e arrastar para o Project deixava o arquivo duplicado. MOGRT continua sem entrar arrastando.

> **Reteste da 1.3.1.** As marcações abaixo são do teste da 1.3.0. Instale a 1.3.1 (`instalar.bat`) e refaça só estes itens: **2.5, 2.8, 2.11, 3.4, 4.3, seção 5, 8.2, 8.3 e 8.5**. O que mudou:
>
> - **2.5** o painel agora pede ao Premiere para receber a tecla Esc; **X**
> - **2.8, 2.11, 3.4, 4.3** ao começar a arrastar, o arquivo é importado no projeto (bin Helmet Library) em segundo plano, porque o Premiere só trazia imagem e som quando o arquivo já estava no projeto. Se o primeiro arrasto ainda vier só com áudio, anote: pode ser que o Premiere precise de um instante a mais. O MOGRT não é pré-importado (duplicaria na bin), então arrastar MOGRT pode continuar não funcionando — use Adicionar; ***- Teste: quando arrasto o asset, a aba Project abre automaticamente. Teria como continuar na aba da Extensão? Teria também como o arquivo sumir da aba Project caso eu desista de arrastá-lo à timeline?***
> - **8.2** cada pasta tem o destino real conferido, mesmo quando o Premiere não avisa que é um atalho; **X**
> - **seção 5 e 8.5** os arquivos de teste já estão prontos em `E:\Teste Helmet` (pasta `Muitos` com 3.000 WAVs e `audio grande 320MB.wav`). Adicione `E:\Teste Helmet` como biblioteca. **X**
> - **2.13** funciona como planejado: a busca procura na pasta aberta e nas subpastas. Para buscar na biblioteca inteira, clique no **nome da biblioteca** na árvore antes de buscar. Busca em todas as bibliotecas de uma vez ficou anotada como ideia para o futuro. **X**

Os testes automáticos (`node tests/run-tests.js`) cobrem o que dá para testar fora do Premiere. Este roteiro é o que **só dá para conferir no Premiere de verdade**. Referência: Premiere Pro 26.x no Windows.

Marque cada item com `x` quando passar. Se algo falhar, anote o número do item, o que apareceu na barra de baixo do painel e, se possível, um print.

---

## 0. Preparação (uma vez só)

1. Crie uma pasta de teste, por exemplo `C:\Teste Helmet`, com:
   - alguns vídeos MP4 (H.264), um MOV ProRes (se tiver), WAVs, MP3s, PNGs, um GIF animado e um ou dois `.mogrt`;
   - uma subpasta `Sons` com alguns áudios;
   - estes arquivos com **nomes difíceis** (copie qualquer áudio/vídeo e renomeie):
     - `Zé Ninguém — áudio final.wav` (acento e travessão)
     - `D'Ávila 'aspas' & cia (v2) 100%.wav` (aspas, `&`, parênteses e `%`)
     - `🔥 explosão 💥.mp4` (emoji)
     - `   espaços   no   meio.png` (vários espaços)
     - `nome.com.pontos.mp3`
2. Feche o Premiere e rode o `instalar.bat` da versão 1.3.4.
3. Abra o Premiere, crie um projeto de teste e uma sequência.

## 1. Instalação

- [x] 1.1 O `instalar.bat` mostra as etapas [1/3], [2/3] e [3/3] e a versão **1.3.4**, sem erro.
- [x] 1.2 **Janela › Extensões › Helmet Library** abre o painel, com o visual de sempre.
- [x] 1.3 Na engrenagem (configurações), o rodapé diz **Helmet Library 1.3.4**.
- [x] 1.4 O painel aparece **uma vez só** no menu de extensões (sem cópia duplicada).
- [x] 1.5 As bibliotecas e favoritos que você já tinha continuam lá.

## 2. Uso normal

- [x] 2.1 **Adicionar pasta** → escolha `C:\Teste Helmet`. A pasta aparece na árvore, com a subpasta `Sons`.
- [x] 2.2 As miniaturas aparecem aos poucos (vídeo: um quadro; áudio: forma de onda; imagem; MOGRT: miniatura).
- [x] 2.3 Clicar num áudio abre o preview e toca. **Pitch** e **Reverse** mudam o som do preview.
- [x] 2.4 Clicar num vídeo toca no player de baixo; a barra mostra a minutagem; arrastar na barra busca.
- [ ] 2.5 Clicar de novo no mesmo arquivo fecha o preview. Esc também fecha. ***- Teste: Esc não fecha.***
- [x] 2.6 **Adicionar** (ou Enter, ou duplo clique) coloca o arquivo na timeline, na agulha, e a barra de baixo diz em qual trilha.
- [x] 2.7 **Só no projeto** (ou Shift+Enter) importa sem mexer na timeline.
- [ ] 2.8 **Arrastar** um card para a timeline funciona; arrastar para o painel Project também. Arrastar um **vídeo** traz imagem **e** som. ***- Teste: Arrastar um vídeo à timeline não traz vídeo, apenas áudio. Ao tentar arrastar de novo (após adicionar apenas o áudio do vídeo à timeline), dá certo.***
- [x] 2.9 Selecione 3 arquivos (Ctrl+clique) e arraste juntos: entram os 3.
- [x] 2.10 Os arquivos entram na bin **Helmet Library › Teste Helmet › …** (com "Recriar as pastas como bins" ligado).
- [ ] 2.11 Um `.mogrt` vai para a timeline com Adicionar e arrastando. ***- Teste: arrastar não funciona, apenas adicionar. Presumo que é o mesmo erro dos vídeos.***
- [x] 2.12 Favoritar pela estrela e pelo clique direito; a pasta **Favoritos** mostra os arquivos.
- [x] 2.13 Busca: digite parte de um nome; acha também nas subpastas. O filtro por tipo funciona. ***- Teste: a busca funciona, mas só consigo pesquisar dentro de pastas, pois não consigo tirar a seleção de uma pasta.***
- [x] 2.14 Clique direito → **Mostrar no Explorer** abre o Explorer com o arquivo selecionado. Clique direito na pasta → **Abrir no Explorer** abre a pasta.
- [x] 2.15 Crie um arquivo novo dentro da pasta pelo Explorer: ele aparece sozinho no painel em poucos segundos.

## 3. Nomes com acento, emoji e espaços

- [x] 3.1 Os cinco arquivos de nome difícil aparecem com o nome **exatamente** igual ao do Explorer (nada de `Ã©`, `?` ou quadradinhos).
- [x] 3.2 Passar o mouse mostra o nome completo; nada aparece "formatado" (negrito, link) no nome.
- [x] 3.3 Cada um deles entra na timeline com **Adicionar** e a mensagem da barra de baixo mostra o nome certo.
- [ ] 3.4 Cada um deles entra **arrastando**. ***- Teste: apenas áudio, como dito anteriormente.***
- [x] 3.5 No painel Project, o nome do clipe está certo.
- [x] 3.6 Favorite um deles, feche e abra o painel: continua nos favoritos.
- [x] 3.7 Renomeie uma biblioteca para `Sons & Efeitos — Ação 🎬` (clique direito → Renomear): o nome aparece certo na árvore e na bin criada no próximo import.
- [x] 3.8 Feche todas as sequências e clique **Adicionar** num `.mogrt`: a mensagem "Abra uma sequência para adicionar o MOGRT." aparece **com os acentos certos** (ela vem da parte que roda dentro do Premiere).

## 4. Importar o mesmo item duas vezes

- [x] 4.1 Adicione o mesmo áudio duas vezes com **Só no projeto**: no painel Project ele aparece **uma vez só** na bin.
- [x] 4.2 Adicione o mesmo áudio duas vezes na timeline (mesma posição da agulha): o segundo vai para a trilha de baixo (ou numa trilha nova), e na bin continua **um** item só.
- [ ] 4.3 Arraste o mesmo arquivo duas vezes para a timeline: entra duas vezes na timeline (é o Premiere que cuida do arrastar), sem erro no painel. ***- Teste: só áudios funcionam bem.***
- [x] 4.4 Desligue "Importar numa bin" nas configurações e adicione um arquivo que já está na bin: entra sem erro.

## 5. Pasta com muitos arquivos

A pasta `E:\Teste Helmet\Muitos` (3.000 WAVs pequenos) já foi criada para a 1.3.1. Para criar de novo em outro lugar, no PowerShell: troque o caminho em `$pasta` por uma pasta que tenha pelo menos um `.wav` pequeno; o comando copia o primeiro `.wav` que encontrar.

```powershell
$pasta = "E:\Teste Helmet"
$modelo = Get-ChildItem $pasta -Filter *.wav | Select-Object -First 1
New-Item -ItemType Directory "$pasta\Muitos" -Force | Out-Null
1..3000 | ForEach-Object { Copy-Item $modelo.FullName "$pasta\Muitos\som $_.wav" }
```

- [x] 5.1 Abrir a pasta `Muitos`: a grade aparece em poucos segundos e o painel **não congela** (dá para rolar e clicar enquanto as miniaturas são geradas).
- [x] 5.2 Rolar até o fim: as miniaturas são geradas conforme os cards aparecem.
- [x] 5.3 Digitar na busca: a primeira busca pode demorar um pouco; as letras seguintes respondem rápido.
- [x] 5.4 O Premiere continua respondendo normalmente enquanto isso.
- [ ] 5.5 (Opcional, demora) Com mais de 20.000 arquivos na biblioteca, ligar **Subpastas juntas** mostra o aviso "Mostrando só os primeiros 20.000 arquivos…".
- [x] 5.6 Configurações → **Limpar previews**: pergunta antes, mostra quantos arquivos e o tamanho; ao confirmar, apaga e as miniaturas são refeitas ao reabrir a pasta. Seus arquivos `.wav` continuam todos lá. ***- Teste: não consegui fazer nenhum porque o comando do PowerShell não funciona por algum motivo.***

Ao terminar, apague a pasta `Muitos` pelo Explorer.

## 6. Arquivo de configuração corrompido

1. Feche o painel (ou o Premiere).
2. Abra `%APPDATA%\Helmet Library\` (cole na barra do Explorer) e abra o `config.json` no Bloco de Notas.
3. Apague algumas linhas do meio (o arquivo fica "quebrado") e salve.
- [x] 6.1 Ao abrir o painel aparece o aviso **Configurações recuperadas**, dizendo que o backup foi usado e onde ficou o arquivo estragado.
- [x] 6.2 Na pasta existe um `config.corrompido-<data>.json` (o arquivo estragado não foi apagado).
- [x] 6.3 As bibliotecas e favoritos voltaram (podem faltar só as mudanças dos últimos instantes).
- [x] 6.4 Feche o painel, **estrague o `config.json` de novo** (passos 2 e 3) **e** apague o `config.json.bak`; depois abra o painel. Só apagar o `.bak` não muda nada, porque o `config.json` ainda está bom. Esperado: o painel avisa e começa vazio, sem travar. (Depois, se quiser, renomeie o `config.corrompido-…json` de volta para recuperar à mão.) ***- Teste: não aconteceu nada ao apagar o .bak. Se era isso o esperado, ok.***

## 7. Pasta da biblioteca removida, renomeada ou desconectada

- [x] 7.1 Com o painel aberto, **renomeie** `C:\Teste Helmet` pelo Explorer e volte para o painel: a biblioteca aparece marcada como não encontrada; clicar nela mostra a mensagem explicando o que fazer. O painel não trava.
- [x] 7.2 Volte o nome original e clique no painel: a biblioteca volta sozinha (sem precisar reabrir).
- [x] 7.3 Os favoritos dessa pasta, enquanto ela estava renomeada, mostravam o aviso "N favorito(s) não encontrado(s)…".
- [x] 7.4 **Remova** a biblioteca (clique direito → Remover da extensão): pede confirmação, some da árvore e os arquivos continuam no disco.
- [ ] 7.5 (Se tiver HD externo ou pendrive) Adicione uma pasta dele como biblioteca, feche o painel, **desconecte** o HD e abra o painel: abre normalmente, com a biblioteca marcada. Reconecte e volte para o painel: ela volta. ***- Teste: não tenho um HD ou pendrive no momento.***
- [ ] 7.6 (Se tiver pasta de rede) Mesmo teste com uma pasta de rede desconectada (Wi-Fi desligado): o painel não fica congelado esperando. ***- Teste: também não tenho.***

## 8. Casos de segurança e limites

- [x] 8.1 **Atalho para dentro:** no Prompt de Comando, `mklink /J "C:\Teste Helmet\Atalho Sons" "C:\Teste Helmet\Sons"`. A pasta `Atalho Sons` aparece e abre.
- [x] 8.2 **Atalho para fora:** `mklink /J "C:\Teste Helmet\Atalho Windows" "C:\Windows"`. Essa pasta **não aparece** no painel. ***- Teste: a pasta aparece.***
- [x] 8.3 **Atalho para a mãe:** `mklink /J "C:\Teste Helmet\Sons\Volta" "C:\Teste Helmet"`. Ligar **Subpastas juntas** e buscar não trava nem repete arquivos sem fim.
  (Apague os atalhos depois pelo Explorer: apagar o atalho não apaga a pasta de verdade.)
- [x] 8.4 **Pasta só de leitura:** clique direito na pasta de teste → Propriedades → Segurança e negue "Gravar" para o seu usuário (ou use um pendrive travado). Abrir a pasta mostra o aviso "Sem permissão para gravar previews nesta pasta. Use "Cache do sistema" nas configurações." Mude para **Cache do sistema**: as miniaturas aparecem. (Desfaça a permissão depois.)
- [x] 8.5 **Áudio grande:** (use `E:\Teste Helmet\audio grande 320MB.wav`, um tom contínuo de uns 32 minutos) um WAV com mais de 300 MB toca pelo player simples (Pitch/Reverse não fazem efeito) e o card não tem forma de onda. O painel não trava ao clicar nele. ***- Teste: não tenho um wav com esse tamanho por enquanto.***
- [x] 8.6 **MOGRT danificado:** copie um `.mogrt`, abra a cópia no Bloco de Notas, apague um pedaço e salve. O card aparece com aviso "Sem pré-visualização" no ícone, sem travar o painel.
- [x] 8.7 **Vídeo com codec sem preview** (ProRes, por exemplo): aparece com ícone e aviso, e entra no Premiere normalmente.

## 9. Configurações

- [x] 9.1 Alternar **Dentro da biblioteca** / **Cache do sistema**: as miniaturas continuam aparecendo.
- [x] 9.2 **Duplo clique** em "Importar só no projeto": o duplo clique passa a só importar.
- [x] 9.3 **Tocar ao selecionar** desligado: clicar não toca sozinho.
- [x] 9.4 **Mostrar outros arquivos**: aparecem arquivos que o Premiere não importa (ex.: `.txt`).
- [x] 9.5 Feche e abra o Premiere: tamanho das miniaturas, largura da barra lateral, volume e última pasta aberta continuam como você deixou.

---

**Resultado:** ___ de ___ itens passaram. Data: ____/____/______. Versão do Premiere: ________.
