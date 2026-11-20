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
