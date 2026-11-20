// client/js/host.js — Helmet Library
// Adicionar ao Premiere (timeline ou só no projeto) pela ponte (bridge.js → host/index.jsx).

(function (app) {
    "use strict";

    var HL = app.HL, BIN_NAME = app.BIN_NAME, L = app.L, inCEP = app.inCEP, cfg = app.cfg, els = app.els,
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

    // ---------- arrastar MOGRT com imagem provisória (1.3.4) ----------
    // O Premiere não aceita .mogrt arrastado de um painel (teste 2.11). O arrasto leva, no lugar do
    // MOGRT, uma imagem provisória com o nome dele (library.js); imagem entra arrastando sem problema.
    // Depois de soltar:
    //   1. o host acha cada imagem na sequência ativa, anota onde ela ficou e tira (timeline e projeto);
    //   2. coloca o MOGRT nesse lugar, um depois do outro se eram vários em fila.
    // Imagem que só aparece no projeto até a última conferência foi solta no painel Project: o MOGRT
    // não é importado (o Premiere não aceita MOGRT no Project e abre um aviso).
    // Arrasto cancelado: não há imagem em lugar nenhum e nada acontece.
    // Vídeo, áudio e imagem vão direto (vídeo do jeito do Animation Composer: ver grid.js).

    function dragPath(f) {
        if (!inCEP || f.kind !== "mogrt") return null;
        try { return L.dragPlaceholder(f.path); } catch (e) {
            HL.log("imagem provisória falhou", f.path, e);
            return null;   // arrasta o arquivo como antes
        }
    }

    var SWAP_CHECKS_MS = [700, 2000, 5000];

    function wait(ms) { return new Promise(function (r) { setTimeout(r, ms); }); }

    // Fase 1: tira as imagens provisórias, conferindo algumas vezes (o Premiere pode demorar a colocar).
    function takePlaceholders(swaps) {
        var n = 0;
        function round() {
            var last = n === SWAP_CHECKS_MS.length - 1;
            var todo = swaps.filter(function (s) { return !s.spot && !s.toProject && !s.error; });
            if (!todo.length) return Promise.resolve();
            return wait(SWAP_CHECKS_MS[n] - (n ? SWAP_CHECKS_MS[n - 1] : 0)).then(function () {
                return todo.reduce(function (chain, s) {
                    return chain.then(function () {
                        return HLBridge.call("hl_takePlaceholder", [s.placeholder, last]).then(function (r) {
                            if (r.found) s.spot = r;
                            else if (r.inProject) s.toProject = true;
                        }, function (err) { s.error = err.message; });
                    });
                }, Promise.resolve());
            }).then(function () {
                if (last) return;
                n++;
                return round();
            });
        }
        return round();
    }

    // Fase 2: coloca cada MOGRT no lugar da imagem dele. Imagens em fila na mesma trilha
    // (uma começando onde a outra acabava) viram MOGRTs em fila, cada um com a duração real.
    function placeItems(swaps) {
        var prev = null, results = [];
        return swaps.reduce(function (chain, s) {
            return chain.then(function () {
                if (s.error) { results.push({ error: s.file.name + ": " + s.error }); return; }
                if (s.toProject) { results.push({ warning: "“" + s.file.name + "”: MOGRT não entra no painel Project. Arraste para a timeline ou use Adicionar." }); return; }
                if (!s.spot) return;   // arrasto cancelado
                var start = s.spot.seconds, ticks = s.spot.ticks;
                if (prev && prev.spot.track === s.spot.track && Math.abs(s.spot.seconds - prev.spot.end) < 0.05 && prev.placedEnd > start) {
                    start = prev.placedEnd;
                    ticks = "";   // o host calcula pelos segundos
                }
                return HLBridge.call("hl_placeMogrt", [s.file.path, s.spot.track, start, ticks]).then(function (d) {
                    s.placedEnd = d.end;
                    prev = s;
                    results.push({ ok: "“" + d.name + "” na trilha " + d.track });
                }, function (err) {
                    prev = null;
                    results.push({ error: s.file.name + ": " + err.message });
                });
            });
        }, Promise.resolve()).then(function () { return results; });
    }

    function swapAfterDrop(swaps) {
        takePlaceholders(swaps).then(function () { return placeItems(swaps); }).then(function (results) {
            var errors = results.filter(function (r) { return r.error; }),
                warnings = results.filter(function (r) { return r.warning; }),
                oks = results.filter(function (r) { return r.ok; });
            if (errors.length) setStatus(errors.length === 1 ? errors[0].error : errors.length + " item(ns) falharam. " + errors[0].error, "error");
            else if (warnings.length) setStatus(warnings[0].warning, "warning");
            else if (oks.length === 1) setStatus(oks[0].ok + ".", "success");
            else if (oks.length) setStatus(oks.length + " arquivos adicionados.", "success");
        });
    }

    function afterDrag(swaps) {
        if (inCEP && swaps && swaps.length) swapAfterDrop(swaps);
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
    app.afterDrag = afterDrag;
    app.dragPath = dragPath;
})(window.HLApp);
