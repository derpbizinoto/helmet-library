// client/js/config.js — Helmet Library
// Constantes num lugar só e um registro (log) simples que pode ser ligado para depuração.
// Carregado antes de todos os outros scripts do painel. Exposto como window.HL.

(function () {
    "use strict";

    // Tem que ser igual às duas versões do CSXS/manifest.xml e ao HL_HOST_VERSION do
    // host/index.jsx (o empacotar.ps1 confere).
    var CLIENT_VERSION = "1.3.0";

    var MB = 1024 * 1024;

    var HL = {
        VERSION: CLIENT_VERSION,

        // true: o console do painel (depurador do CEP) mostra o que normalmente fica escondido.
        // Avisos de problema (HL.warn) aparecem sempre.
        DEBUG: false,

        APP_NAME: "Helmet Library",          // pasta da configuração em %APPDATA% e do cache em %LOCALAPPDATA%
        BIN_NAME: "Helmet Library",          // bin do projeto onde os arquivos entram
        CACHE_DIR_NAME: ".helmet-previews",  // pasta oculta de previews dentro de cada biblioteca

        // ---------- tipos de arquivo ----------
        // kind: o que o Premiere recebe (video/audio/image/mogrt/other)
        // preview: o painel consegue mostrar o conteúdo (o resto aparece com ícone)
        TYPES: {
            mp4: { kind: "video", preview: true }, m4v: { kind: "video", preview: true }, mov: { kind: "video", preview: true },
            webm: { kind: "video", preview: true }, avi: { kind: "video" }, mxf: { kind: "video" }, mkv: { kind: "video" },
            wmv: { kind: "video" }, mpg: { kind: "video" }, mpeg: { kind: "video" }, mts: { kind: "video" }, m2ts: { kind: "video" },

            wav: { kind: "audio", preview: true }, mp3: { kind: "audio", preview: true }, m4a: { kind: "audio", preview: true },
            aac: { kind: "audio", preview: true }, ogg: { kind: "audio", preview: true }, flac: { kind: "audio", preview: true },
            aif: { kind: "audio" }, aiff: { kind: "audio" }, wma: { kind: "audio" },

            jpg: { kind: "image", preview: true }, jpeg: { kind: "image", preview: true }, png: { kind: "image", preview: true },
            gif: { kind: "image", preview: true }, bmp: { kind: "image", preview: true }, webp: { kind: "image", preview: true },
            svg: { kind: "image", preview: true }, psd: { kind: "image" }, ai: { kind: "image" }, eps: { kind: "image" },
            tif: { kind: "image" }, tiff: { kind: "image" }, tga: { kind: "image" }, exr: { kind: "image" }, dpx: { kind: "image" },

            mogrt: { kind: "mogrt", preview: true },

            aep: { kind: "other" }, prproj: { kind: "other" }, aegraphic: { kind: "other" }, ffx: { kind: "other" },
            prfpset: { kind: "other" }, cube: { kind: "other" }, srt: { kind: "other" }, xml: { kind: "other" }
        },

        // arquivos do sistema que nunca aparecem
        IGNORE_NAMES: { "thumbs.db": 1, "desktop.ini": 1, ".ds_store": 1 },

        // arquivos que o Premiere/Windows criam ao lado da mídia: o vigia de pastas não
        // recria a grade por causa deles (isso atrapalhava o arrastar)
        WATCH_IGNORE: /\.(cfa|pek|xmp|tmp|crdownload|part|ims|mcdb|prmdc|lck)$/i,

        // ---------- configurações: valores iniciais ----------
        DEFAULTS: {
            libraries: [],            // [{ id, name, path }]
            favorites: [],            // caminhos completos
            expanded: [],             // pastas abertas na árvore
            lastView: null,           // { type: "folder", path } | { type: "favorites" }
            cacheMode: "library",     // "library" (.helmet-previews dentro da biblioteca) | "system"
            useBin: true,             // importar numa bin "Helmet Library"
            mirrorFolders: true,      // criar sub-bins iguais às subpastas
            includeSub: false,        // mostrar arquivos das subpastas junto
            showUnknown: false,       // mostrar arquivos que o Premiere não importa
            autoplay: true,           // tocar ao selecionar
            dblClick: "timeline",     // "timeline" | "project"
            thumbSize: 168,
            sidebarWidth: 230,
            volume: 0.8,
            filter: "all"
        },

        // ---------- limites ----------
        WALK_LIMIT: 20000,               // busca / "incluir subpastas": arquivos no máximo
        MAX_AUDIO_BYTES: 300 * MB,       // acima disso: sem forma de onda e player simples (sem pitch/reverse)
        ZIP_LIMITS: {                    // leitura do .mogrt (é um .zip)
            directory: 16 * MB,          // índice do .zip
            image: 32 * MB,              // miniatura
            video: 200 * MB,             // vídeo de preview
            json: 4 * MB                 // definition.json (título)
        },

        // ---------- previews ----------
        THUMB_W: 384, THUMB_H: 216,      // tamanho da miniatura gravada
        PEAKS: 800,                      // colunas da forma de onda guardada
        PREVIEW_CONCURRENCY: 2,          // previews gerados ao mesmo tempo

        // ---------- tempos (milissegundos) ----------
        WALK_CACHE_MS: 30000,            // índice da busca guardado na memória
        CONFIG_SAVE_DELAY_MS: 300,       // junta várias mudanças numa gravação só
        WATCH_DELAY_MS: 700,             // espera a pasta parar de mudar antes de reler
        SEARCH_DELAY_MS: 220,            // espera parar de digitar antes de buscar
        STATUS_MS: 5000, STATUS_ERROR_MS: 9000, // quanto tempo a mensagem fica na barra de baixo
        MEDIA_TIMEOUT_MS: 20000,         // abrir imagem/vídeo para gerar a miniatura
        PROGRAM_TIMEOUT_MS: 10000        // programas do Windows (attrib)
    };

    var slice = Array.prototype.slice;

    // detalhes para depuração: só com DEBUG ligado
    HL.log = function () {
        if (HL.DEBUG) console.log.apply(console, ["Helmet Library:"].concat(slice.call(arguments)));
    };

    // problemas que valem registro mesmo com DEBUG desligado
    HL.warn = function () {
        console.warn.apply(console, ["Helmet Library:"].concat(slice.call(arguments)));
    };

    window.HL = HL;
})();
