/* Patrulha Rural - app de consulta (etapa 2) */
(function () {
  'use strict';

  var VERSAO_APP = '1.0.0';
  var C = window.CONFIG || {};

  var CORES_ESPECIE = {
    'Domicílio particular': '#2f6fe0',
    'Estabelecimento agropecuário': '#1f9d45',
    'Outras finalidades': '#8e44c9',
    'Estabelecimento religioso': '#e6b800',
    'Domicílio coletivo': '#e0468a',
    'Estabelecimento de saúde': '#e03131',
    'Estabelecimento de ensino': '#f07b12',
    'Imóvel rural (CAR)': '#7cb518'
  };
  var COR_PADRAO = '#6b7a72';
  var COR_VIA = '#ff8a00';

  /* ================================================================ */
  /* Utilidades                                                        */
  /* ================================================================ */
  function $(s) { return document.querySelector(s); }

  function esc(v) {
    return String(v == null ? '' : v)
      .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
  }

  function normalizar(s) {
    return String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
  }

  function numero(v) {
    var n = parseFloat(String(v || '').replace(',', '.'));
    return isFinite(n) ? n : null;
  }

  function distanciaM(lat1, lon1, lat2, lon2) {
    var r = Math.PI / 180;
    var a = Math.sin((lat2 - lat1) * r / 2) * Math.sin((lat2 - lat1) * r / 2) +
            Math.cos(lat1 * r) * Math.cos(lat2 * r) *
            Math.sin((lon2 - lon1) * r / 2) * Math.sin((lon2 - lon1) * r / 2);
    return 6371008.8 * 2 * Math.asin(Math.sqrt(a));
  }

  function rumo(lat1, lon1, lat2, lon2) {
    var r = Math.PI / 180;
    var y = Math.sin((lon2 - lon1) * r) * Math.cos(lat2 * r);
    var x = Math.cos(lat1 * r) * Math.sin(lat2 * r) -
            Math.sin(lat1 * r) * Math.cos(lat2 * r) * Math.cos((lon2 - lon1) * r);
    var graus = (Math.atan2(y, x) / r + 360) % 360;
    return ['N', 'NE', 'L', 'SE', 'S', 'SO', 'O', 'NO'][Math.round(graus / 45) % 8];
  }

  function fmtDist(m) {
    if (m < 1000) return Math.round(m) + ' m';
    return (m / 1000).toFixed(m < 10000 ? 1 : 0).replace('.', ',') + ' km';
  }

  function fmtDataHora(iso) {
    if (!iso) return '—';
    var d = new Date(iso);
    if (isNaN(d)) return '—';
    function p(n) { return ('0' + n).slice(-2); }
    return p(d.getDate()) + '/' + p(d.getMonth() + 1) + ' ' + p(d.getHours()) + ':' + p(d.getMinutes());
  }

  /* --- armazenamento local --- */
  var LS = {
    get: function (k) { try { return JSON.parse(localStorage.getItem(k)); } catch (e) { return null; } },
    set: function (k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch (e) { /* ignora */ } },
    del: function (k) { try { localStorage.removeItem(k); } catch (e) { /* ignora */ } }
  };

  var IDB = {
    db: null,
    abrir: function () {
      var self = this;
      if (self.db) return Promise.resolve(self.db);
      return new Promise(function (res, rej) {
        var r = indexedDB.open('patrulha-rural', 1);
        r.onupgradeneeded = function () { r.result.createObjectStore('kv'); };
        r.onsuccess = function () { self.db = r.result; res(self.db); };
        r.onerror = function () { rej(r.error); };
      });
    },
    op: function (modo, fn) {
      return this.abrir().then(function (db) {
        return new Promise(function (res, rej) {
          var tx = db.transaction('kv', modo);
          var req = fn(tx.objectStore('kv'));
          tx.oncomplete = function () { res(req && req.result); };
          tx.onerror = function () { rej(tx.error); };
        });
      });
    },
    get: function (k) { return this.op('readonly', function (s) { return s.get(k); }); },
    set: function (k, v) { return this.op('readwrite', function (s) { return s.put(v, k); }); },
    limpar: function () { return this.op('readwrite', function (s) { return s.clear(); }); }
  };

  /* --- comunicação com o Apps Script --- */
  function api(acao, dados) {
    if (!C.API_URL || C.API_URL.indexOf('COLE_AQUI') === 0) {
      return Promise.reject(new Error('Endereço da API não configurado (config.js).'));
    }
    var corpo = Object.assign({ acao: acao }, dados || {});
    var ctrl = new AbortController();
    var timer = setTimeout(function () { ctrl.abort(); }, 90000);
    return fetch(C.API_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'text/plain;charset=utf-8' }, // evita preflight CORS
      body: JSON.stringify(corpo),
      redirect: 'follow',
      signal: ctrl.signal
    }).then(function (r) {
      if (!r.ok) throw new Error('Falha de comunicação (' + r.status + ').');
      return r.json();
    }).then(function (j) {
      if (!j.ok) {
        var e = new Error(j.erro || 'Erro no servidor.');
        e.sessaoInvalida = !!j.sessaoInvalida;
        throw e;
      }
      return j;
    }).catch(function (e) {
      if (e.name === 'AbortError') throw new Error('Tempo esgotado. Verifique o sinal.');
      if (e instanceof TypeError) throw new Error('Sem conexão com o servidor.');
      throw e;
    }).finally(function () { clearTimeout(timer); });
  }

  /* ================================================================ */
  /* Estado                                                            */
  /* ================================================================ */
  var E = {
    sessao: null,
    dados: null,              // { geradoEm, baixadoEm, propriedades:{cols,rows}, vias:{cols,rows} }
    props: [],                // propriedades já convertidas
    vias: [],
    mapa: null,
    render: null,
    bases: {},
    baseAtual: null,
    gruposEspecie: {},        // especie -> L.layerGroup
    grupoVias: null,
    destaque: null,
    gps: { watch: null, seguir: false, pos: null, marcador: null, precisao: null },
    prefs: LS.get('prefs') || { base: 'mapa', ocultas: [], vias: true },
    sincronizando: false
  };

  /* ================================================================ */
  /* Telas                                                             */
  /* ================================================================ */
  function mostrarTela(nome) {
    ['login', 'senha', 'mapa'].forEach(function (t) {
      $('#tela-' + t).hidden = (t !== nome);
    });
  }

  function sessaoValida(s) {
    return !!(s && s.token && s.expira && new Date(s.expira) > new Date());
  }

  function iniciar() {
    registrarServiceWorker();
    var s = LS.get('sessao');
    if (!sessaoValida(s)) {
      LS.del('sessao');
      mostrarTela('login');
      return;
    }
    E.sessao = s;
    if (s.trocarSenha) { mostrarTela('senha'); return; }
    abrirMapa();
  }

  /* --- login --- */
  $('#form-login').addEventListener('submit', function (ev) {
    ev.preventDefault();
    var btn = $('#btn-entrar');
    var erro = $('#login-erro');
    erro.textContent = '';
    btn.disabled = true;
    btn.textContent = 'Entrando…';
    api('login', {
      usuario: $('#login-usuario').value.trim(),
      senha: $('#login-senha').value
    }).then(function (r) {
      E.sessao = {
        token: r.token, expira: r.expira, usuario: r.usuario, trocarSenha: r.trocarSenha
      };
      LS.set('sessao', E.sessao);
      $('#login-senha').value = '';
      if (r.trocarSenha) mostrarTela('senha');
      else abrirMapa();
    }).catch(function (e) {
      erro.textContent = e.message;
    }).finally(function () {
      btn.disabled = false;
      btn.textContent = 'Entrar';
    });
  });

  /* --- troca de senha --- */
  $('#form-senha').addEventListener('submit', function (ev) {
    ev.preventDefault();
    var erro = $('#senha-erro');
    erro.textContent = '';
    var nova = $('#senha-nova').value;
    if (nova !== $('#senha-nova2').value) { erro.textContent = 'As senhas não conferem.'; return; }
    if (nova.length < 8) { erro.textContent = 'Use pelo menos 8 caracteres.'; return; }
    var btn = ev.target.querySelector('button');
    btn.disabled = true;
    api('trocarSenha', {
      token: E.sessao.token, senhaAtual: $('#senha-atual').value, senhaNova: nova
    }).then(function () {
      E.sessao.trocarSenha = false;
      LS.set('sessao', E.sessao);
      ev.target.reset();
      abrirMapa();
    }).catch(function (e) {
      if (e.sessaoInvalida) return encerrarSessao(e.message);
      erro.textContent = e.message;
    }).finally(function () { btn.disabled = false; });
  });

  function encerrarSessao(msg) {
    if (E.sessao) api('sair', { token: E.sessao.token }).catch(function () {});
    LS.del('sessao');
    E.sessao = null;
    IDB.limpar().catch(function () {}).then(function () {
      if (msg) LS.set('msgLogin', msg);
      location.reload();
    });
  }

  /* ================================================================ */
  /* Mapa                                                              */
  /* ================================================================ */
  function abrirMapa() {
    mostrarTela('mapa');
    if (!E.mapa) criarMapa();
    atualizarStatus();
    IDB.get('dados').then(function (d) {
      if (d) aplicarDados(d);
      var horas = d ? (Date.now() - new Date(d.baixadoEm).getTime()) / 3600000 : Infinity;
      if (navigator.onLine && (!d || horas >= (C.ATUALIZAR_APOS_HORAS || 12))) {
        sincronizar(!!d);
      } else if (!d) {
        toast('Sem dados no aparelho. Conecte-se à internet para baixar.', { duracao: 0 });
      }
    }).catch(function () {
      if (navigator.onLine) sincronizar(false);
    });
  }

  function criarMapa() {
    E.render = L.canvas({ padding: 0.5, tolerance: 6 });
    E.mapa = L.map('mapa', {
      zoomControl: false, preferCanvas: true, renderer: E.render,
      center: C.CENTRO || [-21.7878, -46.5613], zoom: C.ZOOM || 11, maxZoom: 20
    });
    E.bases = {
      mapa: L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', {
        maxZoom: 20, maxNativeZoom: 19,
        attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
      }),
      satelite: L.tileLayer(
        'https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}', {
          maxZoom: 20, maxNativeZoom: 18, attribution: 'Imagens &copy; Esri'
        })
    };
    trocarBase(E.prefs.base);
    E.mapa.attributionControl.setPrefix(false);

    E.grupoVias = L.layerGroup();
    E.mapa.on('zoomend', ajustarRaios);
    E.mapa.on('click', function () { fecharPainel(); });
    E.mapa.on('dragstart', function () {
      if (E.gps.seguir) { E.gps.seguir = false; atualizarBotaoGps(); }
    });
  }

  function trocarBase(nome) {
    Object.keys(E.bases).forEach(function (k) { E.mapa.removeLayer(E.bases[k]); });
    if (E.bases[nome]) E.bases[nome].addTo(E.mapa).bringToBack();
    E.baseAtual = nome;
    E.prefs.base = nome;
    LS.set('prefs', E.prefs);
  }

  function raioAtual() {
    var z = E.mapa.getZoom();
    return z < 12 ? 3.5 : z < 14 ? 5 : z < 16 ? 7 : 9;
  }

  function ajustarRaios() {
    var r = raioAtual();
    E.props.forEach(function (p) { if (p.marcador) p.marcador.setRadius(r); });
  }

  /* --- dados --- */
  function linhasParaObjetos(tab) {
    var cols = tab.cols;
    return tab.rows.map(function (row) {
      var o = {};
      for (var i = 0; i < cols.length; i++) o[cols[i]] = row[i];
      return o;
    });
  }

  function aplicarDados(d) {
    E.dados = d;

    // limpa camadas anteriores
    Object.keys(E.gruposEspecie).forEach(function (k) { E.mapa.removeLayer(E.gruposEspecie[k]); });
    E.gruposEspecie = {};
    E.grupoVias.clearLayers();

    var raio = raioAtual();

    // vias (desenhadas primeiro, ficam por baixo)
    E.vias = linhasParaObjetos(d.vias).map(function (v) {
      var coords;
      try { coords = JSON.parse(v.GEOMETRIA_GEOJSON).coordinates; } catch (e) { coords = []; }
      var latlngs = coords.map(function (c) { return [c[1], c[0]]; });
      var validada = String(v.STATUS).toUpperCase() === 'VALIDADO';
      var via = { dados: v, latlngs: latlngs };
      if (latlngs.length > 1) {
        via.linha = L.polyline(latlngs, {
          renderer: E.render, color: COR_VIA, weight: validada ? 4 : 3,
          opacity: 0.95, dashArray: validada ? null : '7 6'
        }).on('click', function (ev) {
          L.DomEvent.stopPropagation(ev);
          abrirFichaVia(via);
        });
        E.grupoVias.addLayer(via.linha);
      }
      return via;
    });
    if (E.prefs.vias) E.grupoVias.addTo(E.mapa);

    // propriedades
    E.props = linhasParaObjetos(d.propriedades).map(function (o) {
      var p = {
        d: o,
        lat: numero(o.LATITUDE),
        lon: numero(o.LONGITUDE),
        especie: o.ESPECIE || 'Outros'
      };
      p.titulo = tituloPropriedade(o);
      p.busca = normalizar([
        o.NOME_PROPRIEDADE, o.NOME_ESTABELECIMENTO, o.LOGRADOURO, o.NUMERO,
        o.LOCALIDADE, o.ESPECIE, o.CEP, o.RESPONSAVEL, o.COMPLEMENTO
      ].join(' '));
      return p;
    }).filter(function (p) { return p.lat !== null && p.lon !== null; });

    E.props.forEach(function (p) {
      var g = E.gruposEspecie[p.especie];
      if (!g) g = E.gruposEspecie[p.especie] = L.layerGroup();
      p.marcador = L.circleMarker([p.lat, p.lon], {
        renderer: E.render, radius: raio, color: '#ffffff', weight: 1.5,
        fillColor: CORES_ESPECIE[p.especie] || COR_PADRAO, fillOpacity: 1
      }).on('click', function (ev) {
        L.DomEvent.stopPropagation(ev);
        abrirFicha(p);
      });
      g.addLayer(p.marcador);
    });
    Object.keys(E.gruposEspecie).forEach(function (k) {
      if (E.prefs.ocultas.indexOf(k) === -1) E.gruposEspecie[k].addTo(E.mapa);
    });

    atualizarStatus();
  }

  function sincronizar(silencioso) {
    if (E.sincronizando || !E.sessao) return Promise.resolve();
    if (!navigator.onLine) {
      toast('Sem sinal. Os dados serão atualizados quando houver internet.');
      return Promise.resolve();
    }
    E.sincronizando = true;
    atualizarStatus();
    if (!silencioso) toast('Baixando dados…', { duracao: 0 });
    return api('dados', { token: E.sessao.token }).then(function (r) {
      var d = {
        geradoEm: r.geradoEm,
        baixadoEm: new Date().toISOString(),
        propriedades: r.propriedades,
        vias: r.vias
      };
      return IDB.set('dados', d).then(function () {
        aplicarDados(d);
        toast('Dados atualizados: ' + r.propriedades.rows.length.toLocaleString('pt-BR') +
              ' propriedades e ' + r.vias.rows.length.toLocaleString('pt-BR') + ' trechos de via.');
      });
    }).catch(function (e) {
      if (e.sessaoInvalida) return encerrarSessao(e.message);
      toast('Não foi possível atualizar: ' + e.message, { duracao: 6000 });
    }).finally(function () {
      E.sincronizando = false;
      atualizarStatus();
    });
  }

  function tituloPropriedade(o) {
    if (o.NOME_PROPRIEDADE) return o.NOME_PROPRIEDADE;
    if (o.NOME_ESTABELECIMENTO) return o.NOME_ESTABELECIMENTO;
    if (o.LOGRADOURO) {
      var n = o.NUMERO && o.NUMERO !== 'SN' ? ', ' + o.NUMERO : '';
      return o.LOGRADOURO + n;
    }
    return o.ESPECIE || 'Endereço rural';
  }

  /* ================================================================ */
  /* Status, toast e painel                                            */
  /* ================================================================ */
  function atualizarStatus() {
    var el = $('#status');
    var online = navigator.onLine;
    el.classList.toggle('offline', !online);
    var txt;
    if (E.sincronizando) txt = 'Atualizando dados…';
    else if (!E.dados) txt = online ? 'Sem dados no aparelho' : 'Sem sinal · sem dados';
    else txt = (online ? 'Online' : 'Sem sinal') + ' · dados de ' + fmtDataHora(E.dados.baixadoEm);
    el.innerHTML = '<span class="ponto"></span><span>' + esc(txt) + '</span>';
  }
  window.addEventListener('online', function () { atualizarStatus(); });
  window.addEventListener('offline', atualizarStatus);

  var timerToast = null;
  function toast(msg, opc) {
    opc = opc || {};
    var el = $('#toast');
    el.innerHTML = '<span>' + esc(msg) + '</span>';
    if (opc.acao) {
      var b = document.createElement('button');
      b.textContent = opc.acao;
      b.addEventListener('click', function () { el.hidden = true; opc.fn(); });
      el.appendChild(b);
    }
    el.hidden = false;
    clearTimeout(timerToast);
    var dur = opc.duracao === undefined ? 3500 : opc.duracao;
    if (dur > 0) timerToast = setTimeout(function () { el.hidden = true; }, dur);
  }

  var painelAberto = false;
  function abrirPainel(html, tipo) {
    var p = $('#painel');
    $('#painel-conteudo').innerHTML = html;
    $('#painel-conteudo').scrollTop = 0;
    p.dataset.tipo = tipo || '';
    p.hidden = false;
    $('#toast').hidden = true;
    if (!painelAberto) {
      painelAberto = true;
      try { history.pushState({ painel: true }, ''); } catch (e) { /* ignora */ }
    }
  }
  function fecharPainel(semHistorico) {
    if (!painelAberto) return;
    painelAberto = false;
    $('#painel').hidden = true;
    removerDestaque();
    if (!semHistorico) { try { history.back(); } catch (e) { /* ignora */ } }
  }
  // botão "voltar" do Android fecha o painel em vez de sair do app
  window.addEventListener('popstate', function () {
    if (painelAberto) fecharPainel(true);
  });
  $('#painel-fechar').addEventListener('click', function () { fecharPainel(); });

  function destacar(latlngs) {
    removerDestaque();
    if (Array.isArray(latlngs[0])) {
      E.destaque = L.polyline(latlngs, { color: '#00e5ff', weight: 8, opacity: 0.7, interactive: false }).addTo(E.mapa);
    } else {
      E.destaque = L.circleMarker(latlngs, {
        radius: 16, color: '#f2b134', weight: 4, fill: false, interactive: false
      }).addTo(E.mapa);
    }
  }
  function removerDestaque() {
    if (E.destaque) { E.mapa.removeLayer(E.destaque); E.destaque = null; }
  }

  /* ================================================================ */
  /* Ficha da propriedade / via                                        */
  /* ================================================================ */
  function linhaCampo(rotulo, valorHtml) {
    if (!valorHtml) return '';
    return '<div><dt>' + esc(rotulo) + '</dt><dd>' + valorHtml + '</dd></div>';
  }

  function abrirFicha(p) {
    var o = p.d;
    destacar([p.lat, p.lon]);
    var validado = String(o.STATUS).toUpperCase() === 'VALIDADO';
    var cor = CORES_ESPECIE[p.especie] || COR_PADRAO;

    var endereco = [o.LOGRADOURO, o.NUMERO && o.NUMERO !== 'SN' ? 'nº ' + o.NUMERO : (o.NUMERO === 'SN' ? 's/nº' : '')]
      .filter(Boolean).join(', ');

    var distHtml = '';
    if (E.gps.pos) {
      var m = distanciaM(E.gps.pos.lat, E.gps.pos.lon, p.lat, p.lon);
      distHtml = esc(fmtDist(m)) + ' em linha reta, rumo ' +
                 esc(rumo(E.gps.pos.lat, E.gps.pos.lon, p.lat, p.lon));
    }
    var contato = o.CONTATO
      ? '<a href="tel:' + esc(String(o.CONTATO).replace(/[^\d+]/g, '')) + '">' + esc(o.CONTATO) + '</a>'
      : '';
    var coord = p.lat.toFixed(6) + ', ' + p.lon.toFixed(6);

    var html =
      '<p class="ficha-tipo"><span class="bolinha" style="display:inline-block;width:12px;height:12px;border-radius:50%;background:' + cor + '"></span>' +
      esc(p.especie) + '<span class="selo' + (validado ? ' ok' : '') + '">' +
      (validado ? 'VALIDADO' : 'NÃO VALIDADO') + '</span></p>' +
      '<h2>' + esc(p.titulo) + '</h2>' +
      (o.OBS_SEGURANCA ? '<div class="alerta"><strong>Segurança:</strong> ' + esc(o.OBS_SEGURANCA) + '</div>' : '') +
      '<h3>Localização</h3><dl class="campos">' +
      linhaCampo('Localidade', esc(o.LOCALIDADE)) +
      linhaCampo('Endereço', esc(endereco)) +
      linhaCampo('Complemento', esc(o.COMPLEMENTO)) +
      linhaCampo('CEP', esc(o.CEP)) +
      linhaCampo('Coordenadas', esc(coord)) +
      linhaCampo('Distância', distHtml) +
      '</dl>' +
      ((o.RESPONSAVEL || o.CONTATO || o.COMO_CHEGAR || o.NOME_ESTABELECIMENTO)
        ? '<h3>Informações</h3><dl class="campos">' +
          linhaCampo('Estabelecimento', esc(o.NOME_ESTABELECIMENTO)) +
          linhaCampo('Responsável', esc(o.RESPONSAVEL)) +
          linhaCampo('Contato', contato) +
          linhaCampo('Como chegar', esc(o.COMO_CHEGAR)) +
          '</dl>'
        : '') +
      '<div class="acoes">' +
        '<a class="btn btn-primario" target="_blank" rel="noopener" href="https://www.google.com/maps/dir/?api=1&destination=' + p.lat + ',' + p.lon + '">Google Maps</a>' +
        '<a class="btn btn-secundario" target="_blank" rel="noopener" href="https://waze.com/ul?ll=' + p.lat + ',' + p.lon + '&navigate=yes">Waze</a>' +
        '<button class="btn btn-secundario largo" data-copiar="' + esc(coord) + '">Copiar coordenadas</button>' +
      '</div>' +
      '<p class="vazio" style="font-size:.8rem">Origem: ' + esc(String(o.ID).split('-')[0]) + ' · ID ' + esc(o.ID) + '</p>';

    abrirPainel(html, 'ficha');
    var zoomAlvo = Math.max(E.mapa.getZoom(), 15);
    E.mapa.setView([p.lat, p.lon], zoomAlvo, { animate: true });
  }

  function abrirFichaVia(via) {
    var v = via.dados;
    destacar(via.latlngs);
    var validada = String(v.STATUS).toUpperCase() === 'VALIDADO';
    var html =
      '<p class="ficha-tipo">Trecho de via (IBGE)<span class="selo' + (validada ? ' ok' : '') + '">' +
      (validada ? 'VALIDADO' : 'NÃO VALIDADO') + '</span></p>' +
      '<h2>' + esc(v.TIPO_VIA || 'Via rural') + ' · ' + esc(fmtDist(Number(v.COMPRIMENTO_M) || 0)) + '</h2>' +
      '<dl class="campos">' +
      linhaCampo('Condição', esc(v.CONDICAO)) +
      linhaCampo('Viatura', esc(v.TRAFEGAVEL_VIATURA)) +
      linhaCampo('Observações', esc(v.OBS)) +
      linhaCampo('ID', esc(v.ID)) +
      '</dl>' +
      (validada ? '' :
        '<div class="alerta">Trecho percorrido pelos recenseadores do Censo 2022. ' +
        'Ainda não conferido pela patrulha: pode haver desvios em relação à via real.</div>');
    abrirPainel(html, 'via');
  }

  $('#painel-conteudo').addEventListener('click', function (ev) {
    var b = ev.target.closest('[data-copiar]');
    if (b) {
      copiar(b.getAttribute('data-copiar'));
      return;
    }
    var r = ev.target.closest('[data-prop]');
    if (r) {
      var p = E.props[Number(r.getAttribute('data-prop'))];
      if (p) abrirFicha(p);
      return;
    }
    var irc = ev.target.closest('[data-irpara]');
    if (irc) {
      var c = irc.getAttribute('data-irpara').split(',').map(Number);
      fecharPainel();
      E.mapa.setView(c, 16);
      destacar(c);
    }
  });

  function copiar(texto) {
    function ok() { toast('Coordenadas copiadas.'); }
    if (navigator.clipboard && window.isSecureContext) {
      navigator.clipboard.writeText(texto).then(ok, fallback);
    } else fallback();
    function fallback() {
      var t = document.createElement('textarea');
      t.value = texto; document.body.appendChild(t); t.select();
      try { document.execCommand('copy'); ok(); } catch (e) { toast(texto, { duracao: 8000 }); }
      document.body.removeChild(t);
    }
  }

  /* ================================================================ */
  /* Busca                                                             */
  /* ================================================================ */
  var campoBusca = $('#busca');
  var timerBusca = null;
  campoBusca.addEventListener('input', function () {
    $('#busca-limpar').hidden = !campoBusca.value;
    clearTimeout(timerBusca);
    timerBusca = setTimeout(buscar, 180);
  });
  campoBusca.addEventListener('keydown', function (ev) {
    if (ev.key === 'Enter') { ev.preventDefault(); clearTimeout(timerBusca); buscar(); campoBusca.blur(); }
  });
  $('#busca-limpar').addEventListener('click', function () {
    campoBusca.value = '';
    $('#busca-limpar').hidden = true;
    fecharPainel();
  });

  function buscar() {
    var q = campoBusca.value.trim();
    if (q.length < 2) { if ($('#painel').dataset.tipo === 'busca') fecharPainel(); return; }

    // coordenada digitada: "-21.9, -46.6"
    var mc = q.match(/^\s*(-?\d{1,2}[.,]\d+)\s*[,;\s]\s*(-?\d{1,3}[.,]\d+)\s*$/);
    if (mc) {
      var la = numero(mc[1]), lo = numero(mc[2]);
      abrirPainel('<h2>Coordenada</h2><ul class="resultados"><li><button class="resultado" data-irpara="' +
        la + ',' + lo + '"><span class="txt"><span class="t1">Ir para ' + esc(la + ', ' + lo) +
        '</span></span></button></li></ul>', 'busca');
      return;
    }

    if (!E.props.length) {
      abrirPainel('<p class="vazio">Ainda não há dados no aparelho.</p>', 'busca');
      return;
    }
    var termos = normalizar(q).split(/\s+/).filter(Boolean);
    var achados = [];
    for (var i = 0; i < E.props.length; i++) {
      var p = E.props[i];
      var ok = true;
      for (var t = 0; t < termos.length; t++) {
        if (p.busca.indexOf(termos[t]) === -1) { ok = false; break; }
      }
      if (ok) achados.push(i);
    }

    var pos = E.gps.pos;
    var tituloN = termos.join(' ');
    achados.sort(function (a, b) {
      var pa = E.props[a], pb = E.props[b];
      if (pos) {
        return distanciaM(pos.lat, pos.lon, pa.lat, pa.lon) - distanciaM(pos.lat, pos.lon, pb.lat, pb.lon);
      }
      var sa = normalizar(pa.titulo).indexOf(tituloN) === -1 ? 1 : 0;
      var sb = normalizar(pb.titulo).indexOf(tituloN) === -1 ? 1 : 0;
      return sa - sb || pa.titulo.localeCompare(pb.titulo, 'pt-BR');
    });

    var total = achados.length;
    var lista = achados.slice(0, 60).map(function (i) {
      var p = E.props[i];
      var sub = [p.d.LOCALIDADE, p.especie].filter(Boolean).join(' · ');
      var dist = pos ? '<span class="dist">' + esc(fmtDist(distanciaM(pos.lat, pos.lon, p.lat, p.lon))) + '</span>' : '';
      return '<li><button class="resultado" data-prop="' + i + '">' +
        '<span class="bolinha" style="background:' + (CORES_ESPECIE[p.especie] || COR_PADRAO) + '"></span>' +
        '<span class="txt"><span class="t1">' + esc(p.titulo) + '</span>' +
        '<span class="t2">' + esc(sub) + '</span></span>' + dist + '</button></li>';
    }).join('');

    var cab = '<h2>' + (total ? total.toLocaleString('pt-BR') + ' resultado' + (total > 1 ? 's' : '') : 'Nada encontrado') + '</h2>' +
      (total > 60 ? '<p class="vazio" style="padding:0 0 6px">Mostrando os 60 primeiros' + (pos ? ' (mais próximos)' : '') + '. Refine a busca.</p>' : '');
    abrirPainel(cab + (total ? '<ul class="resultados">' + lista + '</ul>' :
      '<p class="vazio">Tente o nome da localidade, da estrada ou do estabelecimento.</p>'), 'busca');
  }

  /* ================================================================ */
  /* GPS                                                               */
  /* ================================================================ */
  $('#btn-gps').addEventListener('click', function () {
    if (E.gps.watch === null) {
      iniciarGps();
    } else if (!E.gps.seguir) {
      E.gps.seguir = true;
      if (E.gps.pos) E.mapa.setView([E.gps.pos.lat, E.gps.pos.lon], Math.max(E.mapa.getZoom(), 15));
      atualizarBotaoGps();
    } else {
      pararGps();
    }
  });

  function iniciarGps() {
    if (!('geolocation' in navigator)) { toast('Este aparelho não oferece localização.'); return; }
    E.gps.seguir = true;
    E.gps.primeira = true;
    toast('Buscando sinal de GPS…');
    E.gps.watch = navigator.geolocation.watchPosition(function (pos) {
      var c = pos.coords;
      E.gps.pos = { lat: c.latitude, lon: c.longitude, precisao: c.accuracy };
      var ll = [c.latitude, c.longitude];
      if (!E.gps.marcador) {
        E.gps.precisao = L.circle(ll, {
          radius: c.accuracy, color: '#1e88e5', weight: 1, fillColor: '#1e88e5',
          fillOpacity: 0.12, interactive: false
        }).addTo(E.mapa);
        E.gps.marcador = L.marker(ll, {
          icon: L.divIcon({ className: '', html: '<div class="minha-pos"></div>', iconSize: [18, 18], iconAnchor: [9, 9] }),
          interactive: false, keyboard: false, zIndexOffset: 1000
        }).addTo(E.mapa);
      } else {
        E.gps.marcador.setLatLng(ll);
        E.gps.precisao.setLatLng(ll).setRadius(c.accuracy);
      }
      if (E.gps.seguir) {
        E.mapa.setView(ll, E.gps.primeira ? Math.max(E.mapa.getZoom(), 15) : E.mapa.getZoom(), { animate: !E.gps.primeira });
      }
      if (E.gps.primeira) {
        E.gps.primeira = false;
        toast('Localização encontrada (precisão de ' + Math.round(c.accuracy) + ' m).');
      }
      atualizarBotaoGps();
    }, function (err) {
      var msg = err.code === 1
        ? 'Permita o acesso à localização nas configurações do navegador.'
        : 'Não foi possível obter a localização. Tente em local aberto.';
      toast(msg, { duracao: 6000 });
      if (err.code === 1) pararGps();
    }, { enableHighAccuracy: true, maximumAge: 5000, timeout: 30000 });
    atualizarBotaoGps();
  }

  function pararGps() {
    if (E.gps.watch !== null) navigator.geolocation.clearWatch(E.gps.watch);
    E.gps.watch = null;
    E.gps.seguir = false;
    E.gps.pos = null;
    if (E.gps.marcador) { E.mapa.removeLayer(E.gps.marcador); E.gps.marcador = null; }
    if (E.gps.precisao) { E.mapa.removeLayer(E.gps.precisao); E.gps.precisao = null; }
    atualizarBotaoGps();
  }

  function atualizarBotaoGps() {
    var b = $('#btn-gps');
    b.classList.toggle('ativo', E.gps.watch !== null && !E.gps.seguir);
    b.classList.toggle('seguindo', E.gps.watch !== null && E.gps.seguir);
  }

  /* ================================================================ */
  /* Camadas                                                           */
  /* ================================================================ */
  $('#btn-camadas').addEventListener('click', function () {
    var contagem = {};
    E.props.forEach(function (p) { contagem[p.especie] = (contagem[p.especie] || 0) + 1; });
    var especies = Object.keys(contagem).sort(function (a, b) { return contagem[b] - contagem[a]; });

    var html = '<h2>Camadas</h2><h3>Fundo do mapa</h3><div class="segmentado">' +
      [['mapa', 'Mapa'], ['satelite', 'Satélite'], ['nenhum', 'Sem fundo']].map(function (b) {
        return '<button data-base="' + b[0] + '" class="' + (E.baseAtual === b[0] ? 'ativo' : '') + '">' + b[1] + '</button>';
      }).join('') + '</div>' +
      '<p class="vazio" style="font-size:.82rem">O fundo precisa de internet. Propriedades e vias funcionam sem sinal.</p>' +
      '<h3>Vias</h3><div class="opcoes"><label class="opcao"><input type="checkbox" data-vias ' +
      (E.prefs.vias ? 'checked' : '') + '><span class="linha-amostra"></span>Trechos de via (IBGE)<span class="qtd">' +
      E.vias.length.toLocaleString('pt-BR') + '</span></label></div>' +
      '<h3>Propriedades</h3><div class="opcoes">' +
      especies.map(function (e) {
        return '<label class="opcao"><input type="checkbox" data-especie="' + esc(e) + '" ' +
          (E.prefs.ocultas.indexOf(e) === -1 ? 'checked' : '') + '><span class="bolinha" style="background:' +
          (CORES_ESPECIE[e] || COR_PADRAO) + '"></span>' + esc(e) + '<span class="qtd">' +
          contagem[e].toLocaleString('pt-BR') + '</span></label>';
      }).join('') + '</div>';
    abrirPainel(html, 'camadas');
  });

  $('#painel-conteudo').addEventListener('change', function (ev) {
    var el = ev.target;
    if (el.hasAttribute('data-especie')) {
      var e = el.getAttribute('data-especie');
      var g = E.gruposEspecie[e];
      E.prefs.ocultas = E.prefs.ocultas.filter(function (x) { return x !== e; });
      if (el.checked) { if (g) g.addTo(E.mapa); }
      else { if (g) E.mapa.removeLayer(g); E.prefs.ocultas.push(e); }
      LS.set('prefs', E.prefs);
    } else if (el.hasAttribute('data-vias')) {
      E.prefs.vias = el.checked;
      if (el.checked) E.grupoVias.addTo(E.mapa); else E.mapa.removeLayer(E.grupoVias);
      LS.set('prefs', E.prefs);
    }
  });
  $('#painel-conteudo').addEventListener('click', function (ev) {
    var b = ev.target.closest('[data-base]');
    if (!b) return;
    trocarBase(b.getAttribute('data-base'));
    Array.prototype.forEach.call(document.querySelectorAll('[data-base]'), function (x) {
      x.classList.toggle('ativo', x === b);
    });
  });

  /* ================================================================ */
  /* Menu                                                              */
  /* ================================================================ */
  $('#btn-menu').addEventListener('click', function () {
    var u = (E.sessao && E.sessao.usuario) || {};
    var d = E.dados;
    var html = '<h2>' + esc([u.postoGrad, u.nome].filter(Boolean).join(' ') || 'Usuário') + '</h2>' +
      '<p class="vazio" style="padding:0">' + esc(u.usuario || '') + ' · perfil ' + esc(u.perfil || '') + '</p>' +
      '<h3>Dados no aparelho</h3>' +
      '<div class="info-linha"><span>Propriedades</span><span>' + (E.props.length).toLocaleString('pt-BR') + '</span></div>' +
      '<div class="info-linha"><span>Trechos de via</span><span>' + (E.vias.length).toLocaleString('pt-BR') + '</span></div>' +
      '<div class="info-linha"><span>Baixados em</span><span>' + fmtDataHora(d && d.baixadoEm) + '</span></div>' +
      '<div class="info-linha"><span>Acesso válido até</span><span>' + fmtDataHora(E.sessao && E.sessao.expira) + '</span></div>' +
      '<div class="menu-acoes">' +
        '<button class="btn btn-primario" data-menu="sync"' + (navigator.onLine ? '' : ' disabled') + '>Atualizar dados agora</button>' +
        '<button class="btn btn-perigo" data-menu="sair">Sair e apagar dados do aparelho</button>' +
      '</div>' +
      '<p class="vazio" style="font-size:.8rem;margin-top:12px">Patrulha Rural · versão ' + VERSAO_APP + '</p>';
    abrirPainel(html, 'menu');
  });

  $('#painel-conteudo').addEventListener('click', function (ev) {
    var b = ev.target.closest('[data-menu]');
    if (!b) return;
    var acao = b.getAttribute('data-menu');
    if (acao === 'sync') { fecharPainel(); sincronizar(false); }
    if (acao === 'sair') {
      if (confirm('Sair? Os dados baixados serão apagados deste aparelho.')) encerrarSessao();
    }
  });

  /* ================================================================ */
  /* Service worker (funcionamento offline e atualização do app)       */
  /* ================================================================ */
  function registrarServiceWorker() {
    if (!('serviceWorker' in navigator)) return;
    navigator.serviceWorker.register('sw.js').then(function (reg) {
      reg.addEventListener('updatefound', function () {
        var novo = reg.installing;
        if (!novo) return;
        novo.addEventListener('statechange', function () {
          if (novo.state === 'installed' && navigator.serviceWorker.controller) {
            toast('Nova versão do app disponível.', {
              acao: 'Atualizar', duracao: 0,
              fn: function () { novo.postMessage('ativar'); }
            });
          }
        });
      });
    }).catch(function (e) { console.warn('SW', e); });
    // no primeiro acesso o SW assume a página sem que seja uma atualização: não recarregar
    var haviaControlador = !!navigator.serviceWorker.controller;
    var recarregando = false;
    navigator.serviceWorker.addEventListener('controllerchange', function () {
      if (recarregando || !haviaControlador) return;
      recarregando = true;
      location.reload();
    });
  }

  if (location.hostname === 'localhost') window.__PR = E; // só para testes locais

  /* mensagem pendente da tela de login (ex.: sessão expirada) */
  var msgLogin = LS.get('msgLogin');
  if (msgLogin) { $('#login-erro').textContent = msgLogin; LS.del('msgLogin'); }

  iniciar();
})();
