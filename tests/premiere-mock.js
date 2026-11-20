// tests/premiere-mock.js
// Imitação MÍNIMA da API do Premiere (app.project, bins, sequência, trilhas, File) para
// rodar o host/index.jsx no Node, fora do Premiere. Só cobre o que os testes usam.
// Não substitui o teste no Premiere de verdade.

"use strict";

const fs = require("fs");
const path = require("path");

const TPS = 254016000000;
const BIN = 2, CLIP = 1;
let nextNodeId = 1000;

function removeFrom(parent, item) {
    if (!parent) return;
    const i = parent.children.indexOf(item);
    if (i >= 0) parent.children.splice(i, 1);
}

function collection(arr) {
    Object.defineProperty(arr, "numItems", { get() { return arr.length; } });
    Object.defineProperty(arr, "numTracks", { get() { return arr.length; } });
    return arr;
}

function time(seconds) { return { seconds: seconds, ticks: String(Math.round(seconds * TPS)) }; }

class Bin {
    constructor(name) { this.type = BIN; this.name = name; this.children = collection([]); this.nodeId = String(nextNodeId++); this.parent = null; }
    createBin(name) { const b = new Bin(name); b.parent = this; this.children.push(b); return b; }
    add(item) { item.parent = this; this.children.push(item); return item; }
    // apagar uma bin apaga tudo o que está dentro dela
    deleteBin() { removeFrom(this.parent, this); this.parent = null; }
}

class ClipItem {
    constructor(file, duration) {
        this.type = CLIP;
        this.name = path.basename(file);
        this.file = file;
        this.duration = duration;
        this.nodeId = String(nextNodeId++);
        this.parent = null;
    }
    moveBin(dest) { removeFrom(this.parent, this); dest.add(this); }
    getMediaPath() { return this.file; }
    getInPoint() { return time(0); }
    getOutPoint() { return time(this.duration); }
}

class Track {
    constructor() { this.clips = collection([]); }
    overwriteClip(item, pos) {
        const start = typeof pos === "object" ? pos.seconds : Number(pos);
        const clips = this.clips;
        const clip = {
            name: item.name, item: item, projectItem: item, start: time(start), end: time(start + item.duration),
            remove() { const i = clips.indexOf(clip); if (i >= 0) clips.splice(i, 1); return 0; }   // 0 = ok, como no Premiere
        };
        clips.push(clip);
    }
}

class Sequence {
    constructor(nv, na) {
        this.videoTracks = collection(Array.from({ length: nv }, () => new Track()));
        this.audioTracks = collection(Array.from({ length: na }, () => new Track()));
        this.playhead = 0;
        this.mgts = [];
        this.name = "Sequência 01";
        this.frameSizeHorizontal = 1920;
        this.frameSizeVertical = 1080;
        this.selection = [];
    }
    getSelection() { return this.selection.slice(); }
    setSelection(list) { this.selection = list.slice(); }
    getPlayerPosition() { return time(this.playhead); }
    importMGT(file, ticks, v, a) {
        this.mgts.push({ file: file, ticks: ticks, v: v, a: a });
        const item = new ClipItem(file, 5);
        const track = this.videoTracks[v];
        track.overwriteClip(item, Number(ticks) / TPS);
        const clip = track.clips[track.clips.length - 1];
        clip.name = path.basename(file, ".mogrt");
        return clip;
    }
}

// Cria o contexto global que o index.jsx espera.
// opts: { sequence: Sequence|null, durations: { ext: segundos }, mogrtInProject: bool }
function makeContext(opts) {
    opts = opts || {};
    const durations = Object.assign({ wav: 3, mp4: 10, png: 0, mogrt: 5 }, opts.durations || {});
    const project = {
        name: "Teste.prproj",
        rootItem: new Bin("root"),
        activeSequence: opts.sequence === undefined ? new Sequence(3, 3) : opts.sequence,
        imports: [],
        get sequences() {
            const list = this.activeSequence ? [this.activeSequence] : [];
            Object.defineProperty(list, "numSequences", { value: list.length });
            return list;
        },
        importFiles(paths, suppress, target) {
            if (/\.mogrt$/i.test(paths[0]) && !opts.mogrtInProject) return false;
            paths.forEach((p) => {
                this.imports.push(p);
                const ext = p.split(".").pop().toLowerCase();
                target.add(new ClipItem(p, durations[ext] || 0));
            });
            return true;
        }
    };
    function File(p) {
        this.fsName = path.resolve(String(p));
        this.exists = fs.existsSync(this.fsName);
        this.displayName = path.basename(this.fsName);
    }
    // Desfazer: cada teste empilha em project.undoStack o que o "Ctrl+Z" deve fazer.
    project.undoStack = [];
    project.undoCount = 0;
    const origCreateBin = project.rootItem.createBin.bind(project.rootItem);
    project.rootItem.createBin = function (name) {
        const b = origCreateBin(name);
        project.undoStack.push(() => b.deleteBin());
        return b;
    };
    const sourceMonitor = {
        item: null,
        getProjectItem() { return this.item; },
        closeClip() { this.item = null; }
    };
    const ctx = {
        app: { project: project, sourceMonitor: sourceMonitor, enableQE() {} },
        qe: {
            project: {
                undo() { project.undoCount++; const f = project.undoStack.pop(); if (f) f(); },
                getActiveSequence() {
                    return {
                        addTracks(nv, _a, na) {
                            for (let i = 0; i < nv; i++) project.activeSequence.videoTracks.push(new Track());
                            for (let i = 0; i < na; i++) project.activeSequence.audioTracks.push(new Track());
                        }
                    };
                }
            }
        },
        File: File,
        ProjectItemType: { BIN: BIN, CLIP: CLIP },
        $: { os: "Windows 10" }
    };
    return ctx;
}

module.exports = { makeContext, Sequence, Track, ClipItem, time };
