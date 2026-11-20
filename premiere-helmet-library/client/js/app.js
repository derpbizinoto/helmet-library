// client/js/app.js — Helmet Library
// Base da interface, usada por todos os outros arquivos do painel: configuração carregada,
// elementos da tela, estado, montagem de elementos sem innerHTML, barra de status e favoritos.
// Os outros arquivos (tree, grid, host, libraries, menus, settings, main) se registram em
// window.HLApp e chamam as funções uns dos outros por app.nome(...).

(function () {
    "use strict";

    var app = window.HLApp = {};

    var HL = window.HL;
    var CLIENT_VERSION = HL.VERSION;
    var BIN_NAME = HL.BIN_NAME;

    var L = window.HLLibrary;
    var P = window.HLPreviews;
    var PL = window.HLPlayer;
    var inCEP = typeof window.__adobe_cep__ !== "undefined";
    var cs = inCEP ? new CSInterface() : null;

    var cfg = L.loadConfig();
    P.init(function () { return cfg; });

    function $(id) { return document.getElementById(id); }

    var els = {
        tree: $("tree"), sidebar: $("sidebar"), splitter: $("splitter"),
        btnAddLibrary: $("btnAddLibrary"),
        search: $("searchInput"), btnClearSearch: $("btnClearSearch"), filter: $("filterSelect"),
        btnSettings: $("btnSettings"),
        crumbPath: $("crumbPath"), crumbCount: $("crumbCount"), btnSubfolders: $("btnSubfolders"), btnRefresh: $("btnRefresh"),
        gridWrap: $("gridWrap"), grid: $("grid"), empty: $("emptyState"),
        player: $("player"),
        size: $("sizeRange"), status: $("status"), btnImport: $("btnImport"), btnAdd: $("btnAdd"),
        menu: $("menu"),
        settings: $("settingsModal"), cacheHint: $("cacheHint"), cacheSize: $("cacheSize"), btnClearCache: $("btnClearCache"),
        setUseBin: $("setUseBin"), setMirror: $("setMirror"), setDblClick: $("setDblClick"),
        setAutoplay: $("setAutoplay"), setUnknown: $("setUnknown"), versionNote: $("versionNote"),
        ask: $("askModal"), askTitle: $("askTitle"), askText: $("askText"), askInput: $("askInput"),
        askOk: $("askOk"), askCancel: $("askCancel")
    };

    var state = {
        view: null,          // { type: "folder", path } | { type: "favorites" }
        items: [],           // o que está na grade: subpastas ({ isDir }) e arquivos
        selected: {},        // caminho → true
        anchor: -1,          // índice para seleção com Shift
        focus: -1,
        dirCache: {},        // pasta → [subpastas]
        walkCache: {},       // pasta|showUnknown → { time, files } (busca e "incluir subpastas")
        missing: {},         // biblioteca → true quando a pasta não foi encontrada
        token: 0
    };

    // ======================================================================
    // utilidades
    // ======================================================================

    var KIND_ICON = { video: "i-film", audio: "i-music", image: "i-image", mogrt: "i-sparkles", other: "i-file", unknown: "i-file" };
    var KIND_LABEL = { video: "vídeo", audio: "áudio", image: "imagem", mogrt: "MOGRT", other: "arquivo", unknown: "arquivo" };

    // ---------- montagem da tela ----------
    // Nada de innerHTML: com o Node ligado, um nome de arquivo interpretado como HTML
    // viraria código rodando no computador. Todo texto entra como texto (textContent).

    var SVG_NS = "http://www.w3.org/2000/svg";

    // ícone da lista do index.html (<svg class="icon"><use href="#id"/></svg>)
    function icon(id, cls) {
        var s = document.createElementNS(SVG_NS, "svg");
        s.setAttribute("class", "icon" + (cls ? " " + cls : ""));
        var u = document.createElementNS(SVG_NS, "use");
        u.setAttribute("href", "#" + id);
        s.appendChild(u);
        return s;
    }

    // h("span", { className: "label", title: "…", dataset: {…} }, ["texto", elemento, …])
    function h(tag, props, children) {
        var el = document.createElement(tag);
        if (props) {
            for (var k in props) {
                if (k === "dataset") { for (var d in props.dataset) el.dataset[d] = props.dataset[d]; }
                else el[k] = props[k];
            }
        }
        (children || []).forEach(function (c) {
            if (c != null && c !== false) el.appendChild(typeof c === "string" ? document.createTextNode(c) : c);
        });
        return el;
    }

    // troca todo o conteúdo de um elemento
    function fill(el, children) {
        el.textContent = "";
        (children || []).forEach(function (c) {
            if (c != null && c !== false) el.appendChild(typeof c === "string" ? document.createTextNode(c) : c);
        });
    }

    function norm(s) {
        return String(s).toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "");
    }

    var statusTimer = null;
    function setStatus(msg, kind, sticky) {
        clearTimeout(statusTimer);
        els.status.textContent = msg || "";
        els.status.className = "status" + (kind ? " " + kind : "");
        els.status.title = msg || "";
        if (msg && !sticky) statusTimer = setTimeout(function () { setStatus(defaultStatus()); }, kind === "error" ? HL.STATUS_ERROR_MS : HL.STATUS_MS);
    }

    function defaultStatus() {
        var n = app.selectedFiles().length;
        if (n > 1) return n + " arquivos selecionados";
        if (n === 1) {
            var f = app.selectedFiles()[0];
            return f.name + "  ·  " + L.fmtBytes(f.size);
        }
        return "";
    }

    function save() { L.saveConfig(cfg); }

    function fmtDur(sec) {
        sec = Math.round(sec || 0);
        var m = Math.floor(sec / 60), s = sec % 60;
        return m + ":" + ("0" + s).slice(-2);
    }

    function isFav(p) {
        var k = p.toLowerCase();
        for (var i = 0; i < cfg.favorites.length; i++) if (cfg.favorites[i].toLowerCase() === k) return true;
        return false;
    }

    function toggleFav(p) {
        var k = p.toLowerCase();
        var before = cfg.favorites.length;
        cfg.favorites = cfg.favorites.filter(function (x) { return x.toLowerCase() !== k; });
        if (cfg.favorites.length === before) cfg.favorites.push(p);
        save();
        app.updateFavCount();
        return cfg.favorites.length > before;
    }

    // favorita todos (os que já eram continuam)
    function addFavorites(paths) {
        paths.forEach(function (p) { if (!isFav(p)) cfg.favorites.push(p); });
        save();
        app.updateFavCount();
    }

    // pasta da biblioteca que contém dir (atalhos só são seguidos dentro dela)
    function rootOf(dir) {
        var lib = L.libraryOf(cfg, dir);
        return lib ? lib.path : null;
    }

    function searchText() { return els.search.value.trim(); }

    // ---------- usado pelos outros arquivos ----------

    app.HL = HL;
    app.CLIENT_VERSION = CLIENT_VERSION;
    app.BIN_NAME = BIN_NAME;
    app.L = L;
    app.P = P;
    app.PL = PL;
    app.inCEP = inCEP;
    app.cs = cs;
    app.cfg = cfg;
    app.$ = $;
    app.els = els;
    app.state = state;
    app.KIND_ICON = KIND_ICON;
    app.KIND_LABEL = KIND_LABEL;
    app.icon = icon;
    app.h = h;
    app.fill = fill;
    app.norm = norm;
    app.setStatus = setStatus;
    app.defaultStatus = defaultStatus;
    app.save = save;
    app.fmtDur = fmtDur;
    app.isFav = isFav;
    app.toggleFav = toggleFav;
    app.addFavorites = addFavorites;
    app.rootOf = rootOf;
    app.searchText = searchText;
})();
