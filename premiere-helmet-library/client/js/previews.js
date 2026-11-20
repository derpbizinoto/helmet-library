// client/js/previews.js — Helmet Library
// Gera e guarda os previews de cada arquivo:
//   imagem/GIF → miniatura JPG
//   vídeo (H.264 etc.) → frame em JPG + duração
//   áudio → forma de onda (picos em JSON) + miniatura desenhada
//   MOGRT → miniatura e vídeo de preview tirados de dentro do .mogrt
// Cada arquivo gera <chave>.json (meta) e <chave>.jpg (miniatura), e o MOGRT também <chave>.<ext do vídeo>.
// Exposto como window.HLPreviews.

(function () {
    "use strict";

    var HL = window.HL;
    var L = window.HLLibrary;
    var THUMB_W = HL.THUMB_W, THUMB_H = HL.THUMB_H;
    var PEAKS = HL.PEAKS;
    var MAX_AUDIO_BYTES = HL.MAX_AUDIO_BYTES;
    var CONCURRENCY = HL.PREVIEW_CONCURRENCY;
    var VERSION = 1;                       // muda quando o formato do cache mudar

    var memo = {};                         // caminho|mtime → resultado
    var waiting = {};                      // caminho|mtime → [callbacks]
    var queue = [];
    var running = 0;
    var audioCtx = null;
    var getCfg = function () { return {}; };

    function ctx() {
        if (!audioCtx) audioCtx = new (window.AudioContext || window.webkitAudioContext)();
        return audioCtx;
    }

    function idOf(file) { return file.path + "|" + file.mtime + "|" + file.size; }

    // ---------- API ----------

    // Promise<{ thumb: url|null, meta, video: url|null }>
    function get(file, priority) {
        var id = idOf(file);
        if (memo[id]) return Promise.resolve(memo[id]);
        return new Promise(function (resolve) {
            if (waiting[id]) { waiting[id].push(resolve); return; }
            waiting[id] = [resolve];
            var job = { file: file, id: id };
            if (priority) queue.unshift(job); else queue.push(job);
            pump();
        });
    }

    // Tira da fila o que saiu da tela (os callbacks continuam esperando caso volte).
    function deprioritize(file) {
        var id = idOf(file);
        for (var i = 0; i < queue.length; i++) {
            if (queue[i].id === id) { queue.push(queue.splice(i, 1)[0]); return; }
        }
    }

    function peek(file) { return memo[idOf(file)] || null; }

    function forget(file) {
        var id = idOf(file);
        delete memo[id];
        try { L.removePreview(L.cacheInfo(getCfg(), file)); } catch (e) { /* sem cache */ }
    }

    function clearMemo() { memo = {}; }

    function pump() {
        while (running < CONCURRENCY && queue.length) {
            var job = queue.shift();
            running++;
            // Promise.resolve().then: um erro dentro de run (ex.: pasta só leitura) vira falha
            // deste arquivo, em vez de deixar a fila presa para sempre
            Promise.resolve(job).then(run).then(function (j, res) { finish(j, res); }.bind(null, job), function (j, err) {
                HL.log("preview falhou", j.file.path, err);
                finish(j, { thumb: null, video: null, meta: { error: errorText(err, j.file, null) } });
            }.bind(null, job));
        }
    }

    function finish(job, res) {
        running--;
        memo[job.id] = res;
        var cbs = waiting[job.id] || [];
        delete waiting[job.id];
        cbs.forEach(function (cb) { cb(res); });
        pump();
    }

    // ---------- trabalho ----------

    // Texto do erro para a dica do card. Erros de disco viram mensagem clara; os de gravação
    // no cache (pasta só leitura, disco cheio) também avisam o painel uma vez.
    function errorText(err, file, ci) {
        if (!(err && err.code)) return String(err && err.message || err);
        var writing = ci && err.path && L.isInside(err.path, ci.dir);
        var msg = L.describeError(err, writing ? "write" : "file");
        if (writing) problemHandler(msg);
        return msg;
    }

    var problemHandler = function () { };

    function logWriteError(err) { HL.log("preview não gravado", err); }

    function run(job) {
        var file = job.file;
        if (!file.canPreview) return Promise.resolve({ thumb: null, video: null, meta: { none: true } });
        var ci = L.cacheInfo(getCfg(), file);
        return readCached(ci).then(function (cached) {
            if (cached) return cached;
            try { L.ensureCacheDir(ci.dir); } catch (e) {
                // sem pasta de cache (só leitura, atalho…): falha só deste arquivo, sem gravar nada
                return result(ci, { v: VERSION, error: errorText(e, file, ci) });
            }

            var work;
            if (file.kind === "image") work = imageThumb(file, ci);
            else if (file.kind === "video") work = videoThumb(L.toFileUrl(file.path), ci, {});
            else if (file.kind === "audio") work = audioThumb(file, ci);
            else if (file.kind === "mogrt") work = mogrtThumb(file, ci);
            else work = Promise.resolve({ none: true });

            return work.then(function (meta) {
                meta.v = VERSION;
                return writeFile(ci.base + ".json", JSON.stringify(meta)).catch(logWriteError).then(function () { return result(ci, meta); });
            }, function (err) {
                // grava a falha para não tentar de novo a cada abertura (a chave muda se o arquivo mudar)
                var meta = { v: VERSION, error: errorText(err, file, ci) };
                return writeFile(ci.base + ".json", JSON.stringify(meta)).catch(logWriteError).then(function () { return result(ci, meta); });
            });
        });
    }

    var VIDEO_EXTS = ["mp4", "mov", "m4v", "webm"];

    // O .json do cache pode ter vindo de outro PC (biblioteca copiada): só aceita o formato esperado.
    function validMeta(meta) {
        if (!meta || typeof meta !== "object" || meta.v !== VERSION) return false;
        if (meta.videoExt != null && VIDEO_EXTS.indexOf(meta.videoExt) < 0) return false;
        var nums = ["duration", "width", "height", "channels", "sampleRate"];
        for (var i = 0; i < nums.length; i++) {
            if (meta[nums[i]] != null && !(typeof meta[nums[i]] === "number" && isFinite(meta[nums[i]]))) return false;
        }
        if (meta.title != null && typeof meta.title !== "string") return false;
        if (meta.error != null && typeof meta.error !== "string") return false;
        if (meta.peaks != null && !(Array.isArray(meta.peaks) && meta.peaks.every(Array.isArray))) return false;
        return true;
    }

    function fileExists(file) {
        return new Promise(function (resolve) { L.fs.stat(file, function (err) { resolve(!err); }); });
    }

    // Promise<resultado guardado | null>
    function readCached(ci) {
        return new Promise(function (resolve) {
            L.fs.readFile(ci.base + ".json", "utf8", function (err, text) {
                if (err) return resolve(null);
                try { resolve(JSON.parse(text)); } catch (e) { resolve(null); }
            });
        }).then(function (meta) {
            if (!validMeta(meta)) return null;
            return Promise.all([
                meta.hasThumb ? fileExists(ci.base + ".jpg") : true,
                meta.videoExt ? fileExists(ci.base + "." + meta.videoExt) : true
            ]).then(function (ok) { return ok[0] && ok[1] ? result(ci, meta) : null; });
        });
    }

    function result(ci, meta) {
        return {
            thumb: meta.hasThumb ? L.toFileUrl(ci.base + ".jpg") : null,
            video: meta.videoExt ? L.toFileUrl(ci.base + "." + meta.videoExt) : null,
            meta: meta
        };
    }

    function saveCanvas(canvas, ci) {
        var b64 = canvas.toDataURL("image/jpeg", 0.84).split(",")[1];
        return writeFile(ci.base + ".jpg", Buffer.from(b64, "base64"));
    }

    // desenha a fonte inteira (contain) num quadro 16:9 com fundo escuro
    function drawContain(src, sw, sh, transparentBg) {
        var scale = Math.min(THUMB_W / sw, THUMB_H / sh, 1.5);
        var w = Math.max(1, Math.round(sw * scale)), h = Math.max(1, Math.round(sh * scale));
        var c = document.createElement("canvas");
        c.width = THUMB_W; c.height = THUMB_H;
        var g = c.getContext("2d");
        if (transparentBg) drawChecker(g, THUMB_W, THUMB_H);
        else { g.fillStyle = "#0C0812"; g.fillRect(0, 0, THUMB_W, THUMB_H); }
        g.imageSmoothingQuality = "high";
        g.drawImage(src, Math.round((THUMB_W - w) / 2), Math.round((THUMB_H - h) / 2), w, h);
        return c;
    }

    // xadrez discreto para PNGs com transparência
    function drawChecker(g, w, h) {
        var s = 12;
        for (var y = 0; y < h; y += s) {
            for (var x = 0; x < w; x += s) {
                g.fillStyle = ((x / s + y / s) % 2) ? "#1B1426" : "#150F1D";
                g.fillRect(x, y, s, s);
            }
        }
    }

    function loadImage(url) {
        return new Promise(function (resolve, reject) {
            var img = new Image();
            var t = setTimeout(function () { reject(new Error(N("a imagem demorou demais para abrir (disco lento ou desconectado?)"))); }, HL.MEDIA_TIMEOUT_MS);
            img.onload = function () { clearTimeout(t); resolve(img); };
            img.onerror = function () { clearTimeout(t); reject(new Error(N("imagem não suportada"))); };
            img.src = url;
        });
    }

    function imageThumb(file, ci) {
        return loadImage(L.toFileUrl(file.path)).then(function (img) {
            var w = img.naturalWidth || THUMB_W, h = img.naturalHeight || THUMB_H;
            var alpha = /^(png|gif|webp|svg)$/.test(file.ext);
            return saveCanvas(drawContain(img, w, h, alpha), ci).then(function () {
                return { hasThumb: true, width: w, height: h };
            });
        });
    }

    // Abre o vídeo, pula para ~30% (máx. 3 s) e captura o frame.
    function videoThumb(url, ci, extra) {
        return new Promise(function (resolve, reject) {
            var v = document.createElement("video");
            v.muted = true;
            v.preload = "auto";
            var done = false;
            var timer = setTimeout(function () { fail(new Error(N("o vídeo demorou demais para abrir (disco lento ou desconectado?)"))); }, HL.MEDIA_TIMEOUT_MS);
            function cleanup() { clearTimeout(timer); v.removeAttribute("src"); try { v.load(); } catch (e) { } }
            function fail(err) { if (done) return; done = true; cleanup(); reject(err); }
            v.onerror = function () { fail(new Error(N("codec não suportado no preview (use H.264)"))); };
            v.onloadedmetadata = function () {
                var d = isFinite(v.duration) ? v.duration : 0;
                v.currentTime = d ? Math.min(d * 0.3, 3) : 0;
            };
            v.onseeked = function () {
                if (done) return;
                try {
                    if (!v.videoWidth) throw new Error(N("vídeo sem imagem"));
                    var canvas = drawContain(v, v.videoWidth, v.videoHeight, false);
                    var meta = { hasThumb: true, width: v.videoWidth, height: v.videoHeight, duration: isFinite(v.duration) ? v.duration : 0 };
                    for (var k in extra) meta[k] = extra[k];
                    done = true; cleanup();
                    saveCanvas(canvas, ci).then(function () { resolve(meta); }, reject);
                } catch (e) { fail(e); }
            };
            v.src = url;
        });
    }

    // ---------- áudio ----------

    function decodeFile(filePath) {
        return new Promise(function (resolve, reject) {
            L.fs.readFile(filePath, function (err, buf) {
                if (err) return reject(err);
                var ab = buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength);
                ctx().decodeAudioData(ab, resolve, function () { reject(new Error(N("formato de áudio não suportado no preview"))); });
            });
        });
    }

    // picos [min, max] por coluna, por canal (no máx. 2), arredondados para caber num JSON pequeno
    function computePeaks(buffer, cols) {
        var chans = Math.min(buffer.numberOfChannels, 2);
        var out = [];
        for (var c = 0; c < chans; c++) {
            var data = buffer.getChannelData(c);
            var step = data.length / cols;
            var arr = new Array(cols * 2);
            for (var i = 0; i < cols; i++) {
                var s = Math.floor(i * step), e = Math.max(s + 1, Math.floor((i + 1) * step));
                var mn = 0, mx = 0;
                var stride = Math.max(1, Math.floor((e - s) / 400)); // amostragem dentro da coluna (rápido em arquivos longos)
                for (var j = s; j < e; j += stride) {
                    var v = data[j];
                    if (v < mn) mn = v; else if (v > mx) mx = v;
                }
                arr[i * 2] = Math.round(mn * 1000) / 1000;
                arr[i * 2 + 1] = Math.round(mx * 1000) / 1000;
            }
            out.push(arr);
        }
        return out;
    }

    // Desenha picos num canvas (usado na miniatura e no player).
    // opts: { color, bg, mid, gap }
    function drawWave(canvas, peaks, opts) {
        opts = opts || {};
        var g = canvas.getContext("2d");
        var W = canvas.width, H = canvas.height;
        g.clearRect(0, 0, W, H);
        if (opts.bg) { g.fillStyle = opts.bg; g.fillRect(0, 0, W, H); }
        if (!peaks || !peaks.length) return;
        var chans = peaks.length;
        var gap = opts.gap != null ? opts.gap : Math.round(H * 0.08);
        var laneH = (H - gap * (chans + 1)) / chans;
        for (var c = 0; c < chans; c++) {
            var arr = peaks[c];
            var cols = arr.length / 2;
            var mid = gap + laneH * c + gap * c + laneH / 2;
            if (opts.mid) {
                g.fillStyle = opts.mid;
                g.fillRect(0, Math.round(mid), W, 1);
            }
            g.fillStyle = opts.color || "#F5F1FA";
            for (var x = 0; x < W; x++) {
                var i0 = Math.floor(x / W * cols), i1 = Math.max(i0 + 1, Math.floor((x + 1) / W * cols));
                var mn = 0, mx = 0;
                for (var i = i0; i < i1 && i < cols; i++) {
                    if (arr[i * 2] < mn) mn = arr[i * 2];
                    if (arr[i * 2 + 1] > mx) mx = arr[i * 2 + 1];
                }
                var y1 = mid - mx * laneH / 2, y2 = mid - mn * laneH / 2;
                g.fillRect(x, y1, 1, Math.max(1, y2 - y1));
            }
        }
    }

    function audioThumb(file, ci) {
        if (file.size > MAX_AUDIO_BYTES) return Promise.reject(new Error(N("arquivo grande demais para gerar a forma de onda")));
        return decodeFile(file.path).then(function (buffer) {
            var peaks = computePeaks(buffer, PEAKS);
            var c = document.createElement("canvas");
            c.width = THUMB_W; c.height = THUMB_H;
            var g = c.getContext("2d");
            g.fillStyle = "#130D1C"; g.fillRect(0, 0, THUMB_W, THUMB_H);
            var wave = document.createElement("canvas");
            wave.width = THUMB_W - 24; wave.height = THUMB_H - 40;
            drawWave(wave, peaks, { color: "#EDE3FB", mid: "rgba(200,168,245,0.35)" });
            g.drawImage(wave, 12, 20);
            return saveCanvas(c, ci).then(function () {
                return {
                    hasThumb: true, waveform: true, duration: buffer.duration,
                    channels: buffer.numberOfChannels, sampleRate: buffer.sampleRate, peaks: peaks
                };
            });
        });
    }

    // ---------- MOGRT ----------

    function writeFile(file, data) {
        return new Promise(function (resolve, reject) {
            L.fs.writeFile(file, data, function (err) { if (err) reject(err); else resolve(); });
        });
    }

    function mogrtThumb(file, ci) {
        var meta = {};
        return L.inspectMogrt(file.path).catch(function (e) {
            // erro de disco (sem permissão, desconectado) ou .mogrt danificado/grande demais
            if (e && e.code && e.code !== "MOGRT_INVALID") throw new Error(L.describeError(e, "file"));
            throw new Error(N("MOGRT sem preview (arquivo grande demais ou danificado: {0})", e.message));
        }).then(function (info) {
            meta.title = info.title || "";
            var chain = Promise.resolve();
            if (info.video) {
                var vext = info.video.name.split(".").pop().toLowerCase();
                chain = L.readZipEntry(file.path, info.video, L.ZIP_LIMITS.video).then(function (buf) {
                    return writeFile(ci.base + "." + vext, buf);
                }).then(function () { meta.videoExt = vext; }, function () { /* segue sem vídeo */ });
            }
            if (info.image) {
                chain = chain.then(function () {
                    return L.readZipEntry(file.path, info.image, L.ZIP_LIMITS.image);
                }).then(function (buf) {
                    var mime = /\.png$/i.test(info.image.name) ? "image/png" : /\.gif$/i.test(info.image.name) ? "image/gif" : "image/jpeg";
                    return loadImage("data:" + mime + ";base64," + buf.toString("base64"));
                }).then(function (img) {
                    return saveCanvas(drawContain(img, img.naturalWidth, img.naturalHeight, true), ci).then(function () {
                        meta.hasThumb = true;
                        meta.width = img.naturalWidth; meta.height = img.naturalHeight;
                    });
                }).catch(function () { /* tenta pelo vídeo */ });
            }
            return chain;
        }).then(function () {
            if (meta.hasThumb || !meta.videoExt) return meta;
            return videoThumb(L.toFileUrl(ci.base + "." + meta.videoExt), ci, {}).then(function (m) {
                meta.hasThumb = true; meta.width = m.width; meta.height = m.height; meta.duration = m.duration;
                return meta;
            }, function () { return meta; });
        });
    }

    window.HLPreviews = {
        init: function (cfgGetter) { getCfg = cfgGetter; },
        // aviso de problema ao gravar previews (pasta só leitura, disco cheio)
        onProblem: function (fn) { problemHandler = fn || function () { }; },
        MAX_AUDIO_BYTES: MAX_AUDIO_BYTES,
        get: get,
        peek: peek,
        forget: forget,
        clearMemo: clearMemo,
        deprioritize: deprioritize,
        decodeFile: decodeFile,
        drawWave: drawWave,
        audioContext: ctx,
        _validMeta: validMeta,  // expostos para os testes automáticos
        _readCached: readCached
    };
})();
