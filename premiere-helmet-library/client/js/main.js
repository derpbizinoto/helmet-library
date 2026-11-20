// client/js/main.js — Helmet Library
// Interface: árvore de bibliotecas à esquerda, grade de arquivos à direita, player embaixo.
// Adicionar: botão "Adicionar" / Enter / duplo clique → host/index.jsx (hl_add),
// ou arrastar o card direto para a timeline ou o painel Project.

(function () {
    "use strict";

    var CLIENT_VERSION = "1.2.3";
    var BIN_NAME = "Helmet Library";

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
        token: 0,
        busy: false
    };

    // ======================================================================
    // utilidades
    // ======================================================================

    var KIND_ICON = { video: "i-film", audio: "i-music", image: "i-image", mogrt: "i-sparkles", other: "i-file", unknown: "i-file" };
    var KIND_LABEL = { video: "vídeo", audio: "áudio", image: "imagem", mogrt: "MOGRT", other: "arquivo", unknown: "arquivo" };

    function svg(id, cls) {
        return '<svg class="icon' + (cls ? " " + cls : "") + '"><use href="#' + id + '"/></svg>';
    }

    function esc(s) {
        return String(s).replace(/[&<>"']/g, function (c) { return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]; });
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
        if (msg && !sticky) statusTimer = setTimeout(function () { setStatus(defaultStatus()); }, kind === "error" ? 9000 : 5000);
    }

    function defaultStatus() {
        var n = selectedFiles().length;
        if (n > 1) return n + " arquivos selecionados";
        if (n === 1) {
            var f = selectedFiles()[0];
            return f.name + "  ·  " + L.fmtBytes(f.size);
        }
        return "";
    }

    function save() { L.saveConfig(cfg); }

    function fmtDur(sec) {
        sec = Math.round(sec || 0);
        if (!sec && sec !== 0) return "";
        var m = Math.floor(sec / 60), s = sec % 60;
        return m + ":" + ("0" + s).slice(-2);
    }

    function libById(id) {
        for (var i = 0; i < cfg.libraries.length; i++) if (cfg.libraries[i].id === id) return cfg.libraries[i];
        return null;
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
        updateFavCount();
        return cfg.favorites.length > before;
    }

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
        return L.listDirs(dir).then(function (dirs) { state.dirCache[dir] = dirs; return dirs; }, function () { state.dirCache[dir] = []; return []; });
    }

    function renderTree() {
        var scroll = els.tree.scrollTop;
        els.tree.innerHTML = "";

        var fav = document.createElement("div");
        fav.className = "tree-row fav";
        fav.innerHTML = '<span class="twisty leaf"></span>' + svg("i-star") + '<span class="label">Favoritos</span><span class="count" id="favCount"></span>';
        fav.style.paddingLeft = "0px";
        fav.addEventListener("click", function () { openView({ type: "favorites" }); });
        fav.dataset.fav = "1";
        els.tree.appendChild(fav);

        var sec = document.createElement("div");
        sec.className = "tree-section";
        sec.textContent = "Bibliotecas";
        els.tree.appendChild(sec);

        if (!cfg.libraries.length) {
            var em = document.createElement("div");
            em.className = "tree-empty";
            em.innerHTML = "Nenhuma biblioteca ainda.<br>Clique em <b>Adicionar pasta</b> e escolha uma pasta do computador com seus vídeos, sons, imagens e MOGRTs.";
            els.tree.appendChild(em);
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
        var missing = lib && !L.exists(dir);
        if (missing) row.classList.add("missing");
        row.innerHTML = '<span class="twisty">' + svg("i-chevron") + '</span>' +
            svg(lib ? "i-library" : "i-folder") +
            '<span class="label" title="' + esc(missing ? "Pasta não encontrada: " + dir : dir) + '">' + esc(name) + '</span>' +
            (lib ? '<button class="icon-btn sm row-menu" title="Opções">' + svg("i-dots") + '</button>' : "");
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
            kids.innerHTML = "";
            if (!on) return;
            loadDirs(dir).then(function (dirs) {
                if (!isExpanded(dir)) return;
                kids.innerHTML = "";
                if (!dirs.length) { twisty.classList.add("leaf"); row.classList.remove("open"); return; }
                dirs.forEach(function (d) { kids.appendChild(buildNode(d.path, d.name, depth + 1, null)); });
                markSelectedRow();
            });
        }

        twisty.addEventListener("click", function (e) { e.stopPropagation(); expand(!isExpanded(dir)); });
        row.addEventListener("click", function () {
            if (missing) { setStatus("A pasta desta biblioteca não foi encontrada (unidade desconectada ou pasta movida).", "error"); return; }
            openView({ type: "folder", path: dir });
        });
        row.addEventListener("dblclick", function (e) { if (e.target.closest(".row-menu")) return; expand(!isExpanded(dir)); });
        row.addEventListener("contextmenu", function (e) { e.preventDefault(); folderMenu(e.clientX, e.clientY, dir, lib); });
        var rm = row.querySelector(".row-menu");
        if (rm) rm.addEventListener("click", function (e) {
            e.stopPropagation();
            var r = rm.getBoundingClientRect();
            folderMenu(r.left, r.bottom + 2, dir, lib);
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

    // ======================================================================
    // grade
    // ======================================================================

    function openView(view, keepSelection) {
        var same = state.view && view && state.view.type === view.type && state.view.path === view.path;
        state.view = view;
        cfg.lastView = view;
        save();
        if (!same && !keepSelection) { state.selected = {}; state.anchor = state.focus = -1; }
        if (view.type === "folder") revealInTree(view.path); else markSelectedRow();
        renderCrumbs();
        return loadItems(!same);
    }

    function renderCrumbs() {
        var v = state.view;
        var html = "";
        if (!v) { els.crumbPath.innerHTML = ""; return; }
        if (v.type === "favorites") {
            html = '<button class="crumb">Favoritos</button>';
        } else {
            var lib = L.libraryOf(cfg, v.path);
            if (lib) {
                var rel = L.path.relative(lib.path, v.path);
                var parts = rel ? rel.split(/[\\/]/) : [];
                var cur = lib.path;
                html = '<button class="crumb" data-path="' + esc(cur) + '">' + esc(lib.name) + '</button>';
                parts.forEach(function (p) {
                    cur = L.path.join(cur, p);
                    html += svg("i-chevron", "sep") + '<button class="crumb" data-path="' + esc(cur) + '">' + esc(p) + '</button>';
                });
            } else {
                html = '<button class="crumb">' + esc(v.path) + '</button>';
            }
        }
        els.crumbPath.innerHTML = html;
    }

    function searchText() { return els.search.value.trim(); }

    function loadItems(scrollTop) {
        // durante um arraste, recriar os cards cancela o drag: deixa para depois
        if (state.dragging && !scrollTop) { state.reloadAfterDrag = true; return Promise.resolve(); }
        var token = ++state.token;
        var v = state.view;
        var q = searchText();
        els.gridWrap.classList.add("loading");
        var work;

        if (!v) {
            work = Promise.resolve({ dirs: [], files: [] });
        } else if (v.type === "favorites") {
            var files = [];
            cfg.favorites.forEach(function (p) { var e = L.fileEntry(p); if (e) files.push(e); });
            files.sort(function (a, b) { return a.name.localeCompare(b.name, "pt-BR", { numeric: true }); });
            work = Promise.resolve({ dirs: [], files: files });
        } else if (q || cfg.includeSub) {
            work = L.walk(v.path, { showUnknown: cfg.showUnknown }).then(function (files) { return { dirs: [], files: files }; });
        } else {
            work = L.listDir(v.path, { showUnknown: cfg.showUnknown });
        }

        return work.then(function (res) {
            if (token !== state.token) return;
            var nq = norm(q);
            var filter = cfg.filter || "all";
            var files = res.files.filter(function (f) {
                if (nq && norm(f.name).indexOf(nq) < 0) return false;
                if (filter === "all") return true;
                if (filter === "other") return f.kind === "other" || f.kind === "unknown";
                return f.kind === filter;
            });
            var dirs = (q || filter !== "all") ? [] : res.dirs;
            var items = dirs.map(function (d) { return { isDir: true, name: d.name, path: d.path }; }).concat(files);
            // mantém só a seleção que ainda existe
            var still = {};
            files.forEach(function (f) { if (state.selected[f.path]) still[f.path] = true; });
            state.selected = still;
            // nada mudou de verdade (ex.: o Premiere gravou um .cfa/.pek na pasta): não recria os cards
            var sig = items.map(function (it) { return it.path + "|" + (it.mtime || "") + "|" + (it.size || ""); }).join("\n");
            if (!scrollTop && sig === state.sig && els.grid.children.length === items.length) {
                state.items = items;
                refreshSelectionUi();
            } else {
                state.sig = sig;
                state.items = items;
                renderGrid(scrollTop);
            }
            var count = files.length + " arquivo" + (files.length === 1 ? "" : "s");
            if (q) count = files.length + " resultado" + (files.length === 1 ? "" : "s");
            els.crumbCount.textContent = v ? count : "";
        }, function (err) {
            if (token !== state.token) return;
            state.items = [];
            renderGrid(true);
            showEmpty("i-folder", "Não deu para abrir esta pasta.<br><small>" + esc(err && err.message || err) + "</small>");
        }).then(function () {
            if (token === state.token) els.gridWrap.classList.remove("loading");
        });
    }

    var observer = null;
    function renderGrid(scrollTop) {
        if (observer) observer.disconnect();
        observer = new IntersectionObserver(onVisible, { root: els.gridWrap, rootMargin: "300px 0px" });
        els.grid.innerHTML = "";
        var frag = document.createDocumentFragment();
        state.items.forEach(function (it, i) { frag.appendChild(it.isDir ? folderTile(it, i) : fileTile(it, i)); });
        els.grid.appendChild(frag);
        if (scrollTop) els.gridWrap.scrollTop = 0;
        els.empty.hidden = true;

        if (!state.items.length) {
            if (!cfg.libraries.length) showEmpty("i-folder-plus", "Adicione uma pasta do computador para criar sua biblioteca.<br><button class=\"btn btn-primary btn-sm\" id=\"emptyAdd\" style=\"margin-top:12px\">" + svg("i-folder-plus") + "Adicionar pasta</button>");
            else if (!state.view) showEmpty("i-library", "Escolha uma pasta na barra lateral.");
            else if (state.view.type === "favorites") showEmpty("i-star", "Nenhum favorito ainda.<br>Passe o mouse num arquivo e clique na estrela.");
            else if (searchText()) showEmpty("i-search", "Nada encontrado para “" + esc(searchText()) + "” nesta pasta.");
            else showEmpty("i-folder-open", "Esta pasta está vazia" + (cfg.filter !== "all" ? " (com este filtro)" : "") + ".");
            var b = $("emptyAdd");
            if (b) b.addEventListener("click", addLibrary);
        }
        refreshSelectionUi();
    }

    function showEmpty(icon, html) {
        els.empty.innerHTML = svg(icon) + "<div>" + html + "</div>";
        els.empty.hidden = false;
    }

    function folderTile(it, i) {
        var el = document.createElement("div");
        el.className = "tile folder";
        el.dataset.i = i;
        el.innerHTML = '<div class="tile-thumb">' + svg("i-folder", "ph") + '</div>' +
            '<div class="tile-foot">' + svg("i-folder") + '<span class="tile-name" title="' + esc(it.name) + '">' + esc(it.name) + '</span></div>';
        return el;
    }

    function fileTile(f, i) {
        var el = document.createElement("div");
        el.className = "tile";
        el.dataset.i = i;
        el.draggable = true;
        var warn = f.kind !== "unknown" && !f.canPreview;
        el.innerHTML =
            '<div class="tile-thumb kind-' + f.kind + '">' + svg(KIND_ICON[f.kind] || "i-file", "ph kind-" + f.kind + "-ph") +
            '<span class="tile-ext' + (f.kind === "unknown" ? " warn" : "") + '">' + esc(f.ext) + '</span>' +
            '<span class="tile-badge"></span></div>' +
            '<div class="tile-foot"><span class="kind kind-' + f.kind + '" title="' + KIND_LABEL[f.kind] + '">' + svg(KIND_ICON[f.kind] || "i-file") + '</span>' +
            '<span class="tile-name" title="' + esc(f.name + (warn ? "\nSem pré-visualização para este formato" : "")) + '">' + esc(f.name) + '</span>' +
            '<button class="tile-star' + (isFav(f.path) ? " on" : "") + '" title="Favoritar">' + svg("i-star") + '</button></div>';
        var ph = el.querySelector(".ph");
        ph.style.color = "var(--kind-" + (f.kind === "unknown" ? "other" : f.kind) + ")";
        var cached = P.peek(f);
        if (cached) applyPreview(el, f, cached);
        else if (f.canPreview) observer.observe(el);
        return el;
    }

    function onVisible(entries) {
        entries.forEach(function (en) {
            var el = en.target;
            var f = state.items[+el.dataset.i];
            if (!f || f.isDir) return;
            if (!en.isIntersecting) { P.deprioritize(f); return; }
            observer.unobserve(el);
            var thumb = el.querySelector(".tile-thumb");
            thumb.classList.add("busy");
            var token = state.token;
            P.get(f).then(function (res) {
                if (token !== state.token) return;
                applyPreview(el, f, res);
                PL.updatePreview(f, res);
            });
        });
    }

    function applyPreview(el, f, res) {
        var thumb = el.querySelector(".tile-thumb");
        thumb.classList.remove("busy");
        if (res.thumb) {
            var img = thumb.querySelector("img") || document.createElement("img");
            img.alt = "";
            img.draggable = false;
            img.src = res.thumb;
            if (!img.parentNode) thumb.insertBefore(img, thumb.firstChild);
            thumb.classList.add("has-img");
        }
        var badge = thumb.querySelector(".tile-badge");
        var m = res.meta || {};
        if (m.duration) badge.textContent = fmtDur(m.duration);
        else if (m.width && f.kind === "image") badge.textContent = m.width + "×" + m.height;
        if (m.error) {
            var ext = thumb.querySelector(".tile-ext");
            ext.classList.add("warn");
            ext.title = "Sem pré-visualização: " + m.error;
        }
        if (m.title && f.kind === "mogrt") el.querySelector(".tile-name").title = f.name + "\n" + m.title;
    }

    // ---------- hover: só o GIF anima (vídeos e MOGRTs ficam na miniatura estática;
    // o preview com movimento é o de baixo, ao clicar) ----------

    var hoverEl = null;
    els.grid.addEventListener("mouseover", function (e) {
        var el = e.target.closest(".tile");
        if (el === hoverEl) return;
        stopHover();
        if (!el || el.classList.contains("folder")) return;
        var f = state.items[+el.dataset.i];
        if (!f) return;
        hoverEl = el;
        var res = P.peek(f);
        if (f.kind === "image" && f.ext === "gif" && res && res.thumb) {
            var img = el.querySelector(".tile-thumb img");
            if (img) { img.dataset.still = img.src; img.src = L.toFileUrl(f.path); }
        }
    });
    els.grid.addEventListener("mouseleave", stopHover);

    function stopHover() {
        if (!hoverEl) return;
        var img = hoverEl.querySelector("img[data-still]");
        if (img) { img.src = img.dataset.still; delete img.dataset.still; }
        hoverEl = null;
    }

    // ---------- seleção ----------

    function selectedFiles() {
        return state.items.filter(function (it) { return !it.isDir && state.selected[it.path]; });
    }

    function refreshSelectionUi() {
        var tiles = els.grid.children;
        for (var i = 0; i < tiles.length; i++) {
            var it = state.items[+tiles[i].dataset.i];
            tiles[i].classList.toggle("selected", !!(it && !it.isDir && state.selected[it.path]));
        }
        var n = selectedFiles().length;
        els.btnAdd.disabled = els.btnImport.disabled = !n;
        if (!els.status.className.match(/success|warning|error/)) setStatus(defaultStatus(), "", true);
        // o preview só aparece com algum arquivo selecionado
        if (!n && !els.player.hidden) {
            PL.stopAll();
            PL.load(null);
            els.player.hidden = true;
        }
    }

    function showPlayer() { els.player.hidden = false; }

    function clearSelection() {
        state.selected = {};
        state.anchor = -1;
        refreshSelectionUi();
    }

    function selectIndex(i, ev) {
        var it = state.items[i];
        if (!it || it.isDir) return;
        ev = ev || {};
        var plain = !ev.shiftKey && !ev.ctrlKey && !ev.metaKey;
        // clicar de novo no arquivo que está no preview: para e fecha o preview (desmarca)
        var cur = PL.currentFile();
        if (plain && ev.fromClick && cur && cur.path === it.path && !els.player.hidden && state.selected[it.path]) {
            clearSelection();
            return;
        }
        if (ev.shiftKey && state.anchor >= 0) {
            if (!ev.ctrlKey && !ev.metaKey) state.selected = {};
            var a = Math.min(state.anchor, i), b = Math.max(state.anchor, i);
            for (var k = a; k <= b; k++) if (!state.items[k].isDir) state.selected[state.items[k].path] = true;
        } else if (ev.ctrlKey || ev.metaKey) {
            if (state.selected[it.path]) delete state.selected[it.path]; else state.selected[it.path] = true;
            state.anchor = i;
        } else {
            state.selected = {};
            state.selected[it.path] = true;
            state.anchor = i;
        }
        state.focus = i;
        refreshSelectionUi();
        if (plain) {
            showPlayer();
            var res = P.peek(it);
            PL.load(it, res, !!cfg.autoplay);
            if (!res && it.canPreview) P.get(it, true).then(function (r) { PL.updatePreview(it, r); });
        }
        var tile = els.grid.children[i];
        if (tile && tile.scrollIntoViewIfNeeded) tile.scrollIntoViewIfNeeded(false);
    }

    els.grid.addEventListener("click", function (e) {
        var el = e.target.closest(".tile");
        if (!el) return;
        var i = +el.dataset.i;
        var it = state.items[i];
        if (e.target.closest(".tile-star")) {
            var on = toggleFav(it.path);
            e.target.closest(".tile-star").classList.toggle("on", on);
            setStatus(on ? "Adicionado aos favoritos." : "Removido dos favoritos.", "success");
            if (state.view && state.view.type === "favorites" && !on) loadItems(false);
            return;
        }
        if (it.isDir) { openView({ type: "folder", path: it.path }); return; }
        selectIndex(i, { shiftKey: e.shiftKey, ctrlKey: e.ctrlKey, metaKey: e.metaKey, fromClick: true });
        els.gridWrap.focus();
    });

    els.grid.addEventListener("dblclick", function (e) {
        var el = e.target.closest(".tile");
        if (!el || e.target.closest(".tile-star")) return;
        var it = state.items[+el.dataset.i];
        if (!it || it.isDir) return;
        addFiles([it], cfg.dblClick !== "project");
    });

    els.grid.addEventListener("contextmenu", function (e) {
        var el = e.target.closest(".tile");
        if (!el) return;
        e.preventDefault();
        var i = +el.dataset.i;
        var it = state.items[i];
        if (it.isDir) { folderMenu(e.clientX, e.clientY, it.path, null); return; }
        if (!state.selected[it.path]) selectIndex(i, {});
        fileMenu(e.clientX, e.clientY, selectedFiles());
    });

    // clique no vazio limpa a seleção
    els.gridWrap.addEventListener("mousedown", function (e) {
        if (e.target === els.gridWrap || e.target === els.grid) clearSelection();
    });

    // ---------- teclado ----------

    function columns() {
        var tiles = els.grid.children;
        if (tiles.length < 2) return 1;
        var top = tiles[0].offsetTop, n = 0;
        for (var i = 0; i < tiles.length && tiles[i].offsetTop === top; i++) n++;
        return Math.max(1, n);
    }

    document.addEventListener("keydown", function (e) {
        if (!els.ask.hidden || !els.settings.hidden) {
            if (e.key === "Escape") { closeAsk(null); els.settings.hidden = true; }
            return;
        }
        var typing = e.target && (e.target.tagName === "INPUT" && e.target.type === "text" || e.target.tagName === "TEXTAREA" || e.target.tagName === "SELECT");
        if (e.key === "Escape") {
            if (!els.menu.hidden) { hideMenu(); return; }
            if (typing && e.target === els.search) { els.search.value = ""; onSearch(); els.gridWrap.focus(); return; }
            clearSelection();
            return;
        }
        if (typing) {
            if (e.key === "ArrowDown" && e.target === els.search) { e.preventDefault(); els.gridWrap.focus(); moveFocus(0); }
            return;
        }
        if (e.key === " " || e.code === "Space") { e.preventDefault(); PL.toggle(); return; }
        if (e.key === "Enter") { e.preventDefault(); var s = selectedFiles(); if (s.length) addFiles(s, !e.shiftKey); return; }
        if ((e.ctrlKey || e.metaKey) && (e.key === "a" || e.key === "A")) {
            e.preventDefault();
            state.items.forEach(function (it) { if (!it.isDir) state.selected[it.path] = true; });
            refreshSelectionUi();
            return;
        }
        if ((e.ctrlKey || e.metaKey) && (e.key === "f" || e.key === "F")) { e.preventDefault(); els.search.focus(); els.search.select(); return; }
        if (e.key === "Backspace" && state.view && state.view.type === "folder") {
            var lib = L.libraryOf(cfg, state.view.path);
            if (lib && !L.samePath(lib.path, state.view.path)) openView({ type: "folder", path: L.path.dirname(state.view.path) });
            return;
        }
        var delta = { ArrowRight: 1, ArrowLeft: -1, ArrowDown: columns(), ArrowUp: -columns() }[e.key];
        if (delta) { e.preventDefault(); moveFocus(delta, e); }
    });

    function moveFocus(delta, e) {
        if (!state.items.length) return;
        var i = state.focus < 0 ? 0 : Math.min(state.items.length - 1, Math.max(0, state.focus + delta));
        // pula as subpastas
        var step = delta >= 0 ? 1 : -1;
        while (state.items[i] && state.items[i].isDir) i += step;
        if (!state.items[i]) return;
        selectIndex(i, e && e.shiftKey ? { shiftKey: true } : {});
    }

    // ---------- arrastar para o Premiere ----------

    var dragGhost = null;
    function ghostFor(files) {
        if (!dragGhost) {
            dragGhost = document.createElement("div");
            dragGhost.className = "drag-ghost";
            document.body.appendChild(dragGhost);
        }
        var f = files[0];
        dragGhost.innerHTML = svg(KIND_ICON[f.kind] || "i-file") + "<span>" + esc(files.length > 1 ? files.length + " arquivos" : f.name) + "</span>";
        return dragGhost;
    }

    els.grid.addEventListener("dragstart", function (e) {
        var el = e.target.closest && e.target.closest(".tile");
        if (!el || el.classList.contains("folder")) { e.preventDefault(); return; }
        stopHover();
        hideMenu();
        var it = state.items[+el.dataset.i];
        var files = state.selected[it.path] ? selectedFiles() : [it];
        var dt = e.dataTransfer;
        // "all": se o Premiere pedir mover/vincular e a origem só permitir copiar, o Windows recusa o drop.
        // (o navegador nunca apaga nem move o arquivo original ao arrastar para fora)
        dt.effectAllowed = "all";
        // Formato do CEP + lista de URLs + caminho em texto. Na 1.0 eram estes três e o vídeo entrava
        // sempre; mandar só o do CEP (1.1 a 1.2.1) fazia o vídeo falhar ou entrar só o áudio.
        files.forEach(function (f, n) { dt.setData("com.adobe.cep.dnd.file." + n, f.path); });
        dt.setData("text/uri-list", files.map(function (f) { return L.toFileUrl(f.path); }).join("\r\n"));
        dt.setData("text/plain", files.map(function (f) { return f.path; }).join("\n"));
        try { dt.setDragImage(ghostFor(files), 14, 14); } catch (err) { /* usa a imagem padrão */ }
        state.dragging = { files: files, el: el };
        el.classList.add("dragging");
        setStatus("Solte na timeline ou no painel Project" + (files.length > 1 ? " (" + files.length + " arquivos)" : "") + ".", "", true);
    });

    els.grid.addEventListener("dragend", function (e) {
        var d = state.dragging;
        state.dragging = null;
        if (d && d.el) d.el.classList.remove("dragging");
        var outside = e.clientX <= 0 || e.clientY <= 0 || e.clientX >= window.innerWidth || e.clientY >= window.innerHeight;
        var effect = e.dataTransfer ? e.dataTransfer.dropEffect : "";
        // O dropEffect que volta de outro programa não é confiável (vinha "none" mesmo quando o Premiere
        // aceitava parte do arquivo), então ele só vai para o console, para depuração.
        console.log("Helmet Library: dragend", { dropEffect: effect, outside: outside, x: e.clientX, y: e.clientY });
        setStatus(defaultStatus());
        if (state.reloadAfterDrag) { state.reloadAfterDrag = false; loadItems(false); }
    });

    // arrastar de volta para dentro do próprio painel não faz nada
    // (e soltar dentro do painel nunca pode fazer o painel "abrir" o arquivo como página)
    document.addEventListener("dragover", function (e) { e.preventDefault(); e.dataTransfer.dropEffect = "none"; });
    document.addEventListener("drop", function (e) { e.preventDefault(); });

    // ======================================================================
    // adicionar ao Premiere
    // ======================================================================

    function evalHost(script) {
        return new Promise(function (resolve) {
            if (!cs) { resolve({ ok: false, error: "Fora do Premiere (modo de demonstração)." }); return; }
            cs.evalScript(script, function (res) {
                if (res === "EvalScript error.") { resolve({ ok: false, error: "Erro no ExtendScript. Reabra o painel." }); return; }
                try { resolve(JSON.parse(res)); } catch (e) { resolve({ ok: false, error: String(res || "resposta vazia do Premiere") }); }
            });
        });
    }

    function q(s) { return "'" + encodeURIComponent(s).replace(/'/g, "%27") + "'"; }

    function binFor(f) {
        if (!cfg.useBin) return { bin: "", sub: "" };
        if (!cfg.mirrorFolders) return { bin: BIN_NAME, sub: "" };
        var lib = L.libraryOf(cfg, f.path);
        if (!lib) return { bin: BIN_NAME, sub: "" };
        var rel = L.path.relative(lib.path, L.path.dirname(f.path)).replace(/\\/g, "/");
        return { bin: BIN_NAME, sub: lib.name + (rel ? "/" + rel : "") };
    }

    var adding = false;
    function addFiles(files, toTimeline) {
        if (!files.length || adding) return;
        if (!inCEP) { setStatus("Modo de demonstração: no Premiere, " + files.length + " arquivo(s) iriam para " + (toTimeline ? "a timeline." : "o projeto."), "warning"); return; }
        adding = true;
        els.btnAdd.disabled = els.btnImport.disabled = true;
        var okCount = 0, lastMsg = "", errors = [], noSeq = false;
        var i = 0;
        setStatus((toTimeline ? "Adicionando na timeline" : "Importando") + "…", "", true);
        function next() {
            if (i >= files.length) return Promise.resolve();
            var f = files[i++];
            var b = binFor(f);
            var kind = f.kind === "unknown" ? "other" : f.kind;
            var script = "hl_add(" + q(f.path) + ",'" + kind + "','" + (toTimeline ? "1" : "0") + "'," + q(b.bin) + "," + q(b.sub) + ")";
            return evalHost(script).then(function (r) {
                if (r.ok) {
                    okCount++;
                    if (r.data.noSequence) noSeq = true;
                    lastMsg = r.data.where === "timeline" ? "“" + r.data.name + "” na trilha " + r.data.track : "“" + r.data.name + "” importado no projeto";
                    flashTile(f);
                } else {
                    errors.push(f.name + ": " + r.error);
                }
                return next();
            });
        }
        next().then(function () {
            adding = false;
            refreshSelectionUi();
            if (errors.length) setStatus(errors.length === 1 && files.length === 1 ? errors[0] : errors.length + " de " + files.length + " falharam. " + errors[0], "error");
            else if (noSeq) setStatus("Nenhuma sequência aberta: importado só no projeto.", "warning");
            else if (okCount === 1) setStatus(lastMsg + ".", "success");
            else setStatus(okCount + " arquivos adicionados.", "success");
        });
    }

    function flashTile(f) {
        for (var i = 0; i < state.items.length; i++) {
            if (state.items[i].path === f.path) {
                var el = els.grid.children[i];
                if (el) { el.classList.remove("adding"); void el.offsetWidth; el.classList.add("adding"); }
                return;
            }
        }
    }

    els.btnAdd.addEventListener("click", function () { addFiles(selectedFiles(), true); });
    els.btnImport.addEventListener("click", function () { addFiles(selectedFiles(), false); });

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
        dir = L.path.resolve ? L.path.resolve(dir) : dir;
        for (var i = 0; i < cfg.libraries.length; i++) {
            if (L.samePath(cfg.libraries[i].path, dir)) { setStatus("Esta pasta já está na biblioteca.", "warning"); openView({ type: "folder", path: dir }); return; }
        }
        var lib = { id: L.newId(), name: L.path.basename(dir) || dir, path: dir };
        cfg.libraries.push(lib);
        setExpanded(dir, true);
        save();
        watchLib(lib);
        renderTree();
        openView({ type: "folder", path: dir });
        setStatus("Biblioteca “" + lib.name + "” adicionada. Os previews são gerados conforme você navega.", "success");
    }

    function removeLibrary(lib) {
        ask("Remover biblioteca", "Remover “" + lib.name + "” da extensão? Os arquivos no computador não são apagados.", null, "Remover").then(function (ok) {
            if (!ok) return;
            L.unwatch(lib.path);
            cfg.libraries = cfg.libraries.filter(function (x) { return x.id !== lib.id; });
            save();
            renderTree();
            if (state.view && state.view.type === "folder" && L.isInside(state.view.path, lib.path)) {
                state.view = null;
                if (cfg.libraries.length) openView({ type: "folder", path: cfg.libraries[0].path });
                else { renderCrumbs(); loadItems(true); }
            }
            setStatus("Biblioteca removida.", "success");
        });
    }

    function renameLibrary(lib) {
        ask("Renomear biblioteca", "Nome exibido no painel (a pasta no disco não muda).", lib.name, "Salvar").then(function (name) {
            if (!name || typeof name !== "string") return;
            lib.name = name.trim() || lib.name;
            save();
            renderTree();
            renderCrumbs();
        });
    }

    function refreshFolder(dir) {
        Object.keys(state.dirCache).forEach(function (k) { if (L.isInside(k, dir)) delete state.dirCache[k]; });
        renderTree();
        if (state.view) loadItems(false);
    }

    function watchLib(lib) {
        L.watch(lib.path, function (root, changedDirs) {
            changedDirs.forEach(function (d) {
                delete state.dirCache[d];
                delete state.dirCache[L.path.dirname(d)];
            });
            renderTree();
            var v = state.view;
            if (!v) return;
            var affects = v.type === "favorites" || changedDirs.some(function (d) {
                return L.samePath(d, v.path) || ((cfg.includeSub || searchText()) && L.isInside(d, v.path));
            });
            if (affects) loadItems(false);
        });
    }

    function clearLibraryCache(lib) {
        var dir = L.path.join(lib.path, L.CACHE_DIR_NAME);
        var n = L.clearDir(dir);
        P.clearMemo();
        setStatus(n + " arquivo(s) de preview apagados de “" + lib.name + "”.", "success");
        if (state.view) loadItems(false);
    }

    els.btnAddLibrary.addEventListener("click", addLibrary);

    // ======================================================================
    // menus de contexto
    // ======================================================================

    function showMenu(x, y, items) {
        var m = els.menu;
        m.innerHTML = "";
        items.forEach(function (it) {
            if (it === "-") { m.appendChild(document.createElement("hr")); return; }
            var b = document.createElement("button");
            b.innerHTML = svg(it.icon || "i-file") + "<span>" + esc(it.label) + "</span>";
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
            { label: files.length > 1 ? "Adicionar " + files.length + " na timeline" : "Adicionar na timeline", icon: "i-timeline", action: function () { addFiles(files, true); } },
            { label: "Importar só no projeto", icon: "i-download", action: function () { addFiles(files, false); } },
            "-",
            { label: one ? (fav ? "Remover dos favoritos" : "Favoritar") : "Favoritar selecionados", icon: "i-star", action: function () {
                if (one) toggleFav(one.path);
                else files.forEach(function (f) { if (!isFav(f.path)) cfg.favorites.push(f.path); });
                save(); updateFavCount();
                loadItems(false);
            } },
            { label: "Mostrar no Explorer", icon: "i-folder-open", disabled: !one, action: function () { L.reveal(one.path); } },
            { label: "Gerar preview de novo", icon: "i-refresh", disabled: files.every(function (f) { return !f.canPreview; }), action: function () {
                files.forEach(function (f) { P.forget(f); });
                loadItems(false);
                var cur = PL.currentFile();
                if (cur && files.some(function (f) { return f.path === cur.path; })) P.get(cur, true).then(function (r) { PL.load(cur, r, false); });
            } }
        ]);
    }

    function folderMenu(x, y, dir, lib) {
        var items = [
            { label: "Abrir", icon: "i-folder-open", action: function () { openView({ type: "folder", path: dir }); } },
            { label: "Atualizar", icon: "i-refresh", action: function () { refreshFolder(dir); setStatus("Pasta atualizada.", "success"); } },
            { label: "Abrir no Explorer", icon: "i-folder", action: function () { L.openFolder(dir); } }
        ];
        if (lib) {
            items.push("-",
                { label: "Renomear", icon: "i-pencil", action: function () { renameLibrary(lib); } },
                { label: "Limpar previews desta biblioteca", icon: "i-trash", disabled: cfg.cacheMode !== "library", action: function () { clearLibraryCache(lib); } },
                "-",
                { label: "Remover da extensão", icon: "i-x", danger: true, action: function () { removeLibrary(lib); } });
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

    // ======================================================================
    // configurações
    // ======================================================================

    function openSettings() {
        var radios = document.getElementsByName("cacheMode");
        for (var i = 0; i < radios.length; i++) radios[i].checked = radios[i].value === cfg.cacheMode;
        els.setUseBin.checked = !!cfg.useBin;
        els.setMirror.checked = !!cfg.mirrorFolders;
        els.setDblClick.value = cfg.dblClick;
        els.setAutoplay.checked = !!cfg.autoplay;
        els.setUnknown.checked = !!cfg.showUnknown;
        els.versionNote.textContent = "Helmet Library " + CLIENT_VERSION + "  ·  configuração em " + (L.demo ? "%APPDATA%\\Helmet Library" : L.appDataDir());
        updateCacheInfo();
        updateMirrorState();
        els.settings.hidden = false;
    }

    function updateMirrorState() {
        els.setMirror.disabled = !els.setUseBin.checked;
        els.setMirror.closest(".switch-row").style.opacity = els.setUseBin.checked ? "" : "0.45";
    }

    function updateCacheInfo() {
        var size = { bytes: 0, files: 0 };
        if (cfg.cacheMode === "library") {
            els.cacheHint.innerHTML = "Os previews ficam numa pasta oculta <span class=\"path\">" + L.CACHE_DIR_NAME + "</span> dentro de cada biblioteca. Copiou a pasta para outro PC ou HD? Os previews vão junto.";
            cfg.libraries.forEach(function (lib) {
                var s = L.dirSize(L.path.join(lib.path, L.CACHE_DIR_NAME));
                size.bytes += s.bytes; size.files += s.files;
            });
        } else {
            els.cacheHint.innerHTML = "Os previews ficam em <span class=\"path\">" + esc(L.systemCacheDir()) + "</span>. As pastas da biblioteca não são alteradas.";
            size = L.dirSize(L.systemCacheDir());
        }
        els.cacheSize.textContent = size.files ? "Ocupando " + L.fmtBytes(size.bytes) + " (" + size.files + " arquivos)" : "Nenhum preview salvo ainda.";
    }

    els.btnSettings.addEventListener("click", openSettings);
    els.settings.addEventListener("mousedown", function (e) { if (e.target === els.settings) els.settings.hidden = true; });
    els.settings.querySelector("[data-close]").addEventListener("click", function () { els.settings.hidden = true; });

    Array.prototype.forEach.call(document.getElementsByName("cacheMode"), function (r) {
        r.addEventListener("change", function () {
            if (!r.checked) return;
            cfg.cacheMode = r.value;
            save();
            P.clearMemo();
            updateCacheInfo();
            if (state.view) loadItems(false);
        });
    });
    els.btnClearCache.addEventListener("click", function () {
        var n = 0;
        if (cfg.cacheMode === "library") cfg.libraries.forEach(function (lib) { n += L.clearDir(L.path.join(lib.path, L.CACHE_DIR_NAME)); });
        else n = L.clearDir(L.systemCacheDir());
        P.clearMemo();
        updateCacheInfo();
        setStatus(n + " arquivo(s) de preview apagados. Eles são recriados quando você abrir as pastas.", "success");
        if (state.view) loadItems(false);
    });
    els.setUseBin.addEventListener("change", function () { cfg.useBin = els.setUseBin.checked; save(); updateMirrorState(); });
    els.setMirror.addEventListener("change", function () { cfg.mirrorFolders = els.setMirror.checked; save(); });
    els.setDblClick.addEventListener("change", function () { cfg.dblClick = els.setDblClick.value; save(); });
    els.setAutoplay.addEventListener("change", function () { cfg.autoplay = els.setAutoplay.checked; save(); });
    els.setUnknown.addEventListener("change", function () { cfg.showUnknown = els.setUnknown.checked; save(); if (state.view) loadItems(false); });

    // ======================================================================
    // barra superior, caminho, tamanho, divisor
    // ======================================================================

    var searchTimer = null;
    function onSearch() {
        els.btnClearSearch.hidden = !els.search.value;
        clearTimeout(searchTimer);
        searchTimer = setTimeout(function () { loadItems(true); }, 220);
    }
    els.search.addEventListener("input", onSearch);
    els.btnClearSearch.addEventListener("click", function () { els.search.value = ""; onSearch(); els.search.focus(); });

    els.filter.value = cfg.filter || "all";
    els.filter.addEventListener("change", function () { cfg.filter = els.filter.value; save(); loadItems(true); });

    els.crumbPath.addEventListener("click", function (e) {
        var b = e.target.closest(".crumb");
        if (b && b.dataset.path) openView({ type: "folder", path: b.dataset.path });
    });

    function syncSubfoldersBtn() { els.btnSubfolders.classList.toggle("on", !!cfg.includeSub); }
    els.btnSubfolders.addEventListener("click", function () {
        cfg.includeSub = !cfg.includeSub;
        save();
        syncSubfoldersBtn();
        loadItems(true);
    });
    els.btnRefresh.addEventListener("click", function () {
        if (state.view && state.view.type === "folder") refreshFolder(state.view.path);
        else loadItems(false);
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

    if (cs) {
        try {
            // menu do painel: atalhos úteis
            cs.setPanelFlyoutMenu('<Menu><MenuItem Id="add" Label="Adicionar pasta à biblioteca"/><MenuItem Id="settings" Label="Configurações"/><MenuItem Id="reload" Label="Recarregar painel"/></Menu>');
            cs.addEventListener("com.adobe.csxs.events.flyoutMenuClicked", function (ev) {
                var id = ev.data && ev.data.menuId;
                if (id === "add") addLibrary();
                else if (id === "settings") openSettings();
                else if (id === "reload") location.reload();
            });
        } catch (e) { /* versões antigas sem menu */ }
        cs.evalScript("hl_getHostVersion()", function (v) {
            if (v && v !== "EvalScript error." && v !== CLIENT_VERSION) console.warn("Helmet Library: host " + v + " / painel " + CLIENT_VERSION);
        });
    }

    syncSubfoldersBtn();
    cfg.libraries.forEach(watchLib);
    renderTree();

    var start = cfg.lastView;
    if (start && start.type === "folder" && !(L.libraryOf(cfg, start.path) && L.exists(start.path))) start = null;
    if (!start && cfg.libraries.length) start = { type: "folder", path: cfg.libraries[0].path };
    if (start) openView(start);
    else { renderCrumbs(); loadItems(true); }

    if (L.demo) setStatus("Modo de demonstração (fora do Premiere): biblioteca de exemplo, sem acesso ao disco.", "warning", true);

    // config.json danificado: avisa o que foi recuperado e onde ficou o arquivo estragado
    var notice = L.lastConfigNotice && L.lastConfigNotice();
    if (notice) ask("Configurações recuperadas", notice, null, "OK", { noCancel: true });

    var lastSaveError = 0;
    L.onSaveError(function () {
        if (Date.now() - lastSaveError < 60000) return;
        lastSaveError = Date.now();
        setStatus("Não foi possível salvar suas configurações (disco cheio ou sem permissão em " + L.appDataDir() + ").", "error");
    });

    window.addEventListener("beforeunload", function () { L.saveConfig(cfg, true); });
})();
