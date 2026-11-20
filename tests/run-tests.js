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
function loadPanel(files, env) {
    const fakeProcess = Object.create(process);
    fakeProcess.env = Object.assign({}, process.env, env || {});
    const ctx = {
        require, process: fakeProcess, Buffer, console: { log() {}, warn() {}, error() {} },
        setTimeout, clearTimeout, Promise
    };
    ctx.window = ctx;
    vm.createContext(ctx);
    files.forEach((f) => vm.runInContext(read(f), ctx, { filename: f }));
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
    const src = read("client/js/library.js") + read("client/js/main.js") + read("client/js/previews.js") + read("client/js/player.js");
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
