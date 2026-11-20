// client/js/demo.js — Helmet Library
// Só entra em ação fora do Premiere (navegador comum, sem Node): troca o acesso ao disco
// por uma biblioteca de exemplo, para dar para ver e testar o layout.

(function () {
    "use strict";
    var L = window.HLLibrary;
    if (!L || L.hasNode) return;

    var ROOT_A = "D:\\Biblioteca\\Sons";
    var ROOT_B = "D:\\Biblioteca\\Templates";
    var now = Date.now();

    function f(dir, name, size) {
        var t = L.typeOf(name);
        return { name: name, path: dir + "\\" + name, dir: dir, ext: t.ext, kind: t.kind || "unknown", canPreview: false, size: size || 123456, mtime: now };
    }

    var FS = {};
    FS[ROOT_A] = { dirs: ["Whooshes", "Impactos", "Risers"], files: ["Dramatic Approach 01.wav", "Swooshy Approach 01.wav", "Ambiente Cidade.mp3"] };
    FS[ROOT_A + "\\Whooshes"] = { dirs: ["Curtos"], files: ["Whoosh 01.wav", "Whoosh 02.wav", "Whoosh Grave.wav", "Whoosh Agudo.m4a"] };
    FS[ROOT_A + "\\Whooshes\\Curtos"] = { dirs: [], files: ["Swish 01.wav", "Swish 02.wav"] };
    FS[ROOT_A + "\\Impactos"] = { dirs: [], files: ["Hit Cinemático.wav", "Boom.aac"] };
    FS[ROOT_A + "\\Risers"] = { dirs: [], files: ["Riser 10s.wav"] };
    FS[ROOT_B] = { dirs: ["Títulos", "Overlays", "Light Leaks"], files: ["Lower Third Clean.mogrt", "Call to Action.mogrt", "Logo Reveal.aep"] };
    FS[ROOT_B + "\\Títulos"] = { dirs: [], files: ["Título Glitch.mogrt", "Título Minimal.mogrt", "Contador.mogrt"] };
    FS[ROOT_B + "\\Overlays"] = { dirs: [], files: ["Poeira 4K.mov", "Grão de filme.mp4", "Moldura.png", "Setas.gif"] };
    FS[ROOT_B + "\\Light Leaks"] = { dirs: [], files: ["Leak 01.mp4", "Leak 02.mp4", "Leak 03.m4v", "Bokeh.jpg"] };

    function entry(dir) {
        var e = FS[dir];
        if (!e) return { dirs: [], files: [] };
        return {
            dirs: e.dirs.map(function (n) { return { name: n, path: dir + "\\" + n }; }),
            files: e.files.map(function (n) { return f(dir, n); })
        };
    }

    var pathShim = {
        sep: "\\",
        join: function () { return Array.prototype.slice.call(arguments).join("\\").replace(/\\+/g, "\\"); },
        basename: function (p) { return String(p).split("\\").pop(); },
        dirname: function (p) { var a = String(p).split("\\"); a.pop(); return a.join("\\"); },
        relative: function (from, to) {
            if (to.toLowerCase().indexOf(from.toLowerCase()) !== 0) return "..\\x";
            return to.slice(from.length).replace(/^\\/, "");
        }
    };

    var cfg = null;
    L.path = pathShim;
    L.loadConfig = function () {
        if (!cfg) cfg = {
            libraries: [{ id: "a", name: "Sons", path: ROOT_A }, { id: "b", name: "Templates", path: ROOT_B }],
            favorites: [ROOT_A + "\\Dramatic Approach 01.wav"], expanded: [ROOT_A], lastView: { type: "folder", path: ROOT_A },
            cacheMode: "library", useBin: true, mirrorFolders: true, includeSub: false, showUnknown: false,
            autoplay: true, dblClick: "timeline", thumbSize: 168, sidebarWidth: 230, volume: 0.8, filter: "all"
        };
        return cfg;
    };
    L.saveConfig = function () { };
    L.listDir = function (dir) { return Promise.resolve(entry(dir)); };
    L.listDirs = function (dir) { return Promise.resolve(entry(dir).dirs); };
    L.walk = function (dir) {
        var out = [], stack = [dir];
        while (stack.length) {
            var d = stack.shift(), e = entry(d);
            e.dirs.forEach(function (x) { stack.push(x.path); });
            out = out.concat(e.files);
        }
        return Promise.resolve(out);
    };
    L.fileEntry = function (p) { return Promise.resolve(f(pathShim.dirname(p), pathShim.basename(p))); };
    L.exists = function () { return true; };
    L.existsAsync = function () { return Promise.resolve(true); };
    L.isInside = function (child, parent) { return child.toLowerCase() === parent.toLowerCase() || child.toLowerCase().indexOf(parent.toLowerCase() + "\\") === 0; };
    L.samePath = function (a, b) { return a.toLowerCase() === b.toLowerCase(); };
    L.libraryOf = function (c, p) {
        var best = null;
        c.libraries.forEach(function (lib) { if (L.isInside(p, lib.path) && (!best || lib.path.length > best.path.length)) best = lib; });
        return best;
    };
    L.cacheInfo = function () { return { dir: "(modo de demonstração)", key: "", base: "" }; };
    L.systemCacheDir = function () { return "%LOCALAPPDATA%\\Helmet Library\\cache"; };
    L.cacheSize = function () { return Promise.resolve({ bytes: 0, files: 0 }); };
    L.clearCache = function () { return Promise.resolve(0); };
    L.removePreview = function () { };
    L.watch = L.unwatch = L.reveal = L.openFolder = function () { };
    L.watching = function () { return true; };
    L.demo = true;
})();
