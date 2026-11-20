// client/js/libraries.js — Helmet Library
// Bibliotecas: adicionar, remover, renomear, atualizar, vigiar mudanças, bibliotecas
// desconectadas e limpeza de previews.

(function (app) {
    "use strict";

    var L = app.L, P = app.P, cfg = app.cfg, els = app.els, state = app.state, setStatus = app.setStatus,
        save = app.save, searchText = app.searchText;

    // ======================================================================
    // bibliotecas
    // ======================================================================

    function pickFolder() {
        if (!window.cep || !window.cep.fs) return null;
        var r = window.cep.fs.showOpenDialogEx ?
            window.cep.fs.showOpenDialogEx(false, true, "Escolha a pasta da biblioteca", "") :
            window.cep.fs.showOpenDialog(false, true, "Escolha a pasta da biblioteca", "");
        if (!r || r.err || !r.data || !r.data.length) return null;
        return r.data[0];
    }

    function addLibrary() {
        if (L.demo) { setStatus("Modo de demonstração: no Premiere abre o seletor de pastas.", "warning"); return; }
        var dir = pickFolder();
        if (!dir) return;
        dir = L.path.resolve(dir);
        for (var i = 0; i < cfg.libraries.length; i++) {
            if (L.samePath(cfg.libraries[i].path, dir)) { setStatus("Esta pasta já está na biblioteca.", "warning"); app.openView({ type: "folder", path: dir }); return; }
        }
        var lib = { id: L.newId(), name: L.path.basename(dir) || dir, path: dir };
        cfg.libraries.push(lib);
        app.setExpanded(dir, true);
        save();
        watchLib(lib);
        app.renderTree();
        app.openView({ type: "folder", path: dir });
        setStatus("Biblioteca “" + lib.name + "” adicionada. Os previews são gerados conforme você navega.", "success");
    }

    function removeLibrary(lib) {
        app.ask("Remover biblioteca", "Remover “" + lib.name + "” da extensão? Os arquivos no computador não são apagados.", null, "Remover").then(function (ok) {
            if (!ok) return;
            L.unwatch(lib.path);
            cfg.libraries = cfg.libraries.filter(function (x) { return x.id !== lib.id; });
            save();
            app.renderTree();
            if (state.view && state.view.type === "folder" && L.isInside(state.view.path, lib.path)) {
                state.view = null;
                if (cfg.libraries.length) app.openView({ type: "folder", path: cfg.libraries[0].path });
                else { app.renderCrumbs(); app.loadItems(true); }
            }
            setStatus("Biblioteca removida.", "success");
        });
    }

    function renameLibrary(lib) {
        app.ask("Renomear biblioteca", "Nome exibido no painel (a pasta no disco não muda).", lib.name, "Salvar").then(function (name) {
            if (!name || typeof name !== "string") return;
            lib.name = name.trim() || lib.name;
            save();
            app.renderTree();
            app.renderCrumbs();
        });
    }

    function refreshFolder(dir) {
        Object.keys(state.dirCache).forEach(function (k) { if (L.isInside(k, dir)) delete state.dirCache[k]; });
        app.forgetWalk(dir);
        app.renderTree();
        if (state.view) app.loadItems(false);
        checkLibraries();
    }

    function watchLib(lib) {
        L.watch(lib.path, function (root, changedDirs) {
            changedDirs.forEach(function (d) {
                delete state.dirCache[d];
                delete state.dirCache[L.path.dirname(d)];
                app.forgetWalk(d);
            });
            app.renderTree();
            var v = state.view;
            if (!v) return;
            var affects = v.type === "favorites" || changedDirs.some(function (d) {
                return L.samePath(d, v.path) || ((cfg.includeSub || searchText()) && L.isInside(d, v.path));
            });
            if (affects) app.loadItems(false);
        });
    }

    // pastas de cache do modo atual
    function cacheDirs() {
        if (cfg.cacheMode !== "library") return [L.systemCacheDir()];
        return cfg.libraries.map(function (lib) { return L.path.join(lib.path, L.CACHE_DIR_NAME); });
    }

    // Apaga os previews dessas pastas, depois de confirmar. Só arquivos de preview
    // (nome no formato da extensão) são apagados; a mídia nunca é tocada.
    // where: "" ou " de “Biblioteca”"
    function clearPreviews(dirs, where) {
        L.cacheSize(dirs).then(function (size) {
            if (!size.files) { setStatus("Nenhum preview salvo" + where + ".", "warning"); return; }
            var text = "Apagar " + size.files.toLocaleString("pt-BR") + " arquivo(s) de preview (" + L.fmtBytes(size.bytes) + ")" + where +
                "?\nEles são refeitos sozinhos quando você abrir as pastas. Seus vídeos, sons e imagens não são tocados.";
            return app.ask("Limpar previews", text, null, "Apagar").then(function (ok) {
                if (!ok) return;
                return L.clearCache(dirs).then(function (n) {
                    P.clearMemo();
                    if (!els.settings.hidden) app.updateCacheInfo();
                    if (n < size.files) setStatus(n + " de " + size.files + " arquivo(s) de preview apagados" + where + ". Os outros estão em uso ou sem permissão; tente de novo com o Premiere fechado.", "warning");
                    else setStatus(n + " arquivo(s) de preview apagados" + where + ". Eles são recriados quando você abrir as pastas.", "success");
                    if (state.view) app.loadItems(false);
                });
            });
        }).catch(function (err) {
            setStatus("Não deu para limpar os previews" + where + ": " + L.describeError(err, "folder"), "error");
        });
    }

    function clearLibraryCache(lib) {
        clearPreviews([L.path.join(lib.path, L.CACHE_DIR_NAME)], " de “" + lib.name + "”");
    }

    els.btnAddLibrary.addEventListener("click", addLibrary);


    // ---------- bibliotecas desconectadas ----------
    // Confere (sem travar o painel) se a pasta de cada biblioteca ainda existe. Quando uma
    // volta (HD religado, rede de volta), religa o vigia e relê as pastas.

    var MISSING_TEXT = "A pasta desta biblioteca não foi encontrada. Se ela está num HD externo ou na rede, confira se está conectado; se foi movida ou renomeada, remova e adicione de novo.";
    var checking = null;

    function checkLibraries() {
        if (checking) return checking;
        var libs = cfg.libraries.slice();
        checking = Promise.all(libs.map(function (lib) { return L.existsAsync(lib.path); })).then(function (ok) {
            checking = null;
            var changed = false;
            libs.forEach(function (lib, i) {
                var was = !!state.missing[lib.path];
                if (was === !ok[i]) return;
                changed = true;
                if (ok[i]) delete state.missing[lib.path]; else state.missing[lib.path] = true;
                Object.keys(state.dirCache).forEach(function (k) { if (L.isInside(k, lib.path)) delete state.dirCache[k]; });
                app.forgetWalk(lib.path);
            });
            libs.forEach(function (lib, i) { if (ok[i] && !L.watching(lib.path)) watchLib(lib); });
            if (changed) {
                app.renderTree();
                var v = state.view;
                if (v && (v.type === "favorites" || libs.some(function (lib) { return L.isInside(v.path, lib.path); }))) app.loadItems(false);
            }
        }, function () { checking = null; });
        return checking;
    }

    // ---------- usado pelos outros arquivos ----------

    app.addLibrary = addLibrary;
    app.removeLibrary = removeLibrary;
    app.renameLibrary = renameLibrary;
    app.refreshFolder = refreshFolder;
    app.watchLib = watchLib;
    app.cacheDirs = cacheDirs;
    app.clearPreviews = clearPreviews;
    app.clearLibraryCache = clearLibraryCache;
    app.MISSING_TEXT = MISSING_TEXT;
    app.checkLibraries = checkLibraries;
})(window.HLApp);
