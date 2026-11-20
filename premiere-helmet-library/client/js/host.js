// client/js/host.js — Helmet Library
// Adicionar ao Premiere (timeline ou só no projeto) pela ponte (bridge.js → host/index.jsx).

(function (app) {
    "use strict";

    var HL = app.HL, BIN_NAME = app.BIN_NAME, L = app.L, inCEP = app.inCEP, cs = app.cs, cfg = app.cfg, els = app.els,
        state = app.state, setStatus = app.setStatus, isFav = app.isFav;

    // ======================================================================
    // adicionar ao Premiere
    // ======================================================================

    function binFor(f) {
        if (!cfg.useBin) return { bin: "", sub: "" };
        if (!cfg.mirrorFolders) return { bin: BIN_NAME, sub: "" };
        var lib = L.libraryOf(cfg, f.path);
        if (!lib) return { bin: BIN_NAME, sub: "" };
        var rel = L.path.relative(lib.path, L.path.dirname(f.path)).replace(/\\/g, "/");
        return { bin: BIN_NAME, sub: lib.name + (rel ? "/" + rel : "") };
    }

    // Segunda trava: só vai para o Premiere arquivo que está numa biblioteca ou nos favoritos.
    function allowedFile(f) {
        return !!(f && !f.isDir && (L.libraryOf(cfg, f.path) || isFav(f.path)));
    }

    var adding = false;
    function addFiles(files, toTimeline) {
        files = files.filter(allowedFile);
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
            return HLBridge.call("hl_add", [f.path, kind, !!toTimeline, b.bin, b.sub]).then(function (data) {
                okCount++;
                if (data.noSequence) noSeq = true;
                lastMsg = data.where === "timeline" ? "“" + data.name + "” na trilha " + data.track : "“" + data.name + "” importado no projeto";
                flashTile(f);
            }, function (err) {
                errors.push(f.name + ": " + err.message);
            }).then(next);
        }
        next().then(function () {
            adding = false;
            app.refreshSelectionUi();
            if (errors.length) setStatus(errors.length === 1 && files.length === 1 ? errors[0] : errors.length + " de " + files.length + " falharam. " + errors[0], "error");
            else if (noSeq) setStatus("Nenhuma sequência aberta: importado só no projeto.", "warning");
            else if (okCount === 1) setStatus(lastMsg + ".", "success");
            else setStatus(okCount + " arquivos adicionados.", "success");
        });
    }

    // ---------- pré-importação ao arrastar ----------
    // Vídeo arrastado de fora do projeto entrava só com o áudio (teste 2.8 da 1.3.0); já importado,
    // entrava certo. Por isso, ao começar a arrastar um VÍDEO, ele é importado na bin em segundo
    // plano (arquivo já importado é reaproveitado pelo host). Áudio e imagem já entravam certo
    // arrastando e ficam de fora (1.3.2): assim o Premiere não abre o painel Project à toa.
    // MOGRT também fica de fora: o Premiere duplicaria a cada arrasto.

    var preImports = {};   // caminho -> Promise(resposta do hl_add, ou null se falhou)

    function preImport(files) {
        if (!inCEP) return;
        var chain = Promise.resolve(), fresh = false;
        files.filter(function (f) { return allowedFile(f) && f.kind === "video" && !preImports[f.path]; }).forEach(function (f) {
            var b = binFor(f);
            chain = preImports[f.path] = chain.then(function () {
                return HLBridge.call("hl_add", [f.path, "video", false, b.bin, b.sub]);
            }).then(function (data) {
                if (!data.reused) fresh = true;
                return data;
            }, function (err) {
                HL.log("pré-importação falhou", f.path, err && err.message);
                return null;
            });
        });
        chain.then(function () { if (fresh) bringPanelBack(); });
    }

    // Importar faz o Premiere trazer o painel Project para a frente; pede o Helmet Library de volta.
    // No teste da 1.3.2, pedir só durante o arrasto não adiantou (o Premiere parece ignorar
    // enquanto o arrasto não termina); por isso a 1.3.3 pede de novo depois de soltar.
    function bringPanelBack() {
        try { cs.requestOpenExtension(cs.getExtensionID(), ""); } catch (e) { HL.log("requestOpenExtension falhou", e); }
        try { window.focus(); } catch (e2) { /* ignora */ }
    }
    var PANEL_BACK_AFTER_DROP_MS = [300, 1200];

    // Depois de soltar: se o vídeo foi solto no painel Project, o Premiere importa uma cópia própria
    // e a pré-importada fica sobrando. O host remove a pré-importada só se ela foi criada por este
    // arrasto, se existe outra cópia do mesmo arquivo e se ela não está em nenhuma sequência.
    // Confere duas vezes porque o Premiere pode demorar a terminar a importação dele.
    var DUPLICATE_CHECKS_MS = [1500, 5000];
    function afterDrag(files) {
        if (!inCEP) return;
        var pendings = [];
        files.forEach(function (f) {
            var pending = preImports[f.path];
            if (!pending) return;
            pendings.push(pending);
            pending.then(function (data) {
                if (!data || data.reused || !data.nodeId) { delete preImports[f.path]; return; }
                var n = 0;
                function check() {
                    setTimeout(function () {
                        HLBridge.call("hl_dropDuplicate", [f.path, data.nodeId]).then(function (r) {
                            return r.removed;
                        }, function (err) {
                            HL.log("conferência de cópia falhou", f.path, err && err.message);
                            return true;
                        }).then(function (stop) {
                            n++;
                            if (stop || n >= DUPLICATE_CHECKS_MS.length) delete preImports[f.path];
                            else check();
                        });
                    }, DUPLICATE_CHECKS_MS[n] - (n ? DUPLICATE_CHECKS_MS[n - 1] : 0));
                }
                check();
            });
        });
        // algum vídeo foi importado agora por este arrasto: pede o painel de volta depois de soltar
        Promise.all(pendings).then(function (all) {
            if (!all.some(function (d) { return d && d.reused === false; })) return;
            PANEL_BACK_AFTER_DROP_MS.forEach(function (ms) { setTimeout(bringPanelBack, ms); });
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

    els.btnAdd.addEventListener("click", function () { addFiles(app.selectedFiles(), true); });
    els.btnImport.addEventListener("click", function () { addFiles(app.selectedFiles(), false); });

    // ---------- usado pelos outros arquivos ----------

    app.allowedFile = allowedFile;
    app.addFiles = addFiles;
    app.preImport = preImport;
    app.afterDrag = afterDrag;
})(window.HLApp);
