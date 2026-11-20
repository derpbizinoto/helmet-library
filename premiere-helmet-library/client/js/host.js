// client/js/host.js — Helmet Library
// Adicionar ao Premiere (timeline ou só no projeto) pela ponte (bridge.js → host/index.jsx).

(function (app) {
    "use strict";

    var BIN_NAME = app.BIN_NAME, L = app.L, inCEP = app.inCEP, cfg = app.cfg, els = app.els,
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
})(window.HLApp);
