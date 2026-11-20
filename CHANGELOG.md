# Changelog — Helmet Library

## 1.2.0 — 2026-11-20 · inglês

- ★ O painel agora tem inglês e português. **Inglês é o idioma padrão**; para trocar, abra as
  **Configurações** (Settings) e escolha em **Language / Idioma**. A troca vale na hora (sem
  fechar o painel) e fica salva.
- As mensagens que vêm do Premiere (erros ao adicionar, MOGRT, arrastar) e os avisos de preview
  guardados no cache também aparecem no idioma escolhido.
- A última mensagem da barra de baixo fica no idioma em que foi escrita até a próxima.
- Nomes de pastas e arquivos nunca são traduzidos (uma pasta chamada "Abrir" continua "Abrir").
- Testes novos garantem que toda frase do painel, do index.html e do host tem tradução.

## 1.1.0 — 2026-11-20 · limpeza, segurança e arrastar

O painel funciona como antes, só que mais seguro, sem travar com HD/rede desconectados e com mensagens mais claras. A única mudança de comportamento é o **arrastar**, que agora segue o método do Animation Composer (vídeo entra com imagem e som, MOGRT entra arrastando). Detalhes técnicos na `AUDITORIA.md`.

### Arrastar

- **Vídeo** arrastado entra com imagem e som já no primeiro arrasto (antes entrava só o áudio), sem o painel Project vir para a frente. O arrasto leva só o caminho do arquivo, como o Animation Composer, e o Premiere importa e coloca o vídeo ao soltar.
- **MOGRT agora entra arrastando** (antes só pelo botão Adicionar). O arrasto leva uma imagem cinza com o nome do MOGRT; depois de soltar, a extensão desfaz a soltura (o mesmo Ctrl+Z do Premiere que o Composer usa) e coloca o MOGRT no lugar dela. O que a imagem cobriu volta inteiro, as trilhas criadas ao soltar continuam lá, vários MOGRTs em fila continuam em fila e o MOGRT colocado fica selecionado. As imagens provisórias ficam em `%LOCALAPPDATA%\Helmet Library\arrastar`.
- MOGRT solto no **painel Project**, no **Source Monitor** ou numa **timeline sem sequência**: a imagem sai e a barra de baixo explica o que fazer.
- MOGRT vai num **arrasto só dele**: se a seleção tiver outros arquivos junto, só os MOGRTs vão e a barra de baixo avisa.
- Áudio e imagem continuam entrando arrastando como antes.

### Segurança

- **Nomes de arquivo nunca viram código.** Nomes de pastas e arquivos e títulos de MOGRT entram na tela só como texto. Antes eles eram "escapados" um a um (não havia falha ativa), mas um único esquecimento no futuro deixaria um nome preparado rodar programas no computador, já que o painel tem acesso ao Node.
- **Proteção extra no painel (Content-Security-Policy):** nada de script embutido nem de arquivos da internet.
- **Ponte única com o Premiere:** tudo vai e volta em JSON; nomes com acento, aspas, emoji ou `%` chegam intactos, e só as funções previstas podem ser chamadas.
- **Atalhos (links) de pasta** só são seguidos se apontarem para dentro da mesma biblioteca (cada pasta tem o lugar real conferido, porque no Premiere o sistema nem sempre avisa que é um atalho); a busca não anda mais em círculo com um atalho que aponta para a pasta "mãe".
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
- **Esc** funciona dentro do painel (fecha o preview, limpa a busca ou a seleção).

### Mensagens

- Erros explicam a causa provável e o que fazer: pasta não encontrada, sem permissão, em uso, disco ou rede que não respondeu, disco cheio, "a parte da extensão que roda no Premiere não carregou — reinstale".

### Instalação e projeto

- `instalar.bat` no modelo do Helmet Cutter: etapas numeradas, versão, confere se a liberação de extensões foi gravada e avisa de cópia antiga em `Program Files (x86)`.
- `Add Keys.reg` igual aos das outras extensões (CSXS 9 a 16, só `PlayerDebugMode`).
- `empacotar.ps1` gera o `.zip` de distribuição e confere se as versões batem.
- Código reorganizado: constantes em `config.js` e a interface dividida em arquivos menores; código sem uso removido.
- Testes automáticos (`node tests/run-tests.js`).
- README na raiz (explica também como buscar na biblioteca inteira); `como instalar.txt` removido (repetia o README).

## 1.0.0 — primeira versão

Bibliotecas de pastas, previews, player com Pitch/Reverse, favoritos, busca, arrastar para a timeline/Project e importação em bins.
