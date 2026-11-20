// tests/run-tests.js — testes automáticos do Helmet Library (fora do Premiere)
// Uso:  node tests/run-tests.js
//
// Cobre o que não depende do Premiere: configuração (config.json), caminhos,
// leitor de .mogrt, cache de previews e a ponte painel -> host num Premiere simulado.
// Não substitui o roteiro de testes manuais no Premiere (TESTES.md).

"use strict";

const fs = require("fs");
const os = require("os");
const path = require("path");
const vm = require("vm");
const assert = require("assert");

const ROOT = path.join(__dirname, "..", "premiere-helmet-library");
const read = (rel) => fs.readFileSync(path.join(ROOT, rel), "utf8");

// compara por valor (objetos criados em outro contexto do vm têm outro protótipo)
const eq = (a, b, msg) => assert.deepStrictEqual(JSON.parse(JSON.stringify(a)), JSON.parse(JSON.stringify(b)), msg);

let passed = 0, failed = 0;
const pending = [];
function test(name, fn) { pending.push({ name, fn }); }

// ---------------------------------------------------------------------------
// Carregadores
// ---------------------------------------------------------------------------

// Pasta temporária própria de cada teste (apagada no fim).
const TMP = fs.mkdtempSync(path.join(os.tmpdir(), "hl-tests-"));
let tmpCount = 0;
function tmpDir(name) {
    const d = path.join(TMP, (name || "t") + "-" + (++tmpCount));
    fs.mkdirSync(d, { recursive: true });
    return d;
}

// Carrega os scripts "Node" do painel num contexto parecido com o do CEP
// (--mixed-context: require/process/Buffer visíveis na página).
// customRequire: troca módulos do Node (ex.: um fs que se comporta como o do Premiere)
function loadPanel(files, env, customRequire) {
    const fakeProcess = Object.create(process);
    fakeProcess.env = Object.assign({}, process.env, env || {});
    const ctx = {
        require: customRequire || require, process: fakeProcess, Buffer, console: { log() {}, warn() {}, error() {} },
        setTimeout, clearTimeout, Promise
    };
    ctx.window = ctx;
    vm.createContext(ctx);
    // config.js (constantes e registro) vem sempre antes, como no index.html
    ["client/js/config.js"].concat(files).forEach((f) => vm.runInContext(read(f), ctx, { filename: f }));
    return ctx;
}

function loadLibrary(appData) {
    return loadPanel(["client/js/library.js"], { APPDATA: appData, LOCALAPPDATA: appData }).HLLibrary;
}

// ---------------------------------------------------------------------------
// config.json
// ---------------------------------------------------------------------------

test("config: sem arquivo, começa com os padrões e sem aviso", () => {
    const L = loadLibrary(tmpDir("cfg"));
    const cfg = L.loadConfig();
    eq(cfg.libraries, []);
    assert.strictEqual(cfg.cacheMode, "library");
    assert.strictEqual(L.lastConfigNotice(), null);
});

test("config: gravar cria backup da versão anterior e não deixa o .tmp", () => {
    const appData = tmpDir("cfg");
    const L = loadLibrary(appData);
    const dir = path.join(appData, "Helmet Library");
    const cfg = L.loadConfig();
    cfg.libraries.push({ id: "a", name: "Sons", path: "D:\\Sons" });
    L.saveConfig(cfg, true);
    assert.ok(!fs.existsSync(path.join(dir, "config.json.bak")), "na primeira gravação não há o que guardar");
    cfg.libraries.push({ id: "b", name: "Vídeos", path: "D:\\Vídeos" });
    L.saveConfig(cfg, true);
    const bak = JSON.parse(fs.readFileSync(path.join(dir, "config.json.bak"), "utf8"));
    assert.strictEqual(bak.libraries.length, 1);
    assert.strictEqual(JSON.parse(fs.readFileSync(path.join(dir, "config.json"), "utf8")).libraries.length, 2);
    assert.ok(!fs.existsSync(path.join(dir, "config.json.tmp")));
});

test("config: arquivo corrompido é guardado à parte e recuperado do backup, com aviso", () => {
    const appData = tmpDir("cfg");
    const L = loadLibrary(appData);
    const dir = path.join(appData, "Helmet Library");
    const cfg = L.loadConfig();
    cfg.libraries.push({ id: "a", name: "Sons", path: "D:\\Sons" });
    cfg.favorites.push("D:\\Sons\\boom.wav");
    L.saveConfig(cfg, true);
    L.saveConfig(cfg, true);                                     // agora existe .bak
    fs.writeFileSync(path.join(dir, "config.json"), '{"libraries":[{"id":"a",');  // cortado no meio

    const again = L.loadConfig();
    assert.strictEqual(again.libraries.length, 1);
    assert.strictEqual(again.favorites[0], "D:\\Sons\\boom.wav");
    assert.ok(/recuperado do backup/.test(L.lastConfigNotice()));
    const kept = fs.readdirSync(dir).filter((n) => /^config\.corrompido-\d{8}-\d{6}\.json$/.test(n));
    assert.strictEqual(kept.length, 1, "o arquivo estragado fica guardado");
    assert.strictEqual(fs.readFileSync(path.join(dir, kept[0]), "utf8"), '{"libraries":[{"id":"a",');
});

test("config: corrompido e sem backup → começa vazio, avisa e não apaga o estragado", () => {
    const appData = tmpDir("cfg");
    const dir = path.join(appData, "Helmet Library");
    fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(path.join(dir, "config.json"), "isto não é JSON");
    const L = loadLibrary(appData);
    const cfg = L.loadConfig();
    eq(cfg.libraries, []);
    assert.ok(/não havia backup/.test(L.lastConfigNotice()));
    assert.ok(fs.readdirSync(dir).some((n) => n.startsWith("config.corrompido-")));
    // a gravação seguinte não pode criar .bak a partir de nada
    L.saveConfig(cfg, true);
    assert.ok(!fs.existsSync(path.join(dir, "config.json.bak")));
});

test("config: campos com tipo errado voltam para o padrão sem travar", () => {
    const L = loadLibrary(tmpDir("cfg"));
    const cfg = L.sanitizeConfig({
        libraries: [{ path: "D:\\A" }, { name: "sem caminho" }, "lixo", null],
        favorites: ["D:\\A\\x.wav", 3, null],
        expanded: "não é lista",
        lastView: { type: "folder" },
        cacheMode: "nuvem", dblClick: 1, filter: "tudo",
        useBin: "sim", thumbSize: 99999, sidebarWidth: "largo", volume: -2,
        campoNovo: { manter: true }
    });
    assert.strictEqual(cfg.libraries.length, 1);
    assert.strictEqual(cfg.libraries[0].name, "A");
    assert.ok(cfg.libraries[0].id);
    eq(cfg.favorites, ["D:\\A\\x.wav"]);
    eq(cfg.expanded, []);
    assert.strictEqual(cfg.lastView, null);
    assert.strictEqual(cfg.cacheMode, "library");
    assert.strictEqual(cfg.dblClick, "timeline");
    assert.strictEqual(cfg.filter, "all");
    assert.strictEqual(cfg.useBin, true);
    assert.strictEqual(cfg.thumbSize, 340);
    assert.strictEqual(cfg.sidebarWidth, 230);
    assert.strictEqual(cfg.volume, 0);
    eq(cfg.campoNovo, { manter: true });
});

test("config: 'libraries' que não é lista conta como arquivo corrompido (não perde os dados)", () => {
    const L = loadLibrary(tmpDir("cfg"));
    assert.strictEqual(L.sanitizeConfig({ libraries: {} }), null);
    assert.strictEqual(L.sanitizeConfig({ favorites: "x" }), null);
    assert.strictEqual(L.sanitizeConfig([]), null);
});

test("config: aceita arquivo salvo com BOM (editado no Bloco de Notas)", () => {
    const appData = tmpDir("cfg");
    const dir = path.join(appData, "Helmet Library");
    fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(path.join(dir, "config.json"), "\uFEFF" + JSON.stringify({ libraries: [{ id: "x", name: "X", path: "E:\\X" }] }));
    const L = loadLibrary(appData);
    assert.strictEqual(L.loadConfig().libraries[0].path, "E:\\X");
    assert.strictEqual(L.lastConfigNotice(), null);
});

// ---------------------------------------------------------------------------
// Pastas, atalhos e cache
// ---------------------------------------------------------------------------

function touch(file, content) {
    fs.mkdirSync(path.dirname(file), { recursive: true });
    fs.writeFileSync(file, content || "x");
}

// junção do Windows (não precisa de administrador); em outros sistemas, link simbólico
function link(target, at) { fs.symlinkSync(target, at, process.platform === "win32" ? "junction" : "dir"); }

test("pastas: tipos, ocultos e ordem natural", async () => {
    const L = loadLibrary(tmpDir("cfg"));
    const lib = tmpDir("lib");
    ["Som 10.wav", "Som 2.wav", "Áudio é.mp3", "emoji 🎬.mp4", "notas.txt", ".oculto.wav", "~temp.wav", "Thumbs.db"].forEach((n) => touch(path.join(lib, n)));
    fs.mkdirSync(path.join(lib, "Sub pasta"));
    const res = await L.listDir(lib, { root: lib });
    eq(res.dirs.map((d) => d.name), ["Sub pasta"]);
    eq(res.files.map((f) => f.name), ["Áudio é.mp3", "emoji 🎬.mp4", "Som 2.wav", "Som 10.wav"]);
    const all = await L.listDir(lib, { root: lib, showUnknown: true });
    assert.ok(all.files.some((f) => f.name === "notas.txt" && f.kind === "unknown"));
});

test("pastas: atalho para dentro da biblioteca é seguido; para fora, ignorado", async () => {
    const L = loadLibrary(tmpDir("cfg"));
    const lib = tmpDir("lib");
    const outside = tmpDir("fora");
    touch(path.join(lib, "SFX", "boom.wav"));
    touch(path.join(outside, "segredo.wav"));
    link(path.join(lib, "SFX"), path.join(lib, "Atalho SFX"));
    link(outside, path.join(lib, "Atalho fora"));
    const dirs = await L.listDirs(lib, { root: lib });
    eq(dirs.map((d) => d.name), ["Atalho SFX", "SFX"]);
    const files = await L.walk(lib, { root: lib });
    assert.ok(!files.some((f) => f.name === "segredo.wav"), "nada de fora da biblioteca");
    eq(files.map((f) => f.name), ["boom.wav"], "a pasta real é lida uma vez só");
});

// O Node dentro do Premiere (NW.js 0.63) mostrou uma junção para C:\Windows como pasta comum
// (teste 8.2 da 1.3.0). Aqui o fs "esquece" de marcar atalhos, como lá.
function loadLibraryBlindToLinks(appData) {
    const realFs = require("fs");
    const blindFs = Object.assign({}, realFs, {
        lstat(p, cb) { realFs.stat(p, cb); },
        lstatSync(p) { return realFs.statSync(p); }
    });
    const req = (m) => (m === "fs" ? blindFs : require(m));
    return loadPanel(["client/js/library.js"], { APPDATA: appData, LOCALAPPDATA: appData }, req).HLLibrary;
}

test("pastas: atalho para fora fica escondido mesmo se o sistema não disser que é atalho", async () => {
    const L = loadLibraryBlindToLinks(tmpDir("cfg"));
    const lib = tmpDir("lib");
    const outside = tmpDir("fora");
    touch(path.join(lib, "SFX", "boom.wav"));
    touch(path.join(outside, "segredo.wav"));
    link(path.join(lib, "SFX"), path.join(lib, "Atalho SFX"));
    link(outside, path.join(lib, "Atalho fora"));
    link(lib, path.join(lib, "SFX", "volta"));
    eq((await L.listDirs(lib, { root: lib })).map((d) => d.name), ["Atalho SFX", "SFX"], "atalho para fora aparece");
    const files = await L.walk(lib, { root: lib });
    eq(files.map((f) => f.name), ["boom.wav"], "nada de fora e sem andar em círculo");
});

test("pastas: atalho que aponta para a pasta mãe não faz a busca andar em círculo", async () => {
    const L = loadLibrary(tmpDir("cfg"));
    const lib = tmpDir("lib");
    touch(path.join(lib, "A", "a.wav"));
    link(lib, path.join(lib, "A", "volta"));
    const files = await L.walk(lib, { root: lib });
    eq(files.map((f) => f.name), ["a.wav"]);
});

test("pastas: busca avisa quando passa do limite", async () => {
    const L = loadLibrary(tmpDir("cfg"));
    const lib = tmpDir("lib");
    for (let i = 0; i < 5; i++) touch(path.join(lib, "s" + i + ".wav"));
    const files = await L.walk(lib, { root: lib }, 3);
    assert.strictEqual(files.length, 3);
    assert.strictEqual(files.truncated, true);
    assert.ok(!(await L.walk(lib, { root: lib })).truncated);
});

test("pastas: biblioteca removida/renomeada ou HD desligado dá aviso claro, sem travar", async () => {
    const L = loadLibrary(tmpDir("cfg"));
    const lib = tmpDir("lib");
    touch(path.join(lib, "ok.wav"));
    const gone = path.join(lib, "renomeada");
    assert.strictEqual(await L.existsAsync(lib), true);
    assert.strictEqual(await L.existsAsync(gone), false);
    assert.strictEqual(await L.fileEntry(path.join(gone, "x.wav")), null);
    assert.strictEqual((await L.fileEntry(path.join(lib, "ok.wav"))).name, "ok.wav");
    const err = await L.listDir(gone, { root: lib }).then(() => null, (e) => e);
    assert.ok(err, "pasta que sumiu deve dar erro");
    assert.match(L.describeError(err, "folder"), /HD externo ou na rede/);
    assert.match(L.describeError({ code: "ENOENT" }, "file"), /movido, apagado/);
    assert.match(L.describeError({ code: "EACCES" }, "write"), /Cache do sistema/);
    assert.match(L.describeError({ code: "ENOSPC" }, "write"), /Disco cheio/);
    assert.match(L.describeError({ code: "EHOSTUNREACH" }, "folder"), /não respondeu/);
    assert.strictEqual(L.describeError(new Error("outra coisa"), "folder"), "outra coisa");
});

// Código de todos os scripts do painel (menos o CSInterface.js da Adobe): { nome: texto }
function panelSources() {
    const dir = path.join(ROOT, "client", "js");
    const out = {};
    fs.readdirSync(dir).filter((n) => n.endsWith(".js") && n !== "CSInterface.js").forEach((n) => { out[n] = fs.readFileSync(path.join(dir, n), "utf8"); });
    return out;
}

// arquivos da interface (os que rodam na tela, fora a parte Node de library.js)
const UI_FILES = ["app.js", "tree.js", "grid.js", "host.js", "libraries.js", "menus.js", "settings.js", "main.js"];

test("robustez: navegar e gerar previews não usa leitura síncrona do disco", () => {
    const src = panelSources();
    UI_FILES.forEach((n) => {
        assert.ok(!/L\.exists\(/.test(src[n]), n + " usa L.exists (síncrono)");
        assert.ok(!/Sync\(/.test(src[n]), n + " usa função *Sync");
    });
    assert.ok(!/Sync\(/.test(src["previews.js"]), "previews.js usa função *Sync");
    assert.match(read("client/js/player.js"), /MAX_AUDIO_BYTES/, "player.js deve desviar áudio grande para o <audio>");
});

test("cache: Limpar previews só apaga arquivos com nome de preview", async () => {
    const L = loadLibrary(tmpDir("cfg"));
    const cache = path.join(tmpDir("lib"), ".helmet-previews");
    const key = "0123456789abcdef01234567";
    [key + ".json", key + ".jpg", key + ".mp4"].forEach((n) => touch(path.join(cache, n), "123"));
    ["minha foto.jpg", "notas.json", key + ".exe", "0123.jpg"].forEach((n) => touch(path.join(cache, n)));
    eq(await L.cacheSize([cache]), { bytes: 9, files: 3 });
    assert.strictEqual(await L.clearCache([cache]), 3);
    eq(fs.readdirSync(cache).sort(), ["0123.jpg", key + ".exe", "minha foto.jpg", "notas.json"].sort());
});

test("cache: pasta de previews que é atalho não é lida, gravada nem limpa", async () => {
    const L = loadLibrary(tmpDir("cfg"));
    const lib = tmpDir("lib");
    const elsewhere = tmpDir("importante");
    const key = "0123456789abcdef01234567";
    touch(path.join(elsewhere, key + ".jpg"));
    const cache = path.join(lib, ".helmet-previews");
    link(elsewhere, cache);
    eq(await L.cacheSize([cache]), { bytes: 0, files: 0 });
    assert.strictEqual(await L.clearCache([cache]), 0);
    assert.throws(() => L.ensureCacheDir(cache), /atalho/);
    L.removePreview({ dir: cache, base: path.join(cache, key) });
    assert.ok(fs.existsSync(path.join(elsewhere, key + ".jpg")));
});

test("cache: chave igual para a mesma biblioteca copiada em outro lugar (modo biblioteca)", () => {
    const L = loadLibrary(tmpDir("cfg"));
    const file = (root) => ({ path: path.join(root, "SFX", "boom.wav"), size: 10, mtime: 1700000000000 });
    const a = L.cacheInfo({ cacheMode: "library", libraries: [{ path: "D:\\Bib" }] }, file("D:\\Bib"));
    const b = L.cacheInfo({ cacheMode: "library", libraries: [{ path: "E:\\Copia" }] }, file("E:\\Copia"));
    assert.strictEqual(a.key, b.key);
    assert.ok(/^[0-9a-f]{24}$/.test(a.key));
});

test("previews: .json de cache vindo de outro PC só é aceito no formato esperado", () => {
    const ctx = loadPanel(["client/js/library.js", "client/js/previews.js"], { APPDATA: tmpDir("cfg") });
    const valid = ctx.HLPreviews._validMeta;
    assert.ok(valid({ v: 1, hasThumb: true, duration: 3.2, videoExt: "mp4", title: "Título", peaks: [[0, 1]] }));
    assert.ok(!valid({ v: 1, videoExt: "../../Windows/win.ini" }));
    assert.ok(!valid({ v: 1, duration: "3" }));
    assert.ok(!valid({ v: 1, title: { html: "<b>" } }));
    assert.ok(!valid({ v: 2 }));
    assert.ok(!valid(null));
});

test("previews: cache corrompido ou incompleto é refeito, sem travar", async () => {
    const ctx = loadPanel(["client/js/library.js", "client/js/previews.js"], { APPDATA: tmpDir("cfg") });
    const readCached = ctx.HLPreviews._readCached;
    const dir = tmpDir("cache");
    const ci = { dir, base: path.join(dir, "0123456789abcdef01234567") };
    assert.strictEqual(await readCached(ci), null, "sem cache");
    touch(ci.base + ".json", "{ isso não é json");
    assert.strictEqual(await readCached(ci), null, "json estragado");
    touch(ci.base + ".json", JSON.stringify({ v: 1, hasThumb: true, duration: 2 }));
    assert.strictEqual(await readCached(ci), null, "falta a miniatura .jpg");
    touch(ci.base + ".jpg", "x");
    const res = await readCached(ci);
    assert.ok(res && /^file:\/\//.test(res.thumb) && res.meta.duration === 2);
});

// ---------------------------------------------------------------------------
// MOGRT (.zip)
// ---------------------------------------------------------------------------

// Monta um .zip simples. entries: [{ name, data, deflate, fakeSize }]
function makeZip(entries) {
    const zlib = require("zlib");
    const locals = [], centrals = [];
    let offset = 0;
    entries.forEach((e) => {
        const raw = Buffer.from(e.data);
        const body = e.deflate ? zlib.deflateRawSync(raw) : raw;
        const name = Buffer.from(e.name, "utf8");
        const size = e.fakeSize != null ? e.fakeSize : raw.length;
        const lh = Buffer.alloc(30);
        lh.writeUInt32LE(0x04034b50, 0); lh.writeUInt16LE(e.deflate ? 8 : 0, 8);
        lh.writeUInt32LE(body.length, 18); lh.writeUInt32LE(size, 22); lh.writeUInt16LE(name.length, 26);
        const ch = Buffer.alloc(46);
        ch.writeUInt32LE(0x02014b50, 0); ch.writeUInt16LE(e.deflate ? 8 : 0, 10);
        ch.writeUInt32LE(body.length, 20); ch.writeUInt32LE(size, 24); ch.writeUInt16LE(name.length, 28);
        ch.writeUInt32LE(offset, 42);
        locals.push(lh, name, body);
        centrals.push(ch, name);
        offset += 30 + name.length + body.length;
    });
    const cd = Buffer.concat(centrals);
    const end = Buffer.alloc(22);
    end.writeUInt32LE(0x06054b50, 0); end.writeUInt16LE(entries.length, 8); end.writeUInt16LE(entries.length, 10);
    end.writeUInt32LE(cd.length, 12); end.writeUInt32LE(offset, 16);
    return Buffer.concat(locals.concat([cd, end]));
}

test("mogrt: acha miniatura, vídeo e título em pt-BR", async () => {
    const L = loadLibrary(tmpDir("cfg"));
    const file = path.join(tmpDir("mogrt"), "Título 🎬.mogrt");
    const def = { capsuleNameLocalized: { strDB: [{ localeString: "en_US", str: "Lower Third" }, { localeString: "pt_BR", str: "Terço Inferior" }] } };
    fs.writeFileSync(file, makeZip([
        { name: "thumb_de_DE.png", data: "alemão" },
        { name: "thumb.png", data: "png padrão", deflate: true },
        { name: "thumb.mp4", data: "vídeo", deflate: true },
        { name: "definition.json", data: "﻿" + JSON.stringify(def), deflate: true }
    ]));
    const info = await L.inspectMogrt(file);
    assert.strictEqual(info.image.name, "thumb.png");
    assert.strictEqual(info.video.name, "thumb.mp4");
    assert.strictEqual(info.title, "Terço Inferior");
    assert.strictEqual((await L.readZipEntry(file, info.image)).toString(), "png padrão");
});

test("mogrt: 'bomba de descompressão' para no limite em vez de encher a memória", async () => {
    const L = loadLibrary(tmpDir("cfg"));
    const file = path.join(tmpDir("mogrt"), "bomba.mogrt");
    fs.writeFileSync(file, makeZip([{ name: "thumb.mp4", data: Buffer.alloc(2 * 1024 * 1024), deflate: true, fakeSize: 10 }]));
    const info = await L.inspectMogrt(file);
    await assert.rejects(L.readZipEntry(file, info.video, 64 * 1024), /grande demais/);
});

test("mogrt: arquivo danificado ou com tamanhos falsos é recusado sem travar", async () => {
    const L = loadLibrary(tmpDir("cfg"));
    const dir = tmpDir("mogrt");
    const good = makeZip([{ name: "thumb.png", data: "png" }]);

    fs.writeFileSync(path.join(dir, "vazio.mogrt"), "");
    await assert.rejects(L.inspectMogrt(path.join(dir, "vazio.mogrt")), /não é um \.zip/);

    fs.writeFileSync(path.join(dir, "texto.mogrt"), "isto não é zip nenhum, só texto qualquer aqui");
    await assert.rejects(L.inspectMogrt(path.join(dir, "texto.mogrt")), /não é um \.zip/);

    const hugeDir = Buffer.from(good);
    hugeDir.writeUInt32LE(0xFFFFFFF0, hugeDir.length - 22 + 12);     // índice de ~4 GB
    fs.writeFileSync(path.join(dir, "indice.mogrt"), hugeDir);
    await assert.rejects(L.inspectMogrt(path.join(dir, "indice.mogrt")), /índice/);

    const farEntry = Buffer.from(good);
    const cdStart = farEntry.readUInt32LE(farEntry.length - 22 + 16);
    farEntry.writeUInt32LE(0x7FFFFFFF, cdStart + 42);                 // entrada "fora" do arquivo
    fs.writeFileSync(path.join(dir, "fora.mogrt"), farEntry);
    const info = await L.inspectMogrt(path.join(dir, "fora.mogrt"));
    assert.strictEqual(info.image, null);

    const bigImage = makeZip([{ name: "thumb.png", data: "x", fakeSize: 500 * 1024 * 1024 }]);
    fs.writeFileSync(path.join(dir, "grande.mogrt"), bigImage);
    assert.strictEqual((await L.inspectMogrt(path.join(dir, "grande.mogrt"))).image, null, "miniatura acima do limite é ignorada");
});

// ---------------------------------------------------------------------------
// Programas do sistema
// ---------------------------------------------------------------------------

test("processos: nenhum exec com texto; attrib/explorer pelo caminho completo", () => {
    const src = Object.values(panelSources()).join("\n");
    assert.ok(!/\bcp\.exec\(|\bexecSync\(|shell\s*:\s*true/.test(src), "exec com texto ou shell: true");
    assert.ok(!/\beval\(|new Function\(|setTimeout\(\s*["']/.test(src), "eval / new Function / setTimeout com texto");
    const L = loadPanel(["client/js/library.js"], { SystemRoot: "D:\\WinTeste", APPDATA: tmpDir("cfg") }).HLLibrary;
    assert.strictEqual(L._programs.attrib(), path.join("D:\\WinTeste", "System32", "attrib.exe"));
    assert.strictEqual(L._programs.explorer(), path.join("D:\\WinTeste", "explorer.exe"));
    const L2 = loadPanel(["client/js/library.js"], { SystemRoot: "relativo", windir: "", APPDATA: tmpDir("cfg") }).HLLibrary;
    assert.strictEqual(L2._programs.explorer(), path.join("C:\\Windows", "explorer.exe"), "pasta do Windows relativa é ignorada");
});

// ---------------------------------------------------------------------------
// Interface
// ---------------------------------------------------------------------------

test("interface: nenhum innerHTML/outerHTML/insertAdjacentHTML/document.write no painel", () => {
    const dir = path.join(ROOT, "client", "js");
    fs.readdirSync(dir).filter((n) => n.endsWith(".js") && n !== "CSInterface.js").forEach((n) => {
        const code = fs.readFileSync(path.join(dir, n), "utf8").replace(/\/\/.*$/gm, "");   // ignora comentários
        assert.ok(!/\.(innerHTML|outerHTML)\s*[+]?=|insertAdjacentHTML|document\.write/.test(code), n);
    });
});

test("interface: todos os scripts estão no index.html, na ordem certa", () => {
    const html = read("client/index.html");
    const order = [...html.matchAll(/<script src="js\/([^"]+)"/g)].map((m) => m[1]);
    const files = Object.keys(panelSources()).concat("CSInterface.js").sort();
    eq(order.slice().sort(), files, "script faltando ou sobrando no index.html");
    assert.strictEqual(order[0], "config.js", "config.js tem que vir primeiro");
    const pos = (n) => order.indexOf(n);
    ["library.js", "previews.js", "player.js", "bridge.js"].forEach((n) => assert.ok(pos(n) < pos("app.js"), n + " antes do app.js"));
    UI_FILES.forEach((n) => assert.ok(pos(n) >= pos("app.js"), n + " depois do app.js"));
    assert.strictEqual(order[order.length - 1], "main.js", "main.js tem que vir por último");
    // um arquivo da interface só pode chamar app.x de algo que algum arquivo registra
    const src = panelSources();
    const registered = new Set();
    UI_FILES.forEach((n) => { for (const m of src[n].matchAll(/^\s*app\.([\w$]+) = /gm)) registered.add(m[1]); });
    UI_FILES.forEach((n) => {
        for (const m of src[n].replace(/^\s*\/\/.*$/gm, "").matchAll(/\bapp\.([\w$]+)/g)) assert.ok(registered.has(m[1]), n + " usa app." + m[1] + ", que ninguém registra");
    });
    // e não pode usar direto (sem app.) um nome que só existe em outro arquivo
    const topNames = {};
    UI_FILES.forEach((n) => { for (const m of src[n].matchAll(/^    (?:function|var) ([\w$]+)/gm)) topNames[m[1]] = n; });
    UI_FILES.forEach((n) => {
        const code = src[n].replace(/^\s*\/\/.*$/gm, "").replace(/"(?:[^"\\]|\\.)*"/g, '""');
        const own = new Set([...code.matchAll(/(?:function|var|,)\s+([\w$]+)\s*(?:=|\()/g)].map((m) => m[1]));
        Object.keys(topNames).forEach((name) => {
            if (name === "app" || topNames[name] === n || own.has(name)) return;
            // (nome seguido de ":" é campo de objeto, não uso)
            const re = new RegExp("(^|[^.\\w$])" + name.replace(/\$/g, "\\$") + "(?![\\w$])(?!\\s*:)", "m");
            assert.ok(!re.test(code), n + " usa " + name + " (de " + topNames[name] + ") sem importar de app");
        });
    });
});

test("interface: CSP no index.html bloqueia script embutido e não libera internet", () => {
    const html = read("client/index.html");
    const m = html.match(/http-equiv="Content-Security-Policy" content="([^"]+)"/);
    assert.ok(m, "CSP presente");
    const script = m[1].split(";").map((x) => x.trim()).find((x) => x.startsWith("script-src"));
    assert.ok(!/unsafe-inline|unsafe-eval|https?:|\*/.test(script), script);
    assert.ok(!/https?:/.test(m[1]), "nada da internet");
    assert.ok(!/<script>|\son[a-z]+=/i.test(html.replace(/<!--[\s\S]*?-->/g, "")), "nenhum script embutido no HTML");
});

// ---------------------------------------------------------------------------
// Host (index.jsx) e ponte painel -> host, num Premiere simulado
// ---------------------------------------------------------------------------

const mock = require("./premiere-mock");

function loadHost(opts) {
    const ctx = mock.makeContext(opts);
    vm.createContext(ctx);
    vm.runInContext(read("host/index.jsx"), ctx, { filename: "index.jsx" });
    return ctx;
}

// Painel com a ponte; o evalScript roda o texto no host simulado.
function loadBridge(hostCtx) {
    const ctx = {
        console: { log() {}, warn() {}, error() {} }, setTimeout, Promise, JSON, RegExp, String,
        __adobe_cep__: {},
        SystemPath: { EXTENSION: "extension" },
        CSInterface: function () {
            this.getSystemPath = () => ROOT;
            this.evalScript = (script, cb) => {
                let out;
                try { out = String(vm.runInContext(script, hostCtx)); } catch (e) { out = "EvalScript error."; }
                setTimeout(() => cb(out), 0);
            };
        }
    };
    ctx.window = ctx;
    ctx.console = { log() {}, warn() {}, error() {} };
    vm.createContext(ctx);
    vm.runInContext(read("client/js/config.js"), ctx, { filename: "config.js" });
    vm.runInContext(read("client/js/bridge.js") + "\nthis.HLBridge = HLBridge;", ctx, { filename: "bridge.js" });
    return ctx.HLBridge;
}

const HARD_NAMES = [
    "Zé Ninguém — áudio.wav",
    "100% (final); versão 2 & cia.wav",
    "D’Ávila 'aspas' x.wav",
    "linha\u2028separador\u2029parágrafo.wav",
    "emoji 🎬 e chinês 剪辑.mp4",
    "${injeção}`); alert(1); x.wav"
];

test("host: só responde JSON {ok, data, error}, inclusive a versão", () => {
    const host = loadHost();
    const v = JSON.parse(host.hl_getHostVersion());
    assert.strictEqual(v.ok, true);
    assert.ok(/^\d+\.\d+\.\d+$/.test(v.data.version));
    const tricky = ["a\"b\\c", "linha\nnova\ttab", "\u2028\u2029", "emoji 🎬", "\u0001"];
    eq(JSON.parse(host.hl_json({ list: tricky, n: 1.5, t: true, z: null })), { list: tricky, n: 1.5, t: true, z: null });
});

test("host: arquivo que não existe vira {ok:false} com mensagem clara", () => {
    const host = loadHost();
    const r = JSON.parse(host.hl_add("C:\\não\\existe.wav", "audio", true, "Helmet Library", ""));
    assert.strictEqual(r.ok, false);
    assert.ok(/Arquivo não encontrado/.test(r.error));
});

test("host: erro inesperado do Premiere vira {ok:false}, sem travar", () => {
    const host = loadHost();
    const file = path.join(tmpDir("midia"), "a.wav");
    touch(file);
    host.app.project.importFiles = () => { throw new Error("falha interna"); };
    const r = JSON.parse(host.hl_add(file, "audio", true, "Helmet Library", ""));
    assert.strictEqual(r.ok, false);
    assert.ok(/^Erro ao adicionar: .*falha interna/.test(r.error));
});

test("ponte: nomes difíceis chegam intactos ao Premiere e voltam na resposta", async () => {
    const host = loadHost();
    const bridge = loadBridge(host);
    const dir = tmpDir("midia");
    for (const name of HARD_NAMES) {
        const file = path.join(dir, name);
        touch(file);
        const data = await bridge.call("hl_add", [file, name.endsWith(".mp4") ? "video" : "audio", false, "Helmet Library", "Sons/Sub"]);
        assert.strictEqual(data.where, "project");
        assert.strictEqual(data.name, name);
        assert.strictEqual(host.app.project.imports[host.app.project.imports.length - 1], path.resolve(file));
    }
    const lib = host.app.project.rootItem.children[0];
    assert.strictEqual(lib.name, "Helmet Library");
    assert.strictEqual(lib.children[0].name, "Sons");
    assert.strictEqual(lib.children[0].children[0].name, "Sub");
    assert.strictEqual(lib.children[0].children[0].children.length, HARD_NAMES.length);
});

test("ponte: funções fora da lista são recusadas antes de chegar ao Premiere", async () => {
    const bridge = loadBridge(loadHost());
    await assert.rejects(bridge.call("app.quit", []), /não permitida/);
    assert.throws(() => bridge._buildScript("hl_add);app.quit(", []), /não permitida/);
    assert.strictEqual(bridge._toScriptLiteral("a\u2028b"), "\"a\\u2028b\"");
});

test("ponte: host que não carregou dá mensagem clara", async () => {
    const empty = mock.makeContext();
    vm.createContext(empty);
    const bridge = loadBridge(empty);
    await assert.rejects(bridge.call("hl_add", ["x", "audio", true, "", ""]), /não carregou/);
});

test("host: o mesmo arquivo duas vezes na mesma bin é reaproveitado", async () => {
    const host = loadHost();
    const bridge = loadBridge(host);
    const file = path.join(tmpDir("midia"), "boom.wav");
    touch(file);
    const a = await bridge.call("hl_add", [file, "audio", false, "Helmet Library", ""]);
    const b = await bridge.call("hl_add", [file, "audio", false, "Helmet Library", ""]);
    assert.strictEqual(a.reused, false);
    assert.strictEqual(b.reused, true);
    assert.strictEqual(host.app.project.imports.length, 1);
});

test("host: timeline na primeira trilha livre; cria trilha quando todas estão ocupadas", async () => {
    const seq = new mock.Sequence(1, 1);
    const host = loadHost({ sequence: seq });
    const bridge = loadBridge(host);
    const dir = tmpDir("midia");
    const a = path.join(dir, "a.wav"), v = path.join(dir, "v.mp4");
    touch(a); touch(v);
    eq((await bridge.call("hl_add", [a, "audio", true, "", ""])).track, "A1");
    eq((await bridge.call("hl_add", [a, "audio", true, "", ""])).track, "A2", "A1 ocupada → cria A2");
});

test("host: vídeo usa V e A livres no mesmo número de trilha", async () => {
    const seq = new mock.Sequence(2, 2);
    const host = loadHost({ sequence: seq });
    const bridge = loadBridge(host);
    const dir = tmpDir("midia");
    const a = path.join(dir, "a.wav"), v = path.join(dir, "v.mp4");
    touch(a); touch(v);
    eq((await bridge.call("hl_add", [a, "audio", true, "", ""])).track, "A1");
    eq((await bridge.call("hl_add", [v, "video", true, "", ""])).track, "V2", "A1 ocupada → V2/A2");
    // Comportamento antigo, mantido de propósito (registrado na AUDITORIA, item P1): se as
    // trilhas criadas não deixarem V e A livres no mesmo número, o vídeo recusa com aviso.
    const seq2 = new mock.Sequence(1, 1);
    const host2 = loadHost({ sequence: seq2 });
    const bridge2 = loadBridge(host2);
    await bridge2.call("hl_add", [a, "audio", true, "", ""]);
    await bridge2.call("hl_add", [a, "audio", true, "", ""]);
    await assert.rejects(bridge2.call("hl_add", [v, "video", true, "", ""]), /Não há trilha livre/);
});

test("host: sem sequência aberta, importa só no projeto e avisa", async () => {
    const host = loadHost({ sequence: null });
    const file = path.join(tmpDir("midia"), "a.wav");
    touch(file);
    const data = await loadBridge(host).call("hl_add", [file, "audio", true, "", ""]);
    assert.strictEqual(data.noSequence, true);
    assert.strictEqual(data.where, "project");
});

test("host: MOGRT vai para a timeline com importMGT; no projeto avisa se não der", async () => {
    const host = loadHost();
    const bridge = loadBridge(host);
    const file = path.join(tmpDir("midia"), "Título Ç.mogrt");
    touch(file);
    const t = await bridge.call("hl_add", [file, "mogrt", true, "", ""]);
    assert.strictEqual(t.where, "timeline");
    assert.strictEqual(t.track, "V1");
    assert.strictEqual(host.app.project.activeSequence.mgts[0].file, path.resolve(file));
    await assert.rejects(bridge.call("hl_add", [file, "mogrt", false, "", ""]), /só aceita MOGRT direto na timeline/);
});

// ---------------------------------------------------------------------------
// Execução
// ---------------------------------------------------------------------------

(async () => {
    for (const t of pending) {
        try {
            await t.fn();
            passed++;
            console.log("  ok   " + t.name);
        } catch (e) {
            failed++;
            console.log("  FALHOU " + t.name + "\n         " + (e && e.stack || e).toString().split("\n").slice(0, 4).join("\n         "));
        }
    }
    try { fs.rmSync(TMP, { recursive: true, force: true }); } catch (e) { /* ignora */ }
    console.log("\n" + passed + " ok, " + failed + " falharam");
    process.exit(failed ? 1 : 0);
})();
