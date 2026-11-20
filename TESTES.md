# Roteiro de testes no Premiere — Helmet Library 1.3.0

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
2. Feche o Premiere e rode o `instalar.bat` da versão 1.3.0.
3. Abra o Premiere, crie um projeto de teste e uma sequência.

## 1. Instalação

- [ ] 1.1 O `instalar.bat` mostra as etapas [1/3], [2/3] e [3/3] e a versão **1.3.0**, sem erro.
- [ ] 1.2 **Janela › Extensões › Helmet Library** abre o painel, com o visual de sempre.
- [ ] 1.3 Na engrenagem (configurações), o rodapé diz **Helmet Library 1.3.0**.
- [ ] 1.4 O painel aparece **uma vez só** no menu de extensões (sem cópia duplicada).
- [ ] 1.5 As bibliotecas e favoritos que você já tinha continuam lá.

## 2. Uso normal

- [ ] 2.1 **Adicionar pasta** → escolha `C:\Teste Helmet`. A pasta aparece na árvore, com a subpasta `Sons`.
- [ ] 2.2 As miniaturas aparecem aos poucos (vídeo: um quadro; áudio: forma de onda; imagem; MOGRT: miniatura).
- [ ] 2.3 Clicar num áudio abre o preview e toca. **Pitch** e **Reverse** mudam o som do preview.
- [ ] 2.4 Clicar num vídeo toca no player de baixo; a barra mostra a minutagem; arrastar na barra busca.
- [ ] 2.5 Clicar de novo no mesmo arquivo fecha o preview. Esc também fecha.
- [ ] 2.6 **Adicionar** (ou Enter, ou duplo clique) coloca o arquivo na timeline, na agulha, e a barra de baixo diz em qual trilha.
- [ ] 2.7 **Só no projeto** (ou Shift+Enter) importa sem mexer na timeline.
- [ ] 2.8 **Arrastar** um card para a timeline funciona; arrastar para o painel Project também. Arrastar um **vídeo** traz imagem **e** som.
- [ ] 2.9 Selecione 3 arquivos (Ctrl+clique) e arraste juntos: entram os 3.
- [ ] 2.10 Os arquivos entram na bin **Helmet Library › Teste Helmet › …** (com "Recriar as pastas como bins" ligado).
- [ ] 2.11 Um `.mogrt` vai para a timeline com Adicionar e arrastando.
- [ ] 2.12 Favoritar pela estrela e pelo clique direito; a pasta **Favoritos** mostra os arquivos.
- [ ] 2.13 Busca: digite parte de um nome; acha também nas subpastas. O filtro por tipo funciona.
- [ ] 2.14 Clique direito → **Mostrar no Explorer** abre o Explorer com o arquivo selecionado. Clique direito na pasta → **Abrir no Explorer** abre a pasta.
- [ ] 2.15 Crie um arquivo novo dentro da pasta pelo Explorer: ele aparece sozinho no painel em poucos segundos.

## 3. Nomes com acento, emoji e espaços

- [ ] 3.1 Os cinco arquivos de nome difícil aparecem com o nome **exatamente** igual ao do Explorer (nada de `Ã©`, `?` ou quadradinhos).
- [ ] 3.2 Passar o mouse mostra o nome completo; nada aparece "formatado" (negrito, link) no nome.
- [ ] 3.3 Cada um deles entra na timeline com **Adicionar** e a mensagem da barra de baixo mostra o nome certo.
- [ ] 3.4 Cada um deles entra **arrastando**.
- [ ] 3.5 No painel Project, o nome do clipe está certo.
- [ ] 3.6 Favorite um deles, feche e abra o painel: continua nos favoritos.
- [ ] 3.7 Renomeie uma biblioteca para `Sons & Efeitos — Ação 🎬` (clique direito → Renomear): o nome aparece certo na árvore e na bin criada no próximo import.
- [ ] 3.8 Feche todas as sequências e clique **Adicionar** num `.mogrt`: a mensagem "Abra uma sequência para adicionar o MOGRT." aparece **com os acentos certos** (ela vem da parte que roda dentro do Premiere).

## 4. Importar o mesmo item duas vezes

- [ ] 4.1 Adicione o mesmo áudio duas vezes com **Só no projeto**: no painel Project ele aparece **uma vez só** na bin.
- [ ] 4.2 Adicione o mesmo áudio duas vezes na timeline (mesma posição da agulha): o segundo vai para a trilha de baixo (ou numa trilha nova), e na bin continua **um** item só.
- [ ] 4.3 Arraste o mesmo arquivo duas vezes para a timeline: entra duas vezes na timeline (é o Premiere que cuida do arrastar), sem erro no painel.
- [ ] 4.4 Desligue "Importar numa bin" nas configurações e adicione um arquivo que já está na bin: entra sem erro.

## 5. Pasta com muitos arquivos

Crie uma pasta com muitos arquivos. No PowerShell (troque o caminho do `modelo.wav` por um áudio pequeno seu):

```powershell
New-Item -ItemType Directory "C:\Teste Helmet\Muitos" | Out-Null
1..3000 | ForEach-Object { Copy-Item "C:\Teste Helmet\modelo.wav" "C:\Teste Helmet\Muitos\som $_.wav" }
```

- [ ] 5.1 Abrir a pasta `Muitos`: a grade aparece em poucos segundos e o painel **não congela** (dá para rolar e clicar enquanto as miniaturas são geradas).
- [ ] 5.2 Rolar até o fim: as miniaturas são geradas conforme os cards aparecem.
- [ ] 5.3 Digitar na busca: a primeira busca pode demorar um pouco; as letras seguintes respondem rápido.
- [ ] 5.4 O Premiere continua respondendo normalmente enquanto isso.
- [ ] 5.5 (Opcional, demora) Com mais de 20.000 arquivos na biblioteca, ligar **Subpastas juntas** mostra o aviso "Mostrando só os primeiros 20.000 arquivos…".
- [ ] 5.6 Configurações → **Limpar previews**: pergunta antes, mostra quantos arquivos e o tamanho; ao confirmar, apaga e as miniaturas são refeitas ao reabrir a pasta. Seus arquivos `.wav` continuam todos lá.

Ao terminar, apague a pasta `Muitos` pelo Explorer.

## 6. Arquivo de configuração corrompido

1. Feche o painel (ou o Premiere).
2. Abra `%APPDATA%\Helmet Library\` (cole na barra do Explorer) e abra o `config.json` no Bloco de Notas.
3. Apague algumas linhas do meio (o arquivo fica "quebrado") e salve.

- [ ] 6.1 Ao abrir o painel aparece o aviso **Configurações recuperadas**, dizendo que o backup foi usado e onde ficou o arquivo estragado.
- [ ] 6.2 Na pasta existe um `config.corrompido-<data>.json` (o arquivo estragado não foi apagado).
- [ ] 6.3 As bibliotecas e favoritos voltaram (podem faltar só as mudanças dos últimos instantes).
- [ ] 6.4 Repita apagando também o `config.json.bak`: o painel avisa e começa vazio, sem travar. (Depois, se quiser, renomeie o `config.corrompido-…json` de volta para recuperar à mão.)

## 7. Pasta da biblioteca removida, renomeada ou desconectada

- [ ] 7.1 Com o painel aberto, **renomeie** `C:\Teste Helmet` pelo Explorer e volte para o painel: a biblioteca aparece marcada como não encontrada; clicar nela mostra a mensagem explicando o que fazer. O painel não trava.
- [ ] 7.2 Volte o nome original e clique no painel: a biblioteca volta sozinha (sem precisar reabrir).
- [ ] 7.3 Os favoritos dessa pasta, enquanto ela estava renomeada, mostravam o aviso "N favorito(s) não encontrado(s)…".
- [ ] 7.4 **Remova** a biblioteca (clique direito → Remover da extensão): pede confirmação, some da árvore e os arquivos continuam no disco.
- [ ] 7.5 (Se tiver HD externo ou pendrive) Adicione uma pasta dele como biblioteca, feche o painel, **desconecte** o HD e abra o painel: abre normalmente, com a biblioteca marcada. Reconecte e volte para o painel: ela volta.
- [ ] 7.6 (Se tiver pasta de rede) Mesmo teste com uma pasta de rede desconectada (Wi-Fi desligado): o painel não fica congelado esperando.

## 8. Casos de segurança e limites

- [ ] 8.1 **Atalho para dentro:** no Prompt de Comando, `mklink /J "C:\Teste Helmet\Atalho Sons" "C:\Teste Helmet\Sons"`. A pasta `Atalho Sons` aparece e abre.
- [ ] 8.2 **Atalho para fora:** `mklink /J "C:\Teste Helmet\Atalho Windows" "C:\Windows"`. Essa pasta **não aparece** no painel.
- [ ] 8.3 **Atalho para a mãe:** `mklink /J "C:\Teste Helmet\Sons\Volta" "C:\Teste Helmet"`. Ligar **Subpastas juntas** e buscar não trava nem repete arquivos sem fim.
  (Apague os atalhos depois pelo Explorer: apagar o atalho não apaga a pasta de verdade.)
- [ ] 8.4 **Pasta só de leitura:** clique direito na pasta de teste → Propriedades → Segurança e negue "Gravar" para o seu usuário (ou use um pendrive travado). Abrir a pasta mostra o aviso "Sem permissão para gravar previews nesta pasta. Use "Cache do sistema" nas configurações." Mude para **Cache do sistema**: as miniaturas aparecem. (Desfaça a permissão depois.)
- [ ] 8.5 **Áudio grande:** um WAV com mais de 300 MB toca pelo player simples (Pitch/Reverse não fazem efeito) e o card não tem forma de onda. O painel não trava ao clicar nele.
- [ ] 8.6 **MOGRT danificado:** copie um `.mogrt`, abra a cópia no Bloco de Notas, apague um pedaço e salve. O card aparece com aviso "Sem pré-visualização" no ícone, sem travar o painel.
- [ ] 8.7 **Vídeo com codec sem preview** (ProRes, por exemplo): aparece com ícone e aviso, e entra no Premiere normalmente.

## 9. Configurações

- [ ] 9.1 Alternar **Dentro da biblioteca** / **Cache do sistema**: as miniaturas continuam aparecendo.
- [ ] 9.2 **Duplo clique** em "Importar só no projeto": o duplo clique passa a só importar.
- [ ] 9.3 **Tocar ao selecionar** desligado: clicar não toca sozinho.
- [ ] 9.4 **Mostrar outros arquivos**: aparecem arquivos que o Premiere não importa (ex.: `.txt`).
- [ ] 9.5 Feche e abra o Premiere: tamanho das miniaturas, largura da barra lateral, volume e última pasta aberta continuam como você deixou.

---

**Resultado:** ___ de ___ itens passaram. Data: ____/____/______. Versão do Premiere: ________.
