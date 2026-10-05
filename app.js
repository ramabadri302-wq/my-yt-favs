(function () {
  "use strict";

  const STORAGE_KEY = "yt-favorites-v1";
  const MAX = 5;
  const ASSET_VER = "2";

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
    frameWrap: document.querySelector(".player-frame-wrap"),
    channelPanel: document.getElementById("channel-panel"),
    channelThumb: document.getElementById("channel-panel-thumb"),
    channelName: document.getElementById("channel-panel-name"),
    channelHint: document.getElementById("channel-panel-hint"),
    openYt: document.getElementById("open-yt"),
    closePlayer: document.getElementById("close-player"),
  };

  /**
   * @typedef {{ id: string, kind: 'video'|'channel', url: string, title: string, thumb: string }} Fav
   */

  /** @type {Fav[]} */
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
        .map((v) => {
          const kind = v.kind === "channel" ? "channel" : "video";
          let id = v.id;
          // Migrate legacy bare video ids → v:ID
          if (kind === "video" && id.indexOf("v:") !== 0 && id.indexOf("ch:") !== 0) {
            id = "v:" + id;
          }
          return {
            id: id,
            kind: kind,
            url: v.url,
            title: typeof v.title === "string" ? v.title : defaultTitle({ kind: kind }),
            thumb: typeof v.thumb === "string" ? v.thumb : "",
          };
        });
    } catch {
      return [];
    }
  }

  function defaultTitle(v) {
    return v && v.kind === "channel" ? "YouTube channel" : "YouTube video";
  }

  function save() {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(videos));
  }

  /** Pull first YouTube-looking URL out of pasted text (title + URL, etc.). */
  function extractUrlCandidate(raw) {
    const text = (raw || "").trim();
    if (!text) return "";

    // Prefer an explicit http(s) YouTube URL anywhere in the paste
    const httpMatch = text.match(
      /https?:\/\/(?:www\.|m\.|music\.)?(?:youtube\.com|youtu\.be|youtube-nocookie\.com)\/[^\s<>"']+/i
    );
    if (httpMatch) return httpMatch[0].replace(/[.,;:!?)]+$/, "");

    // Bare youtube.com / youtu.be / @handle paths
    const bareMatch = text.match(
      /(?:(?:www\.|m\.)?(?:youtube\.com|youtu\.be)\/[^\s<>"']+|@[A-Za-z0-9._-]{3,})/i
    );
    if (bareMatch) return bareMatch[0].replace(/[.,;:!?)]+$/, "");

    return text;
  }

  function isYtHost(host) {
    const h = host.replace(/^www\./, "").toLowerCase();
    return (
      h === "youtu.be" ||
      h === "youtube.com" ||
      h === "m.youtube.com" ||
      h === "music.youtube.com" ||
      h === "youtube-nocookie.com"
    );
  }

  /**
   * Parse video or channel from paste.
   * @returns {{ kind: 'video'|'channel', id: string, url: string, label: string } | null}
   */
  function parseYouTube(raw) {
    let input = extractUrlCandidate(raw);
    if (!input) return null;

    // Bare 11-char video id
    if (/^[\w-]{11}$/.test(input)) {
      return {
        kind: "video",
        id: "v:" + input,
        url: "https://www.youtube.com/watch?v=" + input,
        label: input,
      };
    }

    // Bare @handle
    if (/^@[A-Za-z0-9._-]{3,}$/.test(input)) {
      const handle = input.slice(1);
      return {
        kind: "channel",
        id: "ch:@" + handle.toLowerCase(),
        url: "https://www.youtube.com/@" + handle,
        label: "@" + handle,
      };
    }

    if (!/^https?:\/\//i.test(input)) {
      input = "https://" + input;
    }

    let url;
    try {
      url = new URL(input);
    } catch {
      return null;
    }

    if (!isYtHost(url.hostname)) return null;

    const host = url.hostname.replace(/^www\./, "").toLowerCase();
    const path = url.pathname;

    // youtu.be/VIDEO
    if (host === "youtu.be") {
      const vid = path.split("/").filter(Boolean)[0];
      if (vid && /^[\w-]{11}$/.test(vid)) {
        return {
          kind: "video",
          id: "v:" + vid,
          url: "https://www.youtube.com/watch?v=" + vid,
          label: vid,
        };
      }
      return null;
    }

    // Videos first
    const v = url.searchParams.get("v");
    if (v && /^[\w-]{11}$/.test(v)) {
      return {
        kind: "video",
        id: "v:" + v,
        url: "https://www.youtube.com/watch?v=" + v,
        label: v,
      };
    }

    const shortM = path.match(/^\/(shorts|embed|live|v)\/([\w-]{11})/);
    if (shortM) {
      const vid = shortM[2];
      return {
        kind: "video",
        id: "v:" + vid,
        url: "https://www.youtube.com/watch?v=" + vid,
        label: vid,
      };
    }

    // Channels: /@handle
    const atM = path.match(/^\/@([A-Za-z0-9._-]{3,})\/?/);
    if (atM) {
      const handle = atM[1];
      return {
        kind: "channel",
        id: "ch:@" + handle.toLowerCase(),
        url: "https://www.youtube.com/@" + handle,
        label: "@" + handle,
      };
    }

    // /channel/UCxxxx
    const chM = path.match(/^\/channel\/(UC[\w-]{20,})\/?/);
    if (chM) {
      const cid = chM[1];
      return {
        kind: "channel",
        id: "ch:" + cid,
        url: "https://www.youtube.com/channel/" + cid,
        label: cid,
      };
    }

    // /c/CustomName
    const cM = path.match(/^\/c\/([A-Za-z0-9._-]{2,})\/?/);
    if (cM) {
      const name = cM[1];
      return {
        kind: "channel",
        id: "ch:c:" + name.toLowerCase(),
        url: "https://www.youtube.com/c/" + name,
        label: "/c/" + name,
      };
    }

    // /user/Name
    const uM = path.match(/^\/user\/([A-Za-z0-9._-]{2,})\/?/);
    if (uM) {
      const name = uM[1];
      return {
        kind: "channel",
        id: "ch:user:" + name.toLowerCase(),
        url: "https://www.youtube.com/user/" + name,
        label: "/user/" + name,
      };
    }

    // Recognizable YouTube host but not a video/channel we understand
    return null;
  }

  function videoIdFromFavId(id) {
    return id && id.indexOf("v:") === 0 ? id.slice(2) : id;
  }

  function embedUrl(videoId) {
    return "https://www.youtube.com/embed/" + videoId + "?rel=0&modestbranding=1";
  }

  function defaultVideoThumb(videoId) {
    return "https://i.ytimg.com/vi/" + videoId + "/hqdefault.jpg";
  }

  function channelFallbackThumb() {
    // Simple data-URI red play mark so we don't depend on external assets
    return (
      "data:image/svg+xml," +
      encodeURIComponent(
        '<svg xmlns="http://www.w3.org/2000/svg" width="320" height="180" viewBox="0 0 320 180">' +
          '<rect width="320" height="180" fill="#1a1a1a"/>' +
          '<circle cx="160" cy="90" r="42" fill="#ff0033"/>' +
          '<polygon points="150,70 150,110 185,90" fill="#fff"/>' +
          "</svg>"
      )
    );
  }

  async function fetchMeta(parsed) {
    const endpoints = [
      "https://www.youtube.com/oembed?url=" + encodeURIComponent(parsed.url) + "&format=json",
      "https://noembed.com/embed?url=" + encodeURIComponent(parsed.url),
    ];

    for (const ep of endpoints) {
      try {
        const res = await fetch(ep);
        if (!res.ok) continue;
        const data = await res.json();
        if (!data) continue;
        const title =
          (data.title && String(data.title).trim()) ||
          (data.author_name && String(data.author_name).trim()) ||
          null;
        const thumb = data.thumbnail_url || data.thumbnail || null;
        if (title || thumb) {
          return {
            title:
              title ||
              (parsed.kind === "channel" ? "Channel " + parsed.label : "YouTube video"),
            thumb:
              thumb ||
              (parsed.kind === "video"
                ? defaultVideoThumb(videoIdFromFavId(parsed.id))
                : channelFallbackThumb()),
          };
        }
      } catch {
        // try next
      }
    }

    if (parsed.kind === "channel") {
      // Sensible fallback from handle / path
      let title = "YouTube channel";
      if (parsed.label.indexOf("@") === 0) title = parsed.label.slice(1);
      else if (parsed.label.indexOf("/c/") === 0) title = parsed.label.slice(3);
      else if (parsed.label.indexOf("/user/") === 0) title = parsed.label.slice(6);
      return { title: title, thumb: channelFallbackThumb() };
    }

    const vid = videoIdFromFavId(parsed.id);
    return { title: "YouTube video", thumb: defaultVideoThumb(vid) };
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
      els.formTitle.textContent = "Replace this favorite";
      els.submit.textContent = "Save changes";
      els.cancelEdit.classList.remove("hidden");
    } else {
      editingId = null;
      els.formTitle.textContent = "Add a YouTube link";
      els.submit.textContent = "Add favorite";
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

  function thumbFor(v) {
    if (v.thumb) return v.thumb;
    if (v.kind === "video") return defaultVideoThumb(videoIdFromFavId(v.id));
    return channelFallbackThumb();
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
          const title = escapeHtml(v.title || defaultTitle(v));
          const thumb = escapeAttr(thumbFor(v));
          const kindLabel = v.kind === "channel" ? "Channel" : "Video";
          const meta = escapeHtml(kindLabel + " · " + (v.kind === "channel" ? displayChannelLabel(v) : videoIdFromFavId(v.id)));
          const badge = v.kind === "channel" ? "📺" : "▶";
          const aria = v.kind === "channel" ? "Open channel " : "Play ";
          return (
            '<article class="card" data-id="' +
            escapeAttr(v.id) +
            '" data-kind="' +
            escapeAttr(v.kind) +
            '">' +
            '<button type="button" class="thumb-wrap" data-action="play" aria-label="' +
            aria +
            title +
            '">' +
            '<img src="' +
            thumb +
            '" alt="" loading="lazy" onerror="this.style.display=\'none\';this.nextElementSibling.classList.remove(\'hidden\')" />' +
            '<div class="thumb-fallback hidden">No preview</div>' +
            '<span class="play-badge" aria-hidden="true">' +
            badge +
            "</span>" +
            "</button>" +
            '<div class="card-body">' +
            '<h3 class="card-title" data-action="play">' +
            title +
            "</h3>" +
            '<p class="card-meta">' +
            meta +
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

  function displayChannelLabel(v) {
    try {
      const u = new URL(v.url);
      const at = u.pathname.match(/^\/@([^/]+)/);
      if (at) return "@" + at[1];
      return u.pathname.replace(/\/$/, "") || v.url;
    } catch {
      return v.url;
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

  function friendlyParseError(raw) {
    const text = (raw || "").trim();
    // Looks like YouTube but we couldn't parse video/channel
    if (/youtube\.com|youtu\.be|@[A-Za-z0-9._-]{3,}/i.test(text)) {
      return "Couldn't read that YouTube link. Try a video URL, youtu.be link, Shorts link, or a channel like youtube.com/@name.";
    }
    return "That doesn't look like a YouTube link. Paste a youtube.com or youtu.be URL (video or channel).";
  }

  async function addOrReplace(urlText) {
    clearError();
    const parsed = parseYouTube(urlText);
    if (!parsed) {
      showError(friendlyParseError(urlText));
      return;
    }

    if (editingId) {
      const idx = videos.findIndex((v) => v.id === editingId);
      if (idx === -1) {
        setFormMode("add");
        return addOrReplace(urlText);
      }
      if (videos.some((v, i) => i !== idx && v.id === parsed.id)) {
        showError("That favorite is already in your list.");
        return;
      }
      els.submit.disabled = true;
      els.submit.textContent = "Saving…";
      const meta = await fetchMeta(parsed);
      videos[idx] = {
        id: parsed.id,
        kind: parsed.kind,
        url: parsed.url,
        title: meta.title,
        thumb: meta.thumb,
      };
      save();
      setFormMode("add");
      render();
      return;
    }

    if (videos.length >= MAX) {
      showError("You already have 5 favorites. Remove one to add another.");
      return;
    }
    if (videos.some((v) => v.id === parsed.id)) {
      showError("That favorite is already in your list.");
      return;
    }

    els.submit.disabled = true;
    els.submit.textContent = "Adding…";
    const meta = await fetchMeta(parsed);
    videos.push({
      id: parsed.id,
      kind: parsed.kind,
      url: parsed.url,
      title: meta.title,
      thumb: meta.thumb,
    });
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

  function openItem(id) {
    const v = videos.find((x) => x.id === id);
    if (!v) return;

    els.playerTitle.textContent = v.title || defaultTitle(v);
    els.openYt.href = v.url;

    if (v.kind === "channel") {
      // Channels can't be embedded — show panel + open on YouTube
      if (els.frameWrap) els.frameWrap.classList.add("hidden");
      if (els.channelPanel) {
        els.channelPanel.classList.remove("hidden");
        if (els.channelThumb) {
          els.channelThumb.src = thumbFor(v);
          els.channelThumb.alt = "";
        }
        if (els.channelName) els.channelName.textContent = v.title || displayChannelLabel(v);
        if (els.channelHint) {
          els.channelHint.textContent =
            "Channels open on YouTube. Tap the button below to visit " +
            displayChannelLabel(v) +
            ".";
        }
      }
      els.iframe.src = "";
      els.openYt.textContent = "Open channel on YouTube ↗";
    } else {
      if (els.channelPanel) els.channelPanel.classList.add("hidden");
      if (els.frameWrap) els.frameWrap.classList.remove("hidden");
      els.iframe.src = embedUrl(videoIdFromFavId(v.id));
      els.openYt.textContent = "Open on YouTube ↗";
    }

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
      openItem(id);
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

  // Expose for quick sanity checks in console / automated tests
  window.__ytFavsParse = parseYouTube;
  window.__ytFavsVer = ASSET_VER;
})();
