// host/index.jsx — Helmet Library
// Lado ExtendScript: importa arquivos da biblioteca no Project (numa bin "Helmet Library",
// opcionalmente espelhando as subpastas) e coloca o clipe na timeline, na posição da agulha,
// na primeira trilha livre. MOGRTs entram com sequence.importMGT().
//
// O painel só chama as funções públicas (hl_add, hl_dropDuplicate, hl_getHostVersion) pela ponte única
// (client/js/bridge.js), com cada argumento como literal JSON. Toda função pública passa
// por hl_run: try/catch único e resposta sempre em JSON { ok, data, error }.
// Este arquivo é salvo em UTF-8 COM BOM (senão o ExtendScript lê os acentos errado).

var HL_HOST_VERSION = "1.3.3";

// ---------- respostas ----------

function hl_esc(s) {
    var str = String(s);
    var out = "";
    for (var i = 0; i < str.length; i++) {
        var c = str.charAt(i);
        var code = str.charCodeAt(i);
        if (c === "\\") out += "\\\\";
        else if (c === '"') out += '\\"';
        else if (c === "\n") out += "\\n";
        else if (c === "\r") out += "\\r";
        else if (c === "\t") out += "\\t";
        else if (code < 32 || code === 0x2028 || code === 0x2029) out += "\\u" + ("0000" + code.toString(16)).slice(-4);
        else out += c;
    }
    return out;
}

// JSON.stringify simples (o ExtendScript do Premiere não tem JSON nativo).
function hl_json(v) {
    if (v === null || v === undefined) return "null";
    var t = typeof v;
    if (t === "string") return '"' + hl_esc(v) + '"';
    if (t === "number") return isFinite(v) ? String(v) : "null";
    if (t === "boolean") return v ? "true" : "false";
    var parts = [];
    if (Object.prototype.toString.call(v) === "[object Array]") {
        for (var i = 0; i < v.length; i++) parts.push(hl_json(v[i]));
        return "[" + parts.join(",") + "]";
    }
    for (var k in v) {
        if (v.hasOwnProperty(k)) parts.push('"' + hl_esc(k) + '":' + hl_json(v[k]));
    }
    return "{" + parts.join(",") + "}";
}

// Erro com mensagem para o usuário: throw hl_userError("…")
function hl_userError(msg) { return { hlMessage: msg }; }

// Roda fn com um try/catch único. prefix: começo da mensagem de erros inesperados.
function hl_run(fn, prefix) {
    try {
        return hl_json({ ok: true, data: fn() });
    } catch (e) {
        var msg = (e && e.hlMessage) ? e.hlMessage : (prefix || "Erro no Premiere: ") + e;
        return hl_json({ ok: false, error: msg });
    }
}

// ---------- funções públicas ----------

function hl_getHostVersion() {
    return hl_run(function () { return { version: HL_HOST_VERSION }; });
}

var HL_KINDS = { video: 1, audio: 1, image: 1, mogrt: 1, other: 1 };

// path: caminho do arquivo | kind: video | audio | image | mogrt | other
// toTimeline: true coloca na timeline; false só importa no Project
// binName: nome da bin ("" = raiz) | subPath: subpastas "A/B" ("" = nenhuma)
function hl_add(path, kind, toTimeline, binName, subPath) {
    return hl_run(function () {
        if (!app.project) throw hl_userError("Nenhum projeto aberto.");
        if (!HL_KINDS[kind]) kind = "other";
        var f = new File(String(path));
        if (!f.exists) throw hl_userError("Arquivo não encontrado (foi movido, apagado ou está num HD/pasta de rede desconectado).");
        var fsPath = f.fsName;
        var wantTimeline = toTimeline === true;
        var seq = app.project.activeSequence;
        binName = String(binName || "");
        subPath = String(subPath || "");

        if (kind === "mogrt") return hl_addMogrt(fsPath, seq, wantTimeline, binName, subPath);

        var imp = hl_importToBin(fsPath, hl_targetBin(binName, subPath));
        if (!imp.item) throw hl_userError("O Premiere não conseguiu importar este arquivo.");

        if (!wantTimeline) return { where: "project", name: imp.item.name, reused: imp.reused, nodeId: hl_nodeId(imp.item) };
        if (!seq) return { where: "project", noSequence: true, name: imp.item.name };

        var pos = seq.getPlayerPosition();
        var start = pos.seconds;
        var end = start + hl_itemDuration(imp.item, kind);
        var needV = kind !== "audio";
        var needA = kind === "audio" || kind === "video";

        var free = hl_freeIndexOrNewTrack(seq, start, end, needV, needA);
        seq = free.seq;
        if (free.index < 0) throw hl_userError("Não há trilha livre na posição da agulha. Abra espaço ou crie uma trilha.");

        var track = needV ? seq.videoTracks[free.index] : seq.audioTracks[free.index];
        if (!hl_overwrite(track, imp.item, pos)) throw hl_userError("O Premiere recusou colocar o clipe na timeline.");

        return { where: "timeline", name: imp.item.name, track: (needV ? "V" : "A") + (free.index + 1) };
    }, "Erro ao adicionar: ");
}

// Depois de arrastar um vídeo que o painel pré-importou (nodeId): se ele foi solto no painel
// Project, o Premiere importa uma cópia própria e a pré-importada fica sobrando. Remove a
// pré-importada só quando existe outra cópia do mesmo arquivo E ela não está em nenhuma
// sequência. Na dúvida (não deu para conferir), não remove nada.
function hl_dropDuplicate(path, nodeId) {
    return hl_run(function () {
        if (!app.project) return { removed: false };
        var copies = [];
        hl_collectMedia(app.project.rootItem, hl_normPath(String(path)), [], copies);
        var ours = null;
        for (var i = 0; i < copies.length; i++) {
            if (hl_nodeId(copies[i].item) === String(nodeId)) ours = copies[i];
        }
        if (!ours || copies.length < 2) return { removed: false };
        if (hl_inSomeSequence(ours.item) !== false) return { removed: false };
        if (!hl_removeItem(ours.item, ours.chain[ours.chain.length - 1])) return { removed: false };
        hl_removeEmptyBins(ours.chain);
        return { removed: true };
    }, "Erro ao conferir cópia: ");
}

// ---------- bins ----------

function hl_binType() {
    try { if (typeof ProjectItemType !== "undefined" && ProjectItemType.BIN !== undefined) return ProjectItemType.BIN; } catch (e) { /* ignora */ }
    return 2;
}

function hl_findBin(parent, name) {
    var binType = hl_binType();
    try {
        for (var i = 0; i < parent.children.numItems; i++) {
            var c = parent.children[i];
            if (c && c.type === binType && c.name === name) return c;
        }
    } catch (e) { /* ignora */ }
    return null;
}

function hl_getOrCreateBin(parent, name) {
    var b = hl_findBin(parent, name);
    if (b) return b;
    var created = null;
    try { created = parent.createBin(name); } catch (e) { created = null; }
    if (created && created.children) return created;
    b = hl_findBin(parent, name);
    return b || parent;
}

// binName = "" → raiz do Project. subPath = "SFX/Whooshes" → bins aninhadas dentro dela.
function hl_targetBin(binName, subPath) {
    var target = app.project.rootItem;
    if (binName) target = hl_getOrCreateBin(target, binName);
    if (subPath) {
        var parts = String(subPath).split("/");
        for (var i = 0; i < parts.length; i++) {
            if (parts[i]) target = hl_getOrCreateBin(target, parts[i]);
        }
    }
    return target;
}

function hl_normPath(p) {
    var s = String(p || "");
    try { s = new File(s).fsName; } catch (e) { /* mantém */ }
    s = s.replace(/\//g, "\\");
    if ($.os.indexOf("Windows") >= 0) s = s.toLowerCase();
    return s;
}

// Procura (recursivamente) um item de mídia cujo arquivo seja wanted.
function hl_findMedia(item, wanted, depth) {
    if (depth > 8) return null;
    var binType = hl_binType();
    try {
        for (var i = 0; i < item.children.numItems; i++) {
            var c = item.children[i];
            if (!c) continue;
            if (c.type === binType) {
                var r = hl_findMedia(c, wanted, depth + 1);
                if (r) return r;
            } else {
                var mp = "";
                try { mp = c.getMediaPath(); } catch (e) { mp = ""; }
                if (mp && hl_normPath(mp) === wanted) return c;
            }
        }
    } catch (e2) { /* ignora */ }
    return null;
}

// Importa (se ainda não estiver na bin) e devolve o ProjectItem.
function hl_importToBin(path, target) {
    var wanted = hl_normPath(path);
    var found = hl_findMedia(target, wanted, 0);
    if (found) return { item: found, reused: true };
    app.project.importFiles([path], true, target, false);
    found = hl_findMedia(target, wanted, 0);
    if (!found) found = hl_findMedia(app.project.rootItem, wanted, 0);
    return { item: found, reused: false };
}

function hl_nodeId(item) {
    try { return item && item.nodeId !== undefined ? String(item.nodeId) : ""; } catch (e) { return ""; }
}

// Junta TODAS as cópias de mídia do arquivo wanted. chain: bins do caminho até o item (raiz primeiro).
function hl_collectMedia(bin, wanted, chain, out) {
    if (chain.length > 8) return;
    var here = chain.concat([bin]);
    var binType = hl_binType();
    try {
        for (var i = 0; i < bin.children.numItems; i++) {
            var c = bin.children[i];
            if (!c) continue;
            if (c.type === binType) {
                hl_collectMedia(c, wanted, here, out);
            } else {
                var mp = "";
                try { mp = c.getMediaPath(); } catch (e) { mp = ""; }
                if (mp && hl_normPath(mp) === wanted) out.push({ item: c, chain: here });
            }
        }
    } catch (e2) { /* ignora */ }
}

// true/false se o item está (ou não) em alguma sequência; null se não deu para conferir.
function hl_inSomeSequence(item) {
    try {
        var id = hl_nodeId(item);
        if (!id) return null;
        var seqs = app.project.sequences;
        for (var s = 0; s < seqs.numSequences; s++) {
            var groups = [seqs[s].videoTracks, seqs[s].audioTracks];
            for (var g = 0; g < groups.length; g++) {
                for (var t = 0; t < groups[g].numTracks; t++) {
                    var clips = groups[g][t].clips;
                    for (var c = 0; c < clips.numItems; c++) {
                        var pi = clips[c].projectItem;
                        if (pi && hl_nodeId(pi) === id) return true;
                    }
                }
            }
        }
        return false;
    } catch (e) {
        return null;
    }
}

function hl_deleteIfEmpty(bin) {
    try { if (bin.children.numItems === 0) { bin.deleteBin(); return true; } } catch (e) { /* ignora */ }
    return false;
}

// O script do Premiere não tem "apagar item": move o item para uma bin temporária só dele e
// apaga a bin. Se a bin temporária tiver qualquer outra coisa, desfaz e não apaga nada.
function hl_removeItem(item, parent) {
    var root = app.project.rootItem;
    var tmp = hl_getOrCreateBin(root, "Helmet Library - removendo " + new Date().getTime());
    if (!tmp || tmp === root) return false;
    function undo() {
        try { item.moveBin(parent); } catch (e) { /* ignora */ }
        hl_deleteIfEmpty(tmp);
        return false;
    }
    try { item.moveBin(tmp); } catch (e1) { return undo(); }
    var onlyOurs = false;
    try { onlyOurs = tmp.children.numItems === 1 && hl_nodeId(tmp.children[0]) === hl_nodeId(item); } catch (e2) { onlyOurs = false; }
    if (!onlyOurs) return undo();
    try { tmp.deleteBin(); } catch (e3) { return undo(); }
    return true;
}

// Apaga as bins que ficaram vazias no caminho do item removido (nunca a raiz).
function hl_removeEmptyBins(chain) {
    for (var i = chain.length - 1; i >= 1; i--) {
        if (!hl_deleteIfEmpty(chain[i])) return;
    }
}

// ---------- trilhas ----------

function hl_trackFree(track, start, end) {
    try {
        var clips = track.clips;
        for (var i = 0; i < clips.numItems; i++) {
            var c = clips[i];
            var cs = c.start.seconds, ce = c.end.seconds;
            if (cs < end - 0.0005 && ce > start + 0.0005) return false;
        }
    } catch (e) { return false; }
    return true;
}

// needV / needA: quais tipos de trilha precisam estar livres no mesmo índice.
function hl_findFreeIndex(seq, start, end, needV, needA) {
    var nv = seq.videoTracks.numTracks, na = seq.audioTracks.numTracks;
    var n = needV ? nv : na;
    for (var i = 0; i < n; i++) {
        if (needV && !hl_trackFree(seq.videoTracks[i], start, end)) continue;
        // trilha de áudio inexistente nesse índice não bloqueia um vídeo (ele só perde o áudio vinculado)
        if (needA && i < na && !hl_trackFree(seq.audioTracks[i], start, end)) continue;
        return i;
    }
    return -1;
}

// Primeira trilha livre; se não houver, cria uma no fim e procura de novo.
// Devolve { index (-1 = nenhuma), seq (a sequência atualizada) }.
function hl_freeIndexOrNewTrack(seq, start, end, needV, needA) {
    var idx = hl_findFreeIndex(seq, start, end, needV, needA);
    if (idx < 0) {
        hl_addTracks(needV, needA);
        seq = app.project.activeSequence;
        idx = hl_findFreeIndex(seq, start, end, needV, needA);
    }
    return { index: idx, seq: seq };
}

// Cria uma trilha de vídeo e/ou áudio no fim da sequência (API QE, não documentada).
function hl_addTracks(addV, addA) {
    try {
        app.enableQE();
        var qs = qe.project.getActiveSequence();
        var seq = app.project.activeSequence;
        // addTracks(nVideo, depoisDoVideo, nAudio, tipoAudio(1 = estéreo), depoisDoAudio, nSubmix, tipoSubmix, depoisDoSubmix)
        qs.addTracks(addV ? 1 : 0, seq.videoTracks.numTracks, addA ? 1 : 0, 1, seq.audioTracks.numTracks, 0, 1, 0);
        return true;
    } catch (e) {
        return false;
    }
}

function hl_overwrite(track, item, pos) {
    try { track.overwriteClip(item, pos); return true; } catch (e1) { /* tenta segundos */ }
    try { track.overwriteClip(item, pos.seconds); return true; } catch (e2) { /* tenta ticks */ }
    try { track.overwriteClip(item, pos.ticks); return true; } catch (e3) { return false; }
}

function hl_itemDuration(item, kind) {
    var d = 0;
    try { d = item.getOutPoint().seconds - item.getInPoint().seconds; } catch (e) { d = 0; }
    if (!(d > 0) || d > 86400) d = kind === "image" ? 5 : 1;
    return d;
}

// ---------- MOGRT ----------

function hl_addMogrt(path, seq, wantTimeline, binName, subPath) {
    if (!wantTimeline) {
        // Nem toda versão importa .mogrt direto no Project; tentamos e avisamos se não der.
        var ok;
        try {
            ok = app.project.importFiles([path], true, hl_targetBin(binName, subPath), false);
        } catch (e0) {
            ok = false;
        }
        if (ok === false) throw hl_userError("Esta versão do Premiere só aceita MOGRT direto na timeline.");
        return { where: "project", name: new File(path).displayName };
    }
    if (!seq) throw hl_userError("Abra uma sequência para adicionar o MOGRT.");
    var pos = seq.getPlayerPosition();
    var start = pos.seconds;
    // a duração do MOGRT só é conhecida depois de inserir; checamos 1 s a partir da agulha
    var free = hl_freeIndexOrNewTrack(seq, start, start + 1, true, false);
    seq = free.seq;
    var vIdx = free.index < 0 ? seq.videoTracks.numTracks - 1 : free.index;
    var aIdx = hl_findFreeIndex(seq, start, start + 1, false, true);
    if (aIdx < 0) aIdx = 0;

    var ti = null;
    try { ti = seq.importMGT(path, pos.ticks, vIdx, aIdx); } catch (e1) { ti = null; }
    if (!ti) {
        try { ti = seq.importMGT(path, String(pos.ticks), vIdx, aIdx); } catch (e2) { ti = null; }
    }
    if (!ti) throw hl_userError("O Premiere não conseguiu inserir o MOGRT (versão ou template incompatível?).");
    var nm = "";
    try { nm = ti.name; } catch (e3) { nm = new File(path).displayName; }
    return { where: "timeline", name: nm, track: "V" + (vIdx + 1) };
}
