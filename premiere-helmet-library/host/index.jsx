// host/index.jsx — Helmet Library
// Lado ExtendScript: importa arquivos da biblioteca no Project (numa bin "Helmet Library",
// opcionalmente espelhando as subpastas) e coloca o clipe na timeline, na posição da agulha,
// na primeira trilha livre. MOGRTs entram com sequence.importMGT().
//
// O painel só chama as funções públicas (hl_add, hl_takeDrop, hl_placeMogrt, hl_getHostVersion) pela ponte única
// (client/js/bridge.js), com cada argumento como literal JSON. Toda função pública passa
// por hl_run: try/catch único e resposta sempre em JSON { ok, data, error }.
// Este arquivo é salvo em UTF-8 COM BOM (senão o ExtendScript lê os acentos errado).

var HL_HOST_VERSION = "1.2.0";

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

        if (!wantTimeline) return { where: "project", name: imp.item.name, reused: imp.reused };
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

// ---------- arrastar MOGRT com imagem provisória ----------
// O painel arrasta uma imagem provisória (placeholder) no lugar do MOGRT: o Premiere não aceita
// .mogrt arrastado de um painel. Depois de soltar, o painel chama hl_takeDrop com as imagens do
// arrasto e, em seguida, hl_placeMogrt para colocar cada MOGRT no lugar da imagem dele.
// Mesma sequência de passos do Animation Composer (jsx/mh-browser-ppro.jsx, dropMogrt):
//   1. imagem aberta no Source Monitor → fecha e avisa;
//   2. timeline sem sequência (o Premiere criou uma sequência nova com a imagem) → desfaz e avisa;
//   3. imagem na timeline → anota onde ela ficou e DESFAZ a soltura (Ctrl+Z do próprio Premiere),
//      o que também traz de volta o que a imagem cobriu e tira a imagem do projeto; as trilhas que
//      a soltura criou são criadas de novo;
//   4. imagem só no projeto → solta no painel Project: tira do projeto e avisa.
// (Vídeo arrastado vai direto, sem nada disso: ver client/js/grid.js.)

// placeholders: caminhos das imagens provisórias, um por linha.
// lastTry: última conferência — só nela a imagem que está só no projeto conta como solta no Project
//   (antes disso pode ser o Premiere ainda colocando na timeline).
// useUndo: true = pode desfazer a soltura (ainda não desfeita neste arrasto); false = tira clipe
//   por clipe.
// Devolve { spots: [ { found, track, ticks, seconds, end } | { found: 0, inProject } ] (na ordem
// das imagens), undone, sourceMonitor, newSequence }.
function hl_takeDrop(placeholders, lastTry, useUndo) {
    return hl_run(function () {
        var list = String(placeholders || "").split("\n"), wanted = [], i;
        for (i = 0; i < list.length; i++) if (list[i]) wanted.push(hl_normPath(list[i]));
        var out = { spots: [], undone: false };
        for (i = 0; i < wanted.length; i++) out.spots.push({ found: 0 });
        if (!app.project || !wanted.length) return out;

        // 1. Source Monitor
        if (hl_closeInSourceMonitor(wanted)) {
            hl_removePlaceholderItems(hl_placeholderItems(wanted));
            out.sourceMonitor = true;
            return out;
        }

        // 2. timeline vazia: o Premiere criou uma sequência só com a imagem e com o nome dela
        var seq = app.project.activeSequence;
        if (seq && hl_isPlaceholderSequence(seq, wanted)) {
            for (i = 0; i < 3 && hl_placeholderItems(wanted).length; i++) hl_qeUndo();
            hl_preventRedo();
            hl_removePlaceholderItems(hl_placeholderItems(wanted));
            out.newSequence = true;
            return out;
        }

        // 3. timeline
        var spots = [], any = false;
        for (i = 0; i < wanted.length; i++) {
            spots.push(seq ? hl_placeholderClips(seq, wanted[i]) : []);
            if (spots[i].length) any = true;
        }
        if (!any) {
            // 4. painel Project (só na última conferência) ou arrasto cancelado
            if (lastTry !== true) return out;
            for (i = 0; i < wanted.length; i++) {
                var copies = hl_placeholderItems([wanted[i]]);
                if (!copies.length) continue;                   // arrasto cancelado
                hl_removePlaceholderItems(copies);
                out.spots[i] = { found: 0, inProject: true };
            }
            return out;
        }

        if (useUndo === true) {
            var nv = seq.videoTracks.numTracks, na = seq.audioTracks.numTracks;
            hl_qeUndo();
            seq = app.project.activeSequence;
            if (seq) {
                var addV = Math.max(0, nv - seq.videoTracks.numTracks), addA = Math.max(0, na - seq.audioTracks.numTracks);
                if (addV || addA) hl_addTracks(addV, addA);
                seq = app.project.activeSequence;
            }
            out.undone = true;
            if (!seq) throw hl_userError("O Premiere não deixou trocar a imagem provisória. Use o botão Adicionar.");
        }

        // Sem desfazer (ou se o desfazer não tirou tudo): tira clipe por clipe.
        for (i = 0; i < wanted.length; i++) {
            var left = hl_placeholderClips(seq, wanted[i]);
            for (var k = 0; k < left.length; k++) {
                try { left[k].clip.remove(false, false); } catch (e) { /* conferido abaixo */ }
                if (hl_spotStillThere(seq, wanted[i], left[k])) throw hl_userError("O Premiere não deixou trocar a imagem provisória. Use o botão Adicionar.");
            }
        }
        hl_removePlaceholderItems(hl_placeholderItems(wanted));

        for (i = 0; i < wanted.length; i++) {
            if (!spots[i].length) continue;
            var s = spots[i][0];
            out.spots[i] = { found: spots[i].length, track: s.track, ticks: String(s.ticks), seconds: s.seconds, end: s.end };
        }
        return out;
    }, "Erro ao trocar a imagem provisória: ");
}

// Todas as cópias das imagens no projeto: [{ item, chain }].
function hl_placeholderItems(wanted) {
    var out = [];
    for (var i = 0; i < wanted.length; i++) hl_collectMedia(app.project.rootItem, wanted[i], [], out);
    return out;
}

// Fecha a imagem se ela foi solta no Source Monitor (o Composer faz igual). true = estava lá.
function hl_closeInSourceMonitor(wanted) {
    var closed = false;
    try {
        for (var n = 0; n < 10; n++) {
            var pi = app.sourceMonitor.getProjectItem();
            if (!pi) break;
            var mp = hl_normPath(pi.getMediaPath());
            var ours = false;
            for (var i = 0; i < wanted.length; i++) if (mp === wanted[i]) ours = true;
            if (!ours) break;
            app.sourceMonitor.closeClip();
            closed = true;
        }
    } catch (e) { /* sem Source Monitor nesta versão */ }
    return closed;
}

// Tamanho da imagem provisória (PLACEHOLDER_PNG em client/js/library.js).
var HL_PLACEHOLDER_W = 192, HL_PLACEHOLDER_H = 108;

// Nome sem extensão e em minúsculas, para comparar "Card.png" com "Card".
function hl_baseName(n) {
    return String(n || "").replace(/^.*[\\\/]/, "").replace(/\.[^.]*$/, "").toLowerCase();
}

// Sequência criada pelo Premiere ao soltar na timeline vazia: só tem as imagens e tem o nome de
// uma delas ou o tamanho da imagem provisória. O Composer compara o nome exato, mas no Premiere 26
// o nome não bateu (extensão), então aqui o nome é comparado sem extensão e o tamanho também conta.
function hl_isPlaceholderSequence(seq, wanted) {
    var onlyOurs = true, named = false, total = 0;
    var seqName = "";
    try { seqName = hl_baseName(seq.name); } catch (e0) { seqName = ""; }
    for (var w = 0; w < wanted.length; w++) if (seqName && hl_baseName(wanted[w]) === seqName) named = true;
    try {
        if (Number(seq.frameSizeHorizontal) === HL_PLACEHOLDER_W && Number(seq.frameSizeVertical) === HL_PLACEHOLDER_H) named = true;
    } catch (e1) { /* ignora */ }
    var groups = [seq.videoTracks, seq.audioTracks];
    for (var g = 0; g < groups.length; g++) {
        for (var t = 0; t < groups[g].numTracks; t++) {
            var clips = groups[g][t].clips;
            for (var c = 0; c < clips.numItems; c++) {
                total++;
                var mp = "";
                try { mp = hl_normPath(clips[c].projectItem.getMediaPath()); } catch (e) { mp = ""; }
                var ours = false;
                for (var i = 0; i < wanted.length; i++) if (mp === wanted[i]) ours = true;
                if (!ours) onlyOurs = false;
                try { if (seqName && hl_baseName(clips[c].name) === seqName) named = true; } catch (e2) { /* ignora */ }
            }
        }
    }
    return total > 0 && onlyOurs && named;
}

// Desfaz a última ação do projeto (API QE, não documentada; o Composer usa a mesma).
function hl_qeUndo() {
    app.enableQE();
    qe.project.undo();
}

// Depois de desfazer, impede que Ctrl+Shift+Z traga a soltura de volta: faz uma ação pequena e a
// desfaz (o Composer renomeia uma bin dele; aqui cria uma bin vazia). Se a bin ficar, é apagada.
function hl_preventRedo() {
    try {
        var root = app.project.rootItem;
        var name = "Helmet Library - desfazer " + new Date().getTime();
        if (!root.createBin(name) && !hl_findBin(root, name)) return;
        hl_qeUndo();
        var left = hl_findBin(root, name);
        if (left) hl_deleteIfEmpty(left);
    } catch (e) { /* ignora */ }
}

// Seleciona o clipe inserido (e os vinculados a ele), como o Composer. add = soma à seleção atual.
function hl_selectInserted(seq, ti, add) {
    try {
        var sel = [], i;
        if (add) {
            var cur = seq.getSelection();
            for (i = 0; cur && i < cur.length; i++) sel.push(cur[i]);
        }
        var linked = null;
        try { linked = ti.getLinkedItems(); } catch (e1) { linked = null; }
        if (linked && linked.numItems) {
            for (i = 0; i < linked.numItems; i++) sel.push(linked[i]);
        } else {
            sel.push(ti);
        }
        seq.setSelection(sel);
    } catch (e) { /* seleção é só conveniência */ }
}

// Coloca o MOGRT na sequência ativa, na trilha de vídeo vIndex, no tempo seconds
// (ticks, se veio, é a posição exata; "" = calcula pelos segundos).
// addToSelection: true soma o MOGRT à seleção (vários MOGRTs no mesmo arrasto).
function hl_placeMogrt(path, vIndex, seconds, ticks, addToSelection) {
    return hl_run(function () {
        if (!app.project) throw hl_userError("Nenhum projeto aberto.");
        var seq = app.project.activeSequence;
        if (!seq) throw hl_userError("Abra uma sequência para adicionar o MOGRT.");
        var f = new File(String(path));
        if (!f.exists) throw hl_userError("Arquivo não encontrado (foi movido, apagado ou está num HD/pasta de rede desconectado).");
        var start = Number(seconds) || 0;
        var t = (ticks !== undefined && ticks !== null && String(ticks) !== "") ? String(ticks) : hl_ticksOf(start);
        var idx = Number(vIndex) || 0;
        var aIdx = hl_findFreeIndex(seq, start, start + 1, false, true);
        if (aIdx < 0) aIdx = 0;
        var ti = null;
        try { ti = seq.importMGT(f.fsName, t, idx, aIdx); } catch (e1) { ti = null; }
        if (!ti) throw hl_userError("O Premiere não conseguiu inserir o MOGRT (versão ou template incompatível?).");
        hl_selectInserted(seq, ti, addToSelection === true);
        var nm = "", end = start + 5;
        try { nm = ti.name; } catch (e2) { nm = f.displayName; }
        try { end = ti.end.seconds; } catch (e3) { /* mantém */ }
        return { name: nm, track: "V" + (idx + 1), end: end };
    }, "Erro ao adicionar: ");
}

var HL_TICKS_PER_SECOND = 254016000000;
function hl_ticksOf(seconds) { return String(Math.round(seconds * HL_TICKS_PER_SECOND)); }

// Clipes da imagem provisória nas trilhas de vídeo da sequência: { clip, track, ticks, seconds, end }.
function hl_placeholderClips(seq, wanted) {
    var out = [];
    for (var t = 0; t < seq.videoTracks.numTracks; t++) {
        var clips = seq.videoTracks[t].clips;
        for (var c = 0; c < clips.numItems; c++) {
            var mp = "";
            try { mp = clips[c].projectItem.getMediaPath(); } catch (e) { mp = ""; }
            if (mp && hl_normPath(mp) === wanted) {
                out.push({ clip: clips[c], track: t, ticks: clips[c].start.ticks, seconds: clips[c].start.seconds, end: clips[c].end.seconds });
            }
        }
    }
    return out;
}

// O remove() devolve códigos diferentes conforme a versão; confere se o clipe saiu mesmo.
function hl_spotStillThere(seq, wanted, s) {
    var now = hl_placeholderClips(seq, wanted);
    for (var i = 0; i < now.length; i++) {
        if (now[i].track === s.track && String(now[i].ticks) === String(s.ticks)) return true;
    }
    return false;
}

// Tira do projeto as cópias da imagem provisória que não estão em nenhuma sequência.
// As bins onde o Premiere as colocou ficam (podem ser bins do usuário).
function hl_removePlaceholderItems(copies) {
    for (var i = 0; i < copies.length; i++) {
        if (hl_inSomeSequence(copies[i].item) === false) hl_removeItem(copies[i].item, copies[i].chain[copies[i].chain.length - 1]);
    }
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

// Cria trilhas de vídeo e/ou áudio no fim da sequência (API QE, não documentada).
// addV / addA: true = 1 trilha, ou o número de trilhas.
function hl_addTracks(addV, addA) {
    var nv = addV === true ? 1 : (Number(addV) || 0), na = addA === true ? 1 : (Number(addA) || 0);
    try {
        app.enableQE();
        var qs = qe.project.getActiveSequence();
        var seq = app.project.activeSequence;
        // addTracks(nVideo, depoisDoVideo, nAudio, tipoAudio(1 = estéreo), depoisDoAudio, nSubmix, tipoSubmix, depoisDoSubmix)
        qs.addTracks(nv, seq.videoTracks.numTracks, na, 1, seq.audioTracks.numTracks, 0, 1, 0);
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
