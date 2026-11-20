// client/js/tree.js — Helmet Library
// Árvore de bibliotecas e pastas na barra lateral.

(function (app) {
    "use strict";

    var $ = app.$, L = app.L, cfg = app.cfg, els = app.els, state = app.state, icon = app.icon, h = app.h,
        fill = app.fill, setStatus = app.setStatus, save = app.save, rootOf = app.rootOf;

    // ======================================================================
    // árvore lateral
    // ======================================================================

    function isExpanded(p) { return cfg.expanded.indexOf(p) >= 0; }
    function setExpanded(p, on) {
        cfg.expanded = cfg.expanded.filter(function (x) { return x !== p; });
        if (on) cfg.expanded.push(p);
        save();
    }

    function loadDirs(dir) {
        if (state.dirCache[dir]) return Promise.resolve(state.dirCache[dir]);
        return L.listDirs(dir, { root: rootOf(dir) }).then(function (dirs) { state.dirCache[dir] = dirs; return dirs; }, function () { state.dirCache[dir] = []; return []; });
    }

    function renderTree() {
        var scroll = els.tree.scrollTop;
        els.tree.textContent = "";

        var fav = h("div", { className: "tree-row fav" }, [
            h("span", { className: "twisty leaf" }), icon("i-star"),
            h("span", { className: "label" }, ["Favoritos"]), h("span", { className: "count", id: "favCount" })
        ]);
        fav.style.paddingLeft = "0px";
        fav.addEventListener("click", function () { app.openView({ type: "favorites" }); });
        fav.dataset.fav = "1";
        els.tree.appendChild(fav);

        var sec = document.createElement("div");
        sec.className = "tree-section";
        sec.textContent = "Bibliotecas";
        els.tree.appendChild(sec);

        if (!cfg.libraries.length) {
            els.tree.appendChild(h("div", { className: "tree-empty" }, [
                "Nenhuma biblioteca ainda.", h("br"), "Clique em ", h("b", null, ["Adicionar pasta"]),
                " e escolha uma pasta do computador com seus vídeos, sons, imagens e MOGRTs."
            ]));
        }

        cfg.libraries.forEach(function (lib) {
            els.tree.appendChild(buildNode(lib.path, lib.name, 0, lib));
        });
        updateFavCount();
        markSelectedRow();
        els.tree.scrollTop = scroll;
    }

    function updateFavCount() {
        var c = $("favCount");
        if (c) c.textContent = cfg.favorites.length ? String(cfg.favorites.length) : "";
    }

    function buildNode(dir, name, depth, lib) {
        var wrap = document.createElement("div");
        wrap.className = "tree-node";
        var row = document.createElement("div");
        row.className = "tree-row" + (lib ? " root" : "");
        row.dataset.path = dir;
        row.style.paddingLeft = (depth * 14) + "px";
        var missing = !!(lib && state.missing[lib.path]);
        if (missing) row.classList.add("missing");
        fill(row, [
            h("span", { className: "twisty" }, [icon("i-chevron")]),
            icon(lib ? "i-library" : "i-folder"),
            h("span", { className: "label", title: missing ? "Pasta não encontrada: " + dir : dir }, [name]),
            lib && h("button", { className: "icon-btn sm row-menu", title: "Opções" }, [icon("i-dots")])
        ]);
        var kids = document.createElement("div");
        kids.className = "tree-children";
        wrap.appendChild(row);
        wrap.appendChild(kids);

        var twisty = row.querySelector(".twisty");
        var known = state.dirCache[dir];
        if (known && !known.length) twisty.classList.add("leaf");

        function expand(on) {
            setExpanded(dir, on);
            row.classList.toggle("open", on);
            kids.textContent = "";
            if (!on) return;
            loadDirs(dir).then(function (dirs) {
                if (!isExpanded(dir)) return;
                kids.textContent = "";
                if (!dirs.length) { twisty.classList.add("leaf"); row.classList.remove("open"); return; }
                dirs.forEach(function (d) { kids.appendChild(buildNode(d.path, d.name, depth + 1, null)); });
                markSelectedRow();
            });
        }

        twisty.addEventListener("click", function (e) { e.stopPropagation(); expand(!isExpanded(dir)); });
        row.addEventListener("click", function () {
            if (missing) {
                // confere de novo: o HD pode ter sido religado
                app.checkLibraries().then(function () {
                    if (state.missing[lib.path]) setStatus(app.MISSING_TEXT, "error");
                    else app.openView({ type: "folder", path: dir });
                });
                return;
            }
            app.openView({ type: "folder", path: dir });
        });
        row.addEventListener("dblclick", function (e) { if (e.target.closest(".row-menu")) return; expand(!isExpanded(dir)); });
        row.addEventListener("contextmenu", function (e) { e.preventDefault(); app.folderMenu(e.clientX, e.clientY, dir, lib); });
        var rm = row.querySelector(".row-menu");
        if (rm) rm.addEventListener("click", function (e) {
            e.stopPropagation();
            var r = rm.getBoundingClientRect();
            app.folderMenu(r.left, r.bottom + 2, dir, lib);
        });

        if (isExpanded(dir) && !missing) expand(true);
        else if (!known && !missing) {
            // descobre em segundo plano se tem subpastas (para esconder a setinha)
            loadDirs(dir).then(function (dirs) { if (!dirs.length) twisty.classList.add("leaf"); });
        }
        return wrap;
    }

    function markSelectedRow() {
        var rows = els.tree.querySelectorAll(".tree-row");
        for (var i = 0; i < rows.length; i++) {
            var r = rows[i];
            var sel = state.view && (state.view.type === "favorites" ? r.dataset.fav === "1" : (r.dataset.path && L.samePath(r.dataset.path, state.view.path)));
            r.classList.toggle("selected", !!sel);
        }
    }

    // abre os ancestrais de uma pasta na árvore (ao navegar pela grade ou pelo caminho)
    function revealInTree(dir) {
        var lib = L.libraryOf(cfg, dir);
        if (!lib) return;
        var rel = L.path.relative(lib.path, dir);
        var parts = rel ? rel.split(/[\\/]/) : [];
        var cur = lib.path;
        var changed = !isExpanded(cur) && parts.length > 0;
        if (parts.length) setExpanded(cur, true);
        for (var i = 0; i < parts.length - 1; i++) {
            cur = L.path.join(cur, parts[i]);
            if (!isExpanded(cur)) { setExpanded(cur, true); changed = true; }
        }
        if (changed) renderTree(); else markSelectedRow();
    }

    // ---------- usado pelos outros arquivos ----------

    app.setExpanded = setExpanded;
    app.renderTree = renderTree;
    app.updateFavCount = updateFavCount;
    app.markSelectedRow = markSelectedRow;
    app.revealInTree = revealInTree;
})(window.HLApp);
