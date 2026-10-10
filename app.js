/* Patrulha Rural v2 - endereços, propriedades rurais e vias por área de atuação */
(function () {
  'use strict';

  var VERSAO_APP = '2.0.0';
  var C = window.CONFIG || {};
  var MUNICIPIO_V1 = C.MUNICIPIO_V1 || '3151800';
  var ZOOM_POLIGONOS = 13;
  var ZOOM_DETALHE = 12;         // modo leve: endereços e vias só a partir deste zoom
  var LIMITE_LEVE = 20000;       // acima disso (endereços + vias) o app desenha só o que está na tela
  var MUNICIPIOS_AUTO = 8;       // áreas maiores: o militar escolhe quais municípios baixar
  var CELULA = 0.02;             // grade espacial (graus)
  var MAX_POLIGONOS = 3000;

  var CORES_ESPECIE = {
    'Domicílio particular': '#2f6fe0', 'Estabelecimento agropecuário': '#1f9d45',
    'Outras finalidades': '#8e44c9', 'Estabelecimento religioso': '#e6b800',
    'Domicílio coletivo': '#e0468a', 'Estabelecimento de saúde': '#e03131',
    'Estabelecimento de ensino': '#f07b12'
  };
  var COR_PADRAO = '#6b7a72';
  var COR_SITUACAO = { VALIDADO: '#00b050', NAO_VALIDADO: '#8d99a6' };
  var COR_PROP = { VALIDADO: '#00a046', NAO_VALIDADO: '#d08a1e' };
  var COR_VIA = '#ff8a00';
  var MOTIVOS_EXCLUSAO = ['Não existe / demolido', 'Duplicado', 'Não encontrado no local', 'Outro'];

  var OPCOES = {
    TIPO_PROPRIEDADE: ['Fazenda', 'Sítio', 'Chácara', 'Granja', 'Haras', 'Pesqueiro', 'Assentamento', 'Outro'],
    ATIVIDADES: ['Agricultura', 'Pecuária de leite', 'Pecuária de corte', 'Avicultura', 'Suinocultura',
                 'Equinocultura', 'Piscicultura', 'Apicultura', 'Silvicultura (eucalipto)', 'Turismo rural',
                 'Agroindústria', 'Só moradia / lazer'],
    CULTURAS: ['Café', 'Milho', 'Soja', 'Feijão', 'Batata', 'Morango', 'Uva', 'Hortaliças', 'Frutas',
               'Cana', 'Eucalipto', 'Pastagem'],
    REBANHO: ['Bovinos', 'Equinos', 'Suínos', 'Ovinos/Caprinos', 'Aves'],
    MAQUINARIO_BENS: ['Trator', 'Implementos', 'Colheitadeira', 'Ordenhadeira / tanque de leite',
                      'Defensivos / insumos', 'Combustível', 'Ferramentas', 'Produção armazenada',
                      'Painéis solares', 'Bomba / motor'],
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
  var RE_PLACA = /^[A-Z]{3}[0-9][A-Z0-9][0-9]{2}$/;
  var PRECISAO_MAX_CORRECAO = 50;

  /* ================================================================ */
  /* Utilidades                                                        */
  /* ================================================================ */
  function $(s) { return document.querySelector(s); }
  function esc(v) {
    return String(v == null ? '' : v).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
  }
  function normalizar(s) { return String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase(); }
  function numero(v) { var n = parseFloat(String(v == null ? '' : v).replace(',', '.')); return isFinite(n) ? n : null; }
  function distanciaM(lat1, lon1, lat2, lon2) {
    var r = Math.PI / 180;
    var a = Math.pow(Math.sin((lat2 - lat1) * r / 2), 2) +
            Math.cos(lat1 * r) * Math.cos(lat2 * r) * Math.pow(Math.sin((lon2 - lon1) * r / 2), 2);
    return 6371008.8 * 2 * Math.asin(Math.sqrt(a));
  }
  function rumo(lat1, lon1, lat2, lon2) {
    var r = Math.PI / 180;
    var y = Math.sin((lon2 - lon1) * r) * Math.cos(lat2 * r);
    var x = Math.cos(lat1 * r) * Math.sin(lat2 * r) - Math.sin(lat1 * r) * Math.cos(lat2 * r) * Math.cos((lon2 - lon1) * r);
    return ['N', 'NE', 'L', 'SE', 'S', 'SO', 'O', 'NO'][Math.round(((Math.atan2(y, x) / r + 360) % 360) / 45) % 8];
  }
  function fmtDist(m) { return m < 1000 ? Math.round(m) + ' m' : (m / 1000).toFixed(m < 10000 ? 1 : 0).replace('.', ',') + ' km'; }
  function fmtNum(n) { return Number(n || 0).toLocaleString('pt-BR'); }
  function p2(n) { return ('0' + n).slice(-2); }
  function fmtDataHora(iso) {
    var d = new Date(iso);
    if (!iso || isNaN(d)) return '—';
    return p2(d.getDate()) + '/' + p2(d.getMonth() + 1) + ' ' + p2(d.getHours()) + ':' + p2(d.getMinutes());
  }
  function fmtDataCompleta(iso) {
    var d = new Date(iso);
    if (!iso || isNaN(d)) return '';
    return p2(d.getDate()) + '/' + p2(d.getMonth() + 1) + '/' + d.getFullYear() + ' ' + p2(d.getHours()) + ':' + p2(d.getMinutes());
  }
  function haQuanto(iso) {
    var d = new Date(iso);
    if (!iso || isNaN(d)) return '';
    var dias = Math.floor((Date.now() - d.getTime()) / 86400000);
    return dias <= 0 ? 'hoje' : dias === 1 ? 'ontem' : dias < 60 ? 'há ' + dias + ' dias' : 'há ' + Math.round(dias / 30) + ' meses';
  }
  function novoUid() {
    if (window.crypto && crypto.randomUUID) return crypto.randomUUID();
    return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function (c) {
      var r = Math.random() * 16 | 0; return (c === 'x' ? r : (r & 0x3 | 0x8)).toString(16);
    });
  }
  function uidCurto(uid) { return String(uid).replace(/-/g, '').slice(0, 12); }
  function listaDe(v) { return String(v || '').split(/\s*;\s*/).filter(Boolean); }
  function simNao(v) { return v === 'SIM' ? 'Sim' : v === 'NAO' ? 'Não' : ''; }

  /* --- geometria --- */
  function noAnel(x, y, anel) {
    var dentro = false;
    for (var i = 0, j = anel.length - 1; i < anel.length; j = i++) {
      var xi = anel[i][0], yi = anel[i][1], xj = anel[j][0], yj = anel[j][1];
      if ((yi > y) !== (yj > y) && x < (xj - xi) * (y - yi) / (yj - yi) + xi) dentro = !dentro;
    }
    return dentro;
  }
  function naGeometria(lon, lat, g) {
    if (!g) return false;
    var polys = g.type === 'Polygon' ? [g.coordinates] : g.type === 'MultiPolygon' ? g.coordinates : [];
    return polys.some(function (p) {
      return noAnel(lon, lat, p[0]) && !p.slice(1).some(function (furo) { return noAnel(lon, lat, furo); });
    });
  }
  function paraLatLngs(g) {
    function anel(r) { return r.map(function (c) { return [c[1], c[0]]; }); }
    if (g.type === 'Polygon') return g.coordinates.map(anel);
    if (g.type === 'MultiPolygon') return g.coordinates.map(function (p) { return p.map(anel); });
    return [];
  }

  /* --- armazenamento --- */
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
    del: function (k) { return this.op('readwrite', function (s) { return s.delete(k); }); },
    chaves: function () { return this.op('readonly', function (s) { return s.getAllKeys(); }); },
    limpar: function () { return this.op('readwrite', function (s) { return s.clear(); }); }
  };

  function api(acao, dados, tempo) {
    if (!C.API_URL || C.API_URL.indexOf('COLE_AQUI') === 0) {
      return Promise.reject(new Error('Endereço da API não configurado (config.js).'));
    }
    var ctrl = new AbortController();
    var timer = setTimeout(function () { ctrl.abort(); }, tempo || 120000);
    return fetch(C.API_URL, {
      method: 'POST', headers: { 'Content-Type': 'text/plain;charset=utf-8' },
      body: JSON.stringify(Object.assign({ acao: acao }, dados || {})), redirect: 'follow', signal: ctrl.signal
    }).then(function (r) {
      if (!r.ok) throw new Error('Falha de comunicação (' + r.status + ').');
      return r.json();
    }).then(function (j) {
      if (!j.ok) { var e = new Error(j.erro || 'Erro no servidor.'); e.sessaoInvalida = !!j.sessaoInvalida; throw e; }
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
  var CAMPO_VAZIO = function () {
    return { enderecos: { cols: ['ID'], rows: [] }, propriedades: { cols: ['ID'], rows: [] },
             vias: { cols: ['ID'], rows: [] }, pontos: { cols: ['ID'], rows: [] } };
  };
  var E = {
    sessao: null,
    municipios: [],          // [{cod, nome, v}]
    bases: {},               // cod -> base
    campo: CAMPO_VAZIO(),    // camadas de campo vindas da planilha (cols/rows)
    fila: [],
    ends: [], endPorId: {}, props: [], propPorId: {}, vias: [], viaPorId: {}, pontos: [],
    mapa: null, render: null, g: {},
    destaque: null, marcaLocal: null, enquadrado: false,
    gps: { watch: null, seguir: false, pos: null, marcador: null, precisao: null },
    prefs: Object.assign({ base: 'mapa', ocultas: [], ocultasSituacao: [], colorir: 'situacao', vias: true,
                           pontos: true, props: true, ends: true, limites: true }, LS.get('prefs') || {}),
    sincronizando: false, enviando: false
  };

  /* ================================================================ */
  /* Telas, login, senha                                               */
  /* ================================================================ */
  function mostrarTela(nome) {
    ['login', 'senha', 'mapa'].forEach(function (t) { $('#tela-' + t).hidden = (t !== nome); });
  }
  function sessaoValida(s) { return !!(s && s.token && s.expira && new Date(s.expira) > new Date()); }

  function iniciar() {
    registrarServiceWorker();
    var s = LS.get('sessao');
    if (!sessaoValida(s)) { LS.del('sessao'); mostrarTela('login'); return; }
    E.sessao = s;
    if (s.trocarSenha) { mostrarTela('senha'); return; }
    abrirMapa();
  }

  $('#form-login').addEventListener('submit', function (ev) {
    ev.preventDefault();
    var btn = $('#btn-entrar'), erro = $('#login-erro');
    erro.textContent = '';
    btn.disabled = true; btn.textContent = 'Entrando…';
    api('login', { usuario: $('#login-usuario').value.trim(), senha: $('#login-senha').value }).then(function (r) {
      var anterior = LS.get('ultimoUsuario');
      E.sessao = { token: r.token, expira: r.expira, usuario: r.usuario, trocarSenha: r.trocarSenha };
      LS.set('sessao', E.sessao);
      $('#login-senha').value = '';
      var seguir = function () { if (r.trocarSenha) mostrarTela('senha'); else abrirMapa(); };
      // outro militar no mesmo aparelho: não herda dados do anterior (só os envios pendentes, se houver)
      if (anterior && anterior !== r.usuario.usuario) {
        E.prefs.munSel = null; LS.set('prefs', E.prefs);
        return IDB.get('fila').then(function (f) {
          return IDB.limpar().then(function () { if (f && f.length) return IDB.set('fila', f); });
        }).then(function () { LS.set('ultimoUsuario', r.usuario.usuario); seguir(); });
      }
      LS.set('ultimoUsuario', r.usuario.usuario);
      seguir();
    }).catch(function (e) { erro.textContent = e.message; })
      .finally(function () { btn.disabled = false; btn.textContent = 'Entrar'; });
  });

  $('#form-senha').addEventListener('submit', function (ev) {
    ev.preventDefault();
    var erro = $('#senha-erro');
    erro.textContent = '';
    var nova = $('#senha-nova').value;
    if (nova !== $('#senha-nova2').value) { erro.textContent = 'As senhas não conferem.'; return; }
    if (nova.length < 8) { erro.textContent = 'Use pelo menos 8 caracteres.'; return; }
    var btn = ev.target.querySelector('button');
    btn.disabled = true;
    api('trocarSenha', { token: E.sessao.token, senhaAtual: $('#senha-atual').value, senhaNova: nova }).then(function () {
      E.sessao.trocarSenha = false;
      LS.set('sessao', E.sessao);
      ev.target.reset();
      abrirMapa();
    }).catch(function (e) {
      if (e.sessaoInvalida) return sessaoExpirou(e.message);
      erro.textContent = e.message;
    }).finally(function () { btn.disabled = false; });
  });

  function sessaoExpirou(msg) {
    LS.del('sessao');
    E.sessao = null;
    LS.set('msgLogin', (msg || 'Sessão expirada.') +
      (E.fila.length ? ' Seus ' + E.fila.length + ' envio(s) pendente(s) estão guardados.' : ''));
    location.reload();
  }
  function sair() {
    if (E.sessao) api('sair', { token: E.sessao.token }).catch(function () {});
    LS.del('sessao'); LS.del('ultimoUsuario');
    E.sessao = null;
    IDB.limpar().catch(function () {}).then(function () { location.reload(); });
  }

  /* ================================================================ */
  /* Abertura e sincronização                                         */
  /* ================================================================ */
  function abrirMapa() {
    mostrarTela('mapa');
    if (!E.mapa) criarMapa();
    atualizarStatus();
    IDB.del('dados').catch(function () {}); // cópia da versão 1, não é mais usada
    Promise.all([IDB.get('municipios'), IDB.get('campo'), IDB.get('fila'), IDB.get('sincronizadoEm')]).then(function (r) {
      E.municipios = r[0] || [];
      E.campo = r[1] || CAMPO_VAZIO();
      E.fila = migrarFilaV1(Array.isArray(r[2]) ? r[2] : []);
      E.sincronizadoEm = r[3] || null;
      return Promise.all(E.municipios.map(function (m) {
        return IDB.get('base_' + m.cod).then(function (b) { if (b) E.bases[m.cod] = b; });
      }));
    }).then(function () {
      montar();
      var horas = E.sincronizadoEm ? (Date.now() - new Date(E.sincronizadoEm).getTime()) / 3600000 : Infinity;
      if (navigator.onLine && (horas >= (C.ATUALIZAR_APOS_HORAS || 12) || !Object.keys(E.bases).length)) {
        sincronizar(Object.keys(E.bases).length > 0);
      } else {
        enviarFila();
        if (!Object.keys(E.bases).length) toast('Sem dados no aparelho. Conecte-se à internet para baixar.', { duracao: 0 });
        else if (!selecionados(E.municipios) && E.municipios.length) { /* escolha feita no próximo acesso com sinal */ }
      }
    }).catch(function (e) {
      console.error(e);
      if (navigator.onLine) sincronizar(false);
    });
  }

  /** Envios pendentes feitos na versão 1 (só Poços de Caldas) viram envios da v2. */
  function migrarFilaV1(fila) {
    var mapa = { PROPRIEDADE_EDITAR: 'END_EDITAR', VISITA: 'END_VISITA', PROPRIEDADE_EXCLUIR: 'END_EXCLUIR', PROPRIEDADE_NOVA: 'END_NOVO' };
    var mudou = false;
    var nova = fila.map(function (it) {
      if (!mapa[it.tipo]) return it;
      mudou = true;
      var n = Object.assign({}, it, { tipo: mapa[it.tipo] });
      if (n.alvoId && /^CNEFE-\d+$/.test(n.alvoId)) n.alvoId = n.alvoId.replace(/^CNEFE-/, 'CNEFE-' + MUNICIPIO_V1 + '-');
      if (n.tipo === 'END_NOVO') n.mun = MUNICIPIO_V1;
      if (n.dados) {
        var d = {};
        if (n.dados.RESPONSAVEL !== undefined) d.MORADOR = n.dados.RESPONSAVEL;
        ['CONTATO', 'PLACAS_VEICULOS', 'TEM_CAO', 'TEM_CAMERAS', 'COMO_CHEGAR', 'OBS_SEGURANCA', 'ESPECIE',
         'LOCALIDADE', 'LOGRADOURO', 'NUMERO'].forEach(function (k) { if (n.dados[k] !== undefined) d[k] = n.dados[k]; });
        n.dados = d;
      }
      return n;
    }).filter(function (it) { return !(it.tipo === 'END_EDITAR' && !Object.keys(it.dados || {}).length && !it.novaPosicao && !it.registrarVisita); });
    if (mudou) IDB.set('fila', nova);
    return nova;
  }

  function sincronizar(silencioso) {
    if (E.sincronizando || !E.sessao) return Promise.resolve();
    if (!navigator.onLine) { toast('Sem sinal. Os dados serão atualizados quando houver internet.'); return Promise.resolve(); }
    E.sincronizando = true;
    atualizarStatus();
    if (!silencioso) toast('Atualizando dados…', { duracao: 0 });
    var baixadas = 0, semBase = [], escolher = false;
    return enviarFila(true).then(function () {
      return api('dados', { token: E.sessao.token });
    }).then(function (r) {
      if (r.usuario) { E.sessao.usuario = r.usuario; LS.set('sessao', E.sessao); }
      var lista = r.municipios || [];
      var sel = selecionados(lista);
      if (!sel) escolher = true;   // área grande: o militar escolhe antes de baixar
      var pendentes = lista.filter(function (m) {
        if (!sel || !sel[m.cod]) return false;
        if (!m.v) { semBase.push(m.nome); return false; }
        return !E.bases[m.cod] || E.bases[m.cod].v !== m.v;
      });
      var cadeia = Promise.resolve();
      pendentes.forEach(function (m, i) {
        cadeia = cadeia.then(function () {
          toast('Baixando ' + m.nome + ' (' + (i + 1) + ' de ' + pendentes.length + ')…', { duracao: 0 });
          return api('base', { token: E.sessao.token, cod: m.cod }, 300000).then(function (rb) {
            E.bases[m.cod] = rb.base;
            baixadas++;
            return IDB.set('base_' + m.cod, rb.base);
          });
        });
      });
      return cadeia.then(function () {
        // fora da área ou fora da seleção: apaga do aparelho
        Object.keys(E.bases).forEach(function (cod) {
          if (!sel || !sel[cod]) { delete E.bases[cod]; IDB.del('base_' + cod); }
        });
        E.municipios = lista;
        E.campo = r.campo;
        E.fila.forEach(function (it) { aplicarItemLocal(it); });
        E.sincronizadoEm = new Date().toISOString();
        return Promise.all([IDB.set('municipios', lista), IDB.set('campo', E.campo), IDB.set('sincronizadoEm', E.sincronizadoEm)]);
      });
    }).then(function () {
      montar();
      if (escolher) { abrirEscolhaMunicipios(true); return; }
      var msg = 'Dados atualizados: ' + Object.keys(E.bases).length + ' município(s) no aparelho' +
        (baixadas ? ', ' + baixadas + ' base(s) baixada(s)' : '') + '.';
      if (semBase.length) msg += ' Ainda sem base: ' + semBase.join(', ') + '.';
      toast(msg, { duracao: semBase.length ? 8000 : 4000 });
    }).catch(function (e) {
      if (e.sessaoInvalida) return sessaoExpirou(e.message);
      toast('Não foi possível atualizar: ' + e.message, { duracao: 7000 });
      if (baixadas) montar();
    }).finally(function () {
      E.sincronizando = false;
      atualizarStatus();
    });
  }

  /** Municípios a manter no aparelho: {cod:true}, ou null se o militar ainda precisa escolher. */
  function selecionados(lista) {
    var area = {};
    lista.forEach(function (m) { area[m.cod] = true; });
    var sel = (E.prefs.munSel || []).filter(function (c) { return area[c]; });
    if (!sel.length) {
      var ja = Object.keys(E.bases).filter(function (c) { return area[c]; });
      if (ja.length) sel = ja;
      else if (lista.length > MUNICIPIOS_AUTO) return null;
      else sel = Object.keys(area);
    }
    var mapa = {};
    sel.forEach(function (c) { mapa[c] = true; });
    return mapa;
  }

  function abrirEscolhaMunicipios(primeiraVez) {
    var atuais = {};
    (E.prefs.munSel || []).forEach(function (c) { atuais[c] = true; });
    if (!E.prefs.munSel) Object.keys(E.bases).forEach(function (c) { atuais[c] = true; });
    var lista = E.municipios.slice().sort(function (a, b) { return a.nome.localeCompare(b.nome, 'pt-BR'); });
    abrirPainel('<form data-form="municipios"><h2>Municípios neste aparelho</h2>' +
      '<p class="dica">' + (primeiraVez ? 'Sua área tem ' + lista.length + ' municípios. ' : '') +
      'Escolha os que você usa no serviço: só eles são baixados e ficam disponíveis sem sinal. Pode mudar depois pelo menu.</p>' +
      '<div class="acoes"><button type="button" class="btn btn-secundario" data-marcar="todos">Marcar todos</button>' +
      '<button type="button" class="btn btn-secundario" data-marcar="nenhum">Desmarcar todos</button></div>' +
      '<div class="opcoes">' + lista.map(function (m) {
        return '<label class="opcao opcao-form"><input type="checkbox" name="mun" value="' + esc(m.cod) + '"' + (atuais[m.cod] ? ' checked' : '') +
          '><span>' + esc(m.nome) + (m.v ? '' : ' <small>(base ainda não gerada)</small>') + '</span></label>';
      }).join('') + '</div><p class="erro" data-erro></p>' +
      '<div class="acoes"><button type="submit" class="btn btn-primario largo">Salvar e baixar</button></div></form>', 'form-municipios');
  }

  /* ================================================================ */
  /* Montagem: base do IBGE/CAR + camadas de campo                     */
  /* ================================================================ */
  function objetos(tab) {
    if (!tab || !tab.rows) return [];
    return tab.rows.map(function (row) {
      var o = {};
      for (var i = 0; i < tab.cols.length; i++) o[tab.cols[i]] = row[i] === undefined || row[i] === null ? '' : row[i];
      return o;
    });
  }
  function porId(lista) { var m = {}; lista.forEach(function (o) { m[o.ID] = o; }); return m; }
  function nomeMunicipio(cod) {
    var m = E.municipios.filter(function (x) { return x.cod === cod; })[0];
    return m ? m.nome : (E.bases[cod] ? E.bases[cod].nome : cod);
  }

  function fundirEnd(base, ov, mun) {
    var d = Object.assign({}, base || {});
    if (ov) Object.keys(ov).forEach(function (k) { if (ov[k] !== '' || k === 'STATUS') d[k] = ov[k]; });
    var lat = numero(ov && ov.LATITUDE) !== null ? numero(ov.LATITUDE) : numero(base && base.LAT);
    var lon = numero(ov && ov.LONGITUDE) !== null ? numero(ov.LONGITUDE) : numero(base && base.LON);
    if (lat === null || lon === null) return null;
    var e = { tipo: 'END', id: d.ID, mun: (ov && ov.COD_MUNICIPIO) || mun, lat: lat, lon: lon, d: d, base: base || null,
              especie: d.ESPECIE || 'Domicílio particular', validado: String(d.STATUS).toUpperCase() === 'VALIDADO',
              excluido: String(d.STATUS).toUpperCase() === 'EXCLUIDO',
              idProp: (ov && ov.ID_PROPRIEDADE) || (base && base.ID_PROP) || '' };
    e.titulo = d.NOME_ESTABELECIMENTO || (d.LOGRADOURO ? d.LOGRADOURO + (d.NUMERO && d.NUMERO !== 'SN' ? ', ' + d.NUMERO : '') : '') ||
               d.LOCALIDADE || e.especie;
    e.busca = normalizar([d.MORADOR, d.NOME_ESTABELECIMENTO, d.LOGRADOURO, d.NUMERO, d.LOCALIDADE, d.CEP, e.especie,
                          d.PLACAS_VEICULOS, String(d.PLACAS_VEICULOS || '').replace(/[\s,]/g, ''), nomeMunicipio(e.mun)].join(' '));
    return e;
  }

  function fundirProp(base, ov, mun) {
    var d = Object.assign({}, base || {});
    if (ov) Object.keys(ov).forEach(function (k) { if (ov[k] !== '' || k === 'STATUS') d[k] = ov[k]; });
    var sedeLat = numero(ov && ov.LATITUDE), sedeLon = numero(ov && ov.LONGITUDE);
    var lat = sedeLat !== null ? sedeLat : numero(base && base.LAT);
    var lon = sedeLon !== null ? sedeLon : numero(base && base.LON);
    if (lat === null || lon === null) return null;
    var p = { tipo: 'PROP', id: d.ID, mun: (ov && ov.COD_MUNICIPIO) || mun, lat: lat, lon: lon, d: d, base: base || null,
              geom: base && base.GEOM ? base.GEOM : null, bbox: base && base.BBOX ? base.BBOX : null,
              sedeMarcada: sedeLat !== null, validado: String(d.STATUS).toUpperCase() === 'VALIDADO',
              excluido: String(d.STATUS).toUpperCase() === 'EXCLUIDO', ends: [] };
    p.titulo = d.NOME_PROPRIEDADE || (d.TIPO_PROPRIEDADE ? d.TIPO_PROPRIEDADE + ' sem nome' : 'Imóvel rural' +
               (base && base.AREA_HA ? ' · ' + fmtArea(base.AREA_HA) : ''));
    p.busca = normalizar([d.NOME_PROPRIEDADE, d.TIPO_PROPRIEDADE, d.PROPRIETARIO, d.CASEIRO, d.CULTURAS, d.ATIVIDADES,
                          d.PLACAS_VEICULOS, String(d.PLACAS_VEICULOS || '').replace(/[\s,]/g, ''), d.COD_CAR,
                          'imovel rural propriedade', nomeMunicipio(p.mun)].join(' '));
    return p;
  }
  function fmtArea(ha) { ha = Number(ha) || 0; return (ha < 10 ? ha.toFixed(1) : Math.round(ha)).toString().replace('.', ',') + ' ha'; }

  function montar() {
    var ovEnd = porId(objetos(E.campo.enderecos)), ovProp = porId(objetos(E.campo.propriedades));
    var ovVia = porId(objetos(E.campo.vias));
    var usadosEnd = {}, usadosProp = {};
    E.ends = []; E.props = []; E.vias = []; E.endPorId = {}; E.propPorId = {}; E.viaPorId = {};

    Object.keys(E.bases).forEach(function (cod) {
      var b = E.bases[cod];
      objetos(b.propriedades).forEach(function (o) {
        var p = fundirProp(o, ovProp[o.ID], cod);
        usadosProp[o.ID] = true;
        if (p && !p.excluido) { E.props.push(p); E.propPorId[p.id] = p; }
      });
      objetos(b.enderecos).forEach(function (o) {
        var e = fundirEnd(o, ovEnd[o.ID], cod);
        usadosEnd[o.ID] = true;
        if (e && !e.excluido) { E.ends.push(e); E.endPorId[e.id] = e; }
      });
      objetos(b.vias).forEach(function (o) {
        var v = { tipo: 'VIA', id: o.ID, mun: cod, coords: o.GEOM, m: o.M, d: Object.assign({}, ovVia[o.ID] || {}) };
        E.vias.push(v); E.viaPorId[v.id] = v;
      });
    });
    // criados em campo (não existem na base)
    Object.keys(ovProp).forEach(function (id) {
      var o = ovProp[id];
      if (usadosProp[id] || !E.bases[o.COD_MUNICIPIO]) return;
      var p = fundirProp(null, o, o.COD_MUNICIPIO);
      if (p && !p.excluido) { E.props.push(p); E.propPorId[p.id] = p; }
    });
    Object.keys(ovEnd).forEach(function (id) {
      var o = ovEnd[id];
      if (usadosEnd[id] || !E.bases[o.COD_MUNICIPIO]) return;
      var e = fundirEnd(null, o, o.COD_MUNICIPIO);
      if (e && !e.excluido) { E.ends.push(e); E.endPorId[e.id] = e; }
    });
    E.ends.forEach(function (e) { var p = E.propPorId[e.idProp]; if (p) p.ends.push(e); });
    E.pontos = objetos(E.campo.pontos).filter(function (o) {
      return String(o.STATUS).toUpperCase() !== 'REMOVIDO' && E.bases[o.COD_MUNICIPIO];
    }).map(function (o) { return { tipo: 'PONTO', id: o.ID, mun: o.COD_MUNICIPIO, lat: numero(o.LATITUDE), lon: numero(o.LONGITUDE), d: o }; })
      .filter(function (p) { return p.lat !== null && p.lon !== null; });

    desenharTudo();
    atualizarStatus();
  }

  /* ================================================================ */
  /* Mapa e camadas                                                    */
  /* ================================================================ */
  function criarMapa() {
    E.render = L.canvas({ padding: 0.5, tolerance: 6 });
    E.mapa = L.map('mapa', { zoomControl: false, preferCanvas: true, renderer: E.render,
                             center: C.CENTRO || [-21.7878, -46.5613], zoom: C.ZOOM || 10, maxZoom: 20 });
    E.bases_ = {
      mapa: L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', { maxZoom: 20, maxNativeZoom: 19,
        attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>' }),
      satelite: L.tileLayer('https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}',
        { maxZoom: 20, maxNativeZoom: 18, attribution: 'Imagens &copy; Esri' })
    };
    trocarBase(E.prefs.base);
    E.mapa.attributionControl.setPrefix(false);
    ['limites', 'props', 'vias', 'ends', 'pontos'].forEach(function (k) { E.g[k] = L.layerGroup(); });
    E.mapa.on('zoomend', function () { ajustarRaios(); });
    E.mapa.on('moveend', function () { atualizarVisiveis(); atualizarPoligonos(); atualizarDica(); });
    E.mapa.on('click', function () { fecharPainel(); });
    E.mapa.on('contextmenu', function (ev) { abrirAdicionar(ev.latlng); });
    E.mapa.on('dragstart', function () { if (E.gps.seguir) { E.gps.seguir = false; atualizarBotaoGps(); } });
  }
  function trocarBase(nome) {
    Object.keys(E.bases_).forEach(function (k) { E.mapa.removeLayer(E.bases_[k]); });
    if (E.bases_[nome]) E.bases_[nome].addTo(E.mapa).bringToBack();
    E.baseAtual = nome; E.prefs.base = nome; LS.set('prefs', E.prefs);
  }
  function raioAtual() { var z = E.mapa.getZoom(); return z < 12 ? 3.5 : z < 14 ? 5 : z < 16 ? 7 : 9; }
  function ajustarRaios() {
    var r = raioAtual();
    var lista = E.modoLeve ? Object.keys(E.visiveis.ends).map(function (id) { return E.visiveis.ends[id]; }) : E.ends;
    lista.forEach(function (e) { if (e.marcador) e.marcador.setRadius(e.validado ? r + 1 : r); });
  }
  function camadaLigada(nome) { return E.prefs[nome] !== false; }
  function ligarCamada(nome, sim) {
    E.prefs[nome] = sim; LS.set('prefs', E.prefs);
    if (sim) E.g[nome].addTo(E.mapa); else E.mapa.removeLayer(E.g[nome]);
    if (nome === 'props') atualizarPoligonos();
    atualizarDica();
  }

  /* --- criação preguiçosa dos desenhos --- */
  function marcadorEnd(e) {
    if (!e.marcador) {
      e.marcador = L.circleMarker([e.lat, e.lon], estiloEnd(e, raioAtual())).on('click', function (ev) {
        L.DomEvent.stopPropagation(ev); abrirFichaEnd(e);
      });
    }
    return e.marcador;
  }
  function linhaVia(v) {
    if (!v.linha) {
      v.linha = L.polyline(v.latlngs, estiloVia(v)).on('click', function (ev) { L.DomEvent.stopPropagation(ev); abrirFichaVia(v); });
    }
    return v.linha;
  }

  /* --- grade espacial (modo leve) --- */
  function celulas(x0, y0, x1, y1) {
    var out = [];
    for (var i = Math.floor(x0 / CELULA); i <= Math.floor(x1 / CELULA); i++)
      for (var j = Math.floor(y0 / CELULA); j <= Math.floor(y1 / CELULA); j++) out.push(i + ':' + j);
    return out;
  }
  function gradeAdd(grade, x, bb) {
    celulas(bb[0], bb[1], bb[2], bb[3]).forEach(function (c) { (grade[c] || (grade[c] = [])).push(x); });
  }
  function gradeDel(grade, x, bb) {
    celulas(bb[0], bb[1], bb[2], bb[3]).forEach(function (c) {
      if (grade[c]) grade[c] = grade[c].filter(function (y) { return y !== x; });
    });
  }
  function bbVia(v) {
    var x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
    v.coords.forEach(function (c) { if (c[0] < x0) x0 = c[0]; if (c[0] > x1) x1 = c[0]; if (c[1] < y0) y0 = c[1]; if (c[1] > y1) y1 = c[1]; });
    return [x0, y0, x1, y1];
  }

  /** Modo leve: desenha só os endereços e vias que estão na tela. */
  function atualizarVisiveis(forcar) {
    if (!E.mapa || !E.modoLeve || !E.visiveis) return;
    var querer = { ends: {}, vias: {} };
    if (E.mapa.getZoom() >= ZOOM_DETALHE) {
      var b = E.mapa.getBounds().pad(0.3);
      celulas(b.getWest(), b.getSouth(), b.getEast(), b.getNorth()).forEach(function (c) {
        (E.grade.ends[c] || []).forEach(function (e) { if (passaFiltro(e)) querer.ends[e.id] = e; });
        (E.grade.vias[c] || []).forEach(function (v) { querer.vias[v.id] = v; });
      });
    }
    [['ends', marcadorEnd, 'marcador'], ['vias', linhaVia, 'linha']].forEach(function (cfg) {
      var nome = cfg[0], atual = E.visiveis[nome], quer = querer[nome];
      Object.keys(atual).forEach(function (id) {
        if (!quer[id] || quer[id] !== atual[id] || forcar === true) { E.g[nome].removeLayer(atual[id][cfg[2]]); delete atual[id]; }
      });
      Object.keys(quer).forEach(function (id) {
        if (atual[id]) return;
        E.g[nome].addLayer(cfg[1](quer[id]));
        atual[id] = quer[id];
      });
    });
    atualizarDica();
  }

  function atualizarDica() {
    var dica = $('#dica-zoom');
    if (!dica || !E.mapa) return;
    var z = E.mapa.getZoom();
    var temPol = camadaLigada('props') && E.props.some(function (p) { return p.geom; });
    var txt = '';
    if (E.modoLeve && z < ZOOM_DETALHE) txt = 'Aproxime o mapa para ver endereços, vias e propriedades';
    else if (temPol && z < ZOOM_POLIGONOS) txt = 'Aproxime o mapa para ver os limites das propriedades';
    dica.textContent = txt;
    dica.hidden = !txt;
  }

  function corEnd(e) {
    if (E.prefs.colorir === 'tipo') return CORES_ESPECIE[e.especie] || COR_PADRAO;
    return e.validado ? COR_SITUACAO.VALIDADO : COR_SITUACAO.NAO_VALIDADO;
  }
  function estiloEnd(e, raio) {
    var sit = E.prefs.colorir !== 'tipo';
    return { renderer: E.render, radius: e.validado ? raio + 1 : raio, color: sit && e.validado ? '#0b3d1f' : '#ffffff',
             weight: sit && e.validado ? 2 : 1.5, fillColor: corEnd(e), fillOpacity: 1 };
  }
  function estiloProp(p) {
    var c = p.validado ? COR_PROP.VALIDADO : COR_PROP.NAO_VALIDADO;
    return { renderer: E.render, color: c, weight: p.validado ? 2.5 : 1.5, opacity: 0.95,
             fillColor: c, fillOpacity: p.validado ? 0.14 : 0.05 };
  }
  function marcadorSede(p) {
    var c = p.validado ? COR_PROP.VALIDADO : COR_PROP.NAO_VALIDADO;
    return L.marker([p.lat, p.lon], {
      icon: L.divIcon({ className: '', iconSize: [18, 18], iconAnchor: [9, 9],
                        html: '<div class="marca-prop" style="background:' + c + '"></div>' }), keyboard: false
    }).on('click', function (ev) { L.DomEvent.stopPropagation(ev); abrirFichaProp(p); });
  }

  function desenharTudo() {
    Object.keys(E.g).forEach(function (k) { E.g[k].clearLayers(); });
    E.polVisiveis = {};
    E.visiveis = { ends: {}, vias: {} };
    E.grade = { ends: {}, vias: {} };
    E.modoLeve = E.ends.length + E.vias.length > LIMITE_LEVE;
    // limites dos municípios
    Object.keys(E.bases).forEach(function (cod) {
      var b = E.bases[cod];
      if (b.limite) E.g.limites.addLayer(L.polygon(paraLatLngs(b.limite), {
        renderer: E.render, fill: false, color: '#1f3d2b', weight: 2, opacity: 0.7, dashArray: '8 6', interactive: false
      }));
    });
    // vias
    E.vias.forEach(function (v) {
      if (!v.coords || v.coords.length < 2) return;
      v.latlngs = v.coords.map(function (c) { return [c[1], c[0]]; });
      if (E.modoLeve) gradeAdd(E.grade.vias, v, bbVia(v));
      else E.g.vias.addLayer(linhaVia(v));
    });
    // propriedades: sede (só as sem polígono) - polígonos entram por enquadramento
    E.props.forEach(function (p) { if (!p.geom) { p.sede = marcadorSede(p); E.g.props.addLayer(p.sede); } });
    // endereços
    if (E.modoLeve) E.ends.forEach(function (e) { gradeAdd(E.grade.ends, e, [e.lon, e.lat, e.lon, e.lat]); });
    aplicarVisibilidade();
    desenharPontos();
    ['limites', 'props', 'vias', 'ends', 'pontos'].forEach(function (k) {
      if (camadaLigada(k)) E.g[k].addTo(E.mapa); else E.mapa.removeLayer(E.g[k]);
    });
    if (!E.enquadrado && Object.keys(E.bases).length) {
      var b = L.latLngBounds([]);
      E.g.limites.eachLayer(function (l) { b.extend(l.getBounds()); });
      if (b.isValid()) E.mapa.fitBounds(b, { padding: [20, 20] });
      E.enquadrado = true;
    }
    atualizarPoligonos();
    atualizarDica();
  }

  function estiloVia(v) {
    var validada = String(v.d.STATUS).toUpperCase() === 'VALIDADO';
    var intrans = /Intransit/.test(v.d.TRAFEGAVEL_VIATURA);
    return { renderer: E.render, color: intrans ? '#c62828' : COR_VIA, weight: validada ? 4 : 3, opacity: 0.95,
             dashArray: validada ? null : '7 6' };
  }

  function passaFiltro(x) {
    var sit = x.validado ? 'VALIDADO' : 'NAO_VALIDADO';
    if (E.prefs.ocultasSituacao.indexOf(sit) !== -1) return false;
    if (x.tipo === 'END' && E.prefs.ocultas.indexOf(x.especie) !== -1) return false;
    return true;
  }
  function aplicarVisibilidade() {
    if (E.modoLeve) atualizarVisiveis(true);
    else E.ends.forEach(function (e) {
      var m = marcadorEnd(e), ver = passaFiltro(e), esta = E.g.ends.hasLayer(m);
      if (ver && !esta) E.g.ends.addLayer(m); else if (!ver && esta) E.g.ends.removeLayer(m);
    });
    E.props.forEach(function (p) {
      if (!p.sede) return;
      var ver = passaFiltro(p), esta = E.g.props.hasLayer(p.sede);
      if (ver && !esta) E.g.props.addLayer(p.sede); else if (!ver && esta) E.g.props.removeLayer(p.sede);
    });
    atualizarPoligonos(true);
  }

  /** Polígonos do CAR: só a partir de um zoom e só os que estão na tela (desempenho). */
  function atualizarPoligonos(forcar) {
    if (!E.mapa || !E.polVisiveis) return;
    var ligado = camadaLigada('props') && E.props.some(function (p) { return p.geom; });
    var perto = E.mapa.getZoom() >= ZOOM_POLIGONOS;
    var querer = {};
    if (ligado && perto) {
      var b = E.mapa.getBounds().pad(0.25);
      var x0 = b.getWest(), x1 = b.getEast(), y0 = b.getSouth(), y1 = b.getNorth(), n = 0;
      for (var i = 0; i < E.props.length && n < MAX_POLIGONOS; i++) {
        var p = E.props[i];
        if (!p.geom || !passaFiltro(p)) continue;
        var bb = p.bbox;
        if (bb && (bb[2] < x0 || bb[0] > x1 || bb[3] < y0 || bb[1] > y1)) continue;
        querer[p.id] = p; n++;
      }
    }
    Object.keys(E.polVisiveis).forEach(function (id) {
      if (!querer[id] || forcar === true) { E.g.props.removeLayer(E.polVisiveis[id].pol); delete E.polVisiveis[id]; }
    });
    Object.keys(querer).forEach(function (id) {
      if (E.polVisiveis[id]) return;
      var p = querer[id];
      if (!p.pol) {
        p.pol = L.polygon(paraLatLngs(p.geom), estiloProp(p)).on('click', function (ev) {
          L.DomEvent.stopPropagation(ev); abrirFichaProp(p);
        });
      }
      E.g.props.addLayer(p.pol);
      p.pol.bringToBack(); // fica por baixo dos endereços e vias (que continuam clicáveis)
      E.polVisiveis[id] = p;
    });
  }

  function desenharPontos() {
    E.g.pontos.clearLayers();
    E.pontos.forEach(function (pt) {
      var est = ESTILO_PONTO[pt.d.TIPO] || ESTILO_PONTO.Outro;
      pt.marcador = L.marker([pt.lat, pt.lon], {
        icon: L.divIcon({ className: '', iconSize: [24, 24], iconAnchor: [12, 12],
                          html: '<div class="marca-ponto" style="background:' + est[0] + '">' + esc(est[1]) + '</div>' }),
        keyboard: false
      }).on('click', function (ev) { L.DomEvent.stopPropagation(ev); abrirFichaPonto(pt); });
      E.g.pontos.addLayer(pt.marcador);
    });
  }

  /** Atualiza só o registro alterado (sem redesenhar milhares de pontos). */
  function refazer(tipo, id) {
    var ov, base, novo, velho;
    if (tipo === 'END') {
      velho = E.endPorId[id];
      ov = porId(objetos(E.campo.enderecos))[id];
      base = velho ? velho.base : null;
      novo = fundirEnd(base, ov, velho ? velho.mun : ov && ov.COD_MUNICIPIO);
      if (velho) {
        if (velho.marcador) E.g.ends.removeLayer(velho.marcador);
        if (E.modoLeve) { gradeDel(E.grade.ends, velho, [velho.lon, velho.lat, velho.lon, velho.lat]); delete E.visiveis.ends[id]; }
        E.ends.splice(E.ends.indexOf(velho), 1);
        delete E.endPorId[id];
        var pv = E.propPorId[velho.idProp];
        if (pv) pv.ends = pv.ends.filter(function (x) { return x.id !== id; });
      }
      if (novo && !novo.excluido) {
        if (E.modoLeve) gradeAdd(E.grade.ends, novo, [novo.lon, novo.lat, novo.lon, novo.lat]);
        E.ends.push(novo); E.endPorId[id] = novo;
        var pn = E.propPorId[novo.idProp];
        if (pn) pn.ends.push(novo);
      }
    } else if (tipo === 'PROP') {
      velho = E.propPorId[id];
      ov = porId(objetos(E.campo.propriedades))[id];
      novo = fundirProp(velho ? velho.base : null, ov, velho ? velho.mun : ov && ov.COD_MUNICIPIO);
      if (velho) {
        if (velho.sede) E.g.props.removeLayer(velho.sede);
        if (velho.pol) E.g.props.removeLayer(velho.pol);
        delete E.polVisiveis[id];
        E.props.splice(E.props.indexOf(velho), 1);
        delete E.propPorId[id];
      }
      if (novo && !novo.excluido) {
        novo.ends = velho ? velho.ends : [];
        if (!novo.geom) novo.sede = marcadorSede(novo);
        E.props.push(novo); E.propPorId[id] = novo;
      }
    } else if (tipo === 'VIA') {
      var v = E.viaPorId[id];
      if (v) { v.d = Object.assign({}, porId(objetos(E.campo.vias))[id] || {}); if (v.linha) v.linha.setStyle(estiloVia(v)); }
    } else if (tipo === 'PONTO') {
      E.pontos = objetos(E.campo.pontos).filter(function (o) { return String(o.STATUS).toUpperCase() !== 'REMOVIDO'; })
        .map(function (o) { return { tipo: 'PONTO', id: o.ID, mun: o.COD_MUNICIPIO, lat: numero(o.LATITUDE), lon: numero(o.LONGITUDE), d: o }; })
        .filter(function (p) { return p.lat !== null && p.lon !== null; });
      desenharPontos();
    }
    aplicarVisibilidade();
  }

  /* ================================================================ */
  /* Fila de envios (funciona sem sinal)                               */
  /* ================================================================ */
  function registrar(item) {
    item.uid = item.uid || novoUid();
    item.feitoEm = new Date().toISOString();
    if (E.gps.pos) item.posicao = { lat: E.gps.pos.lat, lon: E.gps.pos.lon, precisao: E.gps.pos.precisao };
    E.fila.push(item);
    var alvo = aplicarItemLocal(item);
    if (alvo) refazer(alvo.tipo, alvo.id);
    return Promise.all([IDB.set('fila', E.fila), IDB.set('campo', E.campo)]).then(function () {
      atualizarStatus();
      toast(navigator.onLine ? 'Salvo. Enviando…' : 'Salvo no aparelho. Será enviado quando houver sinal.');
      enviarFila();
      return alvo;
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
      var recusados = [], antes = E.fila.length;
      E.fila = E.fila.filter(function (it) {
        var x = porUid[it.uid];
        if (!x) return true;
        if (x.ok) return false;
        if (x.definitivo) { recusados.push(x.erro); return false; }
        return true;
      });
      var enviados = antes - E.fila.length - recusados.length;
      return IDB.set('fila', E.fila).then(function () {
        atualizarSelosPendentes();
        if (recusados.length) toast('Um envio não foi aceito: ' + recusados[0], { duracao: 9000 });
        else if (enviados > 0 && !silencioso) toast(enviados === 1 ? 'Enviado para a base.' : enviados + ' envios gravados na base.');
        if (E.fila.length && enviados > 0) { E.enviando = false; return enviarFila(silencioso); }
      });
    }).catch(function (e) {
      if (e.sessaoInvalida) return sessaoExpirou(e.message);
      if (!silencioso) toast('Envio adiado: ' + e.message, { duracao: 5000 });
    }).finally(function () { E.enviando = false; atualizarStatus(); });
  }
  window.addEventListener('online', function () { atualizarStatus(); enviarFila(); });
  window.addEventListener('offline', function () { atualizarStatus(); });
  setInterval(function () { enviarFila(true); }, 60000);

  /** Aplica o envio na cópia local das camadas de campo. Devolve {tipo, id} do registro afetado. */
  function aplicarItemLocal(it) {
    var u = (E.sessao && E.sessao.usuario && E.sessao.usuario.usuario) || '';
    var autoria = { ATUALIZADO_EM: it.feitoEm, ATUALIZADO_POR: u };
    var visita = { DATA_ULTIMA_VISITA: it.feitoEm, ULTIMA_VISITA_POR: u };
    function tabela(nome) { return E.campo[nome] || (E.campo[nome] = { cols: ['ID'], rows: [] }); }
    function col(t, c) {
      var i = t.cols.indexOf(c);
      if (i === -1) { t.cols.push(c); t.rows.forEach(function (r) { r.push(''); }); i = t.cols.length - 1; }
      return i;
    }
    function linha(t, id, mun, origem) {
      var iId = col(t, 'ID');
      for (var k = 0; k < t.rows.length; k++) if (t.rows[k][iId] === id) return t.rows[k];
      var r = t.cols.map(function () { return ''; });
      r[iId] = id;
      t.rows.push(r);
      setar(t, r, { COD_MUNICIPIO: mun || '', ORIGEM: origem || '' });
      return r;
    }
    function setar(t, r, v) { Object.keys(v).forEach(function (c) { r[col(t, c)] = v[c] == null ? '' : v[c]; }); }
    function munDe(id) {
      var m = /^CNEFE-(\d{7})-/.exec(id) || /^CAR-[A-Z]{2}-(\d{7})-/.exec(id) || /^IBGE-(\d{7})-/.exec(id);
      return m ? m[1] : '';
    }
    function origemDe(id) { return /^CNEFE-/.test(id) ? 'CNEFE' : /^CAR-/.test(id) ? 'CAR' : ''; }
    var ehEnd = /^END_/.test(it.tipo), t = tabela(ehEnd ? 'enderecos' : 'propriedades');
    var tipoAlvo = ehEnd ? 'END' : 'PROP', r, id;

    switch (it.tipo) {
      case 'END_EDITAR': case 'PROP_EDITAR':
        r = linha(t, it.alvoId, munDe(it.alvoId), origemDe(it.alvoId));
        setar(t, r, Object.assign({}, it.dados, { STATUS: 'VALIDADO' }, autoria, it.registrarVisita ? visita : {}));
        if (it.novaPosicao) setar(t, r, { LATITUDE: it.novaPosicao.lat.toFixed(6), LONGITUDE: it.novaPosicao.lon.toFixed(6),
                                          PRECISAO_COORD: 'GPS_CAMPO ±' + Math.round(it.novaPosicao.precisao) + 'm' });
        return { tipo: tipoAlvo, id: it.alvoId };
      case 'END_VISITA': case 'PROP_VISITA':
        r = linha(t, it.alvoId, munDe(it.alvoId), origemDe(it.alvoId));
        setar(t, r, Object.assign({}, visita, autoria));
        return { tipo: tipoAlvo, id: it.alvoId };
      case 'END_EXCLUIR': case 'PROP_EXCLUIR':
        r = linha(t, it.alvoId, munDe(it.alvoId), origemDe(it.alvoId));
        setar(t, r, Object.assign({ STATUS: 'EXCLUIDO' }, autoria));
        return { tipo: tipoAlvo, id: it.alvoId };
      case 'END_NOVO': case 'PROP_NOVA':
        id = (ehEnd ? 'CAMPO-' : 'PR-') + uidCurto(it.uid);
        r = linha(t, id, it.mun, 'CAMPO');
        setar(t, r, Object.assign({ LATITUDE: it.novaPosicao.lat.toFixed(6), LONGITUDE: it.novaPosicao.lon.toFixed(6),
          STATUS: 'VALIDADO', ID_PROPRIEDADE: it.idPropriedade || '' }, ehEnd ? { ESPECIE: 'Domicílio particular' } : {},
          it.dados, autoria, it.registrarVisita ? visita : {}));
        return { tipo: tipoAlvo, id: id };
      case 'VIA_VALIDAR':
        t = tabela('vias');
        r = linha(t, it.alvoId, munDe(it.alvoId));
        setar(t, r, Object.assign({}, it.dados, { STATUS: 'VALIDADO' }, autoria));
        return { tipo: 'VIA', id: it.alvoId };
      case 'PONTO_NOVO':
        t = tabela('pontos');
        id = 'PI-' + uidCurto(it.uid);
        r = linha(t, id, it.mun);
        setar(t, r, Object.assign({ LATITUDE: it.novaPosicao.lat.toFixed(6), LONGITUDE: it.novaPosicao.lon.toFixed(6), STATUS: 'ATIVO' },
                                  it.dados, autoria));
        return { tipo: 'PONTO', id: id };
      case 'PONTO_EDITAR':
        t = tabela('pontos');
        r = linha(t, it.alvoId);
        setar(t, r, Object.assign({}, it.dados, autoria, it.remover ? { STATUS: 'REMOVIDO' } : {}));
        return { tipo: 'PONTO', id: it.alvoId };
    }
    return null;
  }

  function pendentePara(id) {
    return E.fila.some(function (it) {
      return it.alvoId === id || 'CAMPO-' + uidCurto(it.uid) === id || 'PR-' + uidCurto(it.uid) === id ||
             'PI-' + uidCurto(it.uid) === id;
    });
  }

  /* ================================================================ */
  /* Status, toast, painel                                             */
  /* ================================================================ */
  function atualizarStatus() {
    var el = $('#status');
    var online = navigator.onLine;
    el.classList.toggle('offline', !online);
    var txt = E.sincronizando ? 'Atualizando dados…'
      : !Object.keys(E.bases).length ? (online ? 'Sem dados no aparelho' : 'Sem sinal · sem dados')
      : (online ? 'Online' : 'Sem sinal') + ' · dados de ' + fmtDataHora(E.sincronizadoEm);
    var pend = E.fila.length ? '<span class="pendentes">' + (E.enviando ? 'enviando ' : '') + E.fila.length +
      ' pendente' + (E.fila.length > 1 ? 's' : '') + '</span>' : '';
    el.innerHTML = '<span class="ponto"></span><span>' + esc(txt) + '</span>' + pend;
  }

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
    if (!painelAberto) { painelAberto = true; try { history.pushState({ painel: true }, ''); } catch (e) { /* ignora */ } }
  }
  function fecharPainel(semHistorico) {
    if (!painelAberto) return;
    painelAberto = false;
    $('#painel').hidden = true;
    removerDestaque();
    removerMarcaLocal();
    if (!semHistorico) { try { history.back(); } catch (e) { /* ignora */ } }
  }
  window.addEventListener('popstate', function () { if (painelAberto) fecharPainel(true); });
  $('#painel-fechar').addEventListener('click', function () { fecharPainel(); });

  function destacar(x) {
    removerDestaque();
    if (x.geom) {
      E.destaque = L.polygon(paraLatLngs(x.geom), { color: '#00e5ff', weight: 4, fill: false, interactive: false }).addTo(E.mapa);
    } else if (x.latlngs) {
      E.destaque = L.polyline(x.latlngs, { color: '#00e5ff', weight: 8, opacity: 0.7, interactive: false }).addTo(E.mapa);
    } else {
      E.destaque = L.circleMarker([x.lat, x.lon], { radius: 16, color: '#f2b134', weight: 4, fill: false, interactive: false }).addTo(E.mapa);
    }
  }
  function removerDestaque() { if (E.destaque) { E.mapa.removeLayer(E.destaque); E.destaque = null; } }
  function marcarLocal(ll) {
    removerMarcaLocal();
    E.marcaLocal = L.marker(ll, { icon: L.divIcon({ className: '', html: '<div class="marca-nova"></div>', iconSize: [26, 26], iconAnchor: [13, 26] }),
                                  interactive: false }).addTo(E.mapa);
  }
  function removerMarcaLocal() { if (E.marcaLocal) { E.mapa.removeLayer(E.marcaLocal); E.marcaLocal = null; } }

  /** Centraliza deixando o alvo visível acima do painel. */
  function focar(x) {
    var alturaPainel = Math.min(window.innerHeight * 0.55, 480);
    if (window.innerWidth >= 720) alturaPainel = 0;
    if (x.geom && x.bbox) {
      E.mapa.fitBounds([[x.bbox[1], x.bbox[0]], [x.bbox[3], x.bbox[2]]],
        { paddingTopLeft: [20, 90], paddingBottomRight: [20, alturaPainel + 20], maxZoom: 17 });
      return;
    }
    var z = Math.max(E.mapa.getZoom(), 15);
    var p = E.mapa.project([x.lat, x.lon], z).add([0, alturaPainel / 2]);
    E.mapa.setView(E.mapa.unproject(p, z), z);
  }

  /* ================================================================ */
  /* Fichas                                                            */
  /* ================================================================ */
  function campo(rotulo, valorHtml) { return valorHtml ? '<div><dt>' + esc(rotulo) + '</dt><dd>' + valorHtml + '</dd></div>' : ''; }
  function grupo(titulo, conteudo) { return conteudo ? '<h3>' + esc(titulo) + '</h3><dl class="campos">' + conteudo + '</dl>' : ''; }
  function seloStatus(ok, id) {
    return '<span class="selo' + (ok ? ' ok' : '') + '">' + (ok ? 'VALIDADO' : 'NÃO VALIDADO') + '</span>' +
      (pendentePara(id) ? '<span class="selo pend" data-pend="' + esc(id) + '">AGUARDANDO ENVIO</span>' : '');
  }
  function atualizarSelosPendentes() {
    Array.prototype.forEach.call(document.querySelectorAll('#painel [data-pend]'), function (el) {
      if (!pendentePara(el.getAttribute('data-pend'))) el.remove();
    });
  }
  function tel(v) { return v ? '<a href="tel:' + esc(String(v).replace(/[^\d+]/g, '')) + '">' + esc(v) + '</a>' : ''; }
  function distancia(x) {
    if (!E.gps.pos) return '';
    return esc(fmtDist(distanciaM(E.gps.pos.lat, E.gps.pos.lon, x.lat, x.lon))) + ' em linha reta, rumo ' +
           esc(rumo(E.gps.pos.lat, E.gps.pos.lon, x.lat, x.lon));
  }
  function blocoVisita(d) {
    return grupo('Última visita', campo('Data', d.DATA_ULTIMA_VISITA
      ? esc(fmtDataCompleta(d.DATA_ULTIMA_VISITA)) + ' · ' + esc(haQuanto(d.DATA_ULTIMA_VISITA)) +
        (d.ULTIMA_VISITA_POR ? '<br><small>por ' + esc(d.ULTIMA_VISITA_POR) + '</small>' : '')
      : '<span class="vazio-txt">Nunca visitado pelo sistema</span>'));
  }
  function botoesNavegar(x) {
    var c = x.lat.toFixed(6) + ', ' + x.lon.toFixed(6);
    return '<div class="acoes">' +
      '<a class="btn btn-secundario" target="_blank" rel="noopener" href="https://www.google.com/maps/dir/?api=1&destination=' + x.lat + ',' + x.lon + '">Google Maps</a>' +
      '<a class="btn btn-secundario" target="_blank" rel="noopener" href="https://waze.com/ul?ll=' + x.lat + ',' + x.lon + '&navigate=yes">Waze</a>' +
      '<button class="btn btn-secundario largo" data-copiar="' + esc(c) + '">Copiar coordenadas</button></div>';
  }
  function rodape(x) {
    var d = x.d;
    return '<p class="rodape-ficha">' + esc(nomeMunicipio(x.mun)) + ' · ID ' + esc(x.id) +
      (d.ATUALIZADO_POR ? '<br>Atualizado por ' + esc(d.ATUALIZADO_POR) + ' em ' + esc(fmtDataHora(d.ATUALIZADO_EM)) : '') + '</p>';
  }

  function abrirFichaEnd(e, semMover) {
    var d = e.d, prop = E.propPorId[e.idProp];
    destacar(e);
    var endereco = [d.LOGRADOURO, d.NUMERO && d.NUMERO !== 'SN' ? 'nº ' + d.NUMERO : (d.NUMERO === 'SN' ? 's/nº' : '')].filter(Boolean).join(', ');
    var html =
      '<p class="ficha-tipo"><span class="bolinha-in" style="background:' + (CORES_ESPECIE[e.especie] || COR_PADRAO) + '"></span>' +
      'Endereço · ' + esc(e.especie) + seloStatus(e.validado, e.id) + '</p>' +
      '<h2>' + esc(e.titulo) + '</h2>' +
      (d.OBS_SEGURANCA ? '<div class="alerta"><strong>Segurança:</strong> ' + esc(d.OBS_SEGURANCA) + '</div>' : '') +
      (prop ? '<button class="link-prop" data-abrir-prop="' + esc(prop.id) + '"><span class="marca-prop mini" style="background:' +
              (prop.validado ? COR_PROP.VALIDADO : COR_PROP.NAO_VALIDADO) + '"></span>Dentro de: <strong>' + esc(prop.titulo) + '</strong> ›</button>' : '') +
      '<div class="acoes acoes-topo">' +
        '<button class="btn btn-primario" data-acao="editar-end" data-id="' + esc(e.id) + '">Atualizar informações</button>' +
        '<button class="btn btn-secundario" data-acao="visita-end" data-id="' + esc(e.id) + '">Registrar visita</button></div>' +
      blocoVisita(d) +
      grupo('Morador', campo('Nome', esc(d.MORADOR)) + campo('Telefone', tel(d.CONTATO)) +
        campo('Moradores', esc(d.N_MORADORES)) + campo('Placas', esc(d.PLACAS_VEICULOS)) +
        campo('Cão', esc(simNao(d.TEM_CAO))) + campo('Câmeras', esc(simNao(d.TEM_CAMERAS)))) +
      grupo('Localização', campo('Município', esc(nomeMunicipio(e.mun))) + campo('Localidade', esc(d.LOCALIDADE)) +
        campo('Endereço', esc(endereco)) + campo('Complemento', esc(d.COMPLEMENTO)) + campo('CEP', esc(d.CEP)) +
        campo('Coordenadas', esc(e.lat.toFixed(6) + ', ' + e.lon.toFixed(6)) + (/^GPS_CAMPO/.test(d.PRECISAO_COORD) ? '<br><small>conferida em campo</small>' : '')) +
        campo('Distância', distancia(e)) + campo('Como chegar', esc(d.COMO_CHEGAR))) +
      botoesNavegar(e) +
      '<div class="acoes"><button class="btn btn-perigo-leve largo" data-acao="excluir-end" data-id="' + esc(e.id) + '">Excluir endereço (não confere com a realidade)</button></div>' +
      rodape(e);
    abrirPainel(html, 'ficha-end');
    if (!semMover) focar(e);
  }

  function abrirFichaProp(p, semMover) {
    var d = p.d, b = p.base || {};
    destacar(p);
    var rebanho = listaDe(d.REBANHO).join(' · ');
    var operadora = d.SINAL_CELULAR === 'SIM' && d.OPERADORA ? ' (' + d.OPERADORA + ')' : '';
    var lista = p.ends.slice(0, 30).map(function (e) {
      return '<li><button class="resultado" data-abrir-end="' + esc(e.id) + '"><span class="bolinha" style="background:' + corEnd(e) + '"></span>' +
        '<span class="txt"><span class="t1">' + esc(e.d.MORADOR || e.titulo) + '</span><span class="t2">' + esc(e.especie) + '</span></span></button></li>';
    }).join('');
    var html =
      '<p class="ficha-tipo"><span class="marca-prop mini" style="background:' + (p.validado ? COR_PROP.VALIDADO : COR_PROP.NAO_VALIDADO) + '"></span>' +
      'Propriedade rural' + (d.TIPO_PROPRIEDADE ? ' · ' + esc(d.TIPO_PROPRIEDADE) : '') + seloStatus(p.validado, p.id) + '</p>' +
      '<h2>' + esc(p.titulo) + '</h2>' +
      (d.OBS_SEGURANCA ? '<div class="alerta"><strong>Segurança:</strong> ' + esc(d.OBS_SEGURANCA) + '</div>' : '') +
      '<div class="acoes acoes-topo">' +
        '<button class="btn btn-primario" data-acao="editar-prop" data-id="' + esc(p.id) + '">Atualizar informações</button>' +
        '<button class="btn btn-secundario" data-acao="visita-prop" data-id="' + esc(p.id) + '">Registrar visita</button></div>' +
      blocoVisita(d) +
      grupo('Responsáveis', campo('Proprietário', esc(d.PROPRIETARIO)) + campo('Telefone', tel(d.CONTATO)) +
        campo('Caseiro / adm.', esc(d.CASEIRO)) + campo('Tel. caseiro', tel(d.CONTATO_CASEIRO))) +
      grupo('Atividade', campo('Atividades', esc(listaDe(d.ATIVIDADES).join(', '))) + campo('Culturas', esc(listaDe(d.CULTURAS).join(', '))) +
        campo('Rebanho', esc(rebanho)) + campo('Máquinas e bens', esc(listaDe(d.MAQUINARIO_BENS).join(', ')))) +
      grupo('Segurança e rotina', campo('Placas', esc(d.PLACAS_VEICULOS)) + campo('Cão', esc(simNao(d.TEM_CAO))) +
        campo('Câmeras', esc(simNao(d.TEM_CAMERAS))) + campo('Cerca elétrica', esc(simNao(d.CERCA_ELETRICA))) +
        campo('Sinal de celular', esc(simNao(d.SINAL_CELULAR) + operadora)) + campo('Fica vazia', esc(d.PERIODOS_VAZIA)) +
        campo('Grupo de vizinhos', esc(simNao(d.GRUPO_VIZINHOS)))) +
      grupo('Imóvel', campo('Município', esc(nomeMunicipio(p.mun))) + campo('Área', b.AREA_HA ? esc(fmtArea(b.AREA_HA)) : '') +
        campo('Módulos fiscais', esc(b.MOD_FISCAL)) + campo('CAR', b.COD_CAR ? '<small>' + esc(b.COD_CAR) + '</small>' : 'Sem CAR (cadastrada em campo)') +
        campo('Situação no CAR', esc(b.CONDICAO)) +
        campo(p.sedeMarcada ? 'Sede' : 'Centro', esc(p.lat.toFixed(6) + ', ' + p.lon.toFixed(6)) + (p.sedeMarcada ? '<br><small>marcada em campo</small>' : '')) +
        campo('Distância', distancia(p)) + campo('Como chegar', esc(d.COMO_CHEGAR))) +
      (p.ends.length ? '<h3>Endereços dentro do imóvel (' + p.ends.length + ')</h3><ul class="resultados">' + lista + '</ul>' +
        (p.ends.length > 30 ? '<p class="dica">Mostrando 30.</p>' : '') : '') +
      botoesNavegar(p) +
      '<div class="acoes"><button class="btn btn-perigo-leve largo" data-acao="excluir-prop" data-id="' + esc(p.id) + '">Excluir propriedade (não confere com a realidade)</button></div>' +
      rodape(p);
    abrirPainel(html, 'ficha-prop');
    if (!semMover) focar(p);
  }

  function abrirFichaVia(v) {
    var d = v.d, validada = String(d.STATUS).toUpperCase() === 'VALIDADO';
    destacar(v);
    var html = '<p class="ficha-tipo">Trecho de via (IBGE)' + seloStatus(validada, v.id) + '</p>' +
      '<h2>' + esc(d.TIPO_VIA || 'Via rural') + ' · ' + esc(fmtDist(Number(v.m) || 0)) + '</h2>' +
      (/Intransit/.test(d.TRAFEGAVEL_VIATURA) ? '<div class="alerta perigo">Marcado como intransitável.</div>' : '') +
      '<dl class="campos">' + campo('Condição', esc(d.CONDICAO)) + campo('Viatura', esc(d.TRAFEGAVEL_VIATURA)) +
      campo('Observações', esc(d.OBS)) + campo('Conferido', validada && d.ATUALIZADO_POR ? esc(d.ATUALIZADO_POR + ' em ' + fmtDataHora(d.ATUALIZADO_EM)) : '') +
      campo('Município', esc(nomeMunicipio(v.mun))) + '</dl>' +
      (validada ? '' : '<div class="alerta">Trecho percorrido pelos recenseadores do Censo 2022. Ainda não conferido pela patrulha.</div>') +
      '<div class="acoes"><button class="btn btn-primario largo" data-acao="validar-via" data-id="' + esc(v.id) + '">' +
      (validada ? 'Atualizar trecho' : 'Conferir este trecho') + '</button></div>';
    abrirPainel(html, 'ficha-via');
  }

  function abrirFichaPonto(pt) {
    var o = pt.d, est = ESTILO_PONTO[o.TIPO] || ESTILO_PONTO.Outro;
    destacar(pt);
    var html = '<p class="ficha-tipo"><span class="marca-ponto mini" style="background:' + est[0] + '">' + esc(est[1]) + '</span>' +
      esc(o.TIPO || 'Ponto de interesse') + (pendentePara(o.ID) ? '<span class="selo pend" data-pend="' + esc(o.ID) + '">AGUARDANDO ENVIO</span>' : '') + '</p>' +
      '<h2>' + esc(o.NOME || o.TIPO || 'Ponto de interesse') + '</h2><dl class="campos">' +
      campo('Descrição', esc(o.DESCRICAO)) +
      campo('Sinal de celular', esc(simNao(o.TEM_SINAL_CELULAR) + (o.OPERADORA ? ' (' + o.OPERADORA + ')' : ''))) +
      campo('Coordenadas', esc(pt.lat.toFixed(6) + ', ' + pt.lon.toFixed(6))) + campo('Distância', distancia(pt)) +
      campo('Município', esc(nomeMunicipio(pt.mun))) + campo('Cadastrado por', esc(o.ATUALIZADO_POR)) + '</dl>' +
      '<div class="acoes"><button class="btn btn-primario" data-acao="editar-ponto" data-id="' + esc(o.ID) + '">Editar</button>' +
      '<button class="btn btn-perigo" data-acao="remover-ponto" data-id="' + esc(o.ID) + '">Remover</button>' +
      '<button class="btn btn-secundario largo" data-copiar="' + esc(pt.lat.toFixed(6) + ', ' + pt.lon.toFixed(6)) + '">Copiar coordenadas</button></div>';
    abrirPainel(html, 'ficha-ponto');
  }

  /* ================================================================ */
  /* Formulários                                                       */
  /* ================================================================ */
  var F = {
    texto: function (n, r, v, x) { return '<label class="campo">' + esc(r) + '<input name="' + n + '" value="' + esc(v) + '" ' + (x || '') + '></label>'; },
    area: function (n, r, v, dica) {
      return '<label class="campo">' + esc(r) + '<textarea name="' + n + '" rows="3" maxlength="1000" placeholder="' + esc(dica || '') + '">' + esc(v) + '</textarea></label>';
    },
    simNao: function (n, r, v) {
      return '<div class="campo"><span>' + esc(r) + '</span><div class="seg3">' + [['SIM', 'Sim'], ['NAO', 'Não'], ['', 'Não sei']].map(function (o) {
        return '<label><input type="radio" name="' + n + '" value="' + o[0] + '"' + (String(v || '') === o[0] ? ' checked' : '') + '><span>' + o[1] + '</span></label>';
      }).join('') + '</div></div>';
    },
    chips: function (n, r, opcoes, v, comOutro) {
      var at = listaDe(v), outros = at.filter(function (x) { return opcoes.indexOf(x) === -1; });
      return '<div class="campo"><span>' + esc(r) + '</span><div class="chips">' + opcoes.map(function (o) {
        return '<label class="chip"><input type="checkbox" name="' + n + '" value="' + esc(o) + '"' + (at.indexOf(o) !== -1 ? ' checked' : '') + '><span>' + esc(o) + '</span></label>';
      }).join('') + '</div>' + (comOutro === false ? '' : '<input name="' + n + '__outro" class="outro" placeholder="Outro (escreva)" value="' + esc(outros.join('; ')) + '">') + '</div>';
    },
    escolha: function (n, r, opcoes, v, obrig) {
      return '<label class="campo">' + esc(r) + '<select name="' + n + '"' + (obrig ? ' required' : '') + '><option value="">' + (obrig ? 'Selecione…' : '—') + '</option>' +
        opcoes.map(function (o) { return '<option' + (o === v ? ' selected' : '') + '>' + esc(o) + '</option>'; }).join('') + '</select></label>';
    },
    caixa: function (n, r, marcado) {
      return '<label class="opcao opcao-form"><input type="checkbox" name="' + n + '"' + (marcado ? ' checked' : '') + '><span>' + r + '</span></label>';
    },
    rebanho: function (v) {
      var atual = {};
      listaDe(v).forEach(function (x) { var m = /^(.+?):\s*(\d+)$/.exec(x); if (m) atual[m[1]] = m[2]; else atual.Outros = (atual.Outros ? atual.Outros + '; ' : '') + x; });
      return '<div class="campo"><span>Rebanho (nº de cabeças)</span><div class="rebanho">' + OPCOES.REBANHO.map(function (r) {
        return '<label>' + esc(r) + '<input type="number" min="0" max="999999" inputmode="numeric" name="REB__' + esc(r) + '" value="' + esc(atual[r] || '') + '"></label>';
      }).join('') + '</div><input name="REB__Outros" class="outro" placeholder="Outros animais (ex.: Búfalos: 10)" value="' + esc(atual.Outros || '') + '"></div>';
    },
    ler: function (form) {
      var r = {}, reb = [];
      Array.prototype.forEach.call(form.elements, function (el) {
        if (!el.name) return;
        if (/^REB__/.test(el.name)) {
          var nome = el.name.slice(5), val = el.value.trim();
          if (val && nome === 'Outros') reb.push(val);
          else if (val && Number(val) > 0) reb.push(nome + ': ' + Math.round(Number(val)));
          return;
        }
        if (el.type === 'radio') { if (el.checked) r[el.name] = el.value; else if (!(el.name in r)) r[el.name] = ''; return; }
        if (el.type === 'checkbox') {
          if (el.closest('.chips')) { r[el.name] = r[el.name] || []; if (el.checked) r[el.name].push(el.value); }
          else r[el.name] = el.checked;
          return;
        }
        if (/__outro$/.test(el.name)) {
          var base = el.name.replace(/__outro$/, '');
          r[base] = r[base] || [];
          listaDe(el.value).forEach(function (x) { r[base].push(x.trim()); });
          return;
        }
        r[el.name] = el.value.trim();
      });
      if (form.querySelector('[name^="REB__"]')) r.REBANHO = reb.join('; ');
      Object.keys(r).forEach(function (k) { if (Array.isArray(r[k])) r[k] = r[k].filter(Boolean).join('; '); });
      return r;
    }
  };
  function rodapeForm() {
    return '<p class="erro" data-erro></p><div class="acoes"><button type="button" class="btn btn-secundario" data-acao="cancelar">Cancelar</button>' +
      '<button type="submit" class="btn btn-primario">Salvar</button></div>';
  }
  function normalizarPlacas(txt) {
    var placas = String(txt || '').toUpperCase().split(/[,;\n]+/).map(function (p) { return p.replace(/[\s-]/g, ''); }).filter(Boolean);
    var ruim = placas.filter(function (p) { return !RE_PLACA.test(p); })[0];
    if (ruim) throw new Error('Placa inválida: ' + ruim + ' (use ABC1234 ou ABC1D23).');
    return placas.filter(function (p, i) { return placas.indexOf(p) === i; }).join(', ');
  }
  function opcaoGps(x, rotulo) {
    var g = E.gps.pos;
    if (!g) return '<p class="dica">Ligue o GPS (botão ⊕) para poder ' + rotulo.toLowerCase() + '.</p>';
    if (g.precisao > PRECISAO_MAX_CORRECAO) return '<p class="dica">GPS com precisão de ' + Math.round(g.precisao) + ' m. Aguarde ficar abaixo de ' + PRECISAO_MAX_CORRECAO + ' m.</p>';
    return F.caixa('corrigirPosicao', rotulo + ' <small>(está a ' + esc(fmtDist(distanciaM(g.lat, g.lon, x.lat, x.lon))) +
                   ' daqui; GPS ±' + Math.round(g.precisao) + ' m)</small>', false);
  }

  function camposEndereco(d) {
    return '<h3>Morador</h3>' +
      F.texto('MORADOR', 'Nome do morador / responsável', d.MORADOR, 'maxlength="120"') +
      F.texto('CONTATO', 'Telefone', d.CONTATO, 'type="tel" maxlength="40" inputmode="tel" placeholder="(35) 9 9999-9999"') +
      F.texto('N_MORADORES', 'Nº de moradores', d.N_MORADORES, 'type="number" min="0" max="99" inputmode="numeric"') +
      F.texto('PLACAS_VEICULOS', 'Placas dos veículos', d.PLACAS_VEICULOS, 'maxlength="200" autocapitalize="characters" placeholder="ABC1D23, XYZ9876"') +
      F.simNao('TEM_CAO', 'Tem cão?', d.TEM_CAO) + F.simNao('TEM_CAMERAS', 'Tem câmeras?', d.TEM_CAMERAS) +
      '<h3>Acesso e segurança</h3>' +
      F.area('COMO_CHEGAR', 'Como chegar', d.COMO_CHEGAR, 'Ex.: após a ponte de madeira, segunda porteira à esquerda') +
      F.area('OBS_SEGURANCA', 'Observações de segurança', d.OBS_SEGURANCA, 'Ex.: idoso mora sozinho');
  }
  function camposPropriedade(d) {
    return '<h3>Identificação</h3>' +
      F.texto('NOME_PROPRIEDADE', 'Nome da propriedade', d.NOME_PROPRIEDADE, 'maxlength="120" placeholder="Ex.: Fazenda Boa Esperança"') +
      F.escolha('TIPO_PROPRIEDADE', 'Tipo', OPCOES.TIPO_PROPRIEDADE, d.TIPO_PROPRIEDADE) +
      F.texto('PROPRIETARIO', 'Proprietário', d.PROPRIETARIO, 'maxlength="120"') +
      F.texto('CONTATO', 'Telefone do proprietário', d.CONTATO, 'type="tel" maxlength="40" inputmode="tel"') +
      F.texto('CASEIRO', 'Caseiro / administrador', d.CASEIRO, 'maxlength="120"') +
      F.texto('CONTATO_CASEIRO', 'Telefone do caseiro', d.CONTATO_CASEIRO, 'type="tel" maxlength="40" inputmode="tel"') +
      '<h3>Atividade</h3>' +
      F.chips('ATIVIDADES', 'Atividades', OPCOES.ATIVIDADES, d.ATIVIDADES) +
      F.chips('CULTURAS', 'Culturas / plantio', OPCOES.CULTURAS, d.CULTURAS) +
      F.rebanho(d.REBANHO) +
      F.chips('MAQUINARIO_BENS', 'Máquinas e bens de valor', OPCOES.MAQUINARIO_BENS, d.MAQUINARIO_BENS) +
      '<h3>Segurança e rotina</h3>' +
      F.texto('PLACAS_VEICULOS', 'Placas dos veículos', d.PLACAS_VEICULOS, 'maxlength="200" autocapitalize="characters" placeholder="ABC1D23, XYZ9876"') +
      F.simNao('TEM_CAO', 'Tem cão?', d.TEM_CAO) + F.simNao('TEM_CAMERAS', 'Tem câmeras?', d.TEM_CAMERAS) +
      F.simNao('CERCA_ELETRICA', 'Cerca elétrica?', d.CERCA_ELETRICA) +
      F.simNao('SINAL_CELULAR', 'Tem sinal de celular na sede?', d.SINAL_CELULAR) +
      F.escolha('OPERADORA', 'Operadora com sinal', OPCOES.OPERADORA, d.OPERADORA) +
      F.texto('PERIODOS_VAZIA', 'Quando fica vazia', d.PERIODOS_VAZIA, 'maxlength="200" placeholder="Ex.: dias úteis durante o dia; fins de semana"') +
      F.simNao('GRUPO_VIZINHOS', 'Participa de grupo de vizinhos?', d.GRUPO_VIZINHOS) +
      F.area('COMO_CHEGAR', 'Como chegar', d.COMO_CHEGAR, 'Ex.: entrada pela porteira azul no km 4') +
      F.area('OBS_SEGURANCA', 'Observações de segurança', d.OBS_SEGURANCA, 'Ex.: furto de gado em 2025');
  }

  function abrirFormEnd(e) {
    abrirPainel('<form data-form="end-editar" data-id="' + esc(e.id) + '" novalidate><h2>Atualizar endereço</h2>' +
      '<p class="ficha-tipo">' + esc(e.titulo) + '</p><p class="dica">Informe ao morador que os dados são para uso da Patrulha Rural.</p>' +
      camposEndereco(e.d) + '<h3>Visita e posição</h3>' + F.caixa('registrarVisita', 'Registrar visita agora', true) +
      opcaoGps(e, 'Mover o ponto para minha posição') + rodapeForm() + '</form>', 'form-end');
  }
  function abrirFormProp(p) {
    abrirPainel('<form data-form="prop-editar" data-id="' + esc(p.id) + '" novalidate><h2>Atualizar propriedade rural</h2>' +
      '<p class="ficha-tipo">' + esc(p.titulo) + '</p><p class="dica">Informe ao responsável que os dados são para uso da Patrulha Rural.</p>' +
      camposPropriedade(p.d) + '<h3>Visita e sede</h3>' + F.caixa('registrarVisita', 'Registrar visita agora', true) +
      opcaoGps(p, 'Marcar a sede na minha posição') + rodapeForm() + '</form>', 'form-prop');
  }
  function abrirFormVisita(x) {
    abrirPainel('<form data-form="visita" data-id="' + esc(x.id) + '" data-tipo="' + x.tipo + '"><h2>Registrar visita</h2>' +
      '<p class="ficha-tipo">' + esc(x.titulo) + '</p>' +
      F.area('obs', 'Observação (opcional)', '', 'Ex.: tudo em ordem; morador relatou movimentação estranha à noite') +
      rodapeForm().replace('>Salvar<', '>Registrar<') + '</form>', 'form-visita');
  }
  function abrirFormExcluir(x) {
    var nome = x.tipo === 'END' ? 'endereço' : 'propriedade';
    abrirPainel('<form data-form="excluir" data-id="' + esc(x.id) + '" data-tipo="' + x.tipo + '"><h2>Excluir ' + nome + '</h2>' +
      '<p class="ficha-tipo">' + esc(x.titulo) + '</p>' +
      '<div class="alerta perigo">Deixa de aparecer no mapa de todos os militares. Continua guardado na planilha com o motivo, e o administrador pode restaurar.</div>' +
      '<div class="campo"><span>Motivo</span><div class="opcoes">' + MOTIVOS_EXCLUSAO.map(function (m) {
        return '<label class="opcao opcao-form"><input type="radio" name="motivo" value="' + esc(m) + '"><span>' + esc(m) + '</span></label>';
      }).join('') + '</div></div>' + F.area('obs', 'Observação', '', 'Ex.: casa demolida em 2024') +
      '<p class="erro" data-erro></p><div class="acoes"><button type="button" class="btn btn-secundario" data-acao="cancelar">Cancelar</button>' +
      '<button type="submit" class="btn btn-perigo">Excluir</button></div></form>', 'form-excluir');
  }
  function abrirFormVia(v) {
    destacar(v);
    var d = v.d;
    abrirPainel('<form data-form="via" data-id="' + esc(v.id) + '"><h2>Conferir trecho de via</h2>' +
      '<p class="dica">Confirme como é a via neste trecho (destacado no mapa).</p>' +
      F.escolha('TIPO_VIA', 'Tipo de via', OPCOES.TIPO_VIA, d.TIPO_VIA, true) + F.escolha('CONDICAO', 'Condição', OPCOES.CONDICAO, d.CONDICAO, true) +
      F.escolha('TRAFEGAVEL_VIATURA', 'Passa viatura?', OPCOES.VIATURA, d.TRAFEGAVEL_VIATURA, true) +
      F.area('OBS', 'Observações', d.OBS, 'Ex.: atoleiro em dia de chuva') + rodapeForm() + '</form>', 'form-via');
  }
  function abrirFormPonto(local, pt) {
    var o = pt ? pt.d : {};
    abrirPainel('<form data-form="' + (pt ? 'ponto-editar' : 'ponto-novo') + '"' + (pt ? ' data-id="' + esc(o.ID) + '"' : atributosLocal(local)) + '>' +
      '<h2>' + (pt ? 'Editar ponto' : 'Novo ponto de interesse') + '</h2>' + (pt ? '' : '<p class="dica">' + descricaoLocal(local) + '</p>') +
      F.escolha('TIPO', 'Tipo', OPCOES.TIPO_PONTO, o.TIPO, true) +
      F.texto('NOME', 'Nome / referência', o.NOME, 'maxlength="120" placeholder="Ex.: Ponte do Ribeirão das Antas"') +
      F.area('DESCRICAO', 'Descrição', o.DESCRICAO, 'Ex.: suporta viatura até 3 t') +
      F.simNao('TEM_SINAL_CELULAR', 'Tem sinal de celular aqui?', o.TEM_SINAL_CELULAR) +
      F.escolha('OPERADORA', 'Operadora', OPCOES.OPERADORA, o.OPERADORA) + rodapeForm() + '</form>', 'form-ponto');
    if (!pt) marcarLocal([local.lat, local.lon]);
  }
  function abrirFormNovoEnd(local) {
    var prop = propriedadeEm(local.lat, local.lon);
    abrirPainel('<form data-form="end-novo"' + atributosLocal(local) + (prop ? ' data-prop="' + esc(prop.id) + '"' : '') + ' novalidate>' +
      '<h2>Novo endereço</h2><p class="dica">' + descricaoLocal(local) + (prop ? '<br>Dentro de: <strong>' + esc(prop.titulo) + '</strong>' : '') + '</p>' +
      F.escolha('ESPECIE', 'Tipo', OPCOES.ESPECIE_NOVA, 'Domicílio particular', true) +
      F.texto('LOCALIDADE', 'Localidade / bairro rural', '', 'maxlength="120"') +
      F.texto('LOGRADOURO', 'Estrada / logradouro', '', 'maxlength="120"') + F.texto('NUMERO', 'Número / km', '', 'maxlength="20"') +
      camposEndereco({}) + F.caixa('registrarVisita', 'Registrar visita agora', true) + rodapeForm() + '</form>', 'form-end-novo');
    marcarLocal([local.lat, local.lon]);
  }
  function abrirFormNovaProp(local) {
    abrirPainel('<form data-form="prop-nova"' + atributosLocal(local) + ' novalidate><h2>Nova propriedade rural</h2>' +
      '<p class="dica">' + descricaoLocal(local) + '<br>Use só para propriedade que <strong>não aparece</strong> no mapa (sem CAR). ' +
      'O ponto marca a sede.</p>' + camposPropriedade({}) + F.caixa('registrarVisita', 'Registrar visita agora', true) + rodapeForm() + '</form>', 'form-prop-nova');
    marcarLocal([local.lat, local.lon]);
  }
  function atributosLocal(l) {
    return ' data-lat="' + l.lat + '" data-lon="' + l.lon + '" data-prec="' + (l.precisao || 0) + '" data-fonte="' + l.fonte + '" data-mun="' + l.mun + '"';
  }
  function descricaoLocal(l) {
    return (l.fonte === 'GPS' ? 'Posição: sua localização atual (GPS ±' + Math.round(l.precisao) + ' m)' : 'Posição: o ponto marcado no mapa (pino amarelo)') +
      ' · ' + esc(nomeMunicipio(l.mun)) + '.';
  }

  function municipioEm(lat, lon) {
    var achado = null;
    Object.keys(E.bases).forEach(function (cod) { if (!achado && naGeometria(lon, lat, E.bases[cod].limite)) achado = cod; });
    return achado;
  }
  function propriedadeEm(lat, lon) {
    var melhor = null;
    E.props.forEach(function (p) {
      if (!p.geom || !p.bbox || lon < p.bbox[0] || lon > p.bbox[2] || lat < p.bbox[1] || lat > p.bbox[3]) return;
      if (naGeometria(lon, lat, p.geom) && (!melhor || (p.base.AREA_HA || 0) < (melhor.base.AREA_HA || 0))) melhor = p;
    });
    return melhor;
  }

  function abrirAdicionar(latlng) {
    var local;
    if (latlng) local = { lat: latlng.lat, lon: latlng.lng, precisao: 0, fonte: 'MAPA' };
    else if (E.gps.pos) local = { lat: E.gps.pos.lat, lon: E.gps.pos.lon, precisao: E.gps.pos.precisao, fonte: 'GPS' };
    if (!local) {
      abrirPainel('<h2>Cadastrar</h2><p class="dica">Ligue o GPS (botão ⊕) para cadastrar onde você está, ou <strong>toque e segure</strong> no mapa sobre o local.</p>' +
        '<div class="acoes"><button class="btn btn-primario largo" data-acao="ligar-gps">Ligar GPS</button></div>', 'adicionar');
      return;
    }
    local.mun = municipioEm(local.lat, local.lon);
    if (!local.mun) {
      toast('Este local está fora dos municípios carregados neste aparelho.', { duracao: 5000 });
      return;
    }
    E._local = local;
    marcarLocal([local.lat, local.lon]);
    var prop = propriedadeEm(local.lat, local.lon);
    abrirPainel('<h2>Cadastrar aqui</h2><p class="dica">' + descricaoLocal(local) + '</p>' +
      (prop ? '<button class="link-prop" data-abrir-prop="' + esc(prop.id) + '"><span class="marca-prop mini" style="background:' +
              (prop.validado ? COR_PROP.VALIDADO : COR_PROP.NAO_VALIDADO) + '"></span>Este ponto fica dentro de: <strong>' + esc(prop.titulo) + '</strong> ›</button>' : '') +
      '<div class="menu-acoes">' +
        '<button class="btn btn-primario" data-acao="novo-end">Novo endereço (casa, igreja, escola…)</button>' +
        (prop ? '' : '<button class="btn btn-secundario" data-acao="nova-prop">Nova propriedade rural (sem CAR)</button>') +
        '<button class="btn btn-secundario" data-acao="novo-ponto">Ponto de interesse (ponte, porteira, sinal…)</button></div>', 'adicionar');
  }

  $('#painel-conteudo').addEventListener('submit', function (ev) {
    ev.preventDefault();
    var form = ev.target, erro = form.querySelector('[data-erro]');
    if (erro) erro.textContent = '';
    try { salvarFormulario(form); } catch (e) {
      if (erro) { erro.textContent = e.message; erro.scrollIntoView({ block: 'center' }); } else toast(e.message);
    }
  });

  function salvarFormulario(form) {
    var tipo = form.getAttribute('data-form'), id = form.getAttribute('data-id');
    if (tipo === 'municipios') {
      var cods = Array.prototype.filter.call(form.querySelectorAll('input[name=mun]'), function (i) { return i.checked; })
        .map(function (i) { return i.value; });
      if (!cods.length) throw new Error('Escolha pelo menos um município.');
      E.prefs.munSel = cods; LS.set('prefs', E.prefs);
      fecharPainel();
      E.enquadrado = false;
      return sincronizar(false);
    }
    var v = F.ler(form);
    var local = form.hasAttribute('data-lat') ? {
      lat: Number(form.getAttribute('data-lat')), lon: Number(form.getAttribute('data-lon')),
      precisao: Number(form.getAttribute('data-prec')) || 0, fonte: form.getAttribute('data-fonte')
    } : null;
    var mun = form.getAttribute('data-mun');
    if (v.PLACAS_VEICULOS !== undefined) v.PLACAS_VEICULOS = normalizarPlacas(v.PLACAS_VEICULOS);
    if (v.N_MORADORES !== undefined && v.N_MORADORES !== '' && !/^\d{1,2}$/.test(v.N_MORADORES)) throw new Error('Nº de moradores inválido.');
    var registrarVisita = !!v.registrarVisita, corrigir = !!v.corrigirPosicao;
    delete v.registrarVisita; delete v.corrigirPosicao;

    function posGps() {
      if (!E.gps.pos || E.gps.pos.precisao > PRECISAO_MAX_CORRECAO) throw new Error('GPS sem precisão suficiente.');
      return { lat: E.gps.pos.lat, lon: E.gps.pos.lon, precisao: E.gps.pos.precisao, fonte: 'GPS' };
    }
    function alteracoes(atual) {
      var d = {};
      Object.keys(v).forEach(function (k) { if (String(atual[k] || '') !== String(v[k] || '')) d[k] = v[k] || ''; });
      return d;
    }
    if (tipo === 'end-editar' || tipo === 'prop-editar') {
      var ehEnd = tipo === 'end-editar', x = ehEnd ? E.endPorId[id] : E.propPorId[id];
      var item = { tipo: ehEnd ? 'END_EDITAR' : 'PROP_EDITAR', alvoId: id, dados: alteracoes(x.d), registrarVisita: registrarVisita };
      if (corrigir) item.novaPosicao = posGps();
      if (!Object.keys(item.dados).length && !item.novaPosicao) {
        if (!registrarVisita) throw new Error('Nada foi alterado.');
        item = { tipo: ehEnd ? 'END_VISITA' : 'PROP_VISITA', alvoId: id };
      }
      return concluir(item);
    }
    if (tipo === 'visita') {
      return concluir({ tipo: form.getAttribute('data-tipo') === 'END' ? 'END_VISITA' : 'PROP_VISITA', alvoId: id, obs: v.obs || '' });
    }
    if (tipo === 'excluir') {
      if (!v.motivo) throw new Error('Escolha o motivo da exclusão.');
      if (v.motivo === 'Outro' && !v.obs) throw new Error('Descreva o motivo na observação.');
      return concluir({ tipo: form.getAttribute('data-tipo') === 'END' ? 'END_EXCLUIR' : 'PROP_EXCLUIR', alvoId: id, motivo: v.motivo, obs: v.obs || '' });
    }
    if (tipo === 'end-novo' || tipo === 'prop-nova') {
      if (tipo === 'end-novo' && !v.ESPECIE) throw new Error('Escolha o tipo.');
      var limpo = {};
      Object.keys(v).forEach(function (k) { if (v[k]) limpo[k] = v[k]; });
      return concluir({ tipo: tipo === 'end-novo' ? 'END_NOVO' : 'PROP_NOVA', mun: mun, dados: limpo, novaPosicao: local,
                        registrarVisita: registrarVisita, idPropriedade: form.getAttribute('data-prop') || '' });
    }
    if (tipo === 'via') {
      if (!v.TIPO_VIA || !v.CONDICAO || !v.TRAFEGAVEL_VIATURA) throw new Error('Preencha tipo, condição e se passa viatura.');
      return concluir({ tipo: 'VIA_VALIDAR', alvoId: id, dados: v });
    }
    if (tipo === 'ponto-novo' || tipo === 'ponto-editar') {
      if (!v.TIPO) throw new Error('Escolha o tipo do ponto.');
      return concluir(tipo === 'ponto-novo' ? { tipo: 'PONTO_NOVO', mun: mun, dados: v, novaPosicao: local }
                                            : { tipo: 'PONTO_EDITAR', alvoId: id, dados: v });
    }
  }

  /** Salva e reabre a ficha atualizada (ou fecha, se o registro saiu do mapa). */
  function concluir(item) {
    removerMarcaLocal();
    return registrar(item).then(function (alvo) {
      if (!alvo) return fecharPainel();
      if (alvo.tipo === 'END' && E.endPorId[alvo.id]) return abrirFichaEnd(E.endPorId[alvo.id], true);
      if (alvo.tipo === 'PROP' && E.propPorId[alvo.id]) return abrirFichaProp(E.propPorId[alvo.id], true);
      if (alvo.tipo === 'VIA' && E.viaPorId[alvo.id]) return abrirFichaVia(E.viaPorId[alvo.id]);
      var pt = alvo.tipo === 'PONTO' && E.pontos.filter(function (p) { return p.id === alvo.id; })[0];
      if (pt) return abrirFichaPonto(pt);
      fecharPainel();
    });
  }

  $('#painel-conteudo').addEventListener('click', function (ev) {
    var t = ev.target;
    var mt = t.closest('[data-marcar]');
    if (mt) {
      var todos = mt.getAttribute('data-marcar') === 'todos';
      Array.prototype.forEach.call(document.querySelectorAll('#painel-conteudo input[name=mun]'), function (i) { i.checked = todos; });
      return;
    }
    var b = t.closest('[data-copiar]');
    if (b) { copiar(b.getAttribute('data-copiar')); return; }
    var ap = t.closest('[data-abrir-prop]');
    if (ap) { var pp = E.propPorId[ap.getAttribute('data-abrir-prop')]; if (pp) abrirFichaProp(pp); return; }
    var ae = t.closest('[data-abrir-end]');
    if (ae) { var ee = E.endPorId[ae.getAttribute('data-abrir-end')]; if (ee) abrirFichaEnd(ee); return; }
    var rr = t.closest('[data-resultado]');
    if (rr) {
      var partes = rr.getAttribute('data-resultado').split('|');
      if (partes[0] === 'END' && E.endPorId[partes[1]]) abrirFichaEnd(E.endPorId[partes[1]]);
      if (partes[0] === 'PROP' && E.propPorId[partes[1]]) abrirFichaProp(E.propPorId[partes[1]]);
      return;
    }
    var irc = t.closest('[data-irpara]');
    if (irc) { var c = irc.getAttribute('data-irpara').split(',').map(Number); fecharPainel(); E.mapa.setView(c, 16); destacar({ lat: c[0], lon: c[1] }); return; }
    var a = t.closest('[data-acao]');
    if (!a) return;
    var id = a.getAttribute('data-id');
    switch (a.getAttribute('data-acao')) {
      case 'editar-end': abrirFormEnd(E.endPorId[id]); break;
      case 'editar-prop': abrirFormProp(E.propPorId[id]); break;
      case 'visita-end': abrirFormVisita(E.endPorId[id]); break;
      case 'visita-prop': abrirFormVisita(E.propPorId[id]); break;
      case 'excluir-end': abrirFormExcluir(E.endPorId[id]); break;
      case 'excluir-prop': abrirFormExcluir(E.propPorId[id]); break;
      case 'validar-via': abrirFormVia(E.viaPorId[id]); break;
      case 'editar-ponto': abrirFormPonto(null, E.pontos.filter(function (x) { return x.id === id; })[0]); break;
      case 'remover-ponto': if (confirm('Remover este ponto de interesse?')) concluir({ tipo: 'PONTO_EDITAR', alvoId: id, dados: {}, remover: true }); break;
      case 'novo-end': abrirFormNovoEnd(E._local); break;
      case 'nova-prop': abrirFormNovaProp(E._local); break;
      case 'novo-ponto': abrirFormPonto(E._local); break;
      case 'ligar-gps': fecharPainel(); if (E.gps.watch === null) iniciarGps(); break;
      case 'cancelar': fecharPainel(); break;
    }
  });

  function copiar(texto) {
    function ok() { toast('Coordenadas copiadas.'); }
    function alt() {
      var ta = document.createElement('textarea'); ta.value = texto; document.body.appendChild(ta); ta.select();
      try { document.execCommand('copy'); ok(); } catch (e) { toast(texto, { duracao: 8000 }); }
      document.body.removeChild(ta);
    }
    if (navigator.clipboard && window.isSecureContext) navigator.clipboard.writeText(texto).then(ok, alt); else alt();
  }
  $('#btn-adicionar').addEventListener('click', function () { abrirAdicionar(null); });

  /* ================================================================ */
  /* Busca                                                             */
  /* ================================================================ */
  var campoBusca = $('#busca'), timerBusca = null;
  campoBusca.addEventListener('input', function () {
    $('#busca-limpar').hidden = !campoBusca.value;
    clearTimeout(timerBusca); timerBusca = setTimeout(buscar, 200);
  });
  campoBusca.addEventListener('keydown', function (ev) {
    if (ev.key === 'Enter') { ev.preventDefault(); clearTimeout(timerBusca); buscar(); campoBusca.blur(); }
  });
  $('#busca-limpar').addEventListener('click', function () { campoBusca.value = ''; $('#busca-limpar').hidden = true; fecharPainel(); });

  function buscar() {
    var q = campoBusca.value.trim();
    if (q.length < 2) { if ($('#painel').dataset.tipo === 'busca') fecharPainel(); return; }
    var mc = q.match(/^\s*(-?\d{1,2}[.,]\d+)\s*[,;\s]\s*(-?\d{1,3}[.,]\d+)\s*$/);
    if (mc) {
      var la = numero(mc[1]), lo = numero(mc[2]);
      abrirPainel('<h2>Coordenada</h2><ul class="resultados"><li><button class="resultado" data-irpara="' + la + ',' + lo +
        '"><span class="txt"><span class="t1">Ir para ' + esc(la + ', ' + lo) + '</span></span></button></li></ul>', 'busca');
      return;
    }
    if (!E.ends.length && !E.props.length) { abrirPainel('<p class="vazio">Ainda não há dados no aparelho.</p>', 'busca'); return; }
    var termos = normalizar(q).split(/\s+/).filter(Boolean);
    function bate(x) { for (var i = 0; i < termos.length; i++) if (x.busca.indexOf(termos[i]) === -1) return false; return true; }
    var achados = E.props.filter(bate).concat(E.ends.filter(bate));
    var pos = E.gps.pos, qn = termos.join(' ');
    achados.sort(function (a, b) {
      if (pos) return distanciaM(pos.lat, pos.lon, a.lat, a.lon) - distanciaM(pos.lat, pos.lon, b.lat, b.lon);
      var sa = normalizar(a.titulo + ' ' + (a.d.MORADOR || a.d.PROPRIETARIO || '')).indexOf(qn) === -1 ? 1 : 0;
      var sb = normalizar(b.titulo + ' ' + (b.d.MORADOR || b.d.PROPRIETARIO || '')).indexOf(qn) === -1 ? 1 : 0;
      return sa - sb || (a.tipo === b.tipo ? 0 : a.tipo === 'PROP' ? -1 : 1) || a.titulo.localeCompare(b.titulo, 'pt-BR');
    });
    var total = achados.length;
    var lista = achados.slice(0, 60).map(function (x) {
      var icone = x.tipo === 'PROP'
        ? '<span class="marca-prop mini" style="background:' + (x.validado ? COR_PROP.VALIDADO : COR_PROP.NAO_VALIDADO) + '"></span>'
        : '<span class="bolinha" style="background:' + corEnd(x) + '"></span>';
      var t1 = x.tipo === 'PROP' ? x.titulo : (x.d.MORADOR ? x.d.MORADOR + ' · ' + x.titulo : x.titulo);
      var sub = [x.tipo === 'PROP' ? 'Propriedade rural' : x.d.LOCALIDADE, nomeMunicipio(x.mun)].filter(Boolean).join(' · ');
      var dist = pos ? '<span class="dist">' + esc(fmtDist(distanciaM(pos.lat, pos.lon, x.lat, x.lon))) + '</span>' : '';
      return '<li><button class="resultado" data-resultado="' + x.tipo + '|' + esc(x.id) + '">' + icone +
        '<span class="txt"><span class="t1">' + esc(t1) + '</span><span class="t2">' + esc(sub) + '</span></span>' + dist + '</button></li>';
    }).join('');
    abrirPainel('<h2>' + (total ? fmtNum(total) + ' resultado' + (total > 1 ? 's' : '') : 'Nada encontrado') + '</h2>' +
      (total > 60 ? '<p class="vazio" style="padding:0 0 6px">Mostrando 60' + (pos ? ' (mais próximos)' : '') + '. Refine a busca.</p>' : '') +
      (total ? '<ul class="resultados">' + lista + '</ul>' : '<p class="vazio">Tente o nome do morador, da fazenda, da estrada, da localidade ou uma placa.</p>'), 'busca');
  }

  /* ================================================================ */
  /* GPS                                                               */
  /* ================================================================ */
  $('#btn-gps').addEventListener('click', function () {
    if (E.gps.watch === null) iniciarGps();
    else if (!E.gps.seguir) {
      E.gps.seguir = true;
      if (E.gps.pos) E.mapa.setView([E.gps.pos.lat, E.gps.pos.lon], Math.max(E.mapa.getZoom(), 15));
      atualizarBotaoGps();
    } else pararGps();
  });
  function iniciarGps() {
    if (!('geolocation' in navigator)) { toast('Este aparelho não oferece localização.'); return; }
    E.gps.seguir = true; E.gps.primeira = true;
    toast('Buscando sinal de GPS…');
    E.gps.watch = navigator.geolocation.watchPosition(function (pos) {
      var c = pos.coords, ll = [c.latitude, c.longitude];
      E.gps.pos = { lat: c.latitude, lon: c.longitude, precisao: c.accuracy };
      if (!E.gps.marcador) {
        E.gps.precisao = L.circle(ll, { radius: c.accuracy, color: '#1e88e5', weight: 1, fillColor: '#1e88e5', fillOpacity: 0.12, interactive: false }).addTo(E.mapa);
        E.gps.marcador = L.marker(ll, { icon: L.divIcon({ className: '', html: '<div class="minha-pos"></div>', iconSize: [18, 18], iconAnchor: [9, 9] }),
                                        interactive: false, keyboard: false, zIndexOffset: 1000 }).addTo(E.mapa);
      } else { E.gps.marcador.setLatLng(ll); E.gps.precisao.setLatLng(ll).setRadius(c.accuracy); }
      if (E.gps.seguir) E.mapa.setView(ll, E.gps.primeira ? Math.max(E.mapa.getZoom(), 15) : E.mapa.getZoom(), { animate: !E.gps.primeira });
      if (E.gps.primeira) { E.gps.primeira = false; toast('Localização encontrada (precisão de ' + Math.round(c.accuracy) + ' m).'); }
      atualizarBotaoGps();
    }, function (err) {
      toast(err.code === 1 ? 'Permita o acesso à localização nas configurações do navegador.' : 'Não foi possível obter a localização. Tente em local aberto.', { duracao: 6000 });
      if (err.code === 1) pararGps();
    }, { enableHighAccuracy: true, maximumAge: 5000, timeout: 30000 });
    atualizarBotaoGps();
  }
  function pararGps() {
    if (E.gps.watch !== null) navigator.geolocation.clearWatch(E.gps.watch);
    E.gps.watch = null; E.gps.seguir = false; E.gps.pos = null;
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
  /* Camadas e menu                                                    */
  /* ================================================================ */
  function opcaoCamada(nome, rotulo, amostra, qtd) {
    return '<label class="opcao"><input type="checkbox" data-camada="' + nome + '" ' + (camadaLigada(nome) ? 'checked' : '') + '>' +
      amostra + rotulo + '<span class="qtd">' + (qtd === '' ? '' : fmtNum(qtd)) + '</span></label>';
  }
  $('#btn-camadas').addEventListener('click', function () {
    var contagem = {};
    E.ends.forEach(function (e) { contagem[e.especie] = (contagem[e.especie] || 0) + 1; });
    var especies = Object.keys(contagem).sort(function (a, b) { return contagem[b] - contagem[a]; });
    var nValE = E.ends.filter(function (e) { return e.validado; }).length, nValP = E.props.filter(function (p) { return p.validado; }).length;
    var html = '<h2>Camadas</h2><h3>Fundo do mapa</h3><div class="segmentado">' +
      [['mapa', 'Mapa'], ['satelite', 'Satélite'], ['nenhum', 'Sem fundo']].map(function (b) {
        return '<button data-base="' + b[0] + '" class="' + (E.baseAtual === b[0] ? 'ativo' : '') + '">' + b[1] + '</button>';
      }).join('') + '</div><p class="vazio" style="font-size:.82rem">O fundo precisa de internet. O restante funciona sem sinal.</p>' +
      '<h3>Mostrar</h3><div class="opcoes">' +
      opcaoCamada('props', 'Propriedades rurais (CAR)', '<span class="marca-prop mini" style="background:' + COR_PROP.NAO_VALIDADO + '"></span>', E.props.length) +
      opcaoCamada('ends', 'Endereços', '<span class="bolinha" style="background:' + COR_SITUACAO.NAO_VALIDADO + '"></span>', E.ends.length) +
      opcaoCamada('vias', 'Trechos de via (IBGE)', '<span class="linha-amostra"></span>', E.vias.length) +
      opcaoCamada('pontos', 'Pontos de interesse', '<span class="marca-ponto mini" style="background:#3f51b5">P</span>', E.pontos.length) +
      opcaoCamada('limites', 'Limites dos municípios', '<span class="linha-amostra limite"></span>', Object.keys(E.bases).length) + '</div>' +
      '<p class="dica">Os limites das propriedades aparecem ao aproximar o mapa.</p>' +
      '<h3>Situação</h3><div class="opcoes">' +
      [['VALIDADO', 'Validados (conferidos em campo)', nValE + nValP], ['NAO_VALIDADO', 'Não validados', E.ends.length + E.props.length - nValE - nValP]].map(function (s) {
        return '<label class="opcao"><input type="checkbox" data-situacao="' + s[0] + '" ' + (E.prefs.ocultasSituacao.indexOf(s[0]) === -1 ? 'checked' : '') +
          '><span class="bolinha' + (s[0] === 'VALIDADO' ? ' bolinha-val' : '') + '" style="background:' + COR_SITUACAO[s[0]] + '"></span>' + s[1] +
          '<span class="qtd">' + fmtNum(s[2]) + '</span></label>';
      }).join('') + '</div>' +
      '<h3>Colorir endereços por</h3><div class="segmentado seg2">' + [['situacao', 'Situação'], ['tipo', 'Tipo']].map(function (b) {
        return '<button data-colorir="' + b[0] + '" class="' + (E.prefs.colorir === b[0] ? 'ativo' : '') + '">' + b[1] + '</button>';
      }).join('') + '</div>' +
      '<h3>Tipo de endereço</h3><div class="opcoes">' + especies.map(function (e) {
        return '<label class="opcao"><input type="checkbox" data-especie="' + esc(e) + '" ' + (E.prefs.ocultas.indexOf(e) === -1 ? 'checked' : '') +
          '><span class="bolinha" style="background:' + (CORES_ESPECIE[e] || COR_PADRAO) + '"></span>' + esc(e) + '<span class="qtd">' + fmtNum(contagem[e]) + '</span></label>';
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
      ligarCamada(el.getAttribute('data-camada'), el.checked);
    }
  });
  $('#painel-conteudo').addEventListener('click', function (ev) {
    var c = ev.target.closest('[data-colorir]');
    if (c) {
      E.prefs.colorir = c.getAttribute('data-colorir'); LS.set('prefs', E.prefs);
      var r = raioAtual();
      E.ends.forEach(function (e) { if (e.marcador) e.marcador.setStyle(estiloEnd(e, r)); });
      Array.prototype.forEach.call(document.querySelectorAll('[data-colorir]'), function (x) { x.classList.toggle('ativo', x === c); });
      return;
    }
    var b = ev.target.closest('[data-base]');
    if (!b) return;
    trocarBase(b.getAttribute('data-base'));
    Array.prototype.forEach.call(document.querySelectorAll('[data-base]'), function (x) { x.classList.toggle('ativo', x === b); });
  });

  $('#btn-menu').addEventListener('click', function () {
    var u = (E.sessao && E.sessao.usuario) || {};
    var nValE = E.ends.filter(function (e) { return e.validado; }).length, nValP = E.props.filter(function (p) { return p.validado; }).length;
    function pct(a, b) { return b ? (100 * a / b).toFixed(1).replace('.', ',') + '%' : '0%'; }
    var munis = E.municipios.map(function (m) {
      return '<li' + (E.bases[m.cod] ? '' : ' class="fora"') + '>' + esc(m.nome) + (E.bases[m.cod] ? '' : (m.v ? ' <small>(não baixado)</small>' : ' <small>(sem base)</small>')) + '</li>';
    }).join('');
    var html = '<h2>' + esc([u.postoGrad, u.nome].filter(Boolean).join(' ') || 'Usuário') + '</h2>' +
      '<p class="vazio" style="padding:0">' + esc(u.usuario || '') + ' · ' + esc(u.unidade || u.perfil || '') + '</p>' +
      (E.fila.length ? '<div class="alerta">' + E.fila.length + ' envio(s) aguardando internet. Sobem sozinhos quando houver sinal.</div>' : '') +
      '<h3>Área de atuação (' + E.municipios.length + ' município' + (E.municipios.length === 1 ? '' : 's') + ')</h3><ul class="lista-munis">' + munis + '</ul>' +
      '<h3>Andamento</h3>' +
      '<div class="info-linha"><span>Propriedades validadas</span><span>' + fmtNum(nValP) + ' de ' + fmtNum(E.props.length) + ' (' + pct(nValP, E.props.length) + ')</span></div>' +
      '<div class="info-linha"><span>Endereços validados</span><span>' + fmtNum(nValE) + ' de ' + fmtNum(E.ends.length) + ' (' + pct(nValE, E.ends.length) + ')</span></div>' +
      '<div class="info-linha"><span>Dados atualizados em</span><span>' + fmtDataHora(E.sincronizadoEm) + '</span></div>' +
      '<div class="info-linha"><span>Acesso válido até</span><span>' + fmtDataHora(E.sessao && E.sessao.expira) + '</span></div>' +
      '<div class="menu-acoes">' + (E.municipios.length > 1 ? '<button class="btn btn-secundario" data-menu="municipios"' + (navigator.onLine ? '' : ' disabled') +
        '>Municípios neste aparelho (' + Object.keys(E.bases).length + ' de ' + E.municipios.length + ')</button>' : '') +
      '<button class="btn btn-primario" data-menu="sync"' + (navigator.onLine ? '' : ' disabled') + '>' +
      (E.fila.length ? 'Enviar pendentes e atualizar' : 'Atualizar dados agora') + '</button>' +
      '<button class="btn btn-perigo" data-menu="sair">Sair e apagar dados do aparelho</button></div>' +
      '<h3>Dicas</h3><p class="dica">Toque e segure no mapa para cadastrar um endereço, uma propriedade sem CAR ou um ponto de interesse naquele local. ' +
      'Aproxime o mapa para ver os limites das propriedades.</p>' +
      '<p class="vazio" style="font-size:.8rem;margin-top:12px">Patrulha Rural · versão ' + VERSAO_APP + '</p>';
    abrirPainel(html, 'menu');
  });
  $('#painel-conteudo').addEventListener('click', function (ev) {
    var b = ev.target.closest('[data-menu]');
    if (!b) return;
    if (b.getAttribute('data-menu') === 'sync') { fecharPainel(); sincronizar(false); }
    if (b.getAttribute('data-menu') === 'municipios') abrirEscolhaMunicipios(false);
    if (b.getAttribute('data-menu') === 'sair') {
      if (confirm(E.fila.length ? 'ATENÇÃO: ' + E.fila.length + ' envio(s) ainda não enviados serão PERDIDOS. Sair mesmo assim?'
                                : 'Sair? Os dados baixados serão apagados deste aparelho.')) sair();
    }
  });

  /* ================================================================ */
  /* Service worker                                                    */
  /* ================================================================ */
  function registrarServiceWorker() {
    if (!('serviceWorker' in navigator)) return;
    navigator.serviceWorker.register('sw.js').then(function (reg) {
      reg.addEventListener('updatefound', function () {
        var novo = reg.installing;
        if (!novo) return;
        novo.addEventListener('statechange', function () {
          if (novo.state === 'installed' && navigator.serviceWorker.controller) {
            toast('Nova versão do app disponível.', { acao: 'Atualizar', duracao: 0, fn: function () { novo.postMessage('ativar'); } });
          }
        });
      });
    }).catch(function (e) { console.warn('SW', e); });
    var haviaControlador = !!navigator.serviceWorker.controller, recarregando = false;
    navigator.serviceWorker.addEventListener('controllerchange', function () {
      if (recarregando || !haviaControlador) return;
      recarregando = true; location.reload();
    });
  }

  if (location.hostname === 'localhost') { window.__PR = E; window.__PR_montar = montar; }
  var msgLogin = LS.get('msgLogin');
  if (msgLogin) { $('#login-erro').textContent = msgLogin; LS.del('msgLogin'); }
  iniciar();
})();
