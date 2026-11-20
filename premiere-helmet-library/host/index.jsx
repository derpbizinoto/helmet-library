// host/index.jsx — Helmet Library
// Lado ExtendScript: importa arquivos da biblioteca no Project (numa bin "Helmet Library",
// opcionalmente espelhando as subpastas) e coloca o clipe na timeline, na posição da agulha,
// na primeira trilha livre. MOGRTs entram com sequence.importMGT().
// As respostas são JSON montado à mão (o ExtendScript do Premiere não tem JSON nativo).

var HL_HOST_VERSION = "1.2.3";

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
        else if (code < 32) out += "\\u" + ("0000" + code.toString(16)).slice(-4);
        else out += c;
    }
    return out;
}

function hl_ok(fieldsJson) { return '{"ok":true,"data":{' + (fieldsJson || "") + '}}'; }
function hl_fail(msg) { return '{"ok":false,"error":"' + hl_esc(msg) + '"}'; }

function hl_getHostVersion() { return HL_HOST_VERSION; }

// Situação atual: projeto aberto, sequência ativa e posição da agulha.
function hl_getInfo() {
    try {
        if (!app.project) return hl_fail("Nenhum projeto aberto.");
        var seq = app.project.activeSequence;
        var seqName = "";
        var pos = 0;
        if (seq) {
            try { seqName = seq.name; } catch (e1) { seqName = ""; }
            try { pos = seq.getPlayerPosition().seconds; } catch (e2) { pos = 0; }
        }
        var projName = "";
        try { projName = app.project.name || ""; } catch (e3) { projName = ""; }
        return hl_ok('"project":"' + hl_esc(projName) + '","sequence":"' + hl_esc(seqName) +
            '","hasSequence":' + (seq ? "true" : "false") + ',"playhead":' + pos);
    } catch (e) {
        return hl_fail("Erro ao ler o projeto: " + e);
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

// ---------- entrada principal ----------
// encPath: caminho com encodeURIComponent
// kind: video | audio | image | mogrt | other
// toTimeline: "1" coloca na timeline; "0" só importa no Project
// encBin: nome da bin ("" = raiz) | encSub: subpastas "A/B" ("" = nenhuma)
function hl_add(encPath, kind, toTimeline, encBin, encSub) {
    try {
        if (!app.project) return hl_fail("Nenhum projeto aberto.");
        var path = decodeURIComponent(encPath);
        var f = new File(path);
        if (!f.exists) return hl_fail("Arquivo não encontrado: " + path);
        path = f.fsName;
        var binName = decodeURIComponent(encBin || "");
        var subPath = decodeURIComponent(encSub || "");
        var wantTimeline = String(toTimeline) === "1";
        var seq = app.project.activeSequence;

        if (kind === "mogrt") return hl_addMogrt(path, seq, wantTimeline, binName, subPath);

        var target = hl_targetBin(binName, subPath);
        var imp = hl_importToBin(path, target);
        if (!imp.item) return hl_fail("O Premiere não conseguiu importar este arquivo.");

        if (!wantTimeline) {
            return hl_ok('"where":"project","name":"' + hl_esc(imp.item.name) + '","reused":' + (imp.reused ? "true" : "false"));
        }
        if (!seq) {
            return hl_ok('"where":"project","noSequence":true,"name":"' + hl_esc(imp.item.name) + '"');
        }

        var pos = seq.getPlayerPosition();
        var start = pos.seconds;
        var end = start + hl_itemDuration(imp.item, kind);
        var needV = kind !== "audio";
        var needA = kind === "audio" || kind === "video";

        var idx = hl_findFreeIndex(seq, start, end, needV, needA);
        if (idx < 0) {
            hl_addTracks(needV, needA);
            seq = app.project.activeSequence;
            idx = hl_findFreeIndex(seq, start, end, needV, needA);
        }
        if (idx < 0) return hl_fail("Não há trilha livre na posição da agulha. Abra espaço ou crie uma trilha.");

        var track = needV ? seq.videoTracks[idx] : seq.audioTracks[idx];
        if (!hl_overwrite(track, imp.item, pos)) return hl_fail("O Premiere recusou colocar o clipe na timeline.");

        return hl_ok('"where":"timeline","name":"' + hl_esc(imp.item.name) + '","track":"' +
            (needV ? "V" : "A") + (idx + 1) + '"');
    } catch (e) {
        return hl_fail("Erro ao adicionar: " + e);
    }
}

function hl_addMogrt(path, seq, wantTimeline, binName, subPath) {
    if (!wantTimeline) {
        // Nem toda versão importa .mogrt direto no Project; tentamos e avisamos se não der.
        try {
            var target = hl_targetBin(binName, subPath);
            var ok = app.project.importFiles([path], true, target, false);
            if (ok === false) throw new Error("recusado");
            return hl_ok('"where":"project","name":"' + hl_esc(new File(path).displayName) + '"');
        } catch (e0) {
            return hl_fail("Esta versão do Premiere só aceita MOGRT direto na timeline.");
        }
    }
    if (!seq) return hl_fail("Abra uma sequência para adicionar o MOGRT.");
    var pos = seq.getPlayerPosition();
    var start = pos.seconds;
    // a duração do MOGRT só é conhecida depois de inserir; checamos 1 s a partir da agulha
    var vIdx = hl_findFreeIndex(seq, start, start + 1, true, false);
    if (vIdx < 0) {
        hl_addTracks(true, false);
        seq = app.project.activeSequence;
        vIdx = hl_findFreeIndex(seq, start, start + 1, true, false);
    }
    if (vIdx < 0) vIdx = seq.videoTracks.numTracks - 1;
    var aIdx = hl_findFreeIndex(seq, start, start + 1, false, true);
    if (aIdx < 0) aIdx = 0;

    var ti = null;
    try { ti = seq.importMGT(path, pos.ticks, vIdx, aIdx); } catch (e1) { ti = null; }
    if (!ti) {
        try { ti = seq.importMGT(path, String(pos.ticks), vIdx, aIdx); } catch (e2) { ti = null; }
    }
    if (!ti) return hl_fail("O Premiere não conseguiu inserir o MOGRT (versão ou template incompatível?).");
    var nm = "";
    try { nm = ti.name; } catch (e3) { nm = new File(path).displayName; }
    return hl_ok('"where":"timeline","name":"' + hl_esc(nm) + '","track":"V' + (vIdx + 1) + '"');
}
