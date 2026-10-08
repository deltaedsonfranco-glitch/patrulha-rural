/* Patrulha Rural - app de consulta e coleta em campo */
(function () {
  'use strict';

  var VERSAO_APP = '1.2.0';
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
  var COR_SITUACAO = { VALIDADO: '#00b050', NAO_VALIDADO: '#8d99a6' };
  var MOTIVOS_EXCLUSAO = ['Não existe / demolido', 'Duplicado', 'Não encontrado no local', 'Outro'];
  var COR_VIA = '#ff8a00';

  var OPCOES = {
    PRODUCAO: ['Café', 'Leite', 'Gado de corte', 'Milho', 'Soja', 'Feijão', 'Batata', 'Morango',
               'Uva', 'Hortaliças', 'Frutas', 'Eucalipto', 'Aves / ovos', 'Suínos', 'Só moradia'],
    BENS_VALOR: ['Gado', 'Equinos', 'Trator / máquinas', 'Implementos', 'Defensivos / insumos',
                 'Combustível', 'Ferramentas', 'Veículos', 'Produção armazenada'],
    OPERADORA: ['Vivo', 'Claro', 'TIM', 'Outra'],
    ESPECIE_NOVA: ['Domicílio particular', 'Estabelecimento agropecuário', 'Estabelecimento religioso',
                   'Estabelecimento de ensino', 'Estabelecimento de saúde', 'Outras finalidades'],
    TIPO_PONTO: ['Ponte', 'Porteira', 'Mata-burro', 'Ponto com sinal de celular', 'Área de risco',
                 'Ponto de referência', 'Ponto de apoio', 'Outro'],
    TIPO_VIA: ['Asfalto', 'Calçamento', 'Cascalho', 'Terra', 'Trilha'],
    CONDICAO: ['Boa', 'Regular', 'Ruim', 'Intransitável'],
    VIATURA: ['Qualquer viatura', 'Somente 4x4', 'Somente moto ou a pé', 'Intransitável']
  };
  var ESTILO_PONTO = {
    'Ponte': ['#3f51b5', 'P'], 'Porteira': ['#795548', 'T'], 'Mata-burro': ['#607d8b', 'M'],
    'Ponto com sinal de celular': ['#00897b', 'S'], 'Área de risco': ['#d32f2f', '!'],
    'Ponto de referência': ['#5d4037', 'R'], 'Ponto de apoio': ['#2e7d32', 'A'], 'Outro': ['#455a64', '•']
  };
  var COLS_PONTO = ['ID', 'TIPO', 'NOME', 'DESCRICAO', 'LATITUDE', 'LONGITUDE', 'ID_PROPRIEDADE',
                    'TEM_SINAL_CELULAR', 'OPERADORA', 'STATUS', 'ATUALIZADO_EM', 'ATUALIZADO_POR'];
  var RE_PLACA = /^[A-Z]{3}[0-9][A-Z0-9][0-9]{2}$/;
  var PRECISAO_MAX_CORRECAO = 50; // metros

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

  function p2(n) { return ('0' + n).slice(-2); }
  function fmtDataHora(iso) {
    if (!iso) return '—';
    var d = new Date(iso);
    if (isNaN(d)) return '—';
    return p2(d.getDate()) + '/' + p2(d.getMonth() + 1) + ' ' + p2(d.getHours()) + ':' + p2(d.getMinutes());
  }
  function fmtDataCompleta(iso) {
    if (!iso) return '';
    var d = new Date(iso);
    if (isNaN(d)) return '';
    return p2(d.getDate()) + '/' + p2(d.getMonth() + 1) + '/' + d.getFullYear() +
           ' ' + p2(d.getHours()) + ':' + p2(d.getMinutes());
  }
  function haQuanto(iso) {
    var d = new Date(iso);
    if (!iso || isNaN(d)) return '';
    var dias = Math.floor((Date.now() - d.getTime()) / 86400000);
    if (dias <= 0) return 'hoje';
    if (dias === 1) return 'ontem';
    if (dias < 60) return 'há ' + dias + ' dias';
    return 'há ' + Math.round(dias / 30) + ' meses';
  }

  function novoUid() {
    if (window.crypto && crypto.randomUUID) return crypto.randomUUID();
    return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function (c) {
      var r = Math.random() * 16 | 0;
      return (c === 'x' ? r : (r & 0x3 | 0x8)).toString(16);
    });
  }
  function uidCurto(uid) { return String(uid).replace(/-/g, '').slice(0, 12); }

  function listaDe(valor) {
    return String(valor || '').split(/\s*;\s*/).filter(Boolean);
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
    dados: null,              // { geradoEm, baixadoEm, propriedades, vias, pontos } (formato compacto)
    props: [],
    vias: [],
    pontos: [],
    fila: [],                 // envios feitos em campo aguardando internet
    mapa: null,
    render: null,
    bases: {},
    baseAtual: null,
    grupoProps: null,
    grupoVias: null,
    grupoPontos: null,
    destaque: null,
    marcaLocal: null,
    gps: { watch: null, seguir: false, pos: null, marcador: null, precisao: null },
    prefs: Object.assign({ base: 'mapa', ocultas: [], ocultasSituacao: [], colorir: 'situacao', vias: true, pontos: true },
                         LS.get('prefs') || {}),
    sincronizando: false,
    enviando: false
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
      if (e.sessaoInvalida) return sessaoExpirou(e.message);
      erro.textContent = e.message;
    }).finally(function () { btn.disabled = false; });
  });

  /** Sessão vencida: volta ao login SEM apagar dados nem envios pendentes. */
  function sessaoExpirou(msg) {
    LS.del('sessao');
    E.sessao = null;
    LS.set('msgLogin', (msg || 'Sessão expirada.') +
      (E.fila.length ? ' Seus ' + E.fila.length + ' envio(s) pendente(s) estão guardados.' : ''));
    location.reload();
  }

  /** Saída voluntária: apaga tudo do aparelho. */
  function sair() {
    if (E.sessao) api('sair', { token: E.sessao.token }).catch(function () {});
    LS.del('sessao');
    E.sessao = null;
    IDB.limpar().catch(function () {}).then(function () { location.reload(); });
  }

  /* ================================================================ */
  /* Mapa                                                              */
  /* ================================================================ */
  function abrirMapa() {
    mostrarTela('mapa');
    if (!E.mapa) criarMapa();
    atualizarStatus();
    Promise.all([IDB.get('dados'), IDB.get('fila')]).then(function (r) {
      var d = r[0];
      E.fila = Array.isArray(r[1]) ? r[1] : [];
      if (d) aplicarDados(d);
      var horas = d ? (Date.now() - new Date(d.baixadoEm).getTime()) / 3600000 : Infinity;
      if (navigator.onLine && (!d || horas >= (C.ATUALIZAR_APOS_HORAS || 12))) {
        sincronizar(!!d);
      } else {
        enviarFila();
        if (!d) toast('Sem dados no aparelho. Conecte-se à internet para baixar.', { duracao: 0 });
      }
      atualizarStatus();
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
    E.grupoPontos = L.layerGroup();
    E.grupoProps = L.layerGroup().addTo(E.mapa);
    E.mapa.on('zoomend', ajustarRaios);
    E.mapa.on('click', function () { fecharPainel(); });
    // toque longo (ou botão direito) no mapa: cadastrar algo naquele ponto
    E.mapa.on('contextmenu', function (ev) { abrirAdicionar(ev.latlng); });
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
    E.props.forEach(function (p) { if (p.marcador) p.marcador.setRadius(p.validado ? r + 1 : r); });
  }

  /** Cor do ponto: pela situação (validado / não validado) ou pelo tipo. */
  function corPropriedade(p) {
    if (E.prefs.colorir === 'tipo') return CORES_ESPECIE[p.especie] || COR_PADRAO;
    return p.validado ? COR_SITUACAO.VALIDADO : COR_SITUACAO.NAO_VALIDADO;
  }
  function estiloMarcador(p, raio) {
    var porSituacao = E.prefs.colorir !== 'tipo';
    return {
      renderer: E.render, radius: p.validado ? raio + 1 : raio,
      color: porSituacao && p.validado ? '#0b3d1f' : '#ffffff',
      weight: porSituacao && p.validado ? 2 : 1.5,
      fillColor: corPropriedade(p), fillOpacity: 1
    };
  }
  function recolorir() {
    var r = raioAtual();
    E.props.forEach(function (p) { p.marcador.setStyle(estiloMarcador(p, r)); });
  }
  /** Mostra só o que passa nos filtros de tipo e de situação. */
  function aplicarVisibilidade() {
    var ocT = E.prefs.ocultas, ocS = E.prefs.ocultasSituacao;
    E.props.forEach(function (p) {
      var ver = ocT.indexOf(p.especie) === -1 && ocS.indexOf(p.validado ? 'VALIDADO' : 'NAO_VALIDADO') === -1;
      var esta = E.grupoProps.hasLayer(p.marcador);
      if (ver && !esta) E.grupoProps.addLayer(p.marcador);
      else if (!ver && esta) E.grupoProps.removeLayer(p.marcador);
    });
  }

  /* --- dados --- */
  function linhasParaObjetos(tab) {
    if (!tab) return [];
    var cols = tab.cols;
    return tab.rows.map(function (row) {
      var o = {};
      for (var i = 0; i < cols.length; i++) o[cols[i]] = row[i] === undefined ? '' : row[i];
      return o;
    });
  }

  function aplicarDados(d) {
    E.dados = d;
    if (!d.pontos) d.pontos = { cols: COLS_PONTO.slice(), rows: [] };

    E.grupoProps.clearLayers();
    E.grupoVias.clearLayers();
    E.grupoPontos.clearLayers();

    var raio = raioAtual();

    // vias (desenhadas primeiro, ficam por baixo)
    E.vias = linhasParaObjetos(d.vias).map(function (v) {
      var coords;
      try { coords = JSON.parse(v.GEOMETRIA_GEOJSON).coordinates; } catch (e) { coords = []; }
      var latlngs = coords.map(function (c) { return [c[1], c[0]]; });
      var validada = String(v.STATUS).toUpperCase() === 'VALIDADO';
      var intrans = /Intransit/.test(v.TRAFEGAVEL_VIATURA);
      var via = { d: v, latlngs: latlngs };
      if (latlngs.length > 1) {
        via.linha = L.polyline(latlngs, {
          renderer: E.render, color: intrans ? '#c62828' : COR_VIA, weight: validada ? 4 : 3,
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
      var p = { d: o, lat: numero(o.LATITUDE), lon: numero(o.LONGITUDE), especie: o.ESPECIE || 'Outros' };
      p.titulo = tituloPropriedade(o);
      p.busca = normalizar([
        o.NOME_PROPRIEDADE, o.NOME_ESTABELECIMENTO, o.LOGRADOURO, o.NUMERO, o.LOCALIDADE,
        o.ESPECIE, o.CEP, o.RESPONSAVEL, o.COMPLEMENTO, o.PRODUCAO, o.PLACAS_VEICULOS,
        String(o.PLACAS_VEICULOS || '').replace(/[\s,]/g, '')
      ].join(' '));
      return p;
    }).filter(function (p) {
      return p.lat !== null && p.lon !== null && String(p.d.STATUS).toUpperCase() !== 'EXCLUIDO';
    });

    E.props.forEach(function (p) {
      p.validado = String(p.d.STATUS).toUpperCase() === 'VALIDADO';
      p.marcador = L.circleMarker([p.lat, p.lon], estiloMarcador(p, raio)).on('click', function (ev) {
        L.DomEvent.stopPropagation(ev);
        abrirFicha(p);
      });
    });
    aplicarVisibilidade();

    // pontos de interesse
    E.pontos = linhasParaObjetos(d.pontos).filter(function (o) {
      return String(o.STATUS).toUpperCase() !== 'REMOVIDO';
    }).map(function (o) {
      var pt = { d: o, lat: numero(o.LATITUDE), lon: numero(o.LONGITUDE) };
      if (pt.lat === null || pt.lon === null) return null;
      var est = ESTILO_PONTO[o.TIPO] || ESTILO_PONTO.Outro;
      pt.marcador = L.marker([pt.lat, pt.lon], {
        icon: L.divIcon({
          className: '', iconSize: [24, 24], iconAnchor: [12, 12],
          html: '<div class="marca-ponto" style="background:' + est[0] + '">' + esc(est[1]) + '</div>'
        }),
        keyboard: false
      }).on('click', function (ev) {
        L.DomEvent.stopPropagation(ev);
        abrirFichaPonto(pt);
      });
      E.grupoPontos.addLayer(pt.marcador);
      return pt;
    }).filter(Boolean);
    if (E.prefs.pontos) E.grupoPontos.addTo(E.mapa);

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
    if (!silencioso) toast('Atualizando dados…', { duracao: 0 });
    // primeiro envia o que foi colhido, depois baixa a base atualizada
    return enviarFila(true).then(function () {
      return api('dados', { token: E.sessao.token });
    }).then(function (r) {
      var d = {
        geradoEm: r.geradoEm,
        baixadoEm: new Date().toISOString(),
        propriedades: r.propriedades,
        vias: r.vias,
        pontos: r.pontos || { cols: COLS_PONTO.slice(), rows: [] }
      };
      // o que ainda não subiu continua valendo no aparelho
      E.fila.forEach(function (it) { aplicarItemLocal(it, d); });
      return IDB.set('dados', d).then(function () {
        aplicarDados(d);
        toast('Dados atualizados: ' + r.propriedades.rows.length.toLocaleString('pt-BR') +
              ' propriedades, ' + r.vias.rows.length.toLocaleString('pt-BR') + ' trechos de via' +
              (d.pontos.rows.length ? ', ' + d.pontos.rows.length + ' pontos' : '') + '.');
      });
    }).catch(function (e) {
      if (e.sessaoInvalida) return sessaoExpirou(e.message);
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
  /* Fila de envios (funciona sem sinal)                               */
  /* ================================================================ */

  /** Registra algo colhido em campo: vale na hora no aparelho e sobe quando houver sinal. */
  function registrar(item) {
    item.uid = item.uid || novoUid();
    item.feitoEm = new Date().toISOString();
    if (E.gps.pos) {
      item.posicao = { lat: E.gps.pos.lat, lon: E.gps.pos.lon, precisao: E.gps.pos.precisao };
    }
    E.fila.push(item);
    aplicarItemLocal(item, E.dados);
    aplicarDados(E.dados);
    return Promise.all([IDB.set('fila', E.fila), IDB.set('dados', E.dados)]).then(function () {
      atualizarStatus();
      toast(navigator.onLine ? 'Salvo. Enviando…' : 'Salvo no aparelho. Será enviado quando houver sinal.');
      enviarFila();
      return item;
    });
  }

  function enviarFila(silencioso) {
    if (E.enviando || !E.fila.length || !navigator.onLine || !E.sessao) return Promise.resolve();
    E.enviando = true;
    atualizarStatus();
    var lote = E.fila.slice(0, 100);
    return api('enviar', { token: E.sessao.token, itens: lote }).then(function (r) {
      var porUid = {};
      (r.resultados || []).forEach(function (x) { porUid[x.uid] = x; });
      var recusados = [];
      var antes = E.fila.length;
      E.fila = E.fila.filter(function (it) {
        var x = porUid[it.uid];
        if (!x) return true;
        if (x.ok) return false;
        if (x.definitivo) { recusados.push(x.erro); return false; }
        return true; // erro temporário: tenta de novo depois
      });
      var enviados = antes - E.fila.length - recusados.length;
      return IDB.set('fila', E.fila).then(function () {
        atualizarSelosPendentes();
        if (recusados.length) {
          toast('Um envio não foi aceito: ' + recusados[0], { duracao: 9000 });
        } else if (enviados > 0 && !silencioso) {
          toast(enviados === 1 ? 'Enviado para a base.' : enviados + ' envios gravados na base.');
        }
        if (E.fila.length && enviados > 0) { E.enviando = false; return enviarFila(silencioso); }
      });
    }).catch(function (e) {
      if (e.sessaoInvalida) return sessaoExpirou(e.message);
      if (!silencioso) toast('Envio adiado: ' + e.message, { duracao: 5000 });
    }).finally(function () {
      E.enviando = false;
      atualizarStatus();
    });
  }
  window.addEventListener('online', function () { atualizarStatus(); enviarFila(); });
  setInterval(function () { enviarFila(true); }, 60000);

  /** Aplica um envio na cópia local dos dados (formato compacto). */
  function aplicarItemLocal(it, d) {
    if (!d) return;
    var usuario = (E.sessao && E.sessao.usuario && E.sessao.usuario.usuario) || '';
    var tab, linha;

    function garantirCol(t, col) {
      var i = t.cols.indexOf(col);
      if (i === -1) {
        t.cols.push(col);
        t.rows.forEach(function (r) { r.push(''); });
        i = t.cols.length - 1;
      }
      return i;
    }
    function acharLinha(t, id) {
      var iId = t.cols.indexOf('ID');
      for (var k = 0; k < t.rows.length; k++) if (t.rows[k][iId] === id) return t.rows[k];
      return null;
    }
    function setar(t, row, valores) {
      Object.keys(valores).forEach(function (c) { row[garantirCol(t, c)] = valores[c]; });
    }
    function novaLinha(t, valores) {
      var row = t.cols.map(function () { return ''; });
      t.rows.push(row);
      setar(t, row, valores);
    }

    var visita = { DATA_ULTIMA_VISITA: it.feitoEm, ULTIMA_VISITA_POR: usuario };
    switch (it.tipo) {
      case 'PROPRIEDADE_EDITAR':
      case 'VISITA':
        tab = d.propriedades;
        linha = acharLinha(tab, it.alvoId);
        if (!linha) return;
        if (it.tipo === 'PROPRIEDADE_EDITAR') {
          setar(tab, linha, Object.assign({}, it.dados, { STATUS: 'VALIDADO' }));
          if (it.novaPosicao) {
            setar(tab, linha, {
              LATITUDE: it.novaPosicao.lat.toFixed(6), LONGITUDE: it.novaPosicao.lon.toFixed(6),
              PRECISAO_COORD: 'GPS_CAMPO ±' + Math.round(it.novaPosicao.precisao) + 'm'
            });
          }
        }
        if (it.tipo === 'VISITA' || it.registrarVisita) setar(tab, linha, visita);
        setar(tab, linha, { ATUALIZADO_EM: it.feitoEm, ATUALIZADO_POR: usuario });
        break;
      case 'PROPRIEDADE_EXCLUIR':
        tab = d.propriedades;
        linha = acharLinha(tab, it.alvoId);
        if (linha) setar(tab, linha, { STATUS: 'EXCLUIDO', ATUALIZADO_EM: it.feitoEm, ATUALIZADO_POR: usuario });
        break;
      case 'PROPRIEDADE_NOVA':
        tab = d.propriedades;
        if (acharLinha(tab, 'CAMPO-' + uidCurto(it.uid))) return;
        novaLinha(tab, Object.assign({
          ID: 'CAMPO-' + uidCurto(it.uid), ORIGEM: 'CAMPO', ESPECIE: 'Domicílio particular',
          LATITUDE: it.novaPosicao.lat.toFixed(6), LONGITUDE: it.novaPosicao.lon.toFixed(6),
          STATUS: 'VALIDADO', ATUALIZADO_EM: it.feitoEm, ATUALIZADO_POR: usuario
        }, it.dados, it.registrarVisita ? visita : {}));
        break;
      case 'VIA_VALIDAR':
        tab = d.vias;
        linha = acharLinha(tab, it.alvoId);
        if (linha) setar(tab, linha, Object.assign({}, it.dados, { STATUS: 'VALIDADO', ATUALIZADO_EM: it.feitoEm, ATUALIZADO_POR: usuario }));
        break;
      case 'PONTO_NOVO':
        tab = d.pontos;
        if (acharLinha(tab, 'PI-' + uidCurto(it.uid))) return;
        novaLinha(tab, Object.assign({
          ID: 'PI-' + uidCurto(it.uid), STATUS: 'ATIVO',
          LATITUDE: it.novaPosicao.lat.toFixed(6), LONGITUDE: it.novaPosicao.lon.toFixed(6),
          ATUALIZADO_EM: it.feitoEm, ATUALIZADO_POR: usuario
        }, it.dados));
        break;
      case 'PONTO_EDITAR':
        tab = d.pontos;
        linha = acharLinha(tab, it.alvoId);
        if (linha) {
          setar(tab, linha, Object.assign({}, it.dados, { ATUALIZADO_EM: it.feitoEm, ATUALIZADO_POR: usuario }));
          if (it.remover) setar(tab, linha, { STATUS: 'REMOVIDO' });
        }
        break;
    }
  }

  function pendentePara(id) {
    return E.fila.some(function (it) {
      return it.alvoId === id || 'CAMPO-' + uidCurto(it.uid) === id || 'PI-' + uidCurto(it.uid) === id;
    });
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
    var pend = E.fila.length
      ? '<span class="pendentes">' + (E.enviando ? 'enviando ' : '') + E.fila.length +
        ' pendente' + (E.fila.length > 1 ? 's' : '') + '</span>'
      : '';
    el.innerHTML = '<span class="ponto"></span><span>' + esc(txt) + '</span>' + pend;
  }
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
    p.classList.toggle('alto', /^form/.test(tipo || ''));
    p.hidden = false;
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
    removerMarcaLocal();
    if (!semHistorico) { try { history.back(); } catch (e) { /* ignora */ } }
  }
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
  function marcarLocal(ll) {
    removerMarcaLocal();
    E.marcaLocal = L.marker(ll, {
      icon: L.divIcon({ className: '', html: '<div class="marca-nova"></div>', iconSize: [26, 26], iconAnchor: [13, 26] }),
      interactive: false
    }).addTo(E.mapa);
  }
  function removerMarcaLocal() {
    if (E.marcaLocal) { E.mapa.removeLayer(E.marcaLocal); E.marcaLocal = null; }
  }

  /* ================================================================ */
  /* Fichas                                                            */
  /* ================================================================ */
  function linhaCampo(rotulo, valorHtml) {
    if (!valorHtml) return '';
    return '<div><dt>' + esc(rotulo) + '</dt><dd>' + valorHtml + '</dd></div>';
  }
  function simNao(v) { return v === 'SIM' ? 'Sim' : v === 'NAO' ? 'Não' : ''; }
  function seloStatus(ok, pendente) {
    return '<span class="selo' + (ok ? ' ok' : '') + '">' + (ok ? 'VALIDADO' : 'NÃO VALIDADO') + '</span>' +
      (pendente ? '<span class="selo pend" data-pend="' + esc(pendente) + '">AGUARDANDO ENVIO</span>' : '');
  }
  /** Tira o selo "aguardando envio" da ficha aberta quando o envio termina. */
  function atualizarSelosPendentes() {
    Array.prototype.forEach.call(document.querySelectorAll('#painel [data-pend]'), function (el) {
      if (!pendentePara(el.getAttribute('data-pend'))) el.remove();
    });
  }

  function propPorId(id) {
    for (var i = 0; i < E.props.length; i++) if (E.props[i].d.ID === id) return E.props[i];
    return null;
  }

  function abrirFicha(p, semMover) {
    var o = p.d;
    destacar([p.lat, p.lon]);
    var validado = String(o.STATUS).toUpperCase() === 'VALIDADO';
    var cor = CORES_ESPECIE[p.especie] || COR_PADRAO; // na ficha a bolinha mostra o tipo
    var endereco = [o.LOGRADOURO, o.NUMERO && o.NUMERO !== 'SN' ? 'nº ' + o.NUMERO : (o.NUMERO === 'SN' ? 's/nº' : '')]
      .filter(Boolean).join(', ');
    var distHtml = '';
    if (E.gps.pos) {
      var m = distanciaM(E.gps.pos.lat, E.gps.pos.lon, p.lat, p.lon);
      distHtml = esc(fmtDist(m)) + ' em linha reta, rumo ' + esc(rumo(E.gps.pos.lat, E.gps.pos.lon, p.lat, p.lon));
    }
    var contato = o.CONTATO
      ? '<a href="tel:' + esc(String(o.CONTATO).replace(/[^\d+]/g, '')) + '">' + esc(o.CONTATO) + '</a>' : '';
    var coord = p.lat.toFixed(6) + ', ' + p.lon.toFixed(6);
    var operadora = o.SINAL_CELULAR === 'SIM' && o.OPERADORA ? ' (' + o.OPERADORA + ')' : '';
    var visita = o.DATA_ULTIMA_VISITA
      ? esc(fmtDataCompleta(o.DATA_ULTIMA_VISITA)) + ' · ' + esc(haQuanto(o.DATA_ULTIMA_VISITA)) +
        (o.ULTIMA_VISITA_POR ? '<br><small>por ' + esc(o.ULTIMA_VISITA_POR) + '</small>' : '')
      : '<span class="vazio-txt">Nunca visitada pelo sistema</span>';
    var seguranca = linhaCampo('Cão', esc(simNao(o.TEM_CAO))) +
      linhaCampo('Câmeras', esc(simNao(o.TEM_CAMERAS))) +
      linhaCampo('Cerca elétrica', esc(simNao(o.CERCA_ELETRICA))) +
      linhaCampo('Sinal de celular', esc(simNao(o.SINAL_CELULAR) + operadora)) +
      linhaCampo('Grupo de vizinhos', esc(simNao(o.GRUPO_VIZINHOS)));
    var producao = linhaCampo('Produção', esc(listaDe(o.PRODUCAO).join(', '))) +
      linhaCampo('Bens de valor', esc(listaDe(o.BENS_VALOR).join(', '))) +
      linhaCampo('Placas', esc(o.PLACAS_VEICULOS));

    var html =
      '<p class="ficha-tipo"><span class="bolinha-in" style="background:' + cor + '"></span>' +
      esc(p.especie) + seloStatus(validado, pendentePara(o.ID) && o.ID) + '</p>' +
      '<h2>' + esc(p.titulo) + '</h2>' +
      (o.OBS_SEGURANCA ? '<div class="alerta"><strong>Segurança:</strong> ' + esc(o.OBS_SEGURANCA) + '</div>' : '') +
      '<div class="acoes acoes-topo">' +
        '<button class="btn btn-primario" data-acao="editar-prop" data-id="' + esc(o.ID) + '">Atualizar informações</button>' +
        '<button class="btn btn-secundario" data-acao="visita" data-id="' + esc(o.ID) + '">Registrar visita</button>' +
      '</div>' +
      '<h3>Última visita</h3><dl class="campos">' + linhaCampo('Data', visita) + '</dl>' +
      '<h3>Localização</h3><dl class="campos">' +
      linhaCampo('Localidade', esc(o.LOCALIDADE)) +
      linhaCampo('Endereço', esc(endereco)) +
      linhaCampo('Complemento', esc(o.COMPLEMENTO)) +
      linhaCampo('CEP', esc(o.CEP)) +
      linhaCampo('Coordenadas', esc(coord) +
        (/^GPS_CAMPO/.test(o.PRECISAO_COORD) ? '<br><small>conferida em campo</small>' : '')) +
      linhaCampo('Distância', distHtml) +
      linhaCampo('Como chegar', esc(o.COMO_CHEGAR)) +
      '</dl>' +
      ((o.RESPONSAVEL || o.CONTATO || o.NOME_ESTABELECIMENTO)
        ? '<h3>Responsável</h3><dl class="campos">' +
          linhaCampo('Estabelecimento', esc(o.NOME_ESTABELECIMENTO)) +
          linhaCampo('Nome', esc(o.RESPONSAVEL)) +
          linhaCampo('Telefone', contato) + '</dl>' : '') +
      (seguranca ? '<h3>Segurança</h3><dl class="campos">' + seguranca + '</dl>' : '') +
      (producao ? '<h3>Produção e bens</h3><dl class="campos">' + producao + '</dl>' : '') +
      '<div class="acoes">' +
        '<a class="btn btn-secundario" target="_blank" rel="noopener" href="https://www.google.com/maps/dir/?api=1&destination=' + p.lat + ',' + p.lon + '">Google Maps</a>' +
        '<a class="btn btn-secundario" target="_blank" rel="noopener" href="https://waze.com/ul?ll=' + p.lat + ',' + p.lon + '&navigate=yes">Waze</a>' +
        '<button class="btn btn-secundario largo" data-copiar="' + esc(coord) + '">Copiar coordenadas</button>' +
      '</div>' +
      '<div class="acoes"><button class="btn btn-perigo-leve largo" data-acao="excluir-prop" data-id="' + esc(o.ID) + '">' +
        'Excluir endereço (não confere com a realidade)</button></div>' +
      '<p class="rodape-ficha">Origem: ' + esc(o.ORIGEM || String(o.ID).split('-')[0]) + ' · ID ' + esc(o.ID) +
      (o.ATUALIZADO_POR && !/^carga/.test(o.ATUALIZADO_POR) ? '<br>Atualizado por ' + esc(o.ATUALIZADO_POR) + ' em ' + esc(fmtDataHora(o.ATUALIZADO_EM)) : '') +
      '</p>';

    abrirPainel(html, 'ficha');
    if (!semMover) E.mapa.setView([p.lat, p.lon], Math.max(E.mapa.getZoom(), 15), { animate: true });
  }

  function abrirFichaVia(via) {
    var v = via.d;
    destacar(via.latlngs);
    var validada = String(v.STATUS).toUpperCase() === 'VALIDADO';
    var html =
      '<p class="ficha-tipo">Trecho de via (IBGE)' + seloStatus(validada, pendentePara(v.ID) && v.ID) + '</p>' +
      '<h2>' + esc(v.TIPO_VIA || 'Via rural') + ' · ' + esc(fmtDist(Number(v.COMPRIMENTO_M) || 0)) + '</h2>' +
      (/Intransit/.test(v.TRAFEGAVEL_VIATURA) ? '<div class="alerta perigo">Marcado como intransitável.</div>' : '') +
      '<dl class="campos">' +
      linhaCampo('Condição', esc(v.CONDICAO)) +
      linhaCampo('Viatura', esc(v.TRAFEGAVEL_VIATURA)) +
      linhaCampo('Observações', esc(v.OBS)) +
      linhaCampo('Conferido', v.ATUALIZADO_POR && validada ? esc(v.ATUALIZADO_POR + ' em ' + fmtDataHora(v.ATUALIZADO_EM)) : '') +
      linhaCampo('ID', esc(v.ID)) +
      '</dl>' +
      (validada ? '' :
        '<div class="alerta">Trecho percorrido pelos recenseadores do Censo 2022. ' +
        'Ainda não conferido pela patrulha: pode haver desvios em relação à via real.</div>') +
      '<div class="acoes"><button class="btn btn-primario largo" data-acao="validar-via" data-id="' + esc(v.ID) + '">' +
      (validada ? 'Atualizar trecho' : 'Conferir este trecho') + '</button></div>';
    abrirPainel(html, 'via');
  }

  function abrirFichaPonto(pt) {
    var o = pt.d;
    destacar([pt.lat, pt.lon]);
    var est = ESTILO_PONTO[o.TIPO] || ESTILO_PONTO.Outro;
    var dist = E.gps.pos ? esc(fmtDist(distanciaM(E.gps.pos.lat, E.gps.pos.lon, pt.lat, pt.lon))) + ', rumo ' +
      esc(rumo(E.gps.pos.lat, E.gps.pos.lon, pt.lat, pt.lon)) : '';
    var coord = pt.lat.toFixed(6) + ', ' + pt.lon.toFixed(6);
    var html =
      '<p class="ficha-tipo"><span class="marca-ponto mini" style="background:' + est[0] + '">' + esc(est[1]) + '</span>' +
      esc(o.TIPO || 'Ponto de interesse') + (pendentePara(o.ID) ? '<span class="selo pend" data-pend="' + esc(o.ID) + '">AGUARDANDO ENVIO</span>' : '') + '</p>' +
      '<h2>' + esc(o.NOME || o.TIPO || 'Ponto de interesse') + '</h2>' +
      '<dl class="campos">' +
      linhaCampo('Descrição', esc(o.DESCRICAO)) +
      linhaCampo('Sinal de celular', esc(simNao(o.TEM_SINAL_CELULAR) + (o.OPERADORA ? ' (' + o.OPERADORA + ')' : ''))) +
      linhaCampo('Coordenadas', esc(coord)) +
      linhaCampo('Distância', dist) +
      linhaCampo('Cadastrado por', esc(o.ATUALIZADO_POR)) +
      '</dl>' +
      '<div class="acoes">' +
        '<button class="btn btn-primario" data-acao="editar-ponto" data-id="' + esc(o.ID) + '">Editar</button>' +
        '<button class="btn btn-perigo" data-acao="remover-ponto" data-id="' + esc(o.ID) + '">Remover</button>' +
        '<button class="btn btn-secundario largo" data-copiar="' + esc(coord) + '">Copiar coordenadas</button>' +
      '</div>';
    abrirPainel(html, 'ponto');
  }

  /* ================================================================ */
  /* Formulários                                                       */
  /* ================================================================ */
  var F = {
    texto: function (nome, rotulo, valor, extra) {
      return '<label class="campo">' + esc(rotulo) +
        '<input name="' + nome + '" value="' + esc(valor) + '" ' + (extra || '') + '></label>';
    },
    area: function (nome, rotulo, valor, dica) {
      return '<label class="campo">' + esc(rotulo) +
        '<textarea name="' + nome + '" rows="3" maxlength="1000" placeholder="' + esc(dica || '') + '">' +
        esc(valor) + '</textarea></label>';
    },
    simNao: function (nome, rotulo, valor) {
      var ops = [['SIM', 'Sim'], ['NAO', 'Não'], ['', 'Não sei']];
      return '<div class="campo"><span>' + esc(rotulo) + '</span><div class="seg3">' +
        ops.map(function (o) {
          return '<label><input type="radio" name="' + nome + '" value="' + o[0] + '"' +
            (String(valor || '') === o[0] ? ' checked' : '') + '><span>' + o[1] + '</span></label>';
        }).join('') + '</div></div>';
    },
    chips: function (nome, rotulo, opcoes, valor) {
      var atuais = listaDe(valor);
      var outros = atuais.filter(function (v) { return opcoes.indexOf(v) === -1; });
      return '<div class="campo"><span>' + esc(rotulo) + '</span><div class="chips">' +
        opcoes.map(function (o) {
          return '<label class="chip"><input type="checkbox" name="' + nome + '" value="' + esc(o) + '"' +
            (atuais.indexOf(o) !== -1 ? ' checked' : '') + '><span>' + esc(o) + '</span></label>';
        }).join('') + '</div>' +
        '<input name="' + nome + '__outro" class="outro" placeholder="Outro (escreva)" value="' + esc(outros.join('; ')) + '"></div>';
    },
    escolha: function (nome, rotulo, opcoes, valor, obrigatorio) {
      return '<label class="campo">' + esc(rotulo) + '<select name="' + nome + '"' + (obrigatorio ? ' required' : '') + '>' +
        '<option value="">' + (obrigatorio ? 'Selecione…' : '—') + '</option>' +
        opcoes.map(function (o) {
          return '<option' + (o === valor ? ' selected' : '') + '>' + esc(o) + '</option>';
        }).join('') + '</select></label>';
    },
    caixa: function (nome, rotulo, marcado, extra) {
      return '<label class="opcao opcao-form"><input type="checkbox" name="' + nome + '"' +
        (marcado ? ' checked' : '') + ' ' + (extra || '') + '><span>' + rotulo + '</span></label>';
    },
    ler: function (form) {
      var r = {};
      Array.prototype.forEach.call(form.elements, function (el) {
        if (!el.name) return;
        if (el.type === 'radio') { if (el.checked) r[el.name] = el.value; else if (!(el.name in r)) r[el.name] = r[el.name]; return; }
        if (el.type === 'checkbox') {
          if (/__/.test(el.name)) return;
          if (form.querySelectorAll('input[type=checkbox][name="' + el.name + '"]').length > 1 || el.closest('.chips')) {
            r[el.name] = r[el.name] || [];
            if (el.checked) r[el.name].push(el.value);
          } else {
            r[el.name] = el.checked;
          }
          return;
        }
        if (/__outro$/.test(el.name)) {
          var base = el.name.replace(/__outro$/, '');
          r[base] = r[base] || [];
          listaDe(el.value).forEach(function (v) { r[base].push(v.trim()); });
          return;
        }
        r[el.name] = el.value.trim();
      });
      Object.keys(r).forEach(function (k) { if (Array.isArray(r[k])) r[k] = r[k].filter(Boolean).join('; '); });
      return r;
    }
  };

  function normalizarPlacas(txt) {
    var placas = String(txt || '').toUpperCase().split(/[,;\n]+/)
      .map(function (p) { return p.replace(/[\s-]/g, ''); }).filter(Boolean);
    var invalida = placas.filter(function (p) { return !RE_PLACA.test(p); })[0];
    if (invalida) throw new Error('Placa inválida: ' + invalida + ' (use ABC1234 ou ABC1D23).');
    return placas.filter(function (p, i) { return placas.indexOf(p) === i; }).join(', ');
  }

  function camposPropriedade(o) {
    return '<h3>Identificação</h3>' +
      F.texto('NOME_PROPRIEDADE', 'Nome da propriedade', o.NOME_PROPRIEDADE, 'maxlength="120" placeholder="Ex.: Sítio Boa Esperança"') +
      F.texto('RESPONSAVEL', 'Responsável / proprietário', o.RESPONSAVEL, 'maxlength="120"') +
      F.texto('CONTATO', 'Telefone', o.CONTATO, 'type="tel" maxlength="40" inputmode="tel" placeholder="(35) 9 9999-9999"') +
      '<h3>Produção e bens</h3>' +
      F.chips('PRODUCAO', 'O que produz', OPCOES.PRODUCAO, o.PRODUCAO) +
      F.chips('BENS_VALOR', 'Bens de valor no local', OPCOES.BENS_VALOR, o.BENS_VALOR) +
      F.texto('PLACAS_VEICULOS', 'Placas dos veículos', o.PLACAS_VEICULOS,
        'maxlength="200" autocapitalize="characters" placeholder="ABC1D23, XYZ9876"') +
      '<h3>Segurança</h3>' +
      F.simNao('TEM_CAO', 'Tem cão?', o.TEM_CAO) +
      F.simNao('TEM_CAMERAS', 'Tem câmeras?', o.TEM_CAMERAS) +
      F.simNao('CERCA_ELETRICA', 'Cerca elétrica?', o.CERCA_ELETRICA) +
      F.simNao('SINAL_CELULAR', 'Tem sinal de celular no local?', o.SINAL_CELULAR) +
      F.escolha('OPERADORA', 'Operadora com sinal', OPCOES.OPERADORA, o.OPERADORA) +
      F.simNao('GRUPO_VIZINHOS', 'Participa de grupo de vizinhos?', o.GRUPO_VIZINHOS) +
      F.area('OBS_SEGURANCA', 'Observações de segurança', o.OBS_SEGURANCA,
        'Ex.: idoso mora sozinho; furto de gado em 2025; ausentes nos fins de semana') +
      '<h3>Acesso</h3>' +
      F.area('COMO_CHEGAR', 'Como chegar', o.COMO_CHEGAR, 'Ex.: após a ponte de madeira, segunda porteira à esquerda');
  }

  function opcaoCorrigirPosicao(alvo) {
    var g = E.gps.pos;
    if (!g) return '<p class="dica">Ligue o GPS (botão ⊕) para poder corrigir a posição do ponto.</p>';
    if (g.precisao > PRECISAO_MAX_CORRECAO) {
      return '<p class="dica">GPS com precisão de ' + Math.round(g.precisao) + ' m. Para corrigir a posição, aguarde ficar abaixo de ' + PRECISAO_MAX_CORRECAO + ' m.</p>';
    }
    var d = alvo ? fmtDist(distanciaM(g.lat, g.lon, alvo.lat, alvo.lon)) : '';
    return F.caixa('corrigirPosicao', 'Mover o ponto para minha posição atual' +
      (d ? ' <small>(está a ' + esc(d) + ' daqui; GPS ±' + Math.round(g.precisao) + ' m)</small>' : ''), false);
  }

  function abrirFormPropriedade(p) {
    var o = p.d;
    var html = '<form data-form="prop-editar" data-id="' + esc(o.ID) + '" novalidate>' +
      '<h2>Atualizar: ' + esc(p.titulo) + '</h2>' +
      '<p class="dica">Informe ao morador que os dados são para uso da Patrulha Rural.</p>' +
      camposPropriedade(o) +
      '<h3>Visita e posição</h3>' +
      F.caixa('registrarVisita', 'Registrar visita agora', true) +
      opcaoCorrigirPosicao(p) +
      '<p class="erro" data-erro></p>' +
      '<div class="acoes"><button type="button" class="btn btn-secundario" data-acao="cancelar">Cancelar</button>' +
      '<button type="submit" class="btn btn-primario">Salvar</button></div></form>';
    abrirPainel(html, 'form-prop');
  }

  function abrirFormVisita(p) {
    var html = '<form data-form="visita" data-id="' + esc(p.d.ID) + '">' +
      '<h2>Registrar visita</h2><p class="ficha-tipo">' + esc(p.titulo) + '</p>' +
      F.area('obs', 'Observação da visita (opcional)', '', 'Ex.: tudo em ordem; morador relatou movimentação estranha à noite') +
      '<div class="acoes"><button type="button" class="btn btn-secundario" data-acao="cancelar">Cancelar</button>' +
      '<button type="submit" class="btn btn-primario">Registrar</button></div></form>';
    abrirPainel(html, 'form-visita');
  }

  function abrirFormExcluir(p) {
    var html = '<form data-form="prop-excluir" data-id="' + esc(p.d.ID) + '">' +
      '<h2>Excluir endereço</h2><p class="ficha-tipo">' + esc(p.titulo) + '</p>' +
      '<div class="alerta perigo">O endereço deixa de aparecer no mapa de todos os militares. ' +
      'Ele continua guardado na planilha com o motivo, e o administrador pode restaurá-lo.</div>' +
      '<div class="campo"><span>Motivo</span><div class="opcoes">' +
      MOTIVOS_EXCLUSAO.map(function (m) {
        return '<label class="opcao opcao-form"><input type="radio" name="motivo" value="' + esc(m) + '"><span>' + esc(m) + '</span></label>';
      }).join('') + '</div></div>' +
      F.area('obs', 'Observação', '', 'Ex.: casa demolida em 2024; endereço repetido do Sítio Santa Rita') +
      '<p class="erro" data-erro></p>' +
      '<div class="acoes"><button type="button" class="btn btn-secundario" data-acao="cancelar">Cancelar</button>' +
      '<button type="submit" class="btn btn-perigo">Excluir</button></div></form>';
    abrirPainel(html, 'form-excluir');
  }

  function abrirFormVia(via) {
    var v = via.d;
    destacar(via.latlngs);
    var html = '<form data-form="via" data-id="' + esc(v.ID) + '">' +
      '<h2>Conferir trecho de via</h2>' +
      '<p class="dica">Confirme como é a via neste trecho (destacado no mapa).</p>' +
      F.escolha('TIPO_VIA', 'Tipo de via', OPCOES.TIPO_VIA, v.TIPO_VIA, true) +
      F.escolha('CONDICAO', 'Condição', OPCOES.CONDICAO, v.CONDICAO, true) +
      F.escolha('TRAFEGAVEL_VIATURA', 'Passa viatura?', OPCOES.VIATURA, v.TRAFEGAVEL_VIATURA, true) +
      F.area('OBS', 'Observações', v.OBS, 'Ex.: atoleiro em dia de chuva; ponte estreita; porteira trancada') +
      '<p class="erro" data-erro></p>' +
      '<div class="acoes"><button type="button" class="btn btn-secundario" data-acao="cancelar">Cancelar</button>' +
      '<button type="submit" class="btn btn-primario">Salvar</button></div></form>';
    abrirPainel(html, 'form-via');
  }

  function abrirFormPonto(local, pt) {
    var o = pt ? pt.d : {};
    var html = '<form data-form="' + (pt ? 'ponto-editar' : 'ponto-novo') + '"' +
      (pt ? ' data-id="' + esc(o.ID) + '"' : ' data-lat="' + local.lat + '" data-lon="' + local.lon +
        '" data-prec="' + (local.precisao || 0) + '" data-fonte="' + local.fonte + '"') + '>' +
      '<h2>' + (pt ? 'Editar ponto' : 'Novo ponto de interesse') + '</h2>' +
      (pt ? '' : '<p class="dica">' + descricaoLocal(local) + '</p>') +
      F.escolha('TIPO', 'Tipo', OPCOES.TIPO_PONTO, o.TIPO, true) +
      F.texto('NOME', 'Nome / referência', o.NOME, 'maxlength="120" placeholder="Ex.: Ponte do Ribeirão das Antas"') +
      F.area('DESCRICAO', 'Descrição', o.DESCRICAO, 'Ex.: suporta viatura até 3 t; porteira com cadeado') +
      F.simNao('TEM_SINAL_CELULAR', 'Tem sinal de celular aqui?', o.TEM_SINAL_CELULAR) +
      F.escolha('OPERADORA', 'Operadora', OPCOES.OPERADORA, o.OPERADORA) +
      '<p class="erro" data-erro></p>' +
      '<div class="acoes"><button type="button" class="btn btn-secundario" data-acao="cancelar">Cancelar</button>' +
      '<button type="submit" class="btn btn-primario">Salvar</button></div></form>';
    abrirPainel(html, 'form-ponto');
    if (!pt) marcarLocal([local.lat, local.lon]);
  }

  function abrirFormNovaPropriedade(local) {
    var html = '<form data-form="prop-nova" data-lat="' + local.lat + '" data-lon="' + local.lon +
      '" data-prec="' + (local.precisao || 0) + '" data-fonte="' + local.fonte + '" novalidate>' +
      '<h2>Nova propriedade</h2>' +
      '<p class="dica">' + descricaoLocal(local) + '</p>' +
      F.escolha('ESPECIE', 'Tipo', OPCOES.ESPECIE_NOVA, 'Domicílio particular', true) +
      F.texto('LOCALIDADE', 'Localidade / bairro rural', '', 'maxlength="120"') +
      F.texto('LOGRADOURO', 'Estrada / logradouro', '', 'maxlength="120"') +
      F.texto('NUMERO', 'Número / km', '', 'maxlength="20"') +
      camposPropriedade({}) +
      F.caixa('registrarVisita', 'Registrar visita agora', true) +
      '<p class="erro" data-erro></p>' +
      '<div class="acoes"><button type="button" class="btn btn-secundario" data-acao="cancelar">Cancelar</button>' +
      '<button type="submit" class="btn btn-primario">Salvar</button></div></form>';
    abrirPainel(html, 'form-nova');
    marcarLocal([local.lat, local.lon]);
  }

  function descricaoLocal(local) {
    return local.fonte === 'GPS'
      ? 'Posição: sua localização atual (GPS ±' + Math.round(local.precisao) + ' m).'
      : 'Posição: o ponto que você marcou no mapa (pino amarelo).';
  }

  /** "+" ou toque longo no mapa: o que cadastrar e onde. */
  function abrirAdicionar(latlng) {
    var local;
    if (latlng) local = { lat: latlng.lat, lon: latlng.lng, precisao: 0, fonte: 'MAPA' };
    else if (E.gps.pos) local = { lat: E.gps.pos.lat, lon: E.gps.pos.lon, precisao: E.gps.pos.precisao, fonte: 'GPS' };
    if (!local) {
      abrirPainel('<h2>Cadastrar</h2><p class="dica">Ligue o GPS (botão ⊕) para cadastrar onde você está, ' +
        'ou <strong>toque e segure</strong> no mapa sobre o local desejado.</p>' +
        '<div class="acoes"><button class="btn btn-primario largo" data-acao="ligar-gps">Ligar GPS</button></div>', 'adicionar');
      return;
    }
    E._localAdicionar = local;
    marcarLocal([local.lat, local.lon]);
    abrirPainel('<h2>Cadastrar aqui</h2><p class="dica">' + descricaoLocal(local) + '</p>' +
      '<div class="menu-acoes">' +
        '<button class="btn btn-primario" data-acao="nova-prop">Nova propriedade</button>' +
        '<button class="btn btn-secundario" data-acao="novo-ponto">Ponto de interesse (ponte, porteira, sinal…)</button>' +
      '</div>', 'adicionar');
  }

  /* --- envio dos formulários --- */
  $('#painel-conteudo').addEventListener('submit', function (ev) {
    ev.preventDefault();
    var form = ev.target;
    var erro = form.querySelector('[data-erro]');
    if (erro) erro.textContent = '';
    try {
      salvarFormulario(form);
    } catch (e) {
      if (erro) { erro.textContent = e.message; erro.scrollIntoView({ block: 'center' }); }
      else toast(e.message);
    }
  });

  function salvarFormulario(form) {
    var tipo = form.getAttribute('data-form');
    var v = F.ler(form);
    var id = form.getAttribute('data-id');
    var local = form.hasAttribute('data-lat') ? {
      lat: Number(form.getAttribute('data-lat')), lon: Number(form.getAttribute('data-lon')),
      precisao: Number(form.getAttribute('data-prec')) || 0, fonte: form.getAttribute('data-fonte')
    } : null;

    if (v.PLACAS_VEICULOS !== undefined) v.PLACAS_VEICULOS = normalizarPlacas(v.PLACAS_VEICULOS);
    ['TEM_CAO', 'TEM_CAMERAS', 'CERCA_ELETRICA', 'SINAL_CELULAR', 'GRUPO_VIZINHOS', 'TEM_SINAL_CELULAR']
      .forEach(function (k) { if (k in v && v[k] === undefined) v[k] = ''; });

    var registrarVisita = !!v.registrarVisita;
    var corrigir = !!v.corrigirPosicao;
    delete v.registrarVisita; delete v.corrigirPosicao;

    if (tipo === 'prop-editar') {
      var p = propPorId(id);
      var dados = {};
      Object.keys(v).forEach(function (k) {
        if (String(p.d[k] || '') !== String(v[k] || '')) dados[k] = v[k] || '';
      });
      var item = { tipo: 'PROPRIEDADE_EDITAR', alvoId: id, dados: dados, registrarVisita: registrarVisita };
      if (corrigir) {
        if (!E.gps.pos || E.gps.pos.precisao > PRECISAO_MAX_CORRECAO) throw new Error('GPS sem precisão suficiente para corrigir a posição.');
        item.novaPosicao = { lat: E.gps.pos.lat, lon: E.gps.pos.lon, precisao: E.gps.pos.precisao, fonte: 'GPS' };
      }
      if (!Object.keys(dados).length && !item.novaPosicao) {
        if (!registrarVisita) throw new Error('Nada foi alterado.');
        item = { tipo: 'VISITA', alvoId: id };
      }
      return concluir(item, id);
    }
    if (tipo === 'prop-excluir') {
      if (!v.motivo) throw new Error('Escolha o motivo da exclusão.');
      if (v.motivo === 'Outro' && !v.obs) throw new Error('Descreva o motivo na observação.');
      return concluir({ tipo: 'PROPRIEDADE_EXCLUIR', alvoId: id, motivo: v.motivo, obs: v.obs || '' });
    }
    if (tipo === 'visita') {
      return concluir({ tipo: 'VISITA', alvoId: id, obs: v.obs || '' }, id);
    }
    if (tipo === 'prop-nova') {
      if (!v.ESPECIE) throw new Error('Escolha o tipo da propriedade.');
      var limpo = {};
      Object.keys(v).forEach(function (k) { if (v[k]) limpo[k] = v[k]; });
      var it = { tipo: 'PROPRIEDADE_NOVA', dados: limpo, novaPosicao: local, registrarVisita: registrarVisita };
      it.uid = novoUid();
      return concluir(it, 'CAMPO-' + uidCurto(it.uid));
    }
    if (tipo === 'via') {
      if (!v.TIPO_VIA || !v.CONDICAO || !v.TRAFEGAVEL_VIATURA) throw new Error('Preencha tipo, condição e se passa viatura.');
      return concluir({ tipo: 'VIA_VALIDAR', alvoId: id, dados: v }, null, id);
    }
    if (tipo === 'ponto-novo') {
      if (!v.TIPO) throw new Error('Escolha o tipo do ponto.');
      var pn = { tipo: 'PONTO_NOVO', dados: v, novaPosicao: local };
      pn.uid = novoUid();
      return concluir(pn, null, null, 'PI-' + uidCurto(pn.uid));
    }
    if (tipo === 'ponto-editar') {
      if (!v.TIPO) throw new Error('Escolha o tipo do ponto.');
      return concluir({ tipo: 'PONTO_EDITAR', alvoId: id, dados: v }, null, null, id);
    }
  }

  /* Depois de salvar: troca o conteúdo do painel pela ficha atualizada (sem fechar e
     reabrir, o que mexeria no histórico do navegador e fecharia a ficha nova). */
  function concluir(item, idPropriedade, idVia, idPonto) {
    removerMarcaLocal();
    return registrar(item).then(function () {
      var p = idPropriedade && propPorId(idPropriedade);
      var via = idVia && E.vias.filter(function (x) { return x.d.ID === idVia; })[0];
      var pt = idPonto && E.pontos.filter(function (x) { return x.d.ID === idPonto; })[0];
      if (p) abrirFicha(p, true);
      else if (via) abrirFichaVia(via);
      else if (pt) abrirFichaPonto(pt);
      else fecharPainel();
    });
  }

  /* --- cliques dentro do painel --- */
  $('#painel-conteudo').addEventListener('click', function (ev) {
    var b = ev.target.closest('[data-copiar]');
    if (b) { copiar(b.getAttribute('data-copiar')); return; }

    var r = ev.target.closest('[data-prop]');
    if (r) {
      var pr = E.props[Number(r.getAttribute('data-prop'))];
      if (pr) abrirFicha(pr);
      return;
    }
    var irc = ev.target.closest('[data-irpara]');
    if (irc) {
      var c = irc.getAttribute('data-irpara').split(',').map(Number);
      fecharPainel();
      E.mapa.setView(c, 16);
      destacar(c);
      return;
    }
    var a = ev.target.closest('[data-acao]');
    if (!a) return;
    var id = a.getAttribute('data-id');
    switch (a.getAttribute('data-acao')) {
      case 'editar-prop': abrirFormPropriedade(propPorId(id)); break;
      case 'visita': abrirFormVisita(propPorId(id)); break;
      case 'excluir-prop': abrirFormExcluir(propPorId(id)); break;
      case 'validar-via':
        abrirFormVia(E.vias.filter(function (x) { return x.d.ID === id; })[0]); break;
      case 'editar-ponto':
        abrirFormPonto(null, E.pontos.filter(function (x) { return x.d.ID === id; })[0]); break;
      case 'remover-ponto':
        if (confirm('Remover este ponto de interesse?')) {
          concluir({ tipo: 'PONTO_EDITAR', alvoId: id, dados: {}, remover: true });
        }
        break;
      case 'nova-prop': abrirFormNovaPropriedade(E._localAdicionar); break;
      case 'novo-ponto': abrirFormPonto(E._localAdicionar); break;
      case 'ligar-gps': fecharPainel(); if (E.gps.watch === null) iniciarGps(); break;
      case 'cancelar': fecharPainel(); break;
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

  $('#btn-adicionar').addEventListener('click', function () { abrirAdicionar(null); });

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
      if (pos) return distanciaM(pos.lat, pos.lon, pa.lat, pa.lon) - distanciaM(pos.lat, pos.lon, pb.lat, pb.lon);
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
        '<span class="bolinha" style="background:' + corPropriedade(p) + '"></span>' +
        '<span class="txt"><span class="t1">' + esc(p.titulo) + '</span>' +
        '<span class="t2">' + esc(sub) + '</span></span>' + dist + '</button></li>';
    }).join('');

    var cab = '<h2>' + (total ? total.toLocaleString('pt-BR') + ' resultado' + (total > 1 ? 's' : '') : 'Nada encontrado') + '</h2>' +
      (total > 60 ? '<p class="vazio" style="padding:0 0 6px">Mostrando os 60 primeiros' + (pos ? ' (mais próximos)' : '') + '. Refine a busca.</p>' : '');
    abrirPainel(cab + (total ? '<ul class="resultados">' + lista + '</ul>' :
      '<p class="vazio">Tente o nome da localidade, da estrada, do estabelecimento ou uma placa.</p>'), 'busca');
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
    var nVal = E.props.filter(function (p) { return p.validado; }).length;

    var html = '<h2>Camadas</h2><h3>Fundo do mapa</h3><div class="segmentado">' +
      [['mapa', 'Mapa'], ['satelite', 'Satélite'], ['nenhum', 'Sem fundo']].map(function (b) {
        return '<button data-base="' + b[0] + '" class="' + (E.baseAtual === b[0] ? 'ativo' : '') + '">' + b[1] + '</button>';
      }).join('') + '</div>' +
      '<p class="vazio" style="font-size:.82rem">O fundo precisa de internet. Propriedades, vias e pontos funcionam sem sinal.</p>' +
      '<h3>Vias e pontos</h3><div class="opcoes">' +
      '<label class="opcao"><input type="checkbox" data-camada="vias" ' + (E.prefs.vias ? 'checked' : '') +
      '><span class="linha-amostra"></span>Trechos de via (IBGE)<span class="qtd">' + E.vias.length.toLocaleString('pt-BR') + '</span></label>' +
      '<label class="opcao"><input type="checkbox" data-camada="pontos" ' + (E.prefs.pontos ? 'checked' : '') +
      '><span class="marca-ponto mini" style="background:#3f51b5">P</span>Pontos de interesse<span class="qtd">' + E.pontos.length + '</span></label>' +
      '</div>' +
      '<h3>Colorir propriedades por</h3><div class="segmentado seg2">' +
      [['situacao', 'Situação'], ['tipo', 'Tipo']].map(function (b) {
        return '<button data-colorir="' + b[0] + '" class="' + (E.prefs.colorir === b[0] ? 'ativo' : '') + '">' + b[1] + '</button>';
      }).join('') + '</div>' +
      '<h3>Situação</h3><div class="opcoes">' +
      [['VALIDADO', 'Validados (conferidos em campo)', nVal], ['NAO_VALIDADO', 'Não validados', E.props.length - nVal]].map(function (s) {
        return '<label class="opcao"><input type="checkbox" data-situacao="' + s[0] + '" ' +
          (E.prefs.ocultasSituacao.indexOf(s[0]) === -1 ? 'checked' : '') + '><span class="bolinha' +
          (s[0] === 'VALIDADO' ? ' bolinha-val' : '') + '" style="background:' + COR_SITUACAO[s[0]] + '"></span>' +
          s[1] + '<span class="qtd">' + s[2].toLocaleString('pt-BR') + '</span></label>';
      }).join('') + '</div>' +
      '<h3>Tipo</h3><div class="opcoes">' +
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
    if (el.hasAttribute('data-especie') || el.hasAttribute('data-situacao')) {
      var chave = el.hasAttribute('data-especie') ? 'ocultas' : 'ocultasSituacao';
      var e = el.getAttribute('data-especie') || el.getAttribute('data-situacao');
      E.prefs[chave] = E.prefs[chave].filter(function (x) { return x !== e; });
      if (!el.checked) E.prefs[chave].push(e);
      LS.set('prefs', E.prefs);
      aplicarVisibilidade();
    } else if (el.hasAttribute('data-camada')) {
      var nome = el.getAttribute('data-camada');
      var grupo = nome === 'vias' ? E.grupoVias : E.grupoPontos;
      E.prefs[nome] = el.checked;
      if (el.checked) grupo.addTo(E.mapa); else E.mapa.removeLayer(grupo);
      LS.set('prefs', E.prefs);
    }
  });
  $('#painel-conteudo').addEventListener('click', function (ev) {
    var c = ev.target.closest('[data-colorir]');
    if (c) {
      E.prefs.colorir = c.getAttribute('data-colorir');
      LS.set('prefs', E.prefs);
      recolorir();
      Array.prototype.forEach.call(document.querySelectorAll('[data-colorir]'), function (x) {
        x.classList.toggle('ativo', x === c);
      });
      return;
    }
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
    var nValidadas = E.props.filter(function (p) { return p.validado; }).length;
    var html = '<h2>' + esc([u.postoGrad, u.nome].filter(Boolean).join(' ') || 'Usuário') + '</h2>' +
      '<p class="vazio" style="padding:0">' + esc(u.usuario || '') + ' · perfil ' + esc(u.perfil || '') + '</p>' +
      (E.fila.length ? '<div class="alerta">' + E.fila.length + ' envio(s) aguardando internet. ' +
        'Eles sobem sozinhos quando houver sinal.</div>' : '') +
      '<h3>Dados no aparelho</h3>' +
      '<div class="info-linha"><span>Propriedades</span><span>' + (E.props.length).toLocaleString('pt-BR') + '</span></div>' +
      '<div class="info-linha"><span>Validadas em campo</span><span>' + nValidadas.toLocaleString('pt-BR') + ' (' +
        (E.props.length ? (100 * nValidadas / E.props.length).toFixed(1).replace('.', ',') : '0') + '%)</span></div>' +
      '<div class="info-linha"><span>Trechos de via</span><span>' + (E.vias.length).toLocaleString('pt-BR') + '</span></div>' +
      '<div class="info-linha"><span>Pontos de interesse</span><span>' + E.pontos.length + '</span></div>' +
      '<div class="info-linha"><span>Baixados em</span><span>' + fmtDataHora(d && d.baixadoEm) + '</span></div>' +
      '<div class="info-linha"><span>Acesso válido até</span><span>' + fmtDataHora(E.sessao && E.sessao.expira) + '</span></div>' +
      '<div class="menu-acoes">' +
        '<button class="btn btn-primario" data-menu="sync"' + (navigator.onLine ? '' : ' disabled') + '>' +
        (E.fila.length ? 'Enviar pendentes e atualizar' : 'Atualizar dados agora') + '</button>' +
        '<button class="btn btn-perigo" data-menu="sair">Sair e apagar dados do aparelho</button>' +
      '</div>' +
      '<h3>Dicas</h3><p class="dica">Toque e segure no mapa para cadastrar uma propriedade ou um ponto de interesse naquele local.</p>' +
      '<p class="vazio" style="font-size:.8rem;margin-top:12px">Patrulha Rural · versão ' + VERSAO_APP + '</p>';
    abrirPainel(html, 'menu');
  });

  $('#painel-conteudo').addEventListener('click', function (ev) {
    var b = ev.target.closest('[data-menu]');
    if (!b) return;
    var acao = b.getAttribute('data-menu');
    if (acao === 'sync') { fecharPainel(); sincronizar(false); }
    if (acao === 'sair') {
      var aviso = E.fila.length
        ? 'ATENÇÃO: há ' + E.fila.length + ' envio(s) ainda não enviados, que serão PERDIDOS. Sair mesmo assim?'
        : 'Sair? Os dados baixados serão apagados deste aparelho.';
      if (confirm(aviso)) sair();
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

  var msgLogin = LS.get('msgLogin');
  if (msgLogin) { $('#login-erro').textContent = msgLogin; LS.del('msgLogin'); }

  iniciar();
})();
