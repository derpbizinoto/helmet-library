// client/js/bridge.js — Helmet Library
// Ponte ÚNICA entre o painel e o ExtendScript (host/index.jsx).
//
// O único canal entre os dois é o evalScript, que recebe um TEXTO de código. Para
// nenhum valor (caminho de arquivo, nome de bin…) virar código por acidente, toda
// chamada passa por aqui: só funções da lista abaixo, e cada argumento vira um
// literal JSON seguro. O host responde sempre com JSON { ok, data, error }.
//
//     HLBridge.call("hl_add", [caminho, "video", true, "Helmet Library", "SFX"]) -> Promise(data)

var HLBridge = (function () {
    "use strict";

    // Funções do host que o painel pode chamar.
    var FUNCTIONS = ["hl_add", "hl_takePlaceholder", "hl_placeAt", "hl_getHostVersion"];

    var available = typeof window !== "undefined" && typeof window.__adobe_cep__ !== "undefined" &&
        typeof CSInterface === "function";
    var cs = available ? new CSInterface() : null;
    var log = function (msg) { window.HL.warn(msg); };

    var LINE_SEP = new RegExp(String.fromCharCode(0x2028), "g");
    var PARA_SEP = new RegExp(String.fromCharCode(0x2029), "g");

    // Literal seguro para o ExtendScript (texto, número, true/false). O JSON.stringify não
    // escapa U+2028/U+2029, que o ExtendScript (ES3) trata como quebra de linha dentro do
    // texto — o que viraria "EvalScript error.".
    function toScriptLiteral(value) {
        var t = typeof value;
        if (t !== "string" && t !== "number" && t !== "boolean") value = String(value);
        return JSON.stringify(value).replace(LINE_SEP, "\\u2028").replace(PARA_SEP, "\\u2029");
    }

    function buildScript(name, args) {
        if (FUNCTIONS.indexOf(name) < 0) throw new Error("Função do host não permitida: " + name);
        return name + "(" + (args || []).map(toScriptLiteral).join(",") + ")";
    }

    function evalRaw(script) {
        return new Promise(function (resolve, reject) {
            if (!cs) { reject(new Error("Fora do Premiere.")); return; }
            cs.evalScript(script, function (result) { resolve(String(result)); });
        });
    }

    // Confere se o host/index.jsx está carregado. Se não estiver (erro ao carregar no
    // início), carrega de novo com $.evalFile e registra o erro exato no console.
    var hostReady = null;

    function ensureHost() {
        if (!cs) return Promise.resolve(false);
        if (hostReady) return hostReady;
        var p = evalRaw("typeof hl_add").then(function (t) {
            if (t === "function") return true;
            var jsx = cs.getSystemPath(SystemPath.EXTENSION) + "/host/index.jsx";
            var script = "(function(){try{$.evalFile(" + toScriptLiteral(jsx) + ");return typeof hl_add;}" +
                "catch(e){return 'ERRO: '+e+(e.line?' (linha '+e.line+')':'');}})()";
            return evalRaw(script).then(function (r) {
                if (r === "function") {
                    log("script do host carregado manualmente (" + jsx + ").");
                    return true;
                }
                log("o script do host (host/index.jsx) não carregou: " + r);
                if (hostReady === p) hostReady = null; // tenta de novo na próxima chamada
                return false;
            });
        });
        hostReady = p;
        return p;
    }

    // Chama uma função do host. Resolve com `data`; rejeita com um Error de mensagem clara.
    function call(name, args) {
        var script;
        try { script = buildScript(name, args); } catch (e) { return Promise.reject(e); }
        return ensureHost().then(function () { return evalRaw(script); }).then(function (raw) {
            var parsed;
            try { parsed = JSON.parse(raw); }
            catch (e) {
                log("resposta inválida do ExtendScript (" + name + "): " + raw);
                // "EvalScript error" = a função não existe no Premiere: o host/index.jsx não carregou
                throw new Error(/EvalScript error/i.test(raw)
                    ? "A parte da extensão que roda dentro do Premiere não carregou. Feche o Premiere e reinstale a extensão (instalar.bat)."
                    : "O Premiere devolveu uma resposta inesperada. Reabra o painel e tente de novo.");
            }
            if (!parsed || !parsed.ok) throw new Error((parsed && parsed.error) || "Erro no Premiere.");
            return parsed.data;
        });
    }

    // Versão do host, para avisar de instalação misturada (painel e host de versões diferentes).
    function hostVersion() {
        return call("hl_getHostVersion", []).then(function (data) { return data.version; });
    }

    return {
        available: available,
        call: call,
        hostVersion: hostVersion,
        setLogger: function (fn) { if (fn) log = fn; },
        // expostos para os testes automáticos
        _buildScript: buildScript,
        _toScriptLiteral: toScriptLiteral
    };
})();
