// client/js/main.js — Helmet Library
// Barra superior (busca, filtro, caminho, tamanho, divisor) e início do painel.
// Adicionar: botão "Adicionar" / Enter / duplo clique → host/index.jsx (hl_add),
// ou arrastar o card direto para a timeline ou o painel Project.

(function (app) {
    "use strict";

    var HL = app.HL, CLIENT_VERSION = app.CLIENT_VERSION, L = app.L, P = app.P, PL = app.PL, cs = app.cs,
        cfg = app.cfg, els = app.els, state = app.state, setStatus = app.setStatus, save = app.save;

    // ======================================================================
    // barra superior, caminho, tamanho, divisor
    // ======================================================================

    var searchTimer = null;
    function onSearch() {
        els.btnClearSearch.hidden = !els.search.value;
        clearTimeout(searchTimer);
        searchTimer = setTimeout(function () { app.loadItems(true); }, HL.SEARCH_DELAY_MS);
    }
    els.search.addEventListener("input", onSearch);
    els.btnClearSearch.addEventListener("click", function () { els.search.value = ""; onSearch(); els.search.focus(); });

    els.filter.value = cfg.filter || "all";
    els.filter.addEventListener("change", function () { cfg.filter = els.filter.value; save(); app.loadItems(true); });

    els.crumbPath.addEventListener("click", function (e) {
        var b = e.target.closest(".crumb");
        if (b && b.dataset.path) app.openView({ type: "folder", path: b.dataset.path });
    });

    function syncSubfoldersBtn() { els.btnSubfolders.classList.toggle("on", !!cfg.includeSub); }
    els.btnSubfolders.addEventListener("click", function () {
        cfg.includeSub = !cfg.includeSub;
        save();
        syncSubfoldersBtn();
        app.loadItems(true);
    });
    els.btnRefresh.addEventListener("click", function () {
        if (state.view && state.view.type === "folder") app.refreshFolder(state.view.path);
        else app.loadItems(false);
    });

    function applySize(v) {
        els.grid.style.setProperty("--tile-w", v + "px");
    }
    els.size.value = cfg.thumbSize;
    applySize(cfg.thumbSize);
    els.size.addEventListener("input", function () { cfg.thumbSize = +els.size.value; applySize(cfg.thumbSize); save(); });

    els.sidebar.style.width = cfg.sidebarWidth + "px";
    els.splitter.addEventListener("mousedown", function (e) {
        e.preventDefault();
        var startX = e.clientX, startW = els.sidebar.getBoundingClientRect().width;
        els.splitter.classList.add("dragging");
        function move(ev) {
            var w = Math.max(150, Math.min(window.innerWidth * 0.5, startW + ev.clientX - startX));
            els.sidebar.style.width = w + "px";
            cfg.sidebarWidth = Math.round(w);
        }
        function up() {
            els.splitter.classList.remove("dragging");
            window.removeEventListener("mousemove", move);
            window.removeEventListener("mouseup", up);
            save();
        }
        window.addEventListener("mousemove", move);
        window.addEventListener("mouseup", up);
    });

    // ======================================================================
    // início
    // ======================================================================

    PL.init({
        volume: cfg.volume,
        onState: function (what, v) { if (what === "volume") { cfg.volume = v; save(); } }
    });

    // menu do painel (os três pontinhos da aba): atalhos úteis
    function setFlyoutMenu() {
        var item = function (id, label) { return '<MenuItem Id="' + id + '" Label="' + label.replace(/[&<>"]/g, "") + '"/>'; };
        cs.setPanelFlyoutMenu("<Menu>" + item("add", tr("Adicionar pasta à biblioteca")) + item("settings", tr("Configurações")) +
            item("reload", tr("Recarregar painel")) + "</Menu>");
    }

    if (cs) {
        try {
            setFlyoutMenu();
            cs.addEventListener("com.adobe.csxs.events.flyoutMenuClicked", function (ev) {
                var id = ev.data && ev.data.menuId;
                if (id === "add") app.addLibrary();
                else if (id === "settings") app.openSettings();
                else if (id === "reload") location.reload();
            });
        } catch (e) { /* versões antigas sem menu */ }
        try {
            // Esc: sem isto o Premiere fica com a tecla e o painel nunca a recebe (visto no teste no Premiere).
            // Código da tecla: Windows 27 (VK_ESCAPE), Mac 53.
            cs.registerKeyEventsInterest(JSON.stringify([{ keyCode: process.platform === "darwin" ? 53 : 27 }]));
        } catch (e) { HL.log("registerKeyEventsInterest falhou", e); }
        HLBridge.hostVersion().then(function (v) {
            if (v !== CLIENT_VERSION) HL.warn("versões diferentes: host " + v + " / painel " + CLIENT_VERSION);
        }, function () { /* o aviso de host não carregado aparece ao adicionar */ });
    }

    syncSubfoldersBtn();
    cfg.libraries.forEach(app.watchLib);
    app.renderTree();
    app.checkLibraries();

    // última pasta aberta: conferida sem travar (um HD desligado pode demorar a responder)
    var start = cfg.lastView;
    if (start && start.type === "folder" && !L.libraryOf(cfg, start.path)) start = null;
    (start && start.type === "folder" ? L.existsAsync(start.path) : Promise.resolve(true)).then(function (ok) {
        if (!ok) start = null;
        if (!start && cfg.libraries.length) start = { type: "folder", path: cfg.libraries[0].path };
        if (start) app.openView(start);
        else { app.renderCrumbs(); app.loadItems(true); }
    });

    // ao voltar para o painel, confere se algum HD/pasta de rede foi ligado ou desligado
    var lastFocusCheck = 0;
    window.addEventListener("focus", function () {
        if (Date.now() - lastFocusCheck < 3000) return;
        lastFocusCheck = Date.now();
        app.checkLibraries();
    });

    // previews que não puderam ser gravados (pasta só leitura, disco cheio): avisa uma vez por minuto
    var lastPreviewProblem = 0;
    P.onProblem(function (msg) {
        if (Date.now() - lastPreviewProblem < 60000) return;
        lastPreviewProblem = Date.now();
        setStatus(trMsg(msg), "error");
    });

    // troca de idioma (Configurações › Idioma): o texto fixo do index.html já foi trocado
    // pelo i18n.js; aqui é refeito o que o código monta. A última mensagem da barra de
    // baixo fica no idioma em que foi escrita (a não ser o aviso do modo de demonstração).
    HLI18n.onChange(function () {
        if (cs) { try { setFlyoutMenu(); } catch (e) { /* versões antigas sem menu */ } }
        app.renderTree();
        app.renderCrumbs();
        state.sig = null;            // força recriar os cards (dicas e contagem)
        app.loadItems(false);
        PL.relabel();
        if (!els.settings.hidden) app.updateSettingsTexts();
        if (L.demo && /demonstra|demo mode/i.test(els.status.textContent)) setStatus(tr(DEMO_TEXT), "warning", true);
        else if (!els.status.className.match(/success|warning|error/)) setStatus(app.defaultStatus(), "", true);
    });

    var DEMO_TEXT = N("Modo de demonstração (fora do Premiere): biblioteca de exemplo, sem acesso ao disco.");
    if (L.demo) setStatus(tr(DEMO_TEXT), "warning", true);

    // config.json danificado: avisa o que foi recuperado e onde ficou o arquivo estragado
    var notice = L.lastConfigNotice && L.lastConfigNotice();
    if (notice) app.ask(tr("Configurações recuperadas"), notice, null, "OK", { noCancel: true });

    var lastSaveError = 0;
    L.onSaveError(function () {
        if (Date.now() - lastSaveError < 60000) return;
        lastSaveError = Date.now();
        setStatus(tr("Não foi possível salvar suas configurações (disco cheio ou sem permissão em {0}).", L.appDataDir()), "error");
    });

    window.addEventListener("beforeunload", function () { L.saveConfig(cfg, true); });

    // ---------- usado pelos outros arquivos ----------

    app.onSearch = onSearch;
})(window.HLApp);
