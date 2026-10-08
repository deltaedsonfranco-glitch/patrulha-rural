# Patrulha Rural

App de consulta de propriedades e vias rurais para a Patrulha Rural (PWA).

- Mapa com propriedades (CNEFE/IBGE) e vias rurais (Trajetos dos Recenseadores/IBGE)
- Busca por localidade, estrada ou estabelecimento
- Localização pelo GPS, com distância e rumo até a propriedade
- Funciona sem sinal depois do primeiro download dos dados
- Os dados ficam na planilha da unidade; o acesso exige login

**Configuração:** edite apenas o `config.js` (URL da API do Apps Script).

**Publicar nova versão:** altere os arquivos e aumente o número em `VERSAO` no `sw.js`
(ex.: `pr-v1.0.0` → `pr-v1.0.1`). O app avisa o militar e atualiza com um toque.
