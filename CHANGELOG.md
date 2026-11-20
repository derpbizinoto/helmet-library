# Changelog — Helmet Library

## 1.3.6 — vídeo arrastado igual ao Animation Composer

- **Vídeo arrastado** agora segue exatamente o método do Animation Composer: o arrasto leva só o caminho do arquivo verdadeiro, no formato próprio do CEP. Sem importar antes, sem imagem provisória, sem troca depois de soltar e sem os formatos extras (lista de URLs e texto). O próprio Premiere importa e coloca o vídeo ao soltar.
- Sai todo o sistema de vídeo da 1.3.1 a 1.3.5 (pré-importação, imagem provisória de vídeo, troca e importação no Project).
- Áudio, imagem e MOGRT não mudam.

## 1.3.5 — vídeo arrastado com imagem provisória

- **Vídeo arrastado** agora usa o mesmo esquema do MOGRT: vai como uma imagem cinza com o nome dele, trocada pelo vídeo (imagem e som) no mesmo lugar depois de soltar.
- **Sai a importação ao começar a arrastar** (1.3.1 a 1.3.3), que fazia o painel Project vir para a frente. Com ela saem também a retirada da cópia duplicada e o pedido para o painel voltar, que não são mais necessários.
- Vários vídeos/MOGRTs em fila continuam em fila, cada um com a duração real. Se o lugar já tiver algo na trilha de vídeo ou de áudio, o vídeo vai para a primeira trilha livre no mesmo tempo, sem cobrir nada.
- **MOGRT solto no painel Project** não tenta mais importar (o Premiere abria o aviso "Motion Graphics Templates cannot be imported into the Project panel"): a imagem provisória sai e a barra de baixo explica que é para arrastar para a timeline.

## 1.3.4 — arrastar MOGRT

- **MOGRT agora entra arrastando.** O Premiere não aceita `.mogrt` arrastado de um painel, então a extensão arrasta no lugar uma imagem cinza com o nome do MOGRT. Depois de soltar, ela troca a imagem pelo MOGRT na mesma posição e trilha e tira a imagem do projeto. Solto no painel Project, o MOGRT vai "só no projeto". É a mesma ideia usada por outras extensões de biblioteca.
- A imagem provisória fica em `%LOCALAPPDATA%\Helmet Library\arrastar` (uma por MOGRT, minúscula).

## 1.3.3 — painel de volta depois de soltar

- O pedido para o Helmet Library voltar para a frente agora também é feito **depois de soltar** o vídeo (300 ms e 1,2 s depois). Na 1.3.2 ele só era feito durante o arrasto, e o Premiere ignorava.

## 1.3.2 — ajustes do arrastar

- Só **vídeos** são importados ao começar a arrastar (áudio e imagem já entravam certo). Assim o painel Project não abre à toa.
- Depois de importar o vídeo, o painel **Helmet Library volta para a frente** (o Premiere trazia o Project).
- Vídeo solto no **painel Project** não fica mais duplicado: alguns segundos depois, a cópia que a extensão importou é retirada, junto com as bins que ficaram vazias. Ela só sai se foi criada por esse arrasto, se existe a outra cópia e se não está em nenhuma sequência; na dúvida, nada é apagado.

## 1.3.1 — correções dos testes no Premiere

- **Atalho de pasta para fora da biblioteca** (ex.: uma junção para `C:\Windows`) voltou a ficar escondido. No Premiere, o sistema nem sempre avisa que a pasta é um atalho; agora toda pasta tem o lugar real conferido.
- **Esc** volta a funcionar dentro do painel (fecha o preview, limpa a busca ou a seleção). O painel agora pede ao Premiere para receber essa tecla.
- **Arrastar um vídeo** para a timeline trazia só o áudio na primeira vez. Agora, ao começar a arrastar, o arquivo é importado na bin **Helmet Library** em segundo plano (sem duplicar se já estiver lá). Mudança de comportamento combinada: o arquivo fica na bin mesmo se o arrasto for cancelado. MOGRT não entra nessa pré-importação.
- README: explica como buscar na biblioteca inteira (clicar no nome da biblioteca antes).
- TESTES.md: item 6.4 mais claro e comando da seção 5 mais robusto.

## 1.3.0 — limpeza e segurança

Nenhum recurso novo e nenhuma mudança visual: o painel funciona como antes, só que mais seguro, sem travar com HD/rede desconectados e com mensagens mais claras. Detalhes técnicos na `AUDITORIA.md`.

### Segurança

- **Nomes de arquivo nunca viram código.** Nomes de pastas e arquivos e títulos de MOGRT entram na tela só como texto. Antes eles eram "escapados" um a um (não havia falha ativa), mas um único esquecimento no futuro deixaria um nome preparado rodar programas no computador, já que o painel tem acesso ao Node.
- **Proteção extra no painel (Content-Security-Policy):** nada de script embutido nem de arquivos da internet.
- **Ponte única com o Premiere:** tudo vai e volta em JSON; nomes com acento, aspas, emoji ou `%` chegam intactos, e só as funções previstas podem ser chamadas.
- **Atalhos (links) de pasta** só são seguidos se apontarem para dentro da mesma biblioteca; a busca não anda mais em círculo com um atalho que aponta para a pasta "mãe".
- **Limpar previews** pede confirmação, mostra quanto vai apagar e só apaga arquivos de preview criados pela extensão (nunca a mídia). A pasta de previews nunca é um atalho para outro lugar.
- **Só vai para o Premiere** arquivo que está numa biblioteca ou nos favoritos.
- **Leitor de MOGRT** com limites de tamanho: um `.mogrt` danificado ou "bomba de descompressão" não trava nem enche a memória.
- **Programas do Windows** (Explorer, `attrib`) chamados pelo caminho completo, sem prompt de comando e com tempo limite.
- **Arquivo de depuração `.debug`** fora do git, do instalador e do pacote (ele abria uma porta que permitia rodar programas no computador).

### Dados

- `config.json` gravado de forma segura (arquivo temporário + troca) e com backup da versão anterior (`config.json.bak`).
- Arquivo de configuração estragado: o painel avisa, guarda o estragado à parte e recupera o backup, sem perder nada.
- Falha ao salvar as configurações aparece na barra de baixo (antes só ia para o console).

### Robustez

- Leituras do disco que não travam o painel: HD externo ou pasta de rede lentos/desconectados não congelam mais a tela.
- Biblioteca desconectada aparece marcada e volta sozinha quando o HD ou a rede voltam; favoritos não encontrados são avisados.
- A busca guarda o resultado por 30 s (não relê o disco a cada letra) e avisa quando passa de 20.000 arquivos.
- Pasta só de leitura: aviso claro sugerindo o "Cache do sistema".
- Áudio acima de 300 MB toca pelo player simples (sem Pitch/Reverse), sem carregar o arquivo inteiro na memória.

### Mensagens

- Erros explicam a causa provável e o que fazer: pasta não encontrada, sem permissão, em uso, disco ou rede que não respondeu, disco cheio, "a parte da extensão que roda no Premiere não carregou — reinstale".

### Instalação e projeto

- `instalar.bat` no modelo do Helmet Cutter: etapas numeradas, versão, confere se a liberação de extensões foi gravada e avisa de cópia antiga em `Program Files (x86)`.
- `Add Keys.reg` igual aos das outras extensões (CSXS 9 a 16, só `PlayerDebugMode`).
- `empacotar.ps1` gera o `.zip` de distribuição e confere se as versões batem.
- Código reorganizado: constantes em `config.js` e a interface dividida em arquivos menores; código sem uso removido.
- Testes automáticos (`node tests/run-tests.js`) e roteiro de testes no Premiere (`TESTES.md`).
- README na raiz; `como instalar.txt` removido (repetia o README).

## 1.2.3 e anteriores

Sem registro detalhado. Da 1.0 à 1.2.3: bibliotecas de pastas, previews, player com Pitch/Reverse, favoritos, busca, arrastar para a timeline/Project e importação em bins.
