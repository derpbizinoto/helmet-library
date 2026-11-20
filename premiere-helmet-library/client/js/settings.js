// client/js/settings.js — Helmet Library
// Janela de configurações.

(function (app) {
    "use strict";

    var CLIENT_VERSION = app.CLIENT_VERSION, L = app.L, P = app.P, cfg = app.cfg, els = app.els,
        state = app.state, h = app.h, fill = app.fill, save = app.save;

    // ======================================================================
    // configurações
    // ======================================================================

    function openSettings() {
        var radios = document.getElementsByName("cacheMode");
        for (var i = 0; i < radios.length; i++) radios[i].checked = radios[i].value === cfg.cacheMode;
        els.setUseBin.checked = !!cfg.useBin;
        els.setMirror.checked = !!cfg.mirrorFolders;
        els.setDblClick.value = cfg.dblClick;
        els.setAutoplay.checked = !!cfg.autoplay;
        els.setUnknown.checked = !!cfg.showUnknown;
        els.langSelect.value = HLI18n.lang();
        updateTexts();
        updateMirrorState();
        els.settings.hidden = false;
    }

    // textos montados pelo código (também refeitos ao trocar o idioma com a janela aberta)
    function updateTexts() {
        els.versionNote.textContent = tr("Helmet Library {0}  ·  configuração em {1}", CLIENT_VERSION, L.demo ? "%APPDATA%\\Helmet Library" : L.appDataDir());
        updateCacheInfo();
    }

    function updateMirrorState() {
        els.setMirror.disabled = !els.setUseBin.checked;
        els.setMirror.closest(".switch-row").style.opacity = els.setUseBin.checked ? "" : "0.45";
    }

    var cacheInfoToken = 0;
    function updateCacheInfo() {
        if (cfg.cacheMode === "library") {
            fill(els.cacheHint, trParts("Os previews ficam numa pasta oculta {0} dentro de cada biblioteca. Copiou a pasta para outro PC ou HD? Os previews vão junto.",
                h("span", { className: "path" }, [L.CACHE_DIR_NAME])));
        } else {
            fill(els.cacheHint, trParts("Os previews ficam em {0}. As pastas da biblioteca não são alteradas.", h("span", { className: "path" }, [L.systemCacheDir()])));
        }
        var token = ++cacheInfoToken;
        L.cacheSize(app.cacheDirs()).then(function (size) {
            if (token !== cacheInfoToken) return;
            els.cacheSize.textContent = size.files ? tr("Ocupando {0} ({1} arquivos)", L.fmtBytes(size.bytes), size.files) : tr("Nenhum preview salvo ainda.");
        }, function (err) {
            if (token !== cacheInfoToken) return;
            els.cacheSize.textContent = tr("Não deu para medir os previews: {0}", trMsg(L.describeError(err, "folder")));
        });
    }

    els.btnSettings.addEventListener("click", openSettings);
    els.settings.addEventListener("mousedown", function (e) { if (e.target === els.settings) els.settings.hidden = true; });
    els.settings.querySelector("[data-close]").addEventListener("click", function () { els.settings.hidden = true; });

    Array.prototype.forEach.call(document.getElementsByName("cacheMode"), function (r) {
        r.addEventListener("change", function () {
            if (!r.checked) return;
            cfg.cacheMode = r.value;
            save();
            P.clearMemo();
            updateCacheInfo();
            if (state.view) app.loadItems(false);
        });
    });
    els.btnClearCache.addEventListener("click", function () { app.clearPreviews(app.cacheDirs(), ""); });
    els.setUseBin.addEventListener("change", function () { cfg.useBin = els.setUseBin.checked; save(); updateMirrorState(); });
    els.setMirror.addEventListener("change", function () { cfg.mirrorFolders = els.setMirror.checked; save(); });
    els.setDblClick.addEventListener("change", function () { cfg.dblClick = els.setDblClick.value; save(); });
    els.setAutoplay.addEventListener("change", function () { cfg.autoplay = els.setAutoplay.checked; save(); });
    els.setUnknown.addEventListener("change", function () { cfg.showUnknown = els.setUnknown.checked; save(); app.forgetWalk(null); if (state.view) app.loadItems(false); });
    // idioma: fica guardado no próprio painel (i18n.js); a tela muda na hora (main.js)
    els.langSelect.addEventListener("change", function () { HLI18n.setLang(els.langSelect.value); });

    // ---------- usado pelos outros arquivos ----------

    app.openSettings = openSettings;
    app.updateCacheInfo = updateCacheInfo;
    app.updateSettingsTexts = updateTexts;
})(window.HLApp);
