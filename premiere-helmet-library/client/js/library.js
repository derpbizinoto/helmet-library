// client/js/library.js — Helmet Library
// Parte Node do painel: configuração, leitura das pastas, tipos de arquivo,
// onde fica o cache de previews, leitor de MOGRT (.zip) e vigia de pastas.
// Exposto como window.HLLibrary.

(function () {
    "use strict";

    var hasNode = typeof require === "function";
    var fs = hasNode ? require("fs") : null;
    var path = hasNode ? require("path") : null;
    var os = hasNode ? require("os") : null;
    var crypto = hasNode ? require("crypto") : null;
    var zlib = hasNode ? require("zlib") : null;
    var cp = hasNode ? require("child_process") : null;

    var APP_NAME = "Helmet Library";
    var CACHE_DIR_NAME = ".helmet-previews";

    // ---------- tipos ----------
    // kind: o que o Premiere recebe (video/audio/image/mogrt/other)
    // preview: o painel consegue mostrar o conteúdo (o resto aparece com ícone)
    var TYPES = {
        mp4: { kind: "video", preview: true }, m4v: { kind: "video", preview: true }, mov: { kind: "video", preview: true },
        webm: { kind: "video", preview: true }, avi: { kind: "video" }, mxf: { kind: "video" }, mkv: { kind: "video" },
        wmv: { kind: "video" }, mpg: { kind: "video" }, mpeg: { kind: "video" }, mts: { kind: "video" }, m2ts: { kind: "video" },

        wav: { kind: "audio", preview: true }, mp3: { kind: "audio", preview: true }, m4a: { kind: "audio", preview: true },
        aac: { kind: "audio", preview: true }, ogg: { kind: "audio", preview: true }, flac: { kind: "audio", preview: true },
        aif: { kind: "audio" }, aiff: { kind: "audio" }, wma: { kind: "audio" },

        jpg: { kind: "image", preview: true }, jpeg: { kind: "image", preview: true }, png: { kind: "image", preview: true },
        gif: { kind: "image", preview: true }, bmp: { kind: "image", preview: true }, webp: { kind: "image", preview: true },
        svg: { kind: "image", preview: true }, psd: { kind: "image" }, ai: { kind: "image" }, eps: { kind: "image" },
        tif: { kind: "image" }, tiff: { kind: "image" }, tga: { kind: "image" }, exr: { kind: "image" }, dpx: { kind: "image" },

        mogrt: { kind: "mogrt", preview: true },

        aep: { kind: "other" }, prproj: { kind: "other" }, aegraphic: { kind: "other" }, ffx: { kind: "other" },
        prfpset: { kind: "other" }, cube: { kind: "other" }, srt: { kind: "other" }, xml: { kind: "other" }
    };

    var IGNORE = { "thumbs.db": 1, "desktop.ini": 1, ".ds_store": 1 };

    function typeOf(name) {
        var ext = name.lastIndexOf(".") > 0 ? name.slice(name.lastIndexOf(".") + 1).toLowerCase() : "";
        var t = TYPES[ext];
        return { ext: ext, kind: t ? t.kind : null, preview: !!(t && t.preview) };
    }

    // ---------- promessas simples (sem depender da versão do Node do CEP) ----------

    function p(fn) {
        var args = Array.prototype.slice.call(arguments, 1);
        return new Promise(function (resolve, reject) {
            args.push(function (err, res) { if (err) reject(err); else resolve(res); });
            fn.apply(fs, args);
        });
    }

    function mkdirp(dir) {
        if (fs.existsSync(dir)) return;
        mkdirp(path.dirname(dir));
        try { fs.mkdirSync(dir); } catch (e) { if (e.code !== "EEXIST") throw e; }
    }

    // ---------- configuração ----------

    var DEFAULTS = {
        libraries: [],            // [{ id, name, path }]
        favorites: [],            // caminhos completos
        expanded: [],             // pastas abertas na árvore
        lastView: null,           // { type: "folder", path } | { type: "favorites" }
        cacheMode: "library",     // "library" (.helmet-previews dentro da biblioteca) | "system"
        useBin: true,             // importar numa bin "Helmet Library"
        mirrorFolders: true,      // criar sub-bins iguais às subpastas
        includeSub: false,        // mostrar arquivos das subpastas junto
        showUnknown: false,       // mostrar arquivos que o Premiere não importa
        autoplay: true,           // tocar ao selecionar
        dblClick: "timeline",     // "timeline" | "project"
        thumbSize: 168,
        sidebarWidth: 230,
        volume: 0.8,
        filter: "all"
    };

    function appDataDir() {
        var base = process.env.APPDATA || path.join(os.homedir(), "AppData", "Roaming");
        return path.join(base, APP_NAME);
    }

    function systemCacheDir() {
        var base = process.env.LOCALAPPDATA || path.join(os.homedir(), "AppData", "Local");
        return path.join(base, APP_NAME, "cache");
    }

    function configPath() { return path.join(appDataDir(), "config.json"); }
    function backupPath() { return configPath() + ".bak"; }

    function clone(v) { return JSON.parse(JSON.stringify(v)); }
    function isObject(v) { return !!v && typeof v === "object" && !Array.isArray(v); }

    // Lê um JSON do disco. { ok, data } | { ok: false, missing } | { ok: false, corrupt }
    function readJsonFile(file) {
        var text;
        try { text = fs.readFileSync(file, "utf8"); }
        catch (e) { return e.code === "ENOENT" ? { ok: false, missing: true } : { ok: false, corrupt: true, error: e }; }
        try {
            var data = JSON.parse(text.replace(/^﻿/, ""));
            return isObject(data) ? { ok: true, data: data } : { ok: false, corrupt: true };
        } catch (e2) { return { ok: false, corrupt: true, error: e2 }; }
    }

    var CHOICES = {
        cacheMode: ["library", "system"],
        dblClick: ["timeline", "project"],
        filter: ["all", "video", "audio", "image", "mogrt", "other"]
    };
    var BOOLEANS = ["useBin", "mirrorFolders", "includeSub", "showUnknown", "autoplay"];
    var NUMBERS = { thumbSize: [110, 340], sidebarWidth: [150, 4000], volume: [0, 1] };

    function strings(arr) { return Array.isArray(arr) ? arr.filter(function (x) { return typeof x === "string" && x; }) : null; }

    // Confere o tipo de cada campo. O que vier errado volta para o padrão (sem travar o painel).
    // Devolve null se o essencial (bibliotecas ou favoritos) estiver estragado: aí o arquivo
    // é tratado como corrompido, para não gravar por cima e perder esses dados.
    function sanitizeConfig(raw) {
        if (!isObject(raw)) return null;
        if ("libraries" in raw && !Array.isArray(raw.libraries)) return null;
        if ("favorites" in raw && !Array.isArray(raw.favorites)) return null;
        var cfg = {};
        for (var key in raw) cfg[key] = raw[key];   // campos desconhecidos são mantidos
        for (var k in DEFAULTS) if (!(k in cfg)) cfg[k] = clone(DEFAULTS[k]);

        cfg.libraries = cfg.libraries.filter(function (lib) {
            return isObject(lib) && typeof lib.path === "string" && lib.path;
        }).map(function (lib) {
            return {
                id: typeof lib.id === "string" && lib.id ? lib.id : newId(),
                name: typeof lib.name === "string" && lib.name ? lib.name : (path.basename(lib.path) || lib.path),
                path: lib.path
            };
        });
        cfg.favorites = strings(cfg.favorites);
        cfg.expanded = strings(cfg.expanded) || [];
        var v = cfg.lastView;
        if (!(isObject(v) && (v.type === "favorites" || (v.type === "folder" && typeof v.path === "string" && v.path)))) cfg.lastView = null;
        Object.keys(CHOICES).forEach(function (k) { if (CHOICES[k].indexOf(cfg[k]) < 0) cfg[k] = DEFAULTS[k]; });
        BOOLEANS.forEach(function (k) { if (typeof cfg[k] !== "boolean") cfg[k] = DEFAULTS[k]; });
        Object.keys(NUMBERS).forEach(function (k) {
            var n = cfg[k], r = NUMBERS[k];
            cfg[k] = typeof n === "number" && isFinite(n) ? Math.min(r[1], Math.max(r[0], n)) : DEFAULTS[k];
        });
        return cfg;
    }

    function stamp(d) {
        var two = function (n) { return ("0" + n).slice(-2); };
        return d.getFullYear() + two(d.getMonth() + 1) + two(d.getDate()) + "-" + two(d.getHours()) + two(d.getMinutes()) + two(d.getSeconds());
    }

    function fmtDate(d) {
        var two = function (n) { return ("0" + n).slice(-2); };
        return two(d.getDate()) + "/" + two(d.getMonth() + 1) + "/" + d.getFullYear() + " " + two(d.getHours()) + ":" + two(d.getMinutes());
    }

    var configNotice = null;   // aviso para o usuário depois de uma recuperação

    // Lê o config.json. Se estiver corrompido: guarda o arquivo estragado com outro nome
    // (nunca grava por cima), tenta o backup (.bak) e deixa um aviso em lastConfigNotice().
    function loadConfig() {
        configNotice = null;
        var main = readJsonFile(configPath());
        var cfg = main.ok ? sanitizeConfig(main.data) : null;
        if (cfg) return cfg;
        if (main.missing) return sanitizeConfig({});

        var kept = path.join(appDataDir(), "config.corrompido-" + stamp(new Date()) + ".json");
        try { fs.renameSync(configPath(), kept); } catch (e) { kept = configPath(); }

        var bak = readJsonFile(backupPath());
        var fromBak = bak.ok ? sanitizeConfig(bak.data) : null;
        if (fromBak) {
            var when = "";
            try { when = " de " + fmtDate(fs.statSync(backupPath()).mtime); } catch (e) { /* sem data */ }
            configNotice = "O arquivo de configurações estava danificado e foi recuperado do backup" + when +
                ". O arquivo danificado ficou guardado em:\n" + kept;
            return fromBak;
        }
        configNotice = "O arquivo de configurações estava danificado e não havia backup, então as bibliotecas " +
            "e os favoritos começaram vazios. O arquivo danificado ficou guardado em:\n" + kept;
        return sanitizeConfig({});
    }

    function lastConfigNotice() { return configNotice; }

    var saveErrorHandler = function () { };
    function onSaveError(fn) { saveErrorHandler = fn || function () { }; }

    // Grava de forma atômica (arquivo temporário + renomear) e guarda a versão anterior em .bak.
    function writeConfigNow(cfg) {
        try {
            mkdirp(appDataDir());
            var tmp = configPath() + ".tmp";
            fs.writeFileSync(tmp, JSON.stringify(cfg, null, 2), "utf8");
            if (readJsonFile(configPath()).ok) {
                try { fs.copyFileSync(configPath(), backupPath()); } catch (e) { /* segue sem backup novo */ }
            }
            fs.renameSync(tmp, configPath());
            return true;
        } catch (e) {
            console.error("Helmet Library: falha ao salvar config", e);
            saveErrorHandler(e);
            return false;
        }
    }

    var saveTimer = null;
    function saveConfig(cfg, now) {
        clearTimeout(saveTimer);
        if (now) writeConfigNow(cfg);
        else saveTimer = setTimeout(function () { writeConfigNow(cfg); }, 300);
    }

    function newId() { return "lib" + Date.now().toString(36) + Math.random().toString(36).slice(2, 6); }

    // ---------- leitura de pastas ----------

    function isHidden(name) {
        return name.charAt(0) === "." || IGNORE[name.toLowerCase()] === 1 || name.charAt(0) === "~";
    }

    function byName(a, b) { return a.name.localeCompare(b.name, "pt-BR", { numeric: true, sensitivity: "base" }); }

    function realpath(pth) {
        return new Promise(function (resolve, reject) {
            (fs.realpath.native || fs.realpath)(pth, function (err, res) { if (err) reject(err); else resolve(res); });
        });
    }

    // Caminho real da raiz de cada biblioteca (a própria raiz pode ser um atalho).
    var rootReal = {};
    function realRoot(root) {
        var k = root.toLowerCase();
        if (!rootReal[k]) {
            rootReal[k] = realpath(root).catch(function () { delete rootReal[k]; return path.resolve(root); });
        }
        return rootReal[k];
    }

    // Lê uma entrada da pasta. Atalhos (links simbólicos e junções do Windows) só são
    // seguidos se o destino real ficar DENTRO da mesma biblioteca (root); os que apontam
    // para fora são ignorados. Resolve { st, link, real } ou null (ignorar).
    function inspect(full, root) {
        return p(fs.lstat, full).then(function (lst) {
            if (!lst.isSymbolicLink()) return { st: lst, link: false };
            if (!root) return null;
            return Promise.all([realpath(full), realRoot(root)]).then(function (r) {
                if (!isInside(r[0], r[1])) return null;
                return p(fs.stat, full).then(function (st) { return { st: st, link: true, real: r[0] }; });
            });
        }).catch(function () { return null; });   // sem permissão ou link quebrado: ignora
    }

    function makeEntry(full, st) {
        var name = path.basename(full);
        var t = typeOf(name);
        return {
            name: name, path: full, dir: path.dirname(full), ext: t.ext, kind: t.kind || "unknown",
            canPreview: t.preview, size: st.size, mtime: st.mtime.getTime()
        };
    }

    // Lista uma pasta: subpastas e arquivos (com tipo, tamanho e data).
    // opts: { root: pasta da biblioteca, showUnknown, dirsOnly }
    function listDir(dir, opts) {
        opts = opts || {};
        return p(fs.readdir, dir).then(function (names) {
            var dirs = [], files = [];
            return Promise.all(names.map(function (name) {
                if (isHidden(name)) return null;
                var full = path.join(dir, name);
                return inspect(full, opts.root).then(function (info) {
                    if (!info) return;
                    if (info.st.isDirectory()) {
                        dirs.push({ name: name, path: full, link: info.link, real: info.real });
                    } else if (info.st.isFile() && !opts.dirsOnly) {
                        var e = makeEntry(full, info.st);
                        if (e.kind !== "unknown" || opts.showUnknown) files.push(e);
                    }
                });
            })).then(function () {
                dirs.sort(byName);
                files.sort(byName);
                return { dirs: dirs, files: files };
            });
        });
    }

    // Só as subpastas (para a árvore lateral).
    function listDirs(dir, opts) {
        return listDir(dir, { root: opts && opts.root, dirsOnly: true }).then(function (res) { return res.dirs; });
    }

    function pathKey(pth) { return process.platform === "win32" ? pth.toLowerCase() : pth; }

    // Lista todos os arquivos de uma pasta e das subpastas (para busca e "incluir subpastas").
    // Cada pasta real é lida uma vez só, então um atalho que aponta para a pasta "mãe" não
    // faz a leitura andar em círculo. Se passar do limite, o resultado vem com truncated = true.
    function walk(dir, opts, limit) {
        opts = opts || {};
        limit = limit || 20000;
        var out = [];
        var seen = {};
        return realpath(dir).catch(function () { return path.resolve(dir); }).then(function (startReal) {
            var queue = [{ path: dir, real: startReal }];
            function next() {
                if (out.length >= limit) { out.truncated = true; return out; }
                if (!queue.length) return out;
                var d = queue.shift();
                if (seen[pathKey(d.real)]) return next();
                seen[pathKey(d.real)] = true;
                return listDir(d.path, opts).then(function (res) {
                    res.dirs.forEach(function (x) {
                        queue.push({ path: x.path, real: x.link ? x.real : path.join(d.real, x.name) });
                    });
                    for (var i = 0; i < res.files.length; i++) {
                        if (out.length >= limit) { out.truncated = true; break; }
                        out.push(res.files[i]);
                    }
                    return next();
                }, next);
            }
            return next();
        });
    }

    function exists(pth) { try { return fs.existsSync(pth); } catch (e) { return false; } }

    // Entrada de um arquivo avulso (favoritos). null se não existir mais.
    function fileEntry(pth) {
        try {
            var st = fs.statSync(pth);
            return st.isFile() ? makeEntry(pth, st) : null;
        } catch (e) { return null; }
    }

    // ---------- cache de previews ----------

    function samePath(a, b) { return path.resolve(a).toLowerCase() === path.resolve(b).toLowerCase(); }

    function isInside(child, parent) {
        var rel = path.relative(parent, child);
        return !!rel && rel.indexOf("..") !== 0 && !path.isAbsolute(rel) || samePath(child, parent);
    }

    // Biblioteca à qual o arquivo pertence (a mais específica, se houver pastas aninhadas).
    function libraryOf(cfg, filePath) {
        var best = null;
        cfg.libraries.forEach(function (lib) {
            if (isInside(filePath, lib.path) && (!best || lib.path.length > best.path.length)) best = lib;
        });
        return best;
    }

    // Onde ficam os previews de um arquivo e qual a chave dele.
    // No modo "library" a chave usa o caminho relativo: o cache viaja junto com a pasta.
    function cacheInfo(cfg, file) {
        var lib = libraryOf(cfg, file.path);
        var dir, keySrc;
        if (cfg.cacheMode === "library" && lib) {
            dir = path.join(lib.path, CACHE_DIR_NAME);
            keySrc = path.relative(lib.path, file.path).replace(/\\/g, "/").toLowerCase();
        } else {
            dir = systemCacheDir();
            keySrc = path.resolve(file.path).toLowerCase();
        }
        var key = crypto.createHash("sha1").update(keySrc + "|" + file.size + "|" + Math.floor(file.mtime / 1000)).digest("hex").slice(0, 24);
        return { dir: dir, key: key, base: path.join(dir, key) };
    }

    // Arquivos que a própria extensão grava no cache: <chave de 24 letras/números>.<ext>.
    // Só esses podem ser apagados pelo "Limpar previews".
    var PREVIEW_FILE = /^[0-9a-f]{24}\.(json|jpg|mp4|mov|m4v|webm)$/i;

    function isLinkSync(pth) { try { return fs.lstatSync(pth).isSymbolicLink(); } catch (e) { return false; } }

    // Cria a pasta de cache. Uma pasta de cache que seja atalho para outro lugar é recusada:
    // nada é gravado (nem apagado) através dela.
    function ensureCacheDir(dir) {
        if (exists(dir)) {
            if (isLinkSync(dir)) throw new Error("a pasta de previews é um atalho para outro lugar; por segurança nada é gravado nela");
            return;
        }
        mkdirp(dir);
        // pasta oculta no Windows, para não poluir a biblioteca
        if (process.platform === "win32" && path.basename(dir) === CACHE_DIR_NAME) {
            try { cp.exec('attrib +h "' + dir + '"', { windowsHide: true }); } catch (e) { /* ignora */ }
        }
    }

    // Arquivos de preview de uma pasta de cache: [{ path, size }]. Pasta-atalho: nenhum.
    function previewFiles(dir) {
        return p(fs.lstat, dir).then(function (st) {
            if (st.isSymbolicLink() || !st.isDirectory()) return [];
            return p(fs.readdir, dir).then(function (names) {
                return Promise.all(names.filter(function (n) { return PREVIEW_FILE.test(n); }).map(function (n) {
                    var f = path.join(dir, n);
                    return p(fs.lstat, f).then(function (s) { return s.isFile() ? { path: f, size: s.size } : null; }, function () { return null; });
                }));
            }).then(function (list) { return list.filter(Boolean); });
        }, function () { return []; });
    }

    // Tamanho dos previews guardados nas pastas de cache: Promise<{ bytes, files }>
    function cacheSize(dirs) {
        return Promise.all(dirs.map(previewFiles)).then(function (lists) {
            var total = { bytes: 0, files: 0 };
            lists.forEach(function (list) { list.forEach(function (f) { total.bytes += f.size; total.files++; }); });
            return total;
        });
    }

    // Apaga só os arquivos de preview dessas pastas: Promise<quantos foram apagados>
    function clearCache(dirs) {
        return Promise.all(dirs.map(previewFiles)).then(function (lists) {
            var all = [].concat.apply([], lists);
            return Promise.all(all.map(function (f) {
                return p(fs.unlink, f.path).then(function () { return 1; }, function () { return 0; });
            }));
        }).then(function (done) { return done.reduce(function (a, b) { return a + b; }, 0); });
    }

    // Apaga os previews de um arquivo (para "Gerar preview de novo").
    function removePreview(ci) {
        if (isLinkSync(ci.dir)) return;
        ["json", "jpg", "mp4", "mov", "m4v", "webm"].forEach(function (ext) {
            try { fs.unlinkSync(ci.base + "." + ext); } catch (e) { /* não existia */ }
        });
    }

    // ---------- MOGRT (arquivo .zip) ----------
    // Lê só o diretório central e as entradas que interessam (miniatura e vídeo de preview).

    function readZipEntries(file) {
        var fd = fs.openSync(file, "r");
        try {
            var size = fs.fstatSync(fd).size;
            var tailLen = Math.min(size, 65557);
            var tail = Buffer.alloc(tailLen);
            fs.readSync(fd, tail, 0, tailLen, size - tailLen);
            var eocd = -1;
            for (var i = tailLen - 22; i >= 0; i--) {
                if (tail.readUInt32LE(i) === 0x06054b50) { eocd = i; break; }
            }
            if (eocd < 0) throw new Error("não é um .zip válido");
            var cdCount = tail.readUInt16LE(eocd + 10);
            var cdSize = tail.readUInt32LE(eocd + 12);
            var cdOffset = tail.readUInt32LE(eocd + 16);
            var cd = Buffer.alloc(cdSize);
            fs.readSync(fd, cd, 0, cdSize, cdOffset);
            var entries = [];
            var pos = 0;
            for (var n = 0; n < cdCount && pos + 46 <= cd.length; n++) {
                if (cd.readUInt32LE(pos) !== 0x02014b50) break;
                var method = cd.readUInt16LE(pos + 10);
                var compSize = cd.readUInt32LE(pos + 20);
                var uncompSize = cd.readUInt32LE(pos + 24);
                var nameLen = cd.readUInt16LE(pos + 28);
                var extraLen = cd.readUInt16LE(pos + 30);
                var commentLen = cd.readUInt16LE(pos + 32);
                var localOffset = cd.readUInt32LE(pos + 42);
                var name = cd.slice(pos + 46, pos + 46 + nameLen).toString("utf8");
                entries.push({ name: name, method: method, compSize: compSize, size: uncompSize, offset: localOffset });
                pos += 46 + nameLen + extraLen + commentLen;
            }
            return entries;
        } finally {
            fs.closeSync(fd);
        }
    }

    function readZipEntry(file, entry) {
        var fd = fs.openSync(file, "r");
        try {
            var head = Buffer.alloc(30);
            fs.readSync(fd, head, 0, 30, entry.offset);
            if (head.readUInt32LE(0) !== 0x04034b50) throw new Error("entrada corrompida");
            var start = entry.offset + 30 + head.readUInt16LE(26) + head.readUInt16LE(28);
            var data = Buffer.alloc(entry.compSize);
            fs.readSync(fd, data, 0, entry.compSize, start);
            if (entry.method === 0) return data;
            if (entry.method === 8) return zlib.inflateRawSync(data);
            throw new Error("compressão não suportada (" + entry.method + ")");
        } finally {
            fs.closeSync(fd);
        }
    }

    // Escolhe a melhor miniatura e o vídeo de preview dentro do MOGRT.
    function inspectMogrt(file) {
        var entries = readZipEntries(file);
        // Templates da Adobe trazem thumb.png/thumb.mp4 e variantes por idioma (thumb_de_DE.png…):
        // prefere pt_BR, depois a padrão, depois en_US, depois qualquer "thumb/preview".
        var score = function (e) {
            var base = e.name.split("/").pop().toLowerCase();
            var depth = e.name.split("/").length - 1;
            var s = 50;
            if (/^thumb_pt_br\./.test(base)) s = 0;
            else if (/^thumb\./.test(base)) s = 1;
            else if (/^thumb_en_us\./.test(base)) s = 2;
            else if (/thumb|preview|poster/.test(base)) s = 3;
            return s + depth * 10;
        };
        var imgs = entries.filter(function (e) { return /\.(png|jpe?g|gif)$/i.test(e.name) && e.size > 0; });
        var vids = entries.filter(function (e) { return /\.(mp4|m4v|mov|webm)$/i.test(e.name) && e.size > 0; });
        imgs.sort(function (a, b) { return score(a) - score(b) || b.size - a.size; });
        vids.sort(function (a, b) { return score(a) - score(b) || b.size - a.size; });
        var info = { image: imgs[0] || null, video: vids[0] || null, title: "" };
        var def = entries.filter(function (e) { return /(^|\/)definition\.json$/i.test(e.name); })[0];
        if (def && def.size < 4 * 1024 * 1024) {
            try {
                var json = JSON.parse(readZipEntry(file, def).toString("utf8").replace(/^﻿/, ""));
                var cn = json.capsuleNameLocalized || json.capsuleName;
                if (cn && typeof cn === "object" && cn.strDB && cn.strDB.length) {
                    var pick = function (loc) { return cn.strDB.filter(function (s) { return s.localeString === loc; })[0]; };
                    cn = (pick("pt_BR") || pick("en_US") || cn.strDB[0]).str;
                } else if (cn && typeof cn === "object") {
                    cn = cn.pt_BR || cn.en_US;
                }
                if (typeof cn === "string") info.title = cn;
            } catch (e) { /* sem título */ }
        }
        return info;
    }

    // ---------- vigia de pastas ----------

    var watchers = {};

    function watch(dir, onChange) {
        unwatch(dir);
        var timer = null;
        var changed = {};
        try {
            watchers[dir] = fs.watch(dir, { recursive: true, persistent: false }, function (evt, name) {
                if (name && String(name).indexOf(CACHE_DIR_NAME) >= 0) return;
                // arquivos que o Premiere/Windows criam ao lado da mídia (.cfa, .pek, .xmp, temporários):
                // ignorados para a grade não ser recriada à toa (isso atrapalhava o arrastar)
                var base = name ? path.basename(String(name)) : "";
                if (base && (isHidden(base) || /\.(cfa|pek|xmp|tmp|crdownload|part|ims|mcdb|prmdc|lck)$/i.test(base))) return;
                var sub = name ? path.dirname(path.join(dir, String(name))) : dir;
                changed[sub] = true;
                clearTimeout(timer);
                timer = setTimeout(function () {
                    var list = Object.keys(changed);
                    changed = {};
                    onChange(dir, list);
                }, 700);
            });
            watchers[dir].on("error", function () { unwatch(dir); });
        } catch (e) { /* pasta inacessível: sem vigia */ }
    }

    function unwatch(dir) {
        if (watchers[dir]) { try { watchers[dir].close(); } catch (e) { } delete watchers[dir]; }
    }

    // ---------- utilidades ----------

    function toFileUrl(pth) {
        var s = String(pth).replace(/\\/g, "/");
        if (s.charAt(0) !== "/") s = "/" + s;
        return "file://" + encodeURI(s).replace(/#/g, "%23").replace(/\?/g, "%3F");
    }

    function reveal(pth) {
        if (process.platform === "win32") {
            cp.spawn("explorer.exe", ["/select,", pth], { detached: true, windowsHide: false });
        } else {
            cp.spawn("open", ["-R", pth], { detached: true });
        }
    }

    function openFolder(dir) {
        if (process.platform === "win32") cp.spawn("explorer.exe", [dir], { detached: true });
        else cp.spawn("open", [dir], { detached: true });
    }

    function fmtBytes(n) {
        if (!n) return "0 B";
        var u = ["B", "KB", "MB", "GB", "TB"], i = 0;
        while (n >= 1024 && i < u.length - 1) { n /= 1024; i++; }
        return (i ? n.toFixed(n < 10 ? 1 : 0) : n) + " " + u[i];
    }

    window.HLLibrary = {
        hasNode: hasNode,
        CACHE_DIR_NAME: CACHE_DIR_NAME,
        typeOf: typeOf,
        loadConfig: loadConfig,
        saveConfig: saveConfig,
        lastConfigNotice: lastConfigNotice,
        onSaveError: onSaveError,
        sanitizeConfig: sanitizeConfig,
        newId: newId,
        listDir: listDir,
        listDirs: listDirs,
        walk: walk,
        exists: exists,
        fileEntry: fileEntry,
        libraryOf: libraryOf,
        isInside: isInside,
        samePath: samePath,
        cacheInfo: cacheInfo,
        ensureCacheDir: ensureCacheDir,
        systemCacheDir: systemCacheDir,
        cacheSize: cacheSize,
        clearCache: clearCache,
        removePreview: removePreview,
        inspectMogrt: inspectMogrt,
        readZipEntry: readZipEntry,
        watch: watch,
        unwatch: unwatch,
        toFileUrl: toFileUrl,
        reveal: reveal,
        openFolder: openFolder,
        fmtBytes: fmtBytes,
        appDataDir: appDataDir,
        path: path,
        fs: fs
    };
})();
