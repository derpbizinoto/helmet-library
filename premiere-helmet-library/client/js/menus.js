// client/js/menus.js — Helmet Library
// Menus de clique direito e o diálogo simples (texto / confirmação).

(function (app) {
    "use strict";

    var L = app.L, P = app.P, PL = app.PL, cfg = app.cfg, els = app.els, icon = app.icon, h = app.h,
        setStatus = app.setStatus, isFav = app.isFav, toggleFav = app.toggleFav,
        addFavorites = app.addFavorites;

    // ======================================================================
    // menus de contexto
    // ======================================================================

    function showMenu(x, y, items) {
        var m = els.menu;
        m.textContent = "";
        items.forEach(function (it) {
            if (it === "-") { m.appendChild(document.createElement("hr")); return; }
            var b = h("button", null, [icon(it.icon || "i-file"), h("span", null, [it.label])]);
            if (it.danger) b.className = "danger";
            b.disabled = !!it.disabled;
            b.addEventListener("click", function () { hideMenu(); it.action(); });
            m.appendChild(b);
        });
        m.hidden = false;
        var r = m.getBoundingClientRect();
        m.style.left = Math.max(4, Math.min(x, window.innerWidth - r.width - 4)) + "px";
        m.style.top = Math.max(4, Math.min(y, window.innerHeight - r.height - 4)) + "px";
    }

    function hideMenu() { els.menu.hidden = true; }
    document.addEventListener("mousedown", function (e) { if (!els.menu.hidden && !els.menu.contains(e.target)) hideMenu(); });
    window.addEventListener("blur", hideMenu);
    els.gridWrap.addEventListener("scroll", hideMenu);

    function fileMenu(x, y, files) {
        if (!files.length) return;
        var one = files.length === 1 ? files[0] : null;
        var fav = one && isFav(one.path);
        showMenu(x, y, [
            { label: files.length > 1 ? tr("Adicionar {0} na timeline", files.length) : tr("Adicionar na timeline"), icon: "i-timeline", action: function () { app.addFiles(files, true); } },
            { label: tr("Importar só no projeto"), icon: "i-download", action: function () { app.addFiles(files, false); } },
            "-",
            { label: one ? (fav ? tr("Remover dos favoritos") : tr("Favoritar")) : tr("Favoritar selecionados"), icon: "i-star", action: function () {
                if (one) toggleFav(one.path);
                else addFavorites(files.map(function (f) { return f.path; }));
                app.loadItems(false);
            } },
            { label: tr("Mostrar no Explorer"), icon: "i-folder-open", disabled: !one, action: function () { L.reveal(one.path); } },
            { label: tr("Gerar preview de novo"), icon: "i-refresh", disabled: files.every(function (f) { return !f.canPreview; }), action: function () {
                files.forEach(function (f) { P.forget(f); });
                app.loadItems(false);
                var cur = PL.currentFile();
                if (cur && files.some(function (f) { return f.path === cur.path; })) P.get(cur, true).then(function (r) { PL.load(cur, r, false); });
            } }
        ]);
    }

    function folderMenu(x, y, dir, lib) {
        var items = [
            { label: tr("Abrir"), icon: "i-folder-open", action: function () { app.openView({ type: "folder", path: dir }); } },
            { label: tr("Atualizar"), icon: "i-refresh", action: function () { app.refreshFolder(dir); setStatus(tr("Pasta atualizada."), "success"); } },
            { label: tr("Abrir no Explorer"), icon: "i-folder", action: function () { L.openFolder(dir); } }
        ];
        if (lib) {
            items.push("-",
                { label: tr("Renomear"), icon: "i-pencil", action: function () { app.renameLibrary(lib); } },
                { label: tr("Limpar previews desta biblioteca"), icon: "i-trash", disabled: cfg.cacheMode !== "library", action: function () { app.clearLibraryCache(lib); } },
                "-",
                { label: tr("Remover da extensão"), icon: "i-x", danger: true, action: function () { app.removeLibrary(lib); } });
        }
        showMenu(x, y, items);
    }

    // ======================================================================
    // diálogo simples (texto / confirmação)
    // ======================================================================

    var askResolve = null;
    // opts.noCancel: só o botão OK (avisos)
    function ask(title, text, value, okLabel, opts) {
        els.askTitle.textContent = title;
        els.askText.textContent = text || "";
        els.askCancel.hidden = !!(opts && opts.noCancel);
        els.askInput.hidden = value == null;
        els.askInput.value = value || "";
        els.askOk.textContent = okLabel || "OK";
        els.ask.hidden = false;
        setTimeout(function () { if (value != null) { els.askInput.focus(); els.askInput.select(); } else els.askOk.focus(); }, 0);
        return new Promise(function (resolve) { askResolve = resolve; });
    }
    function closeAsk(result) {
        if (els.ask.hidden) return;
        els.ask.hidden = true;
        var r = askResolve; askResolve = null;
        if (r) r(result);
    }
    els.askOk.addEventListener("click", function () { closeAsk(els.askInput.hidden ? true : els.askInput.value); });
    els.askCancel.addEventListener("click", function () { closeAsk(null); });
    els.askInput.addEventListener("keydown", function (e) { if (e.key === "Enter") closeAsk(els.askInput.value); });
    els.ask.addEventListener("mousedown", function (e) { if (e.target === els.ask) closeAsk(null); });

    // ---------- usado pelos outros arquivos ----------

    app.hideMenu = hideMenu;
    app.fileMenu = fileMenu;
    app.folderMenu = folderMenu;
    app.ask = ask;
    app.closeAsk = closeAsk;
})(window.HLApp);
