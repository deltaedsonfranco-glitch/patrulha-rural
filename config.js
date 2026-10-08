/*
 * CONFIGURAÇÃO DO APP - edite só este arquivo.
 *
 * API_URL: a URL da implantação do Apps Script (termina em /exec).
 *          Apps Script > Implantar > Gerenciar implantações > copiar "URL do app da Web".
 */
window.CONFIG = {
  API_URL: 'https://script.google.com/macros/s/AKfycbzMI6Gfb1-1PBVk4xuBkHoB8K4Mr3g_XjE6EHOG6ZltKBpnxS5YeZq36yAyPnd4A-76/exec',

  // Centro e zoom iniciais do mapa (Poços de Caldas)
  CENTRO: [-21.7878, -46.5613],
  ZOOM: 11,

  // Atualiza os dados sozinho ao abrir o app se a última carga tiver mais que isso (horas)
  ATUALIZAR_APOS_HORAS: 12
};
