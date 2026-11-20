// client/js/player.js — Helmet Library
// Player da parte de baixo do painel.
//   áudio  → Web Audio (permite Pitch e Reverse só no preview) + forma de onda com cursor
//   vídeo  → <video> (inclui o vídeo de preview do MOGRT)
//   imagem → <img> (GIF anima)
// Exposto como window.HLPlayer.

(function () {
    "use strict";

    var P = window.HLPreviews;
    var els = {};
    var state = {
        mode: null,          // "audio" | "video" | "image" | "none"
        file: null,
        // áudio
        buffer: null, reversed: null, source: null, gain: null,
        startedAt: 0, startPos: 0, pos: 0, playing: false, peaks: null, pendingPlay: false,
        audioEl: null,       // fallback quando o Web Audio não decodifica
        loop: false, volume: 0.8, pitch: 0, reverse: false,
        raf: 0, token: 0
    };
    var onState = function () { };

    function $(id) { return document.getElementById(id); }

    function multi(ids) {
        var nodes = ids.map($).filter(Boolean);
        return {
            set textContent(v) { nodes.forEach(function (n) { n.textContent = v; }); },
            get textContent() { return nodes.length ? nodes[0].textContent : ""; }
        };
    }

    function init(opts) {
        els = {
            stage: $("playerStage"), wave: $("waveCanvas"), cursor: $("waveCursor"),
            video: $("playerVideo"), image: $("playerImage"), empty: $("playerEmpty"),
            btnPlay: $("btnPlay"),
            volume: $("volumeRange"), btnMute: $("btnMute"),
            // minutagem: só junto da barra de progresso do vídeo (no áudio não aparece)
            cur: multi(["timeCur"]), total: multi(["timeTotal"]),
            player: $("player"),
            pitchRow: $("pitchRow"), pitch: $("pitchRange"), pitchVal: $("pitchVal"),
            reverse: $("reverseCheckbox"),
            seek: $("seekBar"), seekFill: $("seekFill"), seekThumb: $("seekThumb"), seekTip: $("seekTip")
        };
        state.volume = opts && opts.volume != null ? opts.volume : 0.8;
        els.volume.value = state.volume;
        onState = (opts && opts.onState) || onState;

        els.btnPlay.addEventListener("click", toggle);
        els.volume.addEventListener("input", function () { setVolume(parseFloat(els.volume.value)); });
        els.btnMute.addEventListener("click", function () {
            if (state.volume > 0) { state.lastVol = state.volume; setVolume(0); } else setVolume(state.lastVol || 0.8);
            els.volume.value = state.volume;
        });
        els.pitch.addEventListener("input", function () { setPitch(parseInt(els.pitch.value, 10)); });
        // duplo clique no controle de pitch volta para 0
        els.pitch.addEventListener("dblclick", function () { els.pitch.value = 0; setPitch(0); });
        els.reverse.addEventListener("change", function () { setReverse(els.reverse.checked); });

        // buscar: arrastar na barra de progresso (áudio e vídeo) ou na forma de onda (áudio)
        var seekEl = null;
        var fracAt = function (el, e) {
            var r = el.getBoundingClientRect();
            return Math.min(1, Math.max(0, (e.clientX - r.left) / r.width));
        };
        els.stage.addEventListener("mousedown", function (e) {
            if (state.mode !== "audio") return;
            seekEl = els.stage; seekFrac(fracAt(seekEl, e));
        });
        // clique no vídeo = tocar/pausar
        els.video.addEventListener("click", toggle);
        els.seek.addEventListener("mousedown", function (e) {
            if (!duration()) return;
            e.preventDefault();
            seekEl = els.seek; els.seek.classList.add("dragging");
            seekFrac(fracAt(seekEl, e));
        });
        // dica com a minutagem exata do ponto sob o mouse
        els.seek.addEventListener("mousemove", function (e) {
            var d = duration();
            if (!d) { els.seekTip.hidden = true; return; }
            var f = fracAt(els.seek, e);
            els.seekTip.textContent = fmt(f * d);
            els.seekTip.style.left = (f * 100) + "%";
            els.seekTip.hidden = false;
        });
        els.seek.addEventListener("mouseleave", function () { if (seekEl !== els.seek) els.seekTip.hidden = true; });
        window.addEventListener("mousemove", function (e) { if (seekEl) seekFrac(fracAt(seekEl, e)); });
        window.addEventListener("mouseup", function () {
            if (seekEl === els.seek) { els.seek.classList.remove("dragging"); els.seekTip.hidden = true; }
            seekEl = null;
        });

        els.video.addEventListener("timeupdate", tick);
        els.video.addEventListener("play", function () { setPlayingUi(true); });
        els.video.addEventListener("pause", function () { setPlayingUi(false); });
        els.video.addEventListener("ended", function () { setPlayingUi(false); });
        els.video.addEventListener("loadedmetadata", function () { els.total.textContent = fmt(els.video.duration); });

        if (window.ResizeObserver) new ResizeObserver(redrawWave).observe(els.stage);
        // painel estreito: Pitch/Reverse descem para uma segunda linha
        if (window.ResizeObserver && els.player) new ResizeObserver(function () {
            els.player.classList.toggle("narrow", els.player.clientWidth < 600);
        }).observe(els.player);
        window.addEventListener("resize", redrawWave);
        show("none");
    }

    // ---------- carregar ----------

    // file: entrada da biblioteca; prev: resultado do HLPreviews.get (pode ser null); autoplay: bool
    function load(file, prev, autoplay) {
        stopAll();
        var token = ++state.token;
        state.file = file;
        state.buffer = state.reversed = null;
        state.peaks = null;
        state.pos = 0;
        els.cur.textContent = fmt(0);
        els.total.textContent = fmt(prev && prev.meta && prev.meta.duration || 0);

        if (!file) { show("none"); return; }

        if (file.kind === "audio" && file.canPreview) {
            show("audio");
            state.peaks = prev && prev.meta && prev.meta.peaks || null;
            redrawWave();
            // arquivo muito grande: decodificar inteiro na memória travaria o painel
            var decoding = file.size > P.MAX_AUDIO_BYTES ? Promise.reject(new Error("grande demais")) : P.decodeFile(file.path);
            decoding.then(function (buf) {
                if (token !== state.token) return;
                state.buffer = buf;
                els.total.textContent = fmt(buf.duration);
                if (state.reverse) state.reversed = reverseBuffer(buf);
                if (autoplay || state.pendingPlay) { state.pendingPlay = false; play(); }
            }, function () {
                if (token !== state.token) return;
                // sem Web Audio (ou arquivo grande): toca pelo elemento <audio> (sem pitch/reverse)
                var a = new Audio(window.HLLibrary.toFileUrl(file.path));
                a.volume = state.volume;
                a.addEventListener("ended", function () { if (state.loop) { a.currentTime = 0; a.play(); } else setPlayingUi(false); });
                a.addEventListener("loadedmetadata", function () { els.total.textContent = fmt(a.duration); });
                state.audioEl = a;
                if (autoplay || state.pendingPlay) { state.pendingPlay = false; play(); }
            });
            return;
        }

        var videoUrl = null;
        if (file.kind === "video" && file.canPreview && !(prev && prev.meta && prev.meta.error)) videoUrl = window.HLLibrary.toFileUrl(file.path);
        if (file.kind === "mogrt" && prev && prev.video) videoUrl = prev.video;
        if (videoUrl) {
            show("video");
            els.video.loop = state.loop;
            els.video.volume = state.volume;
            els.video.src = videoUrl;
            if (prev && prev.thumb) els.video.poster = prev.thumb; else els.video.removeAttribute("poster");
            if (autoplay) els.video.play().catch(function () { });
            return;
        }

        if (file.kind === "image" && file.canPreview && !(prev && prev.meta && prev.meta.error)) {
            show("image");
            els.image.src = window.HLLibrary.toFileUrl(file.path);
            return;
        }
        if (prev && prev.thumb) {
            show("image");
            els.image.src = prev.thumb;
            return;
        }
        show("none", file);
    }

    // atualiza a forma de onda quando o preview termina de ser gerado depois do clique
    function updatePreview(file, prev) {
        if (!state.file || file.path !== state.file.path) return;
        if (state.mode === "audio" && prev && prev.meta && prev.meta.peaks) {
            state.peaks = prev.meta.peaks;
            redrawWave();
        } else if (state.mode === "none" || (state.mode === "image" && file.kind === "mogrt")) {
            load(file, prev, false);
        }
    }

    function show(mode, file) {
        state.mode = mode;
        els.stage.className = "player-stage mode-" + mode;
        if (els.player) els.player.classList.toggle("audio", mode === "audio");
        els.pitchRow.classList.toggle("disabled", mode !== "audio");
        var media = mode === "audio" || mode === "video";
        els.btnPlay.disabled = !media;
        if (mode !== "video") { els.video.pause(); els.video.removeAttribute("src"); try { els.video.load(); } catch (e) { } }
        if (mode !== "image") els.image.removeAttribute("src");
        if (mode === "none") {
            els.empty.textContent = file ? "Sem pré-visualização para ." + file.ext + ". Dá para adicionar mesmo assim." : "Selecione um arquivo para pré-visualizar.";
        }
        setPlayingUi(false);
        drawCursor(0);
        onState(mode);
    }

    // ---------- reprodução ----------

    function rate() { return Math.pow(2, state.pitch / 12); }

    function duration() {
        if (state.mode === "video") return els.video.duration || 0;
        if (state.buffer) return state.buffer.duration;
        if (state.audioEl) return state.audioEl.duration || 0;
        return 0;
    }

    // Áudio: state.pos é sempre a posição no arquivo ORIGINAL (segundos), mesmo no reverse.
    // Tocando: posição = startPos ± (tempo decorrido × velocidade).
    function audioPos() {
        if (!state.buffer) return 0;
        var d = state.buffer.duration;
        if (!state.playing) return state.pos;
        var el = (P.audioContext().currentTime - state.startedAt) * rate();
        var p = state.reverse ? state.startPos - el : state.startPos + el;
        if (state.loop && d) p = ((p % d) + d) % d;
        return Math.min(d, Math.max(0, p));
    }

    function position() {
        if (state.mode === "video") return els.video.currentTime || 0;
        if (state.audioEl) return state.audioEl.currentTime || 0;
        return audioPos();
    }

    function play() {
        if (state.mode === "video") { els.video.play().catch(function () { }); return; }
        if (state.mode !== "audio") return;
        if (state.audioEl) {
            state.audioEl.play().then(function () { setPlayingUi(true); loop(); }, function () { });
            return;
        }
        if (!state.buffer) { state.pendingPlay = true; return; }
        var ac = P.audioContext();
        if (ac.state === "suspended") ac.resume();
        stopSource();
        var d = state.buffer.duration;
        // chegou ao fim (ou ao começo, no reverse): recomeça
        if (!state.reverse && state.pos >= d - 0.01) state.pos = 0;
        if (state.reverse && state.pos <= 0.01) state.pos = d;
        var buf = state.reverse ? (state.reversed || (state.reversed = reverseBuffer(state.buffer))) : state.buffer;
        var src = ac.createBufferSource();
        src.buffer = buf;
        src.playbackRate.value = rate();
        src.loop = state.loop;
        if (!state.gain) { state.gain = ac.createGain(); state.gain.connect(ac.destination); }
        state.gain.gain.value = state.volume;
        src.connect(state.gain);
        var offsetInBuf = state.reverse ? d - state.pos : state.pos;
        src.start(0, Math.min(Math.max(0, offsetInBuf), Math.max(0, d - 0.001)));
        src.onended = function () {
            if (state.source !== src) return;
            state.source = null;
            state.playing = false;
            state.pos = state.reverse ? d : 0;
            setPlayingUi(false);
            tick();
        };
        state.source = src;
        state.startedAt = ac.currentTime;
        state.startPos = state.pos;
        state.playing = true;
        setPlayingUi(true);
        loop();
        tick();
    }

    function pause() {
        state.pendingPlay = false;
        if (state.mode === "video") { els.video.pause(); return; }
        if (state.audioEl) { state.audioEl.pause(); setPlayingUi(false); return; }
        if (!state.playing) return;
        state.pos = audioPos();
        stopSource();
        state.playing = false;
        setPlayingUi(false);
        tick();
    }

    function isPlaying() {
        if (state.mode === "video") return !els.video.paused;
        if (state.audioEl) return !state.audioEl.paused;
        return state.playing;
    }

    function toggle() {
        if (isPlaying()) pause(); else play();
    }

    function stop() {
        state.pendingPlay = false;
        if (state.mode === "video") { els.video.pause(); els.video.currentTime = 0; tick(); return; }
        if (state.audioEl) { state.audioEl.pause(); state.audioEl.currentTime = 0; }
        stopSource();
        state.playing = false;
        state.pos = 0;
        setPlayingUi(false);
        tick();
    }

    function stopSource() {
        if (state.source) {
            var s = state.source;
            state.source = null;
            try { s.onended = null; s.stop(); } catch (e) { }
            try { s.disconnect(); } catch (e) { }
        }
    }

    function stopAll() {
        stopSource();
        state.playing = false;
        state.pendingPlay = false;
        if (state.audioEl) { try { state.audioEl.pause(); } catch (e) { } state.audioEl = null; }
        try { els.video.pause(); } catch (e) { }
        cancelAnimationFrame(state.raf);
    }

    function seekFrac(frac) {
        var d = duration();
        if (!d) return;
        var t = frac * d;
        if (state.mode === "video") { els.video.currentTime = t; return; }
        if (state.audioEl) { state.audioEl.currentTime = t; return; }
        var wasPlaying = state.playing;
        stopSource();
        state.playing = false;
        state.pos = t;
        tick();
        if (wasPlaying) play();
    }

    function loop() {
        cancelAnimationFrame(state.raf);
        var step = function () {
            tick();
            if (isPlaying()) state.raf = requestAnimationFrame(step);
        };
        state.raf = requestAnimationFrame(step);
    }

    function tick() {
        var d = duration();
        var t = position();
        els.cur.textContent = fmt(t);
        drawCursor(d ? t / d : 0);
    }

    function drawCursor(frac) {
        var pct = (Math.min(1, Math.max(0, frac || 0)) * 100) + "%";
        els.cursor.style.left = pct;
        els.cursor.style.display = state.mode === "audio" ? "block" : "none";
        els.seekFill.style.width = pct;
        els.seekThumb.style.left = pct;
        els.seek.classList.toggle("disabled", !(state.mode === "audio" || state.mode === "video"));
    }

    function setPlayingUi(on) {
        els.btnPlay.classList.toggle("playing", !!on);
        els.btnPlay.title = on ? "Pausar (espaço)" : "Tocar (espaço)";
        els.btnPlay.querySelector("use").setAttribute("href", on ? "#i-pause" : "#i-play");
    }

    function setVolume(v) {
        state.volume = v;
        if (state.gain) state.gain.gain.value = v;
        if (state.audioEl) state.audioEl.volume = v;
        els.video.volume = v;
        els.btnMute.querySelector("use").setAttribute("href", v > 0 ? "#i-volume" : "#i-mute");
        onState("volume", v);
    }

    function setPitch(semi) {
        var wasPlaying = state.playing;
        if (wasPlaying) pause();
        state.pitch = semi;
        els.pitchVal.textContent = (semi > 0 ? "+" : "") + semi;
        if (state.audioEl) { state.audioEl.preservesPitch = false; state.audioEl.playbackRate = rate(); }
        if (wasPlaying) play();
    }

    function setReverse(on) {
        var wasPlaying = state.playing;
        if (wasPlaying) pause();
        state.reverse = on;
        els.stage.classList.toggle("reversed", on);
        if (wasPlaying) play();
    }

    function reverseBuffer(buf) {
        var ac = P.audioContext();
        var out = ac.createBuffer(buf.numberOfChannels, buf.length, buf.sampleRate);
        for (var c = 0; c < buf.numberOfChannels; c++) {
            var src = buf.getChannelData(c), dst = out.getChannelData(c);
            for (var i = 0, n = src.length; i < n; i++) dst[n - 1 - i] = src[i];
        }
        return out;
    }

    function redrawWave() {
        if (state.mode !== "audio") return;
        var c = els.wave;
        var r = els.stage.getBoundingClientRect();
        var dpr = window.devicePixelRatio || 1;
        c.width = Math.max(1, Math.round(r.width * dpr));
        c.height = Math.max(1, Math.round(r.height * dpr));
        P.drawWave(c, state.peaks, { color: "#EDE3FB", mid: "rgba(200,168,245,0.28)" });
        if (!state.peaks) {
            var g = c.getContext("2d");
            g.fillStyle = "rgba(185,168,203,0.6)";
            g.font = (12 * dpr) + "px Roboto, sans-serif";
            g.textAlign = "center";
            g.fillText("Gerando forma de onda…", c.width / 2, c.height / 2);
        }
    }

    function fmt(sec) {
        sec = Math.max(0, sec || 0);
        var h = Math.floor(sec / 3600), m = Math.floor(sec % 3600 / 60), s = Math.floor(sec % 60);
        var cs = Math.floor((sec - Math.floor(sec)) * 100);
        var two = function (n) { return ("0" + n).slice(-2); };
        return two(h) + ":" + two(m) + ":" + two(s) + ":" + two(cs);
    }

    window.HLPlayer = {
        init: init,
        load: load,
        updatePreview: updatePreview,
        toggle: toggle,
        play: play,
        stop: stop,
        isPlaying: function () { return isPlaying(); },
        stopAll: stopAll,
        currentFile: function () { return state.file; },
        position: function () { return position(); },
        fmt: fmt
    };
})();
