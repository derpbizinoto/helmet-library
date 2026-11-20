// client/js/i18n.js — Helmet Library
// Idioma do painel: inglês (padrão) ou português, escolhido em Configurações › Language /
// Idioma e lembrado entre sessões. Vem logo depois do config.js (todos os outros usam).
//
// Como funciona: o texto continua escrito em português no código e no index.html;
// o português é a "chave". Em inglês, tr() troca a frase pela tradução do
// dicionário EN abaixo. Frase nova na tela = entrada nova no EN (os testes
// automáticos falham se faltar alguma).
//
//   tr("{0} arquivos", 3)          -> "3 files"  ({0}, {1}… são trocados pelos argumentos)
//   N("frase", …)                  -> a frase em português, sempre (com os {0} trocados). Marca
//                                     frases guardadas (constantes, cache de previews) para os
//                                     testes acharem; a tradução acontece ao mostrar, com tr()/trMsg()
//   trMsg(texto)                   -> traduz uma mensagem pronta em português: as do host/index.jsx
//                                     (ex.: "Erro ao adicionar: Nenhum projeto aberto.") e as
//                                     guardadas no cache de previews
//   trParts("Clique em {0}…", el)  -> lista de textos e elementos, para montar com h()/fill()
//   HLI18n.apply()                 -> traduz o texto fixo do index.html (textos, title, placeholder)
var HLI18n = (function () {
    "use strict";

    var LANGS = ["en", "pt"];
    var KEY = "helmetlibrary.lang";

    var EN = {
        // --- index.html -------------------------------------------------------------
        "Buscar nesta pasta e subpastas": "Search this folder and subfolders",
        "Limpar busca": "Clear search",
        "Tipo de arquivo": "File type",
        "Todos os tipos": "All types",
        "Vídeos": "Videos",
        "Áudios": "Audio",
        "Imagens": "Images",
        "Outros": "Other",
        "Configurações": "Settings",
        "Adicionar pasta": "Add folder",
        "Arraste para redimensionar": "Drag to resize",
        "Mostrar também os arquivos das subpastas": "Also show files from subfolders",
        "Atualizar": "Refresh",
        "Selecione um arquivo para pré-visualizar.": "Select a file to preview.",
        "Arraste para buscar": "Drag to seek",
        "Tocar (espaço)": "Play (space)",
        "Pausar (espaço)": "Pause (space)",
        "Mudo": "Mute",
        "Volume do preview": "Preview volume",
        "Só no preview, não altera o arquivo": "Preview only, doesn't change the file",
        "Toca de trás pra frente (só no preview)": "Plays backwards (preview only)",
        "Tamanho das miniaturas": "Thumbnail size",
        "Importa no painel Project sem colocar na timeline": "Imports into the Project panel without placing it on the timeline",
        "Só no projeto": "Project only",
        "Coloca na timeline, na posição da agulha (Enter)": "Places it on the timeline at the playhead (Enter)",
        "Adicionar": "Add",
        "Fechar": "Close",
        "Onde salvar os previews": "Where to save previews",
        "Dentro da biblioteca": "Inside the library",
        "Cache do sistema": "System cache",
        "Limpar previews": "Clear previews",
        "Ao adicionar": "When adding",
        "Importar numa bin \"Helmet Library\"": "Import into a \"Helmet Library\" bin",
        "Desligado: vai para a raiz do Project": "Off: goes to the root of the Project",
        "Recriar as pastas como bins": "Recreate folders as bins",
        "Ex.: Helmet Library › SFX › Whooshes": "E.g.: Helmet Library › SFX › Whooshes",
        "Duplo clique no arquivo": "Double-click on a file",
        "Adiciona na timeline": "Adds to the timeline",
        "Importa só no projeto": "Imports to the project only",
        "Exibição": "Display",
        "Tocar ao selecionar": "Play on select",
        "Áudio e vídeo começam no player ao clicar": "Audio and video start playing when clicked",
        "Mostrar outros arquivos": "Show other files",
        "Lista também o que o Premiere não importa": "Also lists what Premiere can't import",
        "Idioma do painel": "Panel language",
        "Cancelar": "Cancel",

        // --- barra lateral, caminho e grade -----------------------------------------
        "Favoritos": "Favorites",
        "Bibliotecas": "Libraries",
        "Nenhuma biblioteca ainda.": "No libraries yet.",
        "Clique em {0} e escolha uma pasta do computador com seus vídeos, sons, imagens e MOGRTs.":
            "Click {0} and choose a folder on your computer with your videos, sounds, images and MOGRTs.",
        "Pasta não encontrada: {0}": "Folder not found: {0}",
        "Opções": "Options",
        "vídeo": "video",
        "áudio": "audio",
        "imagem": "image",
        "arquivo": "file",
        "{0} arquivos selecionados": "{0} files selected",
        "1 arquivo": "1 file",
        "{0} arquivos": "{0} files",
        "1 resultado": "1 result",
        "{0} resultados": "{0} results",
        "1 favorito não encontrado — o arquivo foi movido ou está num HD/pasta de rede desconectado.":
            "1 favorite not found — the file was moved or is on a disconnected drive/network folder.",
        "{0} favoritos não encontrados — o arquivo foi movido ou está num HD/pasta de rede desconectado.":
            "{0} favorites not found — the files were moved or are on a disconnected drive/network folder.",
        "Mostrando só os primeiros {0} arquivos desta pasta e subpastas. Abra uma subpasta para ver o resto.":
            "Showing only the first {0} files of this folder and its subfolders. Open a subfolder to see the rest.",
        "Não deu para abrir esta pasta.": "Couldn't open this folder.",
        "Adicione uma pasta do computador para criar sua biblioteca.": "Add a folder from your computer to create your library.",
        "Escolha uma pasta na barra lateral.": "Choose a folder in the sidebar.",
        "Nenhum favorito ainda.": "No favorites yet.",
        "Passe o mouse num arquivo e clique na estrela.": "Hover over a file and click the star.",
        "Nada encontrado para “{0}” nesta pasta.": "Nothing found for “{0}” in this folder.",
        "Esta pasta está vazia.": "This folder is empty.",
        "Esta pasta está vazia (com este filtro).": "This folder is empty (with this filter).",
        "Sem pré-visualização para este formato": "No preview for this format",
        "Sem pré-visualização: {0}": "No preview: {0}",
        "Favoritar": "Favorite",
        "Adicionado aos favoritos.": "Added to favorites.",
        "Removido dos favoritos.": "Removed from favorites.",
        "Só os MOGRTs vão neste arrasto. Arraste os outros arquivos à parte.": "Only the MOGRTs go in this drag. Drag the other files separately.",
        "Solte na timeline ou no painel Project.": "Drop on the timeline or in the Project panel.",
        "Solte na timeline ou no painel Project ({0} arquivos).": "Drop on the timeline or in the Project panel ({0} files).",

        // --- menus de clique direito e diálogos ---------------------------------------
        "Adicionar na timeline": "Add to timeline",
        "Adicionar {0} na timeline": "Add {0} to timeline",
        "Importar só no projeto": "Import to project only",
        "Remover dos favoritos": "Remove from favorites",
        "Favoritar selecionados": "Favorite selected",
        "Mostrar no Explorer": "Show in Explorer",
        "Gerar preview de novo": "Regenerate preview",
        "Abrir": "Open",
        "Pasta atualizada.": "Folder refreshed.",
        "Abrir no Explorer": "Open in Explorer",
        "Renomear": "Rename",
        "Limpar previews desta biblioteca": "Clear this library's previews",
        "Remover da extensão": "Remove from extension",

        // --- bibliotecas e limpeza de previews ----------------------------------------
        "Escolha a pasta da biblioteca": "Choose the library folder",
        "Modo de demonstração: no Premiere abre o seletor de pastas.": "Demo mode: in Premiere this opens the folder picker.",
        "Esta pasta já está na biblioteca.": "This folder is already in the library.",
        "Biblioteca “{0}” adicionada. Os previews são gerados conforme você navega.": "Library “{0}” added. Previews are generated as you browse.",
        "Remover biblioteca": "Remove library",
        "Remover “{0}” da extensão? Os arquivos no computador não são apagados.": "Remove “{0}” from the extension? The files on your computer aren't deleted.",
        "Remover": "Remove",
        "Biblioteca removida.": "Library removed.",
        "Renomear biblioteca": "Rename library",
        "Nome exibido no painel (a pasta no disco não muda).": "Name shown in the panel (the folder on disk doesn't change).",
        "Salvar": "Save",
        " de “{0}”": " from “{0}”",
        "Nenhum preview salvo{0}.": "No saved previews{0}.",
        "Apagar {0} arquivo(s) de preview ({1}){2}?\nEles são refeitos sozinhos quando você abrir as pastas. Seus vídeos, sons e imagens não são tocados.":
            "Delete {0} preview file(s) ({1}){2}?\nThey're recreated automatically when you open the folders. Your videos, sounds and images aren't touched.",
        "Apagar": "Delete",
        "{0} de {1} arquivo(s) de preview apagados{2}. Os outros estão em uso ou sem permissão; tente de novo com o Premiere fechado.":
            "{0} of {1} preview file(s) deleted{2}. The others are in use or not allowed; try again with Premiere closed.",
        "{0} arquivo(s) de preview apagados{1}. Eles são recriados quando você abrir as pastas.":
            "{0} preview file(s) deleted{1}. They're recreated when you open the folders.",
        "Não deu para limpar os previews{0}: {1}": "Couldn't clear the previews{0}: {1}",
        "A pasta desta biblioteca não foi encontrada. Se ela está num HD externo ou na rede, confira se está conectado; se foi movida ou renomeada, remova e adicione de novo.":
            "This library's folder wasn't found. If it's on an external drive or the network, check that it's connected; if it was moved or renamed, remove it and add it again.",

        // --- adicionar ao Premiere e arrastar -----------------------------------------
        "Modo de demonstração: no Premiere, {0} arquivo(s) iriam para a timeline.": "Demo mode: in Premiere, {0} file(s) would go to the timeline.",
        "Modo de demonstração: no Premiere, {0} arquivo(s) iriam para o projeto.": "Demo mode: in Premiere, {0} file(s) would go to the project.",
        "Adicionando na timeline…": "Adding to timeline…",
        "Importando…": "Importing…",
        "“{0}” na trilha {1}": "“{0}” on track {1}",
        "“{0}” importado no projeto": "“{0}” imported into the project",
        "{0} de {1} falharam. {2}": "{0} of {1} failed. {2}",
        "Nenhuma sequência aberta: importado só no projeto.": "No open sequence: imported into the project only.",
        "{0} arquivos adicionados.": "{0} files added.",
        "Arrastar para o Source Monitor não funciona. Arraste para a timeline ou use Adicionar.": "Dragging to the Source Monitor doesn't work. Drag to the timeline or use Add.",
        "Arraste para uma sequência já aberta na timeline.": "Drag to a sequence that's already open on the timeline.",
        "“{0}”: MOGRT não entra no painel Project. Arraste para a timeline ou use Adicionar.":
            "“{0}”: MOGRTs can't go into the Project panel. Drag to the timeline or use Add.",
        "O outro arquivo não foi junto: MOGRT vai num arrasto só dele.": "The other file didn't go along: MOGRTs go in a drag of their own.",
        "Os outros {0} arquivos não foram junto: MOGRT vai num arrasto só dele.": "The other {0} files didn't go along: MOGRTs go in a drag of their own.",
        "{0} item(ns) falharam. {1}": "{0} item(s) failed. {1}",

        // --- configurações, início e menu do painel -----------------------------------
        "Helmet Library {0}  ·  configuração em {1}": "Helmet Library {0}  ·  settings in {1}",
        "Os previews ficam numa pasta oculta {0} dentro de cada biblioteca. Copiou a pasta para outro PC ou HD? Os previews vão junto.":
            "Previews are kept in a hidden {0} folder inside each library. Copied the folder to another PC or drive? The previews go along.",
        "Os previews ficam em {0}. As pastas da biblioteca não são alteradas.": "Previews are kept in {0}. The library folders aren't changed.",
        "Ocupando {0} ({1} arquivos)": "Using {0} ({1} files)",
        "Nenhum preview salvo ainda.": "No previews saved yet.",
        "Não deu para medir os previews: {0}": "Couldn't measure the previews: {0}",
        "Adicionar pasta à biblioteca": "Add folder to library",
        "Recarregar painel": "Reload panel",
        "Modo de demonstração (fora do Premiere): biblioteca de exemplo, sem acesso ao disco.": "Demo mode (outside Premiere): sample library, no disk access.",
        "Configurações recuperadas": "Settings recovered",
        "Não foi possível salvar suas configurações (disco cheio ou sem permissão em {0}).": "Couldn't save your settings (disk full or no permission in {0}).",
        "O arquivo de configurações estava danificado e foi recuperado do backup de {0}. O arquivo danificado ficou guardado em:\n{1}":
            "The settings file was damaged and was recovered from the backup of {0}. The damaged file was kept at:\n{1}",
        "O arquivo de configurações estava danificado e foi recuperado do backup. O arquivo danificado ficou guardado em:\n{0}":
            "The settings file was damaged and was recovered from the backup. The damaged file was kept at:\n{0}",
        "O arquivo de configurações estava danificado e não havia backup, então as bibliotecas e os favoritos começaram vazios. O arquivo danificado ficou guardado em:\n{0}":
            "The settings file was damaged and there was no backup, so the libraries and favorites started empty. The damaged file was kept at:\n{0}",

        // --- player -------------------------------------------------------------------
        "Sem pré-visualização para .{0}. Dá para adicionar mesmo assim.": "No preview for .{0}. You can still add it.",
        "Gerando forma de onda…": "Generating waveform…",

        // --- erros de disco e de preview (guardados em português, mostrados com trMsg) -
        "Sem permissão para gravar previews nesta pasta. Use \"Cache do sistema\" nas configurações.":
            "No permission to save previews in this folder. Use \"System cache\" in the settings.",
        "Disco cheio: não deu para gravar o preview.": "Disk full: couldn't save the preview.",
        "O arquivo não foi encontrado (foi movido, apagado ou está num disco desconectado).": "The file wasn't found (it was moved, deleted or is on a disconnected drive).",
        "A pasta não foi encontrada. Se ela está num HD externo ou na rede, confira se está conectado.": "The folder wasn't found. If it's on an external drive or the network, check that it's connected.",
        "Sem permissão para abrir este arquivo.": "No permission to open this file.",
        "Sem permissão para abrir esta pasta.": "No permission to open this folder.",
        "Em uso por outro programa. Tente de novo daqui a pouco.": "In use by another program. Try again in a moment.",
        "O disco ou a pasta de rede não respondeu. Confira se está conectado.": "The drive or network folder didn't respond. Check that it's connected.",
        "a pasta de previews é um atalho para outro lugar; por segurança nada é gravado nela": "the previews folder is a shortcut to somewhere else; for safety nothing is saved in it",
        "arquivo cortado": "truncated file",
        "não é um .zip válido": "not a valid .zip",
        "índice do .zip inválido": "invalid .zip index",
        "arquivo interno grande demais": "internal file too large",
        "entrada corrompida": "corrupted entry",
        "compressão não suportada ({0})": "unsupported compression ({0})",
        "a imagem demorou demais para abrir (disco lento ou desconectado?)": "the image took too long to open (slow or disconnected drive?)",
        "imagem não suportada": "unsupported image",
        "o vídeo demorou demais para abrir (disco lento ou desconectado?)": "the video took too long to open (slow or disconnected drive?)",
        "codec não suportado no preview (use H.264)": "codec not supported in the preview (use H.264)",
        "vídeo sem imagem": "video without picture",
        "formato de áudio não suportado no preview": "audio format not supported in the preview",
        "arquivo grande demais para gerar a forma de onda": "file too large to generate the waveform",
        "MOGRT sem preview (arquivo grande demais ou danificado: {0})": "MOGRT without preview (file too large or damaged: {0})",

        // --- ponte com o Premiere -----------------------------------------------------
        "Fora do Premiere.": "Outside Premiere.",
        "A parte da extensão que roda dentro do Premiere não carregou. Feche o Premiere e reinstale a extensão (instalar.bat).":
            "The part of the extension that runs inside Premiere didn't load. Close Premiere and reinstall the extension (instalar.bat).",
        "O Premiere devolveu uma resposta inesperada. Reabra o painel e tente de novo.": "Premiere returned an unexpected response. Reopen the panel and try again.",
        "Erro no Premiere.": "Premiere error.",

        // --- mensagens do host/index.jsx (chegam em português; trMsg traduz) ----------
        "Erro no Premiere: {0}": "Premiere error: {0}",
        "Erro ao adicionar: {0}": "Error adding: {0}",
        "Erro ao trocar a imagem provisória: {0}": "Error replacing the placeholder image: {0}",
        "Nenhum projeto aberto.": "No project open.",
        "Arquivo não encontrado (foi movido, apagado ou está num HD/pasta de rede desconectado).":
            "File not found (it was moved, deleted or is on a disconnected drive/network folder).",
        "O Premiere não conseguiu importar este arquivo.": "Premiere couldn't import this file.",
        "Não há trilha livre na posição da agulha. Abra espaço ou crie uma trilha.": "There's no free track at the playhead. Make room or create a track.",
        "O Premiere recusou colocar o clipe na timeline.": "Premiere refused to place the clip on the timeline.",
        "O Premiere não deixou trocar a imagem provisória. Use o botão Adicionar.": "Premiere didn't allow replacing the placeholder image. Use the Add button.",
        "Abra uma sequência para adicionar o MOGRT.": "Open a sequence to add the MOGRT.",
        "O Premiere não conseguiu inserir o MOGRT (versão ou template incompatível?).": "Premiere couldn't insert the MOGRT (incompatible version or template?).",
        "Esta versão do Premiere só aceita MOGRT direto na timeline.": "This version of Premiere only accepts MOGRTs directly on the timeline."
    };

    var hasOwn = function (o, k) { return Object.prototype.hasOwnProperty.call(o, k); };

    var lang = "en";
    try {
        var saved = localStorage.getItem(KEY);
        if (LANGS.indexOf(saved) >= 0) lang = saved;
    } catch (e) { /* sem localStorage (testes): fica o padrão */ }

    var listeners = [];

    function format(text, args) {
        return text.replace(/\{(\d)\}/g, function (m, i) {
            var v = args[+i];
            return v === undefined || v === null ? m : String(v);
        });
    }

    // tr("frase em português", arg0, arg1…)
    function t(key) {
        key = String(key);
        var text = lang === "en" && hasOwn(EN, key) ? EN[key] : key;
        return format(text, Array.prototype.slice.call(arguments, 1));
    }

    // N("frase", arg0…): sempre em português (ver o topo do arquivo)
    function N(key) {
        return format(String(key), Array.prototype.slice.call(arguments, 1));
    }

    // trMsg: mensagem pronta em português. Acha a frase igual no dicionário ou um modelo
    // com {0} que case com ela inteira (ex.: "Erro ao adicionar: {0}"); o que entrou no
    // lugar do {0} é traduzido também. O que não está no dicionário (erros do Windows,
    // nomes de arquivo) passa sem mudança.
    var patterns = null;
    function buildPatterns() {
        patterns = [];
        Object.keys(EN).forEach(function (key) {
            if (!/\{\d\}/.test(key) || key.charAt(0) === "{") return;   // "{0} arquivos" casaria com quase tudo
            var order = [];
            var src = key.replace(/[.*+?^${}()|[\]\\]/g, "\\$&").replace(/\\\{(\d)\\\}/g, function (m, i) {
                order.push(+i);
                return "([\\s\\S]*?)";
            });
            patterns.push({ key: key, re: new RegExp("^" + src + "$"), order: order });
        });
        patterns.sort(function (a, b) { return b.key.length - a.key.length; });   // o mais específico primeiro
    }

    function msg(text) {
        if (text === undefined || text === null) return "";
        text = String(text);
        if (lang !== "en") return text;
        if (hasOwn(EN, text)) return EN[text];
        if (!patterns) buildPatterns();
        for (var i = 0; i < patterns.length; i++) {
            var m = patterns[i].re.exec(text);
            if (!m) continue;
            var args = [];
            patterns[i].order.forEach(function (n, j) { args[n] = msg(m[j + 1]); });
            return format(EN[patterns[i].key], args);
        }
        return text;
    }

    // trParts("Clique em {0} e…", elemento) -> ["Click ", elemento, " and…"]
    function parts(key) {
        var nodes = Array.prototype.slice.call(arguments, 1);
        var out = [];
        t(key).split(/(\{\d\})/).forEach(function (piece) {
            var m = /^\{(\d)\}$/.exec(piece);
            if (m) { if (nodes[+m[1]] != null) out.push(nodes[+m[1]]); }
            else if (piece) out.push(piece);
        });
        return out;
    }

    // ---------- texto fixo do index.html ----------
    // Na primeira vez (logo ao carregar, antes dos outros scripts montarem a tela) anota
    // os textos e atributos do index.html que estão no dicionário, com o original em
    // português. Nas trocas seguintes só eles mudam — nunca nomes de arquivo ou pasta
    // que o painel colocou depois (uma pasta chamada "Abrir" não vira "Open").
    var ATTRS = ["title", "placeholder", "aria-label"];
    var fixed = null;

    function collect(root) {
        fixed = [];
        var walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT, null, false);
        var node;
        while ((node = walker.nextNode())) {
            var key = node.nodeValue.trim();
            if (key && hasOwn(EN, key)) fixed.push({ node: node, pt: node.nodeValue, key: key });
        }
        ATTRS.forEach(function (attr) {
            Array.prototype.forEach.call(root.querySelectorAll("[" + attr + "]"), function (el) {
                var key = el.getAttribute(attr);
                if (hasOwn(EN, key)) fixed.push({ el: el, attr: attr, key: key });
            });
        });
    }

    function apply() {
        if (typeof document === "undefined" || !document.body || typeof document.createTreeWalker !== "function") return;
        if (!fixed) collect(document.body);
        document.documentElement.lang = lang === "pt" ? "pt-BR" : "en";
        fixed.forEach(function (f) {
            var text = t(f.key);
            if (f.node) f.node.nodeValue = f.pt.replace(f.key, function () { return text; });
            else f.el.setAttribute(f.attr, text);
        });
    }

    function setLang(next) {
        if (LANGS.indexOf(next) < 0 || next === lang) return;
        lang = next;
        try { localStorage.setItem(KEY, lang); } catch (e) { /* fica só nesta sessão */ }
        apply();
        listeners.forEach(function (fn) { fn(lang); });
    }

    return {
        t: t,
        N: N,
        message: msg,
        parts: parts,
        apply: apply,
        setLang: setLang,
        lang: function () { return lang; },
        locale: function () { return lang === "pt" ? "pt-BR" : "en-US"; },
        onChange: function (fn) { listeners.push(fn); },
        EN: EN
    };
})();

// Atalhos usados por todos os scripts do painel.
var tr = HLI18n.t;
var N = HLI18n.N;
var trMsg = HLI18n.message;
var trParts = HLI18n.parts;

// Os scripts ficam no fim do <body>: a tela já existe aqui, então já sai traduzida
// (mesmo que algum script seguinte quebre).
HLI18n.apply();
