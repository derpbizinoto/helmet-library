# Auditoria — Helmet Library 1.2.3

Data: 20/11/2026 · Referência: Premiere Pro 26.x no Windows · Fase 1 (somente leitura).
Nenhum arquivo da extensão foi alterado. Só foram feitos: `git init`, o commit do
estado atual na branch `main` (`e9c41ad`) e a criação da branch `limpeza-seguranca`.

Os números de linha se referem a esse commit inicial.

**Resumo em uma frase:** o código já toma vários cuidados (todo nome de arquivo mostrado na
tela passa por uma função de escape, a gravação do `config.json` já usa arquivo temporário,
remover uma biblioteca nunca apaga arquivos do disco) e **não achei nada Crítico**. Os dois
pontos mais sérios são: o arquivo de depuração `.debug` **vai junto na instalação** de todo
mundo, e um `config.json` corrompido faz a extensão **apagar em silêncio todas as
bibliotecas e favoritos** no salvamento seguinte.

---

## 1. Mapa do projeto

É uma extensão **CEP** (painel HTML + ExtendScript) para o Premiere Pro, sem `package.json`,
sem bibliotecas de terceiros (só o `CSInterface.js` oficial da Adobe, v11) e sem programas
externos como FFmpeg: miniaturas e formas de onda são geradas pelo próprio navegador do painel.

```
helmet-library/
├─ instalar.bat                copia a extensão para %APPDATA%\Adobe\CEP\extensions e liga o PlayerDebugMode (CSXS 9 a 16)
├─ Add Keys.reg                alternativa manual: liga PlayerDebugMode e LogLevel no CSXS 5 a 15
├─ como instalar.txt           instruções informais (repete o README)
└─ premiere-helmet-library/    a extensão em si
   ├─ .debug                   abre a porta de depuração 8099 (só deveria existir na máquina de desenvolvimento)
   ├─ README.md                manual de uso
   ├─ CSXS/manifest.xml        manifesto: Premiere 15+, Node ligado, autoplay de áudio/vídeo
   ├─ icons/, client/img/, client/fonts/   ícones, logo e fontes locais (Geo, Roboto, com licença OFL)
   ├─ client/index.html        a tela do painel (ícones SVG embutidos, modais de configurações e de texto)
   ├─ client/css/style.css     visual "Violet Terminal"
   ├─ client/js/CSInterface.js biblioteca oficial da Adobe para falar com o Premiere
   ├─ client/js/library.js     parte "Node": configuração, leitura das pastas, tipos de arquivo,
   │                           onde fica o cache, leitor de .mogrt (.zip), vigia de pastas, abrir no Explorer
   ├─ client/js/demo.js        só fora do Premiere: troca o disco por uma biblioteca de exemplo
   ├─ client/js/previews.js    gera e guarda miniaturas, frames de vídeo, formas de onda e previews de MOGRT
   ├─ client/js/player.js      o player de baixo (Web Audio com pitch/reverse, <video>, <img>)
   ├─ client/js/main.js        toda a interface: árvore, grade, seleção, teclado, arrastar,
   │                           adicionar ao Premiere, bibliotecas, menus, diálogo, configurações (1120 linhas)
   └─ host/index.jsx           ExtendScript: importa na bin, coloca na timeline na primeira trilha livre, MOGRT via importMGT
```

### Onde e como a biblioteca guarda dados

| O quê | Onde | Formato / como é gravado |
|---|---|---|
| Bibliotecas (`{id, nome, caminho}`), favoritos (caminhos completos), pastas abertas na árvore, última pasta vista, todas as configurações, volume, tamanho das miniaturas, largura da barra lateral, filtro | `%APPDATA%\Helmet Library\config.json` | JSON. Gravado 300 ms depois de cada mudança e ao fechar o painel, via `config.json.tmp` + renomear (já é atômico). **Sem backup** da versão anterior. Não é apagado ao reinstalar. |
| Previews — modo "Dentro da biblioteca" (padrão) | `<pasta da biblioteca>\.helmet-previews\` (pasta marcada como oculta com `attrib +h`) | Para cada arquivo: `<chave>.json` (duração, dimensões, picos da forma de onda, título do MOGRT, erro), `<chave>.jpg` (miniatura) e, no MOGRT, `<chave>.mp4/.mov/.m4v/.webm` (vídeo de preview). A chave é um código de 24 letras/números calculado a partir do caminho **relativo**, tamanho e data, por isso os previews viajam junto se a pasta for copiada. |
| Previews — modo "Cache do sistema" | `%LOCALAPPDATA%\Helmet Library\cache\` | Igual, mas a chave usa o caminho completo. |
| Memória do painel (some ao fechar) | — | Lista de subpastas já lidas, previews já carregados. |
| No projeto do Premiere | bin `Helmet Library` (opcional) e sub-bins `<Biblioteca>/<subpasta>` (opcional) | Criadas pelo `index.jsx`. |
| No Windows | `HKCU\Software\Adobe\CSXS.<n>\PlayerDebugMode = 1` | Gravado pelo `instalar.bat` / `Add Keys.reg`. |

Não há banco de dados, `localStorage`, internet, cookies nem senhas.

**A extensão nunca apaga nem altera arquivos de mídia do usuário.** As únicas exclusões são
dos próprios previews: "Limpar previews" (todos), "Limpar previews desta biblioteca" e
"Gerar preview de novo" (os de um arquivo).

### Como o painel conversa com o Premiere (ExtendScript)

1. **Botão Adicionar / Enter / duplo clique / Só no projeto** → `main.js:737` monta o texto
   `hl_add('<caminho codificado>','video','1','<bin>','<subpastas>')` e manda com
   `cs.evalScript`. O caminho, a bin e as subpastas vão com `encodeURIComponent` (e `'` → `%27`);
   o tipo vai direto no texto (é sempre um valor fixo da lista de tipos).
2. **`index.jsx` → `hl_add`** decodifica, confere se o arquivo existe, cria/acha as bins,
   importa (ou reaproveita se o mesmo arquivo já estiver naquela bin), procura a primeira trilha
   livre na posição da agulha (cria uma trilha pela API "QE" se precisar) e coloca o clipe.
   MOGRT vai por `sequence.importMGT`. A resposta é um JSON montado à mão
   `{"ok":true,"data":{…}}` ou `{"ok":false,"error":"…"}` (o ExtendScript não tem `JSON`).
3. **`hl_getHostVersion()`** é chamado ao abrir para avisar no console se o painel e o
   `index.jsx` estão em versões diferentes. Devolve texto puro, não JSON.
4. **Arrastar para a timeline/Project** não passa pelo ExtendScript: o painel coloca os
   caminhos no "arrastar" do sistema (`com.adobe.cep.dnd.file.N`, lista de URLs e texto) e o
   próprio Premiere importa.

---

## 2. Funções principais — "comportamentos que não podem quebrar"

**Bibliotecas e navegação**
- **F1** Adicionar pasta como biblioteca (botão, menu do painel, botão da tela vazia). Pasta repetida → aviso "já está na biblioteca" e abre ela.
- **F2** Árvore lateral: Favoritos (com contador), bibliotecas e subpastas; expandir/recolher (setinha ou duplo clique) e lembrar o que estava aberto; setinha some em pasta sem subpastas; biblioteca cuja pasta sumiu fica marcada e mostra aviso ao clicar.
- **F3** Menu da biblioteca (clique direito ou "…"): Abrir, Atualizar, Abrir no Explorer, Renomear (só o nome exibido), Limpar previews desta biblioteca, Remover da extensão (com confirmação; não apaga nada do disco).
- **F4** Grade com subpastas e arquivos em ordem "natural" pt-BR (Arquivo 2 antes de Arquivo 10), contador, caminho clicável no topo, Backspace sobe uma pasta (sem sair da biblioteca).
- **F5** Tipos reconhecidos (vídeo, áudio, imagem, MOGRT, outros), filtro por tipo e "Mostrar outros arquivos"; arquivos ocultos, `Thumbs.db`, `desktop.ini`, `~temporários` não aparecem.
- **F6** Busca na pasta e em todas as subpastas, ignorando acento e maiúscula; Ctrl+F, Esc limpa, seta para baixo vai para a grade.
- **F7** "Subpastas juntas" (botão de camadas).
- **F8** Vigia de pastas: arquivos novos/removidos aparecem sozinhos; arquivos que o Premiere cria ao lado da mídia (`.cfa`, `.pek`, `.xmp`…) são ignorados; a grade não é recriada à toa nem durante um arraste; botão Atualizar força a releitura.

**Previews e player**
- **F9** Miniaturas geradas só para o que aparece na tela, 2 por vez; duração ou dimensão no canto; "Gerar preview de novo"; falha fica gravada para não tentar toda vez.
- **F10** Cache "Dentro da biblioteca" (pasta oculta, viaja com a pasta) ou "Cache do sistema"; tamanho ocupado e "Limpar previews" nas configurações.
- **F11** MOGRT: miniatura e vídeo de preview de dentro do `.mogrt` (prefere pt-BR), título traduzido na dica do card.
- **F12** Player: áudio com forma de onda, cursor e busca clicando/arrastando; Pitch ±12 (duplo clique zera) e Reverse só no preview; volume e mudo (volume lembrado); vídeo com clique para pausar; imagem; barra de progresso com dica de tempo; "Tocar ao selecionar"; clicar de novo no mesmo arquivo fecha o preview; o preview só aparece com algo selecionado; se o áudio não decodificar, toca pelo `<audio>` comum.
- **F13** GIF anima ao passar o mouse; vídeos e MOGRTs ficam parados no card.

**Seleção e teclado**
- **F14** Clique, Ctrl+clique, Shift+clique, Ctrl+A, setas (pulando subpastas), Espaço toca/pausa, clique no vazio ou Esc limpa a seleção; tamanho das miniaturas e largura da barra lateral ajustáveis e lembrados.

**Mandar para o Premiere**
- **F15** Adicionar na timeline (botão, Enter, duplo clique, menu): na agulha, na primeira trilha livre (vídeo com áudio usa o mesmo número de trilha V/A), cria uma trilha se não houver; sem sequência aberta → importa só no projeto e avisa.
- **F16** Só no projeto (botão, Shift+Enter, menu; o duplo clique pode ser configurado para isso).
- **F17** Bins: "Helmet Library" e "Recriar as pastas como bins" (`Helmet Library › Biblioteca › Subpasta`), ambos configuráveis; o mesmo arquivo não é importado duas vezes na mesma bin.
- **F18** MOGRT na timeline (`importMGT`, 1 s livre na agulha) e no projeto (com aviso se a versão do Premiere não aceitar).
- **F19** Vários arquivos de uma vez, um por um, com resumo ("2 de 5 falharam…").
- **F20** Arrastar um ou vários cards para a timeline ou o painel Project; soltar dentro do próprio painel não faz nada.

**Favoritos, persistência e outros**
- **F21** Favoritos: estrela no card, menu (um ou vários), vista Favoritos; arquivos que sumiram não aparecem.
- **F22** Tudo lembrado no `config.json` entre sessões e reinstalações (bibliotecas, favoritos, última pasta, pastas abertas, configurações).
- **F23** Mostrar no Explorer (arquivo selecionado) / Abrir no Explorer (pasta).
- **F24** Menu do painel (≡): Adicionar pasta, Configurações, Recarregar painel.
- **F25** Modo de demonstração quando o `index.html` é aberto num navegador comum.
- **F26** `instalar.bat`: recusa se o Premiere estiver aberto, copia a extensão, libera extensões não assinadas, não apaga as configurações.

---

## 3. Problemas de segurança

Nenhum **Crítico** encontrado.

### Alto

| ID | Onde | Risco em uma frase | Correção proposta |
|---|---|---|---|
| **A1** | premiere-helmet-library/.debug; instalar.bat:25 | O `instalar.bat` copia a pasta inteira, então o `.debug` vai para o PC de todo usuário e abre a porta de depuração 8099; como o Node está ligado, quem conseguir se conectar nessa porta roda qualquer programa no computador. | Igual ao Helmet DL: o `instalar.bat` deixa de copiar o `.debug`, o `empacotar.ps1` recusa gerar pacote com ele, e ele sai do git (`.gitignore`). No seu PC de desenvolvimento continua funcionando — explico no README como ligar. |
| **A2** | library.js:99-104 (ler), 107-118 (salvar); main.js:18, 159 | Se o `config.json` estiver corrompido (queda de energia, disco cheio, edição manual), a leitura falha **em silêncio**, o painel começa vazio e, na primeira mudança, grava por cima — **todas as bibliotecas e favoritos se perdem sem aviso**. Um `config.json` com um campo do tipo errado (ex.: `"libraries": {}`) deixa o painel em branco. | (1) Antes de cada gravação, guardar a versão anterior em `config.json.bak`. (2) Ao ler: se o arquivo estiver corrompido, renomear para `config.corrompido-<data>.json` (nunca gravar por cima), tentar o `.bak` e avisar "Suas configurações estavam danificadas e foram recuperadas do backup de <data>" (ou "…e foram reiniciadas; o arquivo antigo ficou salvo em …"). (3) Conferir cada campo: o que vier com tipo errado volta para o padrão, sem travar. |

### Médio

| ID | Onde | Risco em uma frase | Correção proposta |
|---|---|---|---|
| **M1** | library.js:248 | Para esconder a pasta `.helmet-previews`, usa `exec('attrib +h "<caminho>"')`: o caminho da sua pasta vai **dentro do texto de um comando** do `cmd.exe` (um nome de pasta com `%` já é interpretado pelo cmd), e o `attrib` é chamado só pelo nome, sem tempo limite. | `execFile("%SystemRoot%\System32\attrib.exe", ["+h", caminho])`, com argumentos em lista, sem `cmd`, com tempo limite e sem janela. |
| **M2** | library.js:409, 411, 416, 417 | "Mostrar/Abrir no Explorer" chamam `explorer.exe` (e `open` no Mac) só pelo nome: o Windows procura primeiro na pasta atual, então um `explorer.exe` falso ali seria executado. Os argumentos já vão em lista (bom). | Caminho completo: `%SystemRoot%\explorer.exe` e `/usr/bin/open`. |
| **M3** | library.js:129-191 (`listDir`, `walk`, `listDirs`), 376 (vigia) | Atalhos de pasta do Windows (junções/links simbólicos) dentro de uma biblioteca são seguidos sem conferência: a extensão passa a ler (e listar, buscar, arrastar) pastas **fora** da biblioteca, e um link que aponta para a pasta "mãe" faz a busca girar em círculo até o caminho ficar longo demais. | Conferir com `lstat`/`realpath`: link só é seguido se o destino real estiver **dentro da mesma biblioteca** (decisão D4); a busca guarda as pastas já visitadas para nunca repetir. |
| **M4** | library.js:262-270 (`clearDir`); main.js:852-858, 1007-1015 | "Limpar previews" apaga **todo e qualquer arquivo** que estiver na pasta de cache, sem confirmar e sem conferir os nomes: se `.helmet-previews` for um atalho para outra pasta, ou se alguém guardou algo ali, esses arquivos somem para sempre (não vão para a Lixeira). | (1) Só apagar arquivos com nome de preview (`<24 letras/números>.json/.jpg/.mp4/.mov/.m4v/.webm`). (2) Recusar se a pasta de cache for um atalho. (3) Pedir confirmação antes de apagar (decisão D3). Mesma regra para gravar: nunca gravar previews numa pasta de cache que seja atalho. |
| **M5** | library.js:275-328 (leitor de .zip), 331-365; previews.js:309-340 | O leitor de `.mogrt` confia nos tamanhos escritos dentro do arquivo: um MOGRT danificado ou malicioso (são muito baixados da internet) pode pedir para reservar até 4 GB de memória ou ser uma "bomba de descompressão" — e tudo roda de forma síncrona, **congelando ou derrubando o painel**. | Conferir os tamanhos contra o tamanho real do arquivo; limites (índice ≤ 16 MB, miniatura ≤ 32 MB, vídeo de preview ≤ 200 MB, `definition.json` ≤ 4 MB); descompressão com limite de saída (`maxOutputLength`); leitura assíncrona para não travar a tela. Fora do limite: o card mostra "MOGRT sem preview (arquivo grande ou danificado)" e continua podendo ser adicionado. |
| **M6** | main.js:137-981 (16 lugares com `innerHTML`) | Nomes de arquivos, pastas, bibliotecas, caminhos e mensagens de erro entram na tela via `innerHTML`. **Hoje todos passam pela função `esc()`**, então não há falha ativa; mas como o Node está ligado, um único `esc()` esquecido no futuro vira execução de programa no computador. | Montar os elementos com `createElement` + `textContent` (incluindo os ícones SVG). O visual fica idêntico. |
| **M7** | instalar.bat:32-35; Add Keys.reg | Para instalar sem assinatura, liga o `PlayerDebugMode`, que desliga a verificação de assinatura de **todas** as extensões CEP do usuário. | Igual ao Helmet Cutter e ao Helmet DL: não é mudança de código; o caminho limpo é assinar a extensão (certificado fora do git). Proposta: deixar pendente e explicado no README (decisão D2). |

### Baixo

| ID | Onde | Risco em uma frase | Correção proposta |
|---|---|---|---|
| **B1** | main.js:702-712, 737, 1102; host/index.jsx:9-29, 191 | A ponte painel → Premiere monta o comando como texto; hoje está protegida (`encodeURIComponent` + `%27`), mas o tipo vai sem proteção e nada impede uma chamada futura de concatenar errado; `hl_getHostVersion` não segue o formato `{ok, data, error}`. | Uma função única no painel, `Host.call("hl_add", {…})`, que serializa com `JSON.stringify` (escapando também os caracteres U+2028/U+2029, que o ExtendScript não aceita dentro de texto); no `.jsx`, uma função auxiliar única com `try/catch` que sempre devolve `{ok, data, error}`, inclusive a versão. |
| **B2** | previews.js:121-137 | Com o cache "dentro da biblioteca", os `.json` de preview vêm junto quando alguém copia uma biblioteca de outra pessoa, e o campo `videoExt` é usado para montar um caminho sem conferência (`../../…` faria o player abrir outro arquivo do disco). | Só aceitar `videoExt` da lista `mp4/mov/m4v/webm` e números nos campos numéricos; o resto é tratado como cache inválido e o preview é refeito. |
| **B3** | main.js:724-737 | O painel manda para o Premiere qualquer caminho que estiver na grade, sem conferir se ele está numa biblioteca ou nos favoritos. Hoje a grade só tem itens de lá, então é só uma segunda trava. | Antes de chamar o Premiere, conferir que o arquivo está dentro de uma biblioteca ou é um favorito. |
| **B4** | client/index.html | Não há "Política de Segurança de Conteúdo" (CSP): se algum dia entrar HTML indevido, nada impede um script embutido de rodar. | Adicionar `<meta http-equiv="Content-Security-Policy">` permitindo só os scripts da própria extensão, imagens/mídia `file:` e `data:`. É uma rede de proteção extra; se algo do Premiere reclamar, aparece no teste e eu ajusto. |

### O que já está certo (não precisa mexer)

- **Remover biblioteca não apaga arquivos**; renomear muda só o nome exibido. Nenhuma função apaga, move ou altera mídia do usuário.
- **Pitch e Reverse** mexem só no preview em memória.
- **Nomes de arquivos criados pela extensão** são fixos ou um código hexadecimal (`.helmet-previews`, `<chave>.jpg`), então não há nome vindo de fora que precise ser limpo. Os nomes de bins vêm das suas pastas e só existem dentro do projeto do Premiere.
- **Escape do texto na tela:** todos os 16 usos de `innerHTML` com dados passam por `esc()`; título de MOGRT, erros e tamanhos usam `title`/`textContent`.
- **`config.json` já é gravado de forma atômica** (temporário + renomear); o problema é só a leitura e a falta de backup (A2).
- **Cache de preview corrompido** não trava nada: é ignorado e refeito.
- **Soltar arquivos dentro do painel** não abre nada (main.js:695-696).
- **Sem `eval`, `new Function`, `setTimeout` com texto, sem nada carregado de CDN ou da internet.** Fontes e ícones são locais.
- **Segredos:** nenhum certificado, senha, chave ou token no projeto. Nenhum caminho pessoal fixo (os caminhos `D:\Biblioteca\…` do `demo.js` são de exemplo). O `config.json` guarda caminhos com o nome de usuário do Windows, mas só no seu PC.
- **Não há `package.json`**, então `npm audit` não se aplica.
- **Flags do manifest:** `--enable-nodejs` é necessário (ler pastas com `fs`, abrir MOGRT com `zlib`, calcular a chave com `crypto`, abrir o Explorer). `--mixed-context` faz o código da página enxergar o Node direto (`require`, `Buffer`); tirar exigiria reescrever o acesso ao Node e, na prática, não fecha a porta (sem ele o Node continua acessível pela página). Proposta: **manter os dois**, com o comentário explicando o impacto no manifest (como no Helmet Cutter). `--autoplay-policy` só deixa o preview tocar sem clique prévio.

---

## 3b. Robustez e desempenho

| ID | Onde | Problema | Proposta |
|---|---|---|---|
| **R1** | previews.js:72-81, 94-100; library.js:243-250 | Se a pasta da biblioteca não aceitar gravação (pasta de rede só leitura, pendrive protegido, pasta do sistema), a criação de `.helmet-previews` dá erro **fora** do tratamento, a fila de previews fica presa e **nenhum preview é gerado mais**, sem nenhum aviso. | Tratar o erro: o card mostra "Sem permissão para gravar previews nesta pasta — use 'Cache do sistema' nas configurações" e a fila continua. |
| **R2** | main.js:312-313, 1026-1031; library.js:159-173 | A busca e as "subpastas juntas" **releem o disco inteiro a cada letra digitada** (com 220 ms de espera); em bibliotecas grandes ou de rede, cada letra demora. Acima de 20 000 arquivos o resultado é cortado sem avisar. | Guardar a lista de arquivos de cada pasta em memória (índice) e só reler o que o vigia de pastas ou o botão Atualizar disserem que mudou. Quando passar do limite: "Mostrando os primeiros 20 000 arquivos". |
| **R3** | main.js:179 (`exists` em cada biblioteca, a cada redesenho da árvore — que acontece a cada mudança detectada pelo vigia), 309 (`statSync` em cada favorito), 983/988 (`dirSize`), 1009 (`clearDir`); previews.js:123, 318 | Várias leituras de disco **síncronas** (o painel para até terminar). Num HD externo ou pasta de rede que caiu, cada uma pode levar vários segundos → painel congelado. | Trocar por versões assíncronas; guardar o estado "pasta ausente" em vez de testar o disco a cada redesenho. |
| **R4** | main.js:347-351; library.js:391; main.js:309 | Pasta desconectada: a mensagem é técnica ("ENOENT: no such file or directory, scandir…"); o vigia de pastas morre em silêncio e não volta quando o HD é reconectado; favoritos de um HD desconectado simplesmente somem da lista, sem aviso. | Mensagens claras ("A pasta não foi encontrada. Se ela está num HD externo ou na rede, confira se está conectado."); religar o vigia no Atualizar/ao reabrir a pasta; mostrar "3 favoritos indisponíveis (pasta desconectada)". |
| **R5** | player.js:131 | O player carrega o áudio **inteiro** na memória, de qualquer tamanho (a forma de onda já tem o limite de 300 MB, o player não): clicar num WAV de 1–2 GB pode derrubar o painel. | Acima de 300 MB, tocar direto pelo `<audio>` comum (o mesmo caminho que já existe quando a decodificação falha), sem Pitch/Reverse para esse arquivo (decisão D5). |
| **R6** | main.js:358-378 | A grade cria todos os cards de uma vez (até 20 000). As miniaturas já são sob demanda (bom), mas criar milhares de cards pesa. | **Não mexer nesta limpeza:** mudar para "grade virtual" é uma reescrita grande da grade, da seleção e do teclado, com risco de mudar comportamento. Fica registrado como melhoria futura. |
| **R7** | — | Previews de arquivos que mudaram ou foram apagados nunca são removidos do cache (ele só cresce). | Só registro: limpar órfãos seria recurso novo. O "Limpar previews" resolve manualmente. |

---

## 4. Problemas de limpeza

| ID | Onde | Problema | Proposta |
|---|---|---|---|
| **L1** | main.js (1120 linhas) | Um arquivo faz tudo: árvore, grade, seleção, teclado, arrastar, ponte com o Premiere, bibliotecas, menus, diálogo e configurações. | Dividir em `config.js`, `host.js` (ponte), `tree.js`, `grid.js` (grade, seleção, teclado, arrastar), `menus.js` (menus e diálogo), `settings.js` e `main.js` (início). Mantendo os nomes `HLLibrary`, `HLPreviews`, `HLPlayer`. |
| **L2** | main.js:9-10; library.js:17-18, 23-43, 69-85, 381; previews.js:14-18, 172, 195; espalhado | Constantes e números "mágicos" espalhados (versão, nome da bin, nome da pasta de cache, lista de tipos, padrões da config, tamanho da miniatura, 300 MB, 2 por vez, tempos de 20 s/700 ms/300 ms/220 ms/5 s/9 s, limite de 20 000, extensões ignoradas pelo vigia). | Tudo em `config.js`. |
| **L3** | library.js:129-191, 196-207; main.js:310, 852-858 × 1007-1015, 91-96 × player.js:424-430, 897-901 × 109-117; index.jsx:222-227 × 256-261, 26-27, 44-45, 210-274 | Duplicações: `listDir`/`listDirs`/`fileEntry` fazem quase o mesmo; a ordenação por nome aparece 3 vezes (uma diferente das outras); a limpeza de cache existe 2 vezes; dois formatadores de tempo; "favoritar vários" repete o `toggleFav`; no `.jsx`, "criar trilha e procurar de novo" 2 vezes e o JSON de resposta montado à mão em 8 lugares. | Uma função para cada coisa; no `.jsx`, um pequeno `hl_json(obj)` que monta a resposta a partir de um objeto. |
| **L4** | index.jsx:31-49; player.js:27-33, 297-306, 432-444; main.js:47, 93; previews.js:184; index.html:24-25 | Código sem uso: `hl_getInfo` (nunca é chamado); no player, `stop()`, o "loop" (não há botão de loop), o auxiliar `multi()` e 5 funções exportadas que ninguém usa; `state.busy`; linha que nunca roda em `fmtDur`; `meta.animated`; ícones `i-repeat` e `i-stop`. | Remover. (Os campos `channels`/`sampleRate` do cache ficam, para não invalidar previews já gerados.) |
| **L5** | main.js:688, 1103; previews.js:77; library.js:115 | Um `console.log` de depuração a cada arraste e avisos soltos no console; vários `catch { }` vazios escondem problemas. | Um logger simples `HL.log` com `debug` desligado por padrão em `config.js`; os `catch` vazios passam a registrar em `debug`. |
| **L6** | main.js:351, 706-707; previews.js:174, 198, 224; library.js:115 | Mensagens pouco úteis: erro técnico do Node ao abrir pasta; "Erro no ExtendScript. Reabra o painel." quando o `index.jsx` não carregou; falha ao salvar a configuração só vai para o console (o usuário não fica sabendo). | Mensagens claras: pasta não encontrada/sem permissão/em uso; "O script do Premiere não carregou — reinstale a extensão"; "Não foi possível salvar suas configurações (disco cheio ou sem permissão)". |
| **L7** | raiz | Não há `.gitignore` nem `.gitattributes`. | `.gitignore` cobrindo `node_modules/`, `dist/`, `build/`, `*.zxp`, `*.zip`, certificados e chaves (`*.p12`, `*.pfx`, `*.key`, `*.pem`, `*.crt`, `*.cer`), `.debug`, `.helmet-previews/`, temporários e lixo do Windows. `.gitattributes` mantendo `.bat` com quebra de linha do Windows (lição do Helmet Cutter). |
| **L8** | Add Keys.reg | Liga CSXS 5 a 15 (o `instalar.bat` liga 9 a 16) e também o `LogLevel`. | Igual aos outros dois: CSXS 9 a 16, só `PlayerDebugMode`. |
| **L9** | — | Não há script de empacotamento; hoje o "pacote" é a pasta inteira (com `.debug`). | `empacotar.ps1` que gera `dist\HelmetLibrary-<versão>.zip` só com o necessário e **para com erro** se achar `.debug`, certificado ou chave, ou se as versões não baterem. |
| **L10** | host/index.jsx | Salvo **sem BOM** e com mensagens acentuadas ("Arquivo **não** encontrado"). **Você confirmou que os acentos aparecem certos no Premiere**, então não há bug. | Salvar em UTF-8 com BOM só para ficar igual ao Helmet Cutter e ao Helmet DL e não depender de como o Premiere adivinha a codificação. Os acentos continuam certos (confere no roteiro de testes). |
| **L11** | manifest.xml:3, 6; main.js:9; index.jsx:7 | A versão aparece em quatro lugares. | Manter (o aviso "painel ≠ host" depende disso), mas o `empacotar.ps1` confere se os quatro batem. |
| **L12** | premiere-helmet-library/README.md; como instalar.txt | README dentro da pasta da extensão; `como instalar.txt` repete o README; não há CHANGELOG nem roteiro de testes. | README na raiz, `CHANGELOG.md`, `TESTES.md` (fase final). |
| **L13** | manifest.xml:2 | O ID da extensão é `com.seuestudio.helmetlibrary` ("seu estúdio", texto de modelo). | **Não mudar:** trocar o ID faz o Premiere tratar como outra extensão. Só registro. |
| **L14** | — | Não há testes automáticos. | `tests\run-tests.js` (Node puro, como nos outros dois) para o que não depende do Premiere: tipos de arquivo, "está dentro da biblioteca", chave do cache, leitor de `.mogrt` com arquivos de teste (inclusive danificados), recuperação do `config.json`, filtro de nomes do "Limpar previews", serialização da ponte; e um "Premiere de mentira" para testar o `index.jsx`. |

| **L15** | instalar.bat | Já existe e é quase idêntico ao do Helmet DL **antes** da limpeza: não tira o `.debug`, não diz a versão, não confere se o registro foi gravado, e não avisa se existe uma cópia instalada pelo jeito manual (`C:\Program Files (x86)\Common Files\Adobe\CEP\extensions`), o que deixaria a extensão duplicada. | Deixar no modelo do `instalar.bat` do Helmet Cutter (sem a parte do "Silence Cutter antigo", que não se aplica): [1/3] copiar e tirar o `.debug`, [2/3] liberar extensões não assinadas conferindo erro, [3/3] avisar de cópia antiga em `Program Files (x86)`. Mantém o aviso de que as bibliotecas e configurações não são apagadas. |

### Arquivos cujo uso não está claro — preciso que você decida (D1)

- `como instalar.txt` — repete o README num tom informal.
- `Add Keys.reg` — alternativa manual ao `instalar.bat` (faz a mesma coisa que ele já faz).
- `client/js/demo.js` — biblioteca de exemplo para abrir o painel num navegador comum.

---

## 5. Decisões que preciso de você

- **D1 — Arquivos acima.** Sugestão (igual ao Helmet DL): juntar `como instalar.txt` no README
  e apagar; **manter** `Add Keys.reg` (corrigido conforme L8) e o `demo.js` (útil para ajustar
  o visual, e não roda dentro do Premiere).
- **D2 — PlayerDebugMode / assinatura (M7).** Sugestão: deixar pendente, como nos outros dois,
  com explicação no README.
- **D3 — Apagar previews.** São só arquivos de cache, refeitos sozinhos, e podem ser milhares
  de arquivos pequenos. Sugestão: **pedir confirmação** ("Apagar 1 234 previews (56 MB)? Eles
  são refeitos quando você abrir as pastas.") e **apagar de vez, sem Lixeira** — mandar
  milhares de miniaturas para a Lixeira só a encheria. "Gerar preview de novo" (de um arquivo)
  continua sem perguntar. Isso adiciona uma janelinha que hoje não existe.
- **D4 — Atalhos de pasta (junções/links) dentro de uma biblioteca (M3).** Opções:
  (a) seguir só se apontarem para dentro da mesma biblioteca — **sugestão**;
  (b) nunca seguir; (c) seguir sempre (como hoje, só evitando o "círculo").
  Se você usa atalhos para juntar pastas de outros HDs numa biblioteca, a (a) esconderia
  essas pastas — nesse caso o melhor é adicionar cada uma como biblioteca.
- **D5 — Áudio muito grande no player (R5).** Sugestão: acima de 300 MB tocar pelo player
  simples, sem Pitch/Reverse nesse arquivo (hoje pode derrubar o painel).
- **D6 — Versão.** O painel está na 1.2.3. Sugestão: sair como **1.3.0**.

---

## 6. Plano de execução (um commit por etapa)

| # | Etapa | Itens |
|---|---|---|
| 1 | Arquivos do repositório: `.gitignore`, `.gitattributes`, `.debug` fora do git, decisões D1, README na raiz, `Add Keys.reg` | L7, L8, L12 (parte), D1, A1 (parte) |
| 2 | Instalação e pacote: `instalar.bat` no modelo do Helmet Cutter (etapas numeradas, versão, sem `.debug`, confere se o registro foi gravado, avisa de cópia antiga em `Program Files (x86)`); `empacotar.ps1` com conferência de versões | A1, L9, L11, L15 |
| 3 | `config.json` seguro: backup, recuperação com aviso, conferência dos campos | A2 |
| 4 | Caminhos e exclusões: atalhos de pasta, cache nunca em atalho, "Limpar previews" só apaga previews e pede confirmação, cache de preview conferido, segunda trava antes de mandar ao Premiere | M3, M4, B2, B3, D3, D4 |
| 5 | MOGRT: limites de tamanho e leitura sem travar a tela | M5 |
| 6 | Processos: `attrib`, Explorer e `open` com caminho completo, argumentos em lista e tempo limite | M1, M2 |
| 7 | Interface: fim do `innerHTML` com dados; CSP | M6, B4 |
| 8 | Ponte única painel → Premiere; `index.jsx` com auxiliar único e BOM | B1, L10 |
| 9 | Robustez e desempenho: previews em pasta só leitura, índice da busca, leituras assíncronas, HD/rede desconectados, áudio grande | R1–R5, D5 |
| 10 | Limpeza: `config.js`, dividir `main.js`, duplicações, código morto, logger | L1–L5 |
| 11 | Mensagens de erro claras | L6 |
| 12 | Fase final: README, CHANGELOG, TESTES.md (roteiro manual), versão (D6), situação final neste arquivo | L12, L14 |

Os testes automáticos (L14) entram junto de cada etapa a partir da 3. O que depende do
Premiere de verdade vai para o `TESTES.md`, e **você precisará testar no Premiere**, porque
eu não tenho como abri-lo.

**Fase 1 encerrada. Aguardando sua aprovação — da lista de funções (seção 2), das decisões
D1 a D6 e do plano — antes de alterar qualquer coisa.**

---

## 7. Situação final — versão 1.3.0

Data: 20/11/2026 · Branch `limpeza-seguranca` (ainda **não** juntada à `main`) · 12 etapas,
um commit cada (`3cb67da` a este). Testes automáticos: **36 de 36** passando
(`node tests/run-tests.js`). Pacote: `empacotar.ps1` gera `dist\HelmetLibrary-1.3.0.zip`
sem `.debug`, certificados, testes nem auditoria.

### O que foi resolvido

| Item | Situação | Onde |
|---|---|---|
| A1 `.debug` na instalação | Resolvido: fora do git, o `instalar.bat` apaga, o `empacotar.ps1` recusa | etapas 1–2 |
| A2 `config.json` corrompido | Resolvido: backup `.bak`, arquivo estragado guardado à parte, aviso ao usuário, campos conferidos | etapa 3 |
| M1 `attrib` por texto | Resolvido: `execFile` com caminho completo, lista de argumentos e tempo limite | etapa 6 |
| M2 Explorer pelo nome | Resolvido: caminho completo da pasta do Windows | etapa 6 |
| M3 atalhos de pasta | Resolvido (D4): só seguidos se apontarem para dentro da mesma biblioteca; sem "círculo" | etapa 4 |
| M4 Limpar previews | Resolvido (D3): só nomes de preview, confirmação com quantidade e tamanho, nunca através de atalho | etapa 4 |
| M5 leitor de MOGRT | Resolvido: limites de tamanho, leitura assíncrona, arquivo danificado recusado | etapa 5 |
| M6 `innerHTML` | Resolvido: nenhum `innerHTML` com dados; tela conferida igual no modo demonstração | etapa 7 |
| M7 `PlayerDebugMode` | **Pendente (D2)**: depende de assinar a extensão (`.zxp`), como no Helmet Cutter e no Helmet DL | — |
| B1 ponte com o Premiere | Resolvido: `bridge.js` com JSON (inclusive U+2028/U+2029), lista de funções permitidas, host sempre `{ok, data, error}` | etapa 8 |
| B2 cache de outro PC | Resolvido: `.json` de preview conferido campo a campo | etapa 4 |
| B3 segunda trava | Resolvido: só vai ao Premiere arquivo de biblioteca ou favorito (botões e arrastar) | etapa 4 |
| B4 CSP | Resolvido: CSP no `index.html` sem script embutido nem internet | etapa 7 |
| R1 pasta só leitura | Resolvido: falha só daquele preview + aviso sugerindo "Cache do sistema" | etapa 9 |
| R2 busca | Resolvido: índice em memória por 30 s (vigia, Atualizar e opção de desconhecidos apagam) + aviso acima de 20.000 | etapa 9 |
| R3 leituras síncronas | Resolvido na navegação e nos previews (árvore, favoritos, início, cache). Restam síncronas: a leitura/gravação do `config.json` (arquivo pequeno em `%APPDATA%`), a criação da pasta de previews e o apagar do "Gerar preview de novo" (poucos arquivos pequenos) | etapa 9 |
| R4 pasta desconectada | Resolvido: mensagens claras, biblioteca marcada e conferida de novo (abrir, clicar, atualizar, voltar ao painel), vigia religado, aviso de favoritos não encontrados | etapa 9 |
| R5 áudio grande no player | Resolvido (D5): acima de 300 MB, player simples sem Pitch/Reverse | etapa 9 |
| R6 grade com milhares de cards | **Não mexido** (registrado): grade virtual seria reescrita grande | — |
| R7 cache só cresce | **Não mexido** (registrado): seria recurso novo; "Limpar previews" resolve | — |
| L1 `main.js` gigante | Resolvido: `app.js`, `tree.js`, `grid.js`, `host.js`, `libraries.js`, `menus.js`, `settings.js`, `main.js`. Dois arquivos a mais que o planejado (`app.js` com a base comum e `libraries.js`), para nenhum ficar grande demais | etapa 10 |
| L2 constantes | Resolvido: `config.js` | etapa 10 |
| L3 duplicações | Resolvido (favoritar vários, ordenação, limpeza de cache, `listDir`, `.jsx`). Os dois formatadores de tempo ficaram: mostram formatos diferentes de propósito (`1:05` no card, `00:01:05:12` no player) | etapas 4, 8, 10 |
| L4 código sem uso | Resolvido | etapas 8, 10 |
| L5 logger | Resolvido: `HL.log` (só com `DEBUG: true`) e `HL.warn` | etapa 10 |
| L6 mensagens | Resolvido | etapas 3, 8, 9, 11 |
| L7–L12, L14, L15 | Resolvidos | etapas 1, 2, 8, 12 |
| L13 ID `com.seuestudio…` | **Não mudado** de propósito (mudaria a extensão para o Premiere) | — |
| D1 | `como instalar.txt` removido; `Add Keys.reg` e `demo.js` mantidos | etapa 1 |
| D6 | Versão 1.3.0 nos quatro lugares (conferido pelo `empacotar.ps1`) | etapa 12 |

### P1 — problema antigo encontrado nos testes (mantido de propósito)

Ao colocar um **vídeo** na timeline, a extensão procura V e A livres **com o mesmo número**.
Quando ela mesma cria trilhas, elas podem ficar desencontradas e o vídeo é recusado mesmo
havendo espaço. Exemplo: sequência só com V1/A1, agulha parada, adicionar dois áudios (o
segundo cria a A2) e depois um vídeo → a extensão cria V2/A3, procura o par V2/A2 (A2
ocupada) e diz "Não há trilha livre na posição da agulha".

Já era assim na 1.2.3; como a regra era não mudar comportamento, ficou igual e há um teste
que documenta isso (`host: vídeo usa V e A livres no mesmo número de trilha`). **Correção
sugerida para uma próxima versão:** depois de criar trilhas, procurar de novo o primeiro
número em que V **e** A estejam livres e, se não houver, criar só o que falta (V ou A) até
os dois coincidirem.

### Pendências

1. **Testar no Premiere** com o `TESTES.md` (eu não tenho como abrir o Premiere).
2. **D2 / M7 — assinatura:** gerar certificado, assinar o `.zxp` e então tirar o
   `PlayerDebugMode` do instalador (o certificado nunca vai para o git: o `.gitignore` já cobre).
3. **Juntar a branch** `limpeza-seguranca` na `main` depois dos testes.
4. Melhorias futuras registradas: P1, R6, R7.

## 8. Testes no Premiere da 1.3.0 e correções da 1.3.1

Resultado do `TESTES.md` na 1.3.0: quase tudo passou. O que falhou:

| Item | O que aconteceu | Causa | 1.3.1 |
|---|---|---|---|
| 8.2 | Junção para `C:\Windows` aparecia no painel | O Node do Premiere (NW.js 0.63) não diz que uma junção é atalho (`isSymbolicLink` falso) | Toda pasta tem o caminho real (`realpath`) e o destino do link (`readlink`) conferidos; teste novo simula esse Node |
| 2.5 | Esc não fechava o preview | O Premiere fica com a tecla (já era assim na 1.2.3) | `registerKeyEventsInterest` para o Esc |
| 2.8, 2.11, 3.4, 4.3 | Vídeo arrastado entrava só com áudio; no segundo arrasto dava certo | O Premiere só monta vídeo + áudio de arquivo que já está no projeto (já era assim na 1.2.3) | Pré-importação na bin ao começar a arrastar (mudança de comportamento aprovada). MOGRT fica de fora |
| 2.13 | Não dava para buscar fora de uma pasta | Funciona como planejado | README explica: clicar no nome da biblioteca busca nela toda |
| 5.x, 8.5 | Não testados (faltavam arquivos) | Comando da seção 5 dependia de um `modelo.wav` | Arquivos criados em `E:\Teste Helmet`; comando corrigido |
| 6.4 | "Nada aconteceu" | Instrução pouco clara: era preciso estragar o `config.json` de novo | Texto corrigido |
| 7.5, 7.6 | Não testados | Sem HD externo / pasta de rede | Pendente |

**Ideia para o futuro (recurso novo, não feito):** busca em todas as bibliotecas de uma vez.

### Reteste da 1.3.1 e ajustes da 1.3.2

Passaram 2.5, 8.2, seção 5, 8.5 e 2.13; o vídeo arrastado entra com imagem e som no primeiro arrasto.
Dois efeitos colaterais da pré-importação, corrigidos na 1.3.2:

| Problema | Causa | 1.3.2 |
|---|---|---|
| O painel Project abria sozinho ao arrastar | Todo import faz o Premiere trazer o Project para a frente | Só vídeo é pré-importado; depois o painel pede para voltar à frente (`requestOpenExtension`) |
| Arrastar para o Project deixava o arquivo duplicado | Ao soltar no Project o Premiere importa uma cópia própria | `hl_dropDuplicate`: 1,5 s e 5 s depois de soltar, remove a cópia pré-importada se ela foi criada por esse arrasto, se há outra cópia e se não está em nenhuma sequência (o script do Premiere não tem "apagar item": move para uma bin temporária e apaga a bin) |

Pedido do usuário deixado para depois: tirar o vídeo do projeto quando o arrasto é cancelado.
MOGRT continua sem entrar arrastando (o Premiere não aceita); o caminho é o botão Adicionar.
