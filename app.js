// Configuração Centralizada
const DEFAULT_API_KEY = "SUA_API_KEY_DO_GOOGLE_CLOUD_AQUI"; 
const STORAGE_KEY_PLAYLISTS = "checklisty_playlists";
const STORAGE_KEY_STATUS = "checklisty_status_map";

let playlists = JSON.parse(localStorage.getItem(STORAGE_KEY_PLAYLISTS) || "[]");
let statusMap = JSON.parse(localStorage.getItem(STORAGE_KEY_STATUS) || "{}");
let activePlaylistId = null;
let currentFilter = "all";

// Elementos DOM
const viewPlaylists = document.getElementById("view-playlists");
const viewEpisodes = document.getElementById("view-episodes");
const playlistCardsContainer = document.getElementById("playlist-cards");
const feedContainer = document.getElementById("feed");
const statsContainer = document.getElementById("stats");
const filterBar = document.getElementById("filter-bar");
const modalAdd = document.getElementById("modal-add");

// Event Listeners Nativos
document.getElementById("btn-home").addEventListener("click", showHome);
document.getElementById("btn-back").addEventListener("click", showHome);
document.getElementById("btn-add-modal").addEventListener("click", () => modalAdd.classList.remove("hidden"));
document.getElementById("btn-cancel-modal").addEventListener("click", () => modalAdd.classList.add("hidden"));
document.getElementById("btn-save-playlist").addEventListener("click", handleAddPlaylist);

// Event Listeners de Filtro
document.querySelectorAll(".filter-btn").forEach(btn => {
  btn.addEventListener("click", (e) => {
    document.querySelectorAll(".filter-btn").forEach(b => {
      b.className = "filter-btn py-1.5 rounded-lg bg-zinc-800 text-zinc-400 font-medium text-center transition-all";
    });

    currentFilter = e.target.dataset.filter;

    if (currentFilter === "all") {
      e.target.className = "filter-btn py-1.5 rounded-lg bg-zinc-700 text-zinc-100 font-bold text-center shadow transition-all";
    } else if (currentFilter === "watching") {
      e.target.className = "filter-btn py-1.5 rounded-lg bg-amber-500 text-zinc-950 font-bold text-center shadow transition-all";
    } else if (currentFilter === "unstarted") {
      e.target.className = "filter-btn py-1.5 rounded-lg bg-red-600 text-white font-bold text-center shadow transition-all";
    } else if (currentFilter === "completed") {
      e.target.className = "filter-btn py-1.5 rounded-lg bg-emerald-600 text-white font-bold text-center shadow transition-all";
    }

    if (window.currentEpisodes) renderEpisodesFeed(window.currentEpisodes);
  });
});

// Extrai ID de Playlist ou Identificador de Canal da URL colada pelo usuário
function parseYouTubeInput(input) {
  const cleanInput = input.trim();

  // 1. Caso seja link de Playlist tradicional (list=...)
  const listMatch = cleanInput.match(/[&?]list=([^&]+)/i);
  if (listMatch) {
    return { type: "playlist", id: listMatch[1] };
  }

  // 2. Caso seja um @handle de canal (ex: youtube.com/@CanalExemplo)
  const handleMatch = cleanInput.match(/(?:youtube\.com\/|@)([\w.-]+)/i);
  if (cleanInput.includes("@") && handleMatch) {
    const handle = handleMatch[1].startsWith("@") ? handleMatch[1] : `@${handleMatch[1]}`;
    return { type: "handle", value: handle };
  }

  // 3. Caso seja link com ID direto de canal (ex: youtube.com/channel/UC...)
  const channelMatch = cleanInput.match(/youtube\.com\/channel\/([\w-]+)/i);
  if (channelMatch) {
    return { type: "channelId", value: channelMatch[1] };
  }

  // Fallback: considera o próprio texto digitado como ID de playlist
  return { type: "playlist", id: cleanInput };
}

// Navegação entre Telas
function showHome() {
  activePlaylistId = null;
  viewPlaylists.classList.remove("hidden");
  viewEpisodes.classList.add("hidden");
  filterBar.classList.add("hidden");
  filterBar.classList.remove("grid");
  renderPlaylistsHome();
}

function showEpisodesView(playlist) {
  activePlaylistId = playlist.id;
  document.getElementById("playlist-title-header").innerText = playlist.title;
  viewPlaylists.classList.add("hidden");
  viewEpisodes.classList.remove("hidden");
  filterBar.classList.remove("hidden");
  filterBar.classList.add("grid");
  fetchEpisodesForPlaylist(playlist.id);
}

// Lógica para Adicionar Playlist ou Canal
async function handleAddPlaylist() {
  const input = document.getElementById("input-playlist-url");
  const rawValue = input.value;

  if (!rawValue) {
    alert("Informe um link de playlist ou canal do YouTube!");
    return;
  }

  const parsed = parseYouTubeInput(rawValue);
  let playlistId = null;
  let title = "Coleção sem título";
  let thumb = "https://cdn-icons-png.flaticon.com/512/1384/1384060.png";

  try {
    if (parsed.type === "playlist") {
      playlistId = parsed.id;

      // Busca dados da playlist diretamente
      const url = `https://www.googleapis.com/youtube/v3/playlists?part=snippet&id=${playlistId}&key=${DEFAULT_API_KEY}`;
      const res = await fetch(url);
      const data = await res.json();

      if (data.items && data.items.length > 0) {
        title = data.items[0].snippet.title;
        thumb = data.items[0].snippet.thumbnails.medium?.url || thumb;
      }
    } else {
      // Se for canal (@handle ou channelId), busca a playlist oculta de uploads
      let channelUrl = "";
      if (parsed.type === "handle") {
        channelUrl = `https://www.googleapis.com/youtube/v3/channels?part=snippet,contentDetails&forHandle=${encodeURIComponent(parsed.value)}&key=${DEFAULT_API_KEY}`;
      } else {
        channelUrl = `https://www.googleapis.com/youtube/v3/channels?part=snippet,contentDetails&id=${encodeURIComponent(parsed.value)}&key=${DEFAULT_API_KEY}`;
      }

      const res = await fetch(channelUrl);
      const data = await res.json();

      if (!data.items || data.items.length === 0) {
        alert("Canal não encontrado no YouTube. Verifique o link ou @handle.");
        return;
      }

      const channelItem = data.items[0];
      // A playlist oculta com todos os vídeos enviados pelo canal fica em relatedPlaylists.uploads
      playlistId = channelItem.contentDetails.relatedPlaylists.uploads;
      title = `${channelItem.snippet.title} (Vídeos do Canal)`;
      thumb = channelItem.snippet.thumbnails.medium?.url || thumb;
    }

    if (!playlistId) {
      alert("Não foi possível identificar o conteúdo. Verifique o link fornecido.");
      return;
    }

    // Verifica se já existe na coleção do usuário
    if (playlists.some(p => p.id === playlistId)) {
      alert("Esta playlist ou canal já está na sua coleção!");
      return;
    }

    const newPlaylist = { id: playlistId, title, thumb, createdAt: new Date().toISOString() };
    playlists.push(newPlaylist);
    localStorage.setItem(STORAGE_KEY_PLAYLISTS, JSON.stringify(playlists));

    input.value = "";
    modalAdd.classList.add("hidden");
    renderPlaylistsHome();
  } catch (err) {
    alert("Erro ao buscar informações na API do YouTube. Tente novamente.");
    console.error(err);
  }
}

// Deleta Playlist
function deletePlaylist(playlistId, e) {
  e.stopPropagation();
  if (confirm("Deseja remover esta coleção?")) {
    playlists = playlists.filter(p => p.id !== playlistId);
    localStorage.setItem(STORAGE_KEY_PLAYLISTS, JSON.stringify(playlists));
    renderPlaylistsHome();
  }
}

// Renderiza a Home de Coleções
function renderPlaylistsHome() {
  playlistCardsContainer.innerHTML = "";

  if (playlists.length === 0) {
    playlistCardsContainer.innerHTML = `
      <div class="text-center py-12 space-y-3 bg-zinc-900/30 rounded-xl border border-zinc-800/50 p-6">
        <p class="text-sm font-semibold text-zinc-300">Nenhuma coleção encontrada</p>
        <p class="text-xs text-zinc-500">Clique no botão <b>+ Playlist</b> no topo para adicionar um link de playlist ou de um canal do YouTube!</p>
      </div>
    `;
    return;
  }

  playlists.forEach(p => {
    const card = document.createElement("div");
    card.className = "flex bg-zinc-900 hover:bg-zinc-800/80 rounded-xl overflow-hidden border border-zinc-800 p-3 gap-3 items-center cursor-pointer transition-all shadow-sm";
    card.onclick = () => showEpisodesView(p);

    card.innerHTML = `
      <div class="relative flex-shrink-0 w-24 h-16 rounded-lg overflow-hidden bg-zinc-800">
        <img src="${p.thumb}" class="w-full h-full object-cover">
      </div>
      <div class="flex-grow min-w-0">
        <h3 class="text-xs sm:text-sm font-bold text-zinc-100 truncate">${p.title}</h3>
        <p class="text-[11px] text-zinc-400 mt-0.5">Toque para ver episódios</p>
      </div>
      <button onclick="deletePlaylist('${p.id}', event)" class="px-2.5 py-2 text-xs text-zinc-500 hover:text-red-400 hover:bg-zinc-800 rounded-lg transition-colors">
        ✕
      </button>
    `;
    playlistCardsContainer.appendChild(card);
  });
}

// Alterna o status do episódio em ciclo (Não iniciado -> Assistindo -> Concluído)
function cycleStatus(videoId) {
  const current = statusMap[videoId];
  if (!current) {
    statusMap[videoId] = "watching";
  } else if (current === "watching") {
    statusMap[videoId] = "completed";
  } else {
    delete statusMap[videoId];
  }

  localStorage.setItem(STORAGE_KEY_STATUS, JSON.stringify(statusMap));
  if (window.currentEpisodes) renderEpisodesFeed(window.currentEpisodes);
}

// Busca Episódios da Playlist Selecionada
async function fetchEpisodesForPlaylist(playlistId) {
  statsContainer.innerText = "Buscando episódios do YouTube...";

  try {
    let allItems = [];
    let nextPageToken = "";

    do {
      const pageParam = nextPageToken ? `&pageToken=${nextPageToken}` : "";
      const url = `https://www.googleapis.com/youtube/v3/playlistItems?part=snippet&playlistId=${playlistId}&maxResults=50${pageParam}&key=${DEFAULT_API_KEY}`;
      
      const res = await fetch(url);
      const data = await res.json();

      if (data.error) {
        alert("Erro na API: " + data.error.message);
        return;
      }

      const pageItems = data.items.map(item => ({
        id: item.snippet.resourceId.videoId,
        title: item.snippet.title,
        publishedAt: item.snippet.publishedAt,
        thumb: item.snippet.thumbnails.medium?.url || item.snippet.thumbnails.default?.url
      }));

      allItems = allItems.concat(pageItems);
      nextPageToken = data.nextPageToken || "";

    } while (nextPageToken);

    window.currentEpisodes = allItems;
    renderEpisodesFeed(allItems);
  } catch (err) {
    statsContainer.innerText = "Erro ao carregar episódios da API.";
    console.error(err);
  }
}

// Renderiza os episódios com Filtros e Estilos
function renderEpisodesFeed(episodes) {
  const completedCount = episodes.filter(ep => statusMap[ep.id] === "completed").length;
  const watchingCount = episodes.filter(ep => statusMap[ep.id] === "watching").length;

  statsContainer.innerText = `Assistindo: ${watchingCount} | Concluídos: ${completedCount} de ${episodes.length}`;

  let filtered = episodes.filter(ep => {
    const status = statusMap[ep.id] || "unstarted";
    if (currentFilter === "watching") return status === "watching";
    if (currentFilter === "completed") return status === "completed";
    if (currentFilter === "unstarted") return status === "unstarted";
    return true;
  });

  feedContainer.innerHTML = "";

  if (filtered.length === 0) {
    feedContainer.innerHTML = `<p class="text-center text-zinc-500 py-8">Nenhum episódio nesta categoria.</p>`;
    return;
  }

  filtered.forEach(ep => {
    const status = statusMap[ep.id] || "unstarted";
    const card = document.createElement("div");

    let cardBg = "bg-zinc-900 border-zinc-800";
    let btnStyle = "bg-zinc-800 text-zinc-400 hover:bg-zinc-700";
    let btnIcon = "+";
    let badgeHtml = "";

    if (status === "watching") {
      cardBg = "bg-amber-950/20 border-amber-500/40 shadow-sm";
      btnStyle = "bg-amber-500 text-zinc-950 hover:bg-amber-400 font-extrabold";
      btnIcon = "⏳";
      badgeHtml = `<span class="inline-block bg-amber-500/20 text-amber-400 border border-amber-500/30 text-[10px] font-bold px-1.5 py-0.5 rounded mb-1">ASSISTINDO</span>`;
    } else if (status === "completed") {
      cardBg = "bg-zinc-900/40 opacity-60 border-zinc-800/50";
      btnStyle = "bg-emerald-600 text-white hover:bg-emerald-500";
      btnIcon = "✓";
      badgeHtml = `<span class="inline-block bg-emerald-500/20 text-emerald-400 border border-emerald-500/30 text-[10px] font-bold px-1.5 py-0.5 rounded mb-1">CONCLUÍDO</span>`;
    }

    card.className = `flex bg-zinc-900 rounded-lg overflow-hidden border p-3 gap-3 items-center transition-all ${cardBg}`;

    card.innerHTML = `
      <a href="https://www.youtube.com/watch?v=${ep.id}" target="_blank" class="relative flex-shrink-0 w-32 h-20 rounded overflow-hidden bg-zinc-800">
        <img src="${ep.thumb}" class="w-full h-full object-cover">
      </a>
      <div class="flex-grow min-w-0 py-1">
        ${badgeHtml}
        <h2 class="text-xs sm:text-sm font-semibold text-zinc-100 leading-snug break-words">${ep.title}</h2>
      </div>
      <button onclick="cycleStatus('${ep.id}')" class="flex-shrink-0 w-10 h-10 flex items-center justify-center text-sm font-bold rounded-lg transition-colors ${btnStyle}">
        ${btnIcon}
      </button>
    `;
    feedContainer.appendChild(card);
  });
}

// Inicialização
renderPlaylistsHome();
