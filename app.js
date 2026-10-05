(function () {
  "use strict";

  const STORAGE_KEY = "yt-favorites-v1";
  const MAX = 5;

  const els = {
    empty: document.getElementById("empty-state"),
    list: document.getElementById("video-list"),
    formSection: document.getElementById("form-section"),
    formTitle: document.getElementById("form-title"),
    form: document.getElementById("add-form"),
    input: document.getElementById("url-input"),
    error: document.getElementById("form-error"),
    submit: document.getElementById("submit-btn"),
    cancelEdit: document.getElementById("cancel-edit"),
    countLabel: document.getElementById("count-label"),
    overlay: document.getElementById("player-overlay"),
    playerTitle: document.getElementById("player-title"),
    iframe: document.getElementById("player-iframe"),
    openYt: document.getElementById("open-yt"),
    closePlayer: document.getElementById("close-player"),
  };

  /** @type {{id: string, url: string, title: string, thumb: string}[]} */
  let videos = load();
  /** @type {string|null} */
  let editingId = null;

  function load() {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (!raw) return [];
      const parsed = JSON.parse(raw);
      if (!Array.isArray(parsed)) return [];
      return parsed
        .filter((v) => v && typeof v.id === "string" && typeof v.url === "string")
        .slice(0, MAX)
        .map((v) => ({
          id: v.id,
          url: v.url,
          title: typeof v.title === "string" ? v.title : "YouTube video",
          thumb: typeof v.thumb === "string" ? v.thumb : "",
        }));
    } catch {
      return [];
    }
  }

  function save() {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(videos));
  }

  /**
   * Extract a YouTube video ID from common URL shapes.
   * Supports: watch?v=, youtu.be/, shorts/, embed/, live/, m.youtube.com
   */
  function extractVideoId(raw) {
    let input = (raw || "").trim();
    if (!input) return null;

    // Allow bare 11-char ids
    if (/^[\w-]{11}$/.test(input)) return input;

    // Prepend https if missing scheme
    if (!/^https?:\/\//i.test(input)) {
      input = "https://" + input;
    }

    let url;
    try {
      url = new URL(input);
    } catch {
      return null;
    }

    const host = url.hostname.replace(/^www\./, "").toLowerCase();
    const path = url.pathname;

    if (host === "youtu.be") {
      const id = path.split("/").filter(Boolean)[0];
      return id && /^[\w-]{11}$/.test(id) ? id : null;
    }

    const ytHosts = ["youtube.com", "m.youtube.com", "music.youtube.com", "youtube-nocookie.com"];
    if (!ytHosts.includes(host)) return null;

    // /watch?v=
    const v = url.searchParams.get("v");
    if (v && /^[\w-]{11}$/.test(v)) return v;

    // /shorts/ID, /embed/ID, /live/ID, /v/ID
    const m = path.match(/^\/(shorts|embed|live|v)\/([\w-]{11})/);
    if (m) return m[2];

    return null;
  }

  function watchUrl(id) {
    return "https://www.youtube.com/watch?v=" + id;
  }

  function embedUrl(id) {
    return "https://www.youtube.com/embed/" + id + "?rel=0&modestbranding=1";
  }

  function defaultThumb(id) {
    return "https://i.ytimg.com/vi/" + id + "/hqdefault.jpg";
  }

  async function fetchMeta(id) {
    const endpoints = [
      "https://www.youtube.com/oembed?url=" + encodeURIComponent(watchUrl(id)) + "&format=json",
      "https://noembed.com/embed?url=" + encodeURIComponent(watchUrl(id)),
    ];
    for (const ep of endpoints) {
      try {
        const res = await fetch(ep);
        if (!res.ok) continue;
        const data = await res.json();
        const title = (data && data.title) || "YouTube video";
        const thumb = (data && (data.thumbnail_url || data.thumbnail)) || defaultThumb(id);
        return { title, thumb };
      } catch {
        // try next
      }
    }
    return { title: "YouTube video", thumb: defaultThumb(id) };
  }

  function showError(msg) {
    els.error.textContent = msg;
    els.error.classList.remove("hidden");
  }

  function clearError() {
    els.error.textContent = "";
    els.error.classList.add("hidden");
  }

  function setFormMode(mode) {
    if (mode === "edit") {
      els.formTitle.textContent = "Replace this video";
      els.submit.textContent = "Save changes";
      els.cancelEdit.classList.remove("hidden");
    } else {
      editingId = null;
      els.formTitle.textContent = "Add a YouTube link";
      els.submit.textContent = "Add video";
      els.cancelEdit.classList.add("hidden");
      els.input.value = "";
    }
  }

  function updateCount() {
    els.countLabel.textContent = videos.length + " of " + MAX + " saved";
  }

  function updateFormVisibility() {
    const atCap = videos.length >= MAX && !editingId;
    if (atCap) {
      els.formSection.classList.add("hidden");
    } else {
      els.formSection.classList.remove("hidden");
      els.submit.disabled = false;
    }
  }

  function render() {
    updateCount();
    updateFormVisibility();

    if (videos.length === 0) {
      els.empty.classList.remove("hidden");
      els.list.innerHTML = "";
    } else {
      els.empty.classList.add("hidden");
      els.list.innerHTML = videos
        .map((v) => {
          const title = escapeHtml(v.title || "YouTube video");
          const thumb = escapeAttr(v.thumb || defaultThumb(v.id));
          return (
            '<article class="card" data-id="' +
            escapeAttr(v.id) +
            '">' +
            '<button type="button" class="thumb-wrap" data-action="play" aria-label="Play ' +
            title +
            '">' +
            '<img src="' +
            thumb +
            '" alt="" loading="lazy" onerror="this.style.display=\'none\';this.nextElementSibling.classList.remove(\'hidden\')" />' +
            '<div class="thumb-fallback hidden">No preview</div>' +
            '<span class="play-badge" aria-hidden="true">▶</span>' +
            "</button>" +
            '<div class="card-body">' +
            '<h3 class="card-title" data-action="play">' +
            title +
            "</h3>" +
            '<p class="card-meta">' +
            escapeHtml(v.id) +
            "</p>" +
            '<div class="card-actions">' +
            '<button type="button" class="btn btn-sm btn-edit" data-action="edit">Edit</button>' +
            '<button type="button" class="btn btn-sm btn-danger" data-action="remove">Remove</button>' +
            "</div>" +
            "</div>" +
            "</article>"
          );
        })
        .join("");
    }
  }

  function escapeHtml(s) {
    return String(s)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;");
  }

  function escapeAttr(s) {
    return escapeHtml(s).replace(/'/g, "&#39;");
  }

  async function addOrReplace(urlText) {
    clearError();
    const id = extractVideoId(urlText);
    if (!id) {
      showError("That doesn't look like a YouTube link. Try youtube.com or youtu.be.");
      return;
    }

    if (editingId) {
      // Replacing one entry
      const idx = videos.findIndex((v) => v.id === editingId);
      if (idx === -1) {
        setFormMode("add");
        return addOrReplace(urlText);
      }
      // Don't allow duplicate of another saved video
      if (videos.some((v, i) => i !== idx && v.id === id)) {
        showError("That video is already in your list.");
        return;
      }
      els.submit.disabled = true;
      els.submit.textContent = "Saving…";
      const meta = await fetchMeta(id);
      videos[idx] = { id, url: watchUrl(id), title: meta.title, thumb: meta.thumb };
      save();
      setFormMode("add");
      render();
      return;
    }

    if (videos.length >= MAX) {
      showError("You already have 5 favorites. Remove one to add another.");
      return;
    }
    if (videos.some((v) => v.id === id)) {
      showError("That video is already in your list.");
      return;
    }

    els.submit.disabled = true;
    els.submit.textContent = "Adding…";
    const meta = await fetchMeta(id);
    videos.push({ id, url: watchUrl(id), title: meta.title, thumb: meta.thumb });
    save();
    els.input.value = "";
    setFormMode("add");
    render();
  }

  function removeVideo(id) {
    videos = videos.filter((v) => v.id !== id);
    save();
    if (editingId === id) setFormMode("add");
    render();
  }

  function startEdit(id) {
    const v = videos.find((x) => x.id === id);
    if (!v) return;
    editingId = id;
    clearError();
    setFormMode("edit");
    els.input.value = v.url;
    els.formSection.classList.remove("hidden");
    els.input.focus();
    els.input.select();
    els.formSection.scrollIntoView({ behavior: "smooth", block: "center" });
  }

  function openPlayer(id) {
    const v = videos.find((x) => x.id === id);
    els.playerTitle.textContent = (v && v.title) || "Watching";
    els.iframe.src = embedUrl(id);
    els.openYt.href = watchUrl(id);
    els.overlay.classList.remove("hidden");
    document.body.style.overflow = "hidden";
  }

  function closePlayer() {
    els.overlay.classList.add("hidden");
    els.iframe.src = "";
    document.body.style.overflow = "";
  }

  // Events
  els.form.addEventListener("submit", function (e) {
    e.preventDefault();
    addOrReplace(els.input.value);
  });

  els.cancelEdit.addEventListener("click", function () {
    clearError();
    setFormMode("add");
    updateFormVisibility();
  });

  els.list.addEventListener("click", function (e) {
    const actionEl = e.target.closest("[data-action]");
    const card = e.target.closest(".card");
    if (!card) return;
    const id = card.getAttribute("data-id");
    if (!id) return;
    const action = actionEl ? actionEl.getAttribute("data-action") : "play";
    if (action === "remove") {
      removeVideo(id);
    } else if (action === "edit") {
      startEdit(id);
    } else {
      openPlayer(id);
    }
  });

  els.closePlayer.addEventListener("click", closePlayer);
  els.overlay.addEventListener("click", function (e) {
    if (e.target === els.overlay) closePlayer();
  });
  document.addEventListener("keydown", function (e) {
    if (e.key === "Escape" && !els.overlay.classList.contains("hidden")) {
      closePlayer();
    }
  });

  // Init
  render();
})();
