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
        if (!inCEP) {
            setStatus(toTimeline ? tr("Modo de demonstração: no Premiere, {0} arquivo(s) iriam para a timeline.", files.length)
                : tr("Modo de demonstração: no Premiere, {0} arquivo(s) iriam para o projeto.", files.length), "warning");
            return;
        }
        adding = true;
        els.btnAdd.disabled = els.btnImport.disabled = true;
        var okCount = 0, lastMsg = "", errors = [], noSeq = false;
        var i = 0;
        setStatus(toTimeline ? tr("Adicionando na timeline…") : tr("Importando…"), "", true);
        function next() {
            if (i >= files.length) return Promise.resolve();
            var f = files[i++];
            var b = binFor(f);
            var kind = f.kind === "unknown" ? "other" : f.kind;
            return HLBridge.call("hl_add", [f.path, kind, !!toTimeline, b.bin, b.sub]).then(function (data) {
                okCount++;
                if (data.noSequence) noSeq = true;
                lastMsg = data.where === "timeline" ? tr("“{0}” na trilha {1}", data.name, data.track) : tr("“{0}” importado no projeto", data.name);
                flashTile(f);
            }, function (err) {
                errors.push(f.name + ": " + err.message);
            }).then(next);
        }
        next().then(function () {
            adding = false;
            app.refreshSelectionUi();
            if (errors.length) setStatus(errors.length === 1 && files.length === 1 ? errors[0] : tr("{0} de {1} falharam. {2}", errors.length, files.length, errors[0]), "error");
            else if (noSeq) setStatus(tr("Nenhuma sequência aberta: importado só no projeto."), "warning");
            else if (okCount === 1) setStatus(lastMsg + ".", "success");
            else setStatus(tr("{0} arquivos adicionados.", okCount), "success");
        });
    }

    // ---------- arrastar MOGRT com imagem provisória ----------
    // O Premiere não aceita .mogrt arrastado de um painel. O arrasto leva, no lugar do MOGRT, uma
    // imagem provisória com o nome dele (library.js); imagem entra arrastando sem problema. São os
    // passos do Animation Composer (detalhes em AUDITORIA.md). Logo ao soltar e de novo depois, se
    // ainda não achou:
    //   1. o host acha as imagens na sequência ativa, anota onde ficaram e desfaz a soltura
    //      (hl_takeDrop; detalhes em host/index.jsx);
    //   2. coloca cada MOGRT nesse lugar, um depois do outro se eram vários em fila, e seleciona.
    // Imagem que só aparece no projeto até a última conferência foi solta no painel Project: o MOGRT
    // não é importado (o Premiere não aceita MOGRT no Project e abre um aviso).
    // Solta no Source Monitor ou na timeline sem sequência: sai e a barra de baixo explica.
    // Arrasto cancelado: não há imagem em lugar nenhum e nada acontece.
    // O arrasto com MOGRT leva só MOGRTs (grid.js). Vídeo, áudio e imagem vão direto.

    function dragPath(f) {
        if (!inCEP || f.kind !== "mogrt") return null;
        try { return L.dragPlaceholder(f.path); } catch (e) {
            HL.log("imagem provisória falhou", f.path, e);
            return null;   // sem imagem provisória: ver grid.js
        }
    }

    var SWAP_CHECKS_MS = [0, 700, 2000, 5000];

    var WRONG_DROP = {
        sourceMonitor: N("Arrastar para o Source Monitor não funciona. Arraste para a timeline ou use Adicionar."),
        newSequence: N("Arraste para uma sequência já aberta na timeline.")
    };

    function wait(ms) { return new Promise(function (r) { setTimeout(r, ms); }); }

    // Fase 1: tira as imagens provisórias, conferindo algumas vezes (o Premiere pode demorar a colocar).
    // A soltura é desfeita no máximo uma vez por arrasto; depois disso o host tira clipe por clipe.
    function takePlaceholders(swaps) {
        var n = 0, undone = false;
        function round() {
            var last = n === SWAP_CHECKS_MS.length - 1;
            var todo = swaps.filter(function (s) { return !s.spot && !s.toProject && !s.error && !s.wrongDrop; });
            if (!todo.length) return Promise.resolve();
            return wait(SWAP_CHECKS_MS[n] - (n ? SWAP_CHECKS_MS[n - 1] : 0)).then(function () {
                var list = todo.map(function (s) { return s.placeholder; }).join("\n");
                return HLBridge.call("hl_takeDrop", [list, last, !undone]).then(function (r) {
                    if (r.undone) undone = true;
                    todo.forEach(function (s, i) {
                        var sp = r.spots[i] || {};
                        if (r.sourceMonitor) s.wrongDrop = "sourceMonitor";
                        else if (r.newSequence) s.wrongDrop = "newSequence";
                        else if (sp.found) s.spot = sp;
                        else if (sp.inProject) s.toProject = true;
                    });
                }, function (err) { todo.forEach(function (s) { s.error = err.message; }); });
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
    // Os MOGRTs colocados ficam selecionados, como no Composer.
    function placeItems(swaps) {
        var prev = null, placed = 0, results = [];
        return swaps.reduce(function (chain, s) {
            return chain.then(function () {
                if (s.error) { results.push({ error: s.file.name + ": " + s.error }); return; }
                if (s.wrongDrop) { results.push({ warning: tr(WRONG_DROP[s.wrongDrop]) }); return; }
                if (s.toProject) { results.push({ warning: tr("“{0}”: MOGRT não entra no painel Project. Arraste para a timeline ou use Adicionar.", s.file.name) }); return; }
                if (!s.spot) return;   // arrasto cancelado
                var start = s.spot.seconds, ticks = s.spot.ticks;
                if (prev && prev.spot.track === s.spot.track && Math.abs(s.spot.seconds - prev.spot.end) < 0.05 && prev.placedEnd > start) {
                    start = prev.placedEnd;
                    ticks = "";   // o host calcula pelos segundos
                }
                return HLBridge.call("hl_placeMogrt", [s.file.path, s.spot.track, start, ticks, placed > 0]).then(function (d) {
                    s.placedEnd = d.end;
                    prev = s;
                    placed++;
                    results.push({ ok: tr("“{0}” na trilha {1}", d.name, d.track) });
                }, function (err) {
                    prev = null;
                    results.push({ error: s.file.name + ": " + err.message });
                });
            });
        }, Promise.resolve()).then(function () { return results; });
    }

    // leftOut: quantos arquivos da seleção ficaram fora do arrasto (MOGRT não vai junto com outros).
    function afterDrag(swaps, leftOut) {
        if (!inCEP || !swaps || !swaps.length) return;
        takePlaceholders(swaps).then(function () { return placeItems(swaps); }).then(function (results) {
            var errors = results.filter(function (r) { return r.error; }),
                warnings = results.filter(function (r) { return r.warning; }),
                oks = results.filter(function (r) { return r.ok; });
            var left = !leftOut ? "" : " " + (leftOut === 1 ? tr("O outro arquivo não foi junto: MOGRT vai num arrasto só dele.")
                : tr("Os outros {0} arquivos não foram junto: MOGRT vai num arrasto só dele.", leftOut));
            if (errors.length) setStatus(errors.length === 1 ? errors[0].error : tr("{0} item(ns) falharam. {1}", errors.length, errors[0].error), "error");
            else if (warnings.length) setStatus(warnings[0].warning, "warning");
            else if (oks.length === 1) setStatus(oks[0].ok + "." + left, left ? "warning" : "success");
            else if (oks.length) setStatus(tr("{0} arquivos adicionados.", oks.length) + left, left ? "warning" : "success");
            else if (left) setStatus(left.slice(1), "warning");
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
    app.afterDrag = afterDrag;
    app.dragPath = dragPath;
})(window.HLApp);
