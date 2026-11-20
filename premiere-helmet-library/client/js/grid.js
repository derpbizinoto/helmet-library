// client/js/grid.js — Helmet Library
// Grade de arquivos: listagem (com índice da busca), cards e previews, seleção, teclado
// e arrastar para o Premiere.

(function (app) {
    "use strict";

    var HL = app.HL, L = app.L, P = app.P, PL = app.PL, cfg = app.cfg, els = app.els, state = app.state,
        KIND_ICON = app.KIND_ICON, KIND_LABEL = app.KIND_LABEL, icon = app.icon, h = app.h, fill = app.fill,
        norm = app.norm, setStatus = app.setStatus, defaultStatus = app.defaultStatus, save = app.save,
        fmtDur = app.fmtDur, isFav = app.isFav, toggleFav = app.toggleFav, rootOf = app.rootOf,
        searchText = app.searchText;

    // ======================================================================
    // grade
    // ======================================================================

    function openView(view, keepSelection) {
        var same = state.view && view && state.view.type === view.type && state.view.path === view.path;
        state.view = view;
        cfg.lastView = view;
        save();
        if (!same && !keepSelection) { state.selected = {}; state.anchor = state.focus = -1; }
        if (view.type === "folder") app.revealInTree(view.path); else app.markSelectedRow();
        renderCrumbs();
        return loadItems(!same);
    }

    function renderCrumbs() {
        var v = state.view;
        var nodes = [];
        var crumb = function (label, p) { return h("button", { className: "crumb", dataset: p ? { path: p } : {} }, [label]); };
        if (!v) { fill(els.crumbPath, []); return; }
        if (v.type === "favorites") {
            nodes.push(crumb("Favoritos"));
        } else {
            var lib = L.libraryOf(cfg, v.path);
            if (lib) {
                var rel = L.path.relative(lib.path, v.path);
                var parts = rel ? rel.split(/[\\/]/) : [];
                var cur = lib.path;
                nodes.push(crumb(lib.name, cur));
                parts.forEach(function (p) {
                    cur = L.path.join(cur, p);
                    nodes.push(icon("i-chevron", "sep"), crumb(p, cur));
                });
            } else {
                nodes.push(crumb(v.path));
            }
        }
        fill(els.crumbPath, nodes);
    }

    // ---------- índice das subpastas em memória ----------
    // Buscar ou "incluir subpastas" lê a pasta inteira. Guardar o resultado por alguns
    // segundos evita reler o disco a cada letra digitada na busca. O vigia de pastas,
    // o "Atualizar" e a opção de arquivos desconhecidos apagam o índice.

    var WALK_LIMIT = HL.WALK_LIMIT;
    var WALK_TTL = HL.WALK_CACHE_MS;

    function walkCached(dir) {
        var key = dir + "|" + (cfg.showUnknown ? 1 : 0);
        var hit = state.walkCache[key];
        if (hit && Date.now() - hit.time < WALK_TTL) return Promise.resolve(hit.files);
        return L.walk(dir, { showUnknown: cfg.showUnknown, root: rootOf(dir) }, WALK_LIMIT).then(function (files) {
            state.walkCache[key] = { time: Date.now(), files: files };
            return files;
        });
    }

    // apaga o índice das pastas afetadas por uma mudança em dir (ela e as que a contêm)
    function forgetWalk(dir) {
        Object.keys(state.walkCache).forEach(function (key) {
            var p = key.slice(0, key.lastIndexOf("|"));
            if (!dir || L.isInside(dir, p) || L.isInside(p, dir)) delete state.walkCache[key];
        });
    }

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
            work = Promise.all(cfg.favorites.map(L.fileEntry)).then(function (found) {
                var files = found.filter(Boolean);
                files.sort(L.byName);
                var lost = found.length - files.length;
                return {
                    dirs: [], files: files,
                    notice: lost ? lost + (lost === 1 ? " favorito não encontrado" : " favoritos não encontrados") + " — o arquivo foi movido ou está num HD/pasta de rede desconectado." : ""
                };
            });
        } else if (q || cfg.includeSub) {
            work = walkCached(v.path).then(function (files) {
                return {
                    dirs: [], files: files,
                    notice: files.truncated ? "Mostrando só os primeiros " + WALK_LIMIT.toLocaleString("pt-BR") + " arquivos desta pasta e subpastas. Abra uma subpasta para ver o resto." : ""
                };
            });
        } else {
            work = L.listDir(v.path, { showUnknown: cfg.showUnknown, root: rootOf(v.path) });
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
            if (res.notice) setStatus(res.notice, "warning");
        }, function (err) {
            if (token !== state.token) return;
            state.items = [];
            renderGrid(true);
            showEmpty("i-folder", ["Não deu para abrir esta pasta.", h("br"), h("small", null, [L.describeError(err, "folder")])]);
            // a biblioteca inteira pode ter sumido (HD desligado): atualiza a árvore
            app.checkLibraries();
        }).then(function () {
            if (token === state.token) els.gridWrap.classList.remove("loading");
        });
    }

    var observer = null;
    function renderGrid(scrollTop) {
        if (observer) observer.disconnect();
        observer = new IntersectionObserver(onVisible, { root: els.gridWrap, rootMargin: "300px 0px" });
        els.grid.textContent = "";
        var frag = document.createDocumentFragment();
        state.items.forEach(function (it, i) { frag.appendChild(it.isDir ? folderTile(it, i) : fileTile(it, i)); });
        els.grid.appendChild(frag);
        if (scrollTop) els.gridWrap.scrollTop = 0;
        els.empty.hidden = true;

        if (!state.items.length) {
            if (!cfg.libraries.length) {
                var b = h("button", { className: "btn btn-primary btn-sm", id: "emptyAdd" }, [icon("i-folder-plus"), "Adicionar pasta"]);
                b.style.marginTop = "12px";
                b.addEventListener("click", app.addLibrary);
                showEmpty("i-folder-plus", ["Adicione uma pasta do computador para criar sua biblioteca.", h("br"), b]);
            }
            else if (!state.view) showEmpty("i-library", ["Escolha uma pasta na barra lateral."]);
            else if (state.view.type === "favorites") showEmpty("i-star", ["Nenhum favorito ainda.", h("br"), "Passe o mouse num arquivo e clique na estrela."]);
            else if (searchText()) showEmpty("i-search", ["Nada encontrado para “" + searchText() + "” nesta pasta."]);
            else showEmpty("i-folder-open", ["Esta pasta está vazia" + (cfg.filter !== "all" ? " (com este filtro)" : "") + "."]);
        }
        refreshSelectionUi();
    }

    // parts: textos e elementos da mensagem
    function showEmpty(iconId, parts) {
        fill(els.empty, [icon(iconId), h("div", null, parts)]);
        els.empty.hidden = false;
    }

    function folderTile(it, i) {
        return h("div", { className: "tile folder", dataset: { i: i } }, [
            h("div", { className: "tile-thumb" }, [icon("i-folder", "ph")]),
            h("div", { className: "tile-foot" }, [icon("i-folder"), h("span", { className: "tile-name", title: it.name }, [it.name])])
        ]);
    }

    function fileTile(f, i) {
        var warn = f.kind !== "unknown" && !f.canPreview;
        var kindIcon = KIND_ICON[f.kind] || "i-file";
        var el = h("div", { className: "tile", dataset: { i: i }, draggable: true }, [
            h("div", { className: "tile-thumb kind-" + f.kind }, [
                icon(kindIcon, "ph kind-" + f.kind + "-ph"),
                h("span", { className: "tile-ext" + (f.kind === "unknown" ? " warn" : "") }, [f.ext]),
                h("span", { className: "tile-badge" })
            ]),
            h("div", { className: "tile-foot" }, [
                h("span", { className: "kind kind-" + f.kind, title: KIND_LABEL[f.kind] }, [icon(kindIcon)]),
                h("span", { className: "tile-name", title: f.name + (warn ? "\nSem pré-visualização para este formato" : "") }, [f.name]),
                h("button", { className: "tile-star" + (isFav(f.path) ? " on" : ""), title: "Favoritar" }, [icon("i-star")])
            ])
        ]);
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
        app.addFiles([it], cfg.dblClick !== "project");
    });

    els.grid.addEventListener("contextmenu", function (e) {
        var el = e.target.closest(".tile");
        if (!el) return;
        e.preventDefault();
        var i = +el.dataset.i;
        var it = state.items[i];
        if (it.isDir) { app.folderMenu(e.clientX, e.clientY, it.path, null); return; }
        if (!state.selected[it.path]) selectIndex(i, {});
        app.fileMenu(e.clientX, e.clientY, selectedFiles());
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
            if (e.key === "Escape") { app.closeAsk(null); els.settings.hidden = true; }
            return;
        }
        var typing = e.target && (e.target.tagName === "INPUT" && e.target.type === "text" || e.target.tagName === "TEXTAREA" || e.target.tagName === "SELECT");
        if (e.key === "Escape") {
            if (!els.menu.hidden) { app.hideMenu(); return; }
            if (typing && e.target === els.search) { els.search.value = ""; app.onSearch(); els.gridWrap.focus(); return; }
            clearSelection();
            return;
        }
        if (typing) {
            if (e.key === "ArrowDown" && e.target === els.search) { e.preventDefault(); els.gridWrap.focus(); moveFocus(0); }
            return;
        }
        if (e.key === " " || e.code === "Space") { e.preventDefault(); PL.toggle(); return; }
        if (e.key === "Enter") { e.preventDefault(); var s = selectedFiles(); if (s.length) app.addFiles(s, !e.shiftKey); return; }
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
        fill(dragGhost, [icon(KIND_ICON[f.kind] || "i-file"), h("span", null, [files.length > 1 ? files.length + " arquivos" : f.name])]);
        return dragGhost;
    }

    els.grid.addEventListener("dragstart", function (e) {
        var el = e.target.closest && e.target.closest(".tile");
        if (!el || el.classList.contains("folder")) { e.preventDefault(); return; }
        stopHover();
        app.hideMenu();
        var it = state.items[+el.dataset.i];
        var files = (state.selected[it.path] ? selectedFiles() : [it]).filter(app.allowedFile);
        if (!files.length) { e.preventDefault(); return; }
        var dt = e.dataTransfer;
        // "all": se o Premiere pedir mover/vincular e a origem só permitir copiar, o Windows recusa o drop.
        // (o navegador nunca apaga nem move o arquivo original ao arrastar para fora)
        dt.effectAllowed = "all";
        // Formato do CEP + lista de URLs + caminho em texto. Na 1.0 eram estes três e o vídeo entrava
        // sempre; mandar só o do CEP (1.1 a 1.2.1) fazia o vídeo falhar ou entrar só o áudio.
        // MOGRT vai como imagem provisória, trocada pelo MOGRT depois de soltar (1.3.4).
        var swaps = [];
        var paths = files.map(function (f) {
            var ph = f.kind === "mogrt" ? app.mogrtDragPath(f) : null;
            if (ph) swaps.push({ file: f, placeholder: ph });
            return ph || f.path;
        });
        paths.forEach(function (fp, n) { dt.setData("com.adobe.cep.dnd.file." + n, fp); });
        dt.setData("text/uri-list", paths.map(function (fp) { return L.toFileUrl(fp); }).join("\r\n"));
        dt.setData("text/plain", paths.join("\n"));
        try { dt.setDragImage(ghostFor(files), 14, 14); } catch (err) { /* usa a imagem padrão */ }
        app.preImport(files);   // vídeo de fora do projeto entrava só com o áudio (teste 2.8 da 1.3.0)
        state.dragging = { files: files, el: el, swaps: swaps };
        el.classList.add("dragging");
        setStatus("Solte na timeline ou no painel Project" + (files.length > 1 ? " (" + files.length + " arquivos)" : "") + ".", "", true);
    });

    els.grid.addEventListener("dragend", function (e) {
        var d = state.dragging;
        state.dragging = null;
        if (d && d.el) d.el.classList.remove("dragging");
        if (d) app.afterDrag(d.files, d.swaps);   // cópia duplicada de vídeo; troca da imagem provisória pelo MOGRT
        var outside = e.clientX <= 0 || e.clientY <= 0 || e.clientX >= window.innerWidth || e.clientY >= window.innerHeight;
        var effect = e.dataTransfer ? e.dataTransfer.dropEffect : "";
        // O dropEffect que volta de outro programa não é confiável (vinha "none" mesmo quando o Premiere
        // aceitava parte do arquivo), então ele só vai para o console, para depuração.
        HL.log("dragend", { dropEffect: effect, outside: outside, x: e.clientX, y: e.clientY });
        setStatus(defaultStatus());
        if (state.reloadAfterDrag) { state.reloadAfterDrag = false; loadItems(false); }
    });

    // arrastar de volta para dentro do próprio painel não faz nada
    // (e soltar dentro do painel nunca pode fazer o painel "abrir" o arquivo como página)
    document.addEventListener("dragover", function (e) { e.preventDefault(); e.dataTransfer.dropEffect = "none"; });
    document.addEventListener("drop", function (e) { e.preventDefault(); });

    // ---------- usado pelos outros arquivos ----------

    app.openView = openView;
    app.renderCrumbs = renderCrumbs;
    app.forgetWalk = forgetWalk;
    app.loadItems = loadItems;
    app.selectedFiles = selectedFiles;
    app.refreshSelectionUi = refreshSelectionUi;
})(window.HLApp);
