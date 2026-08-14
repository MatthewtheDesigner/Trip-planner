(function () {
  "use strict";

  var OWNER = "MatthewtheDesigner";
  var REPO = "Trip-planner";
  var FILE = "data.json";
  var API = "https://api.github.com/repos/" + OWNER + "/" + REPO + "/contents/" + FILE;
  var TOKEN_KEY = "ph_trip_planner_gh_pat";
  var ISSUE_URL =
    "https://github.com/" + OWNER + "/" + REPO + "/issues/new" +
    "?title=" + encodeURIComponent("申請編輯權限") +
    "&body=" + encodeURIComponent(
      "請填寫以下資訊,擁有者確認後會把你加為 repo 協作者(Settings → Collaborators),之後你就能用自己的 GitHub Token 編輯行程。\n\n" +
      "GitHub 帳號:\n" +
      "想申請的原因(選填):\n"
    );

  var state = null;
  var sha = null;
  var editMode = false;
  var dirty = false;

  var app = document.getElementById("app");
  var statusEl = document.getElementById("status");
  var topbarActions = document.getElementById("topbarActions");

  // ---------- small DOM helpers ----------
  function el(tag, attrs, children) {
    var node = document.createElement(tag);
    attrs = attrs || {};
    for (var k in attrs) {
      if (k === "className") node.className = attrs[k];
      else if (k === "text") node.textContent = attrs[k];
      else if (k === "html") node.innerHTML = attrs[k];
      else if (k.indexOf("on") === 0 && typeof attrs[k] === "function") node.addEventListener(k.slice(2), attrs[k]);
      else node.setAttribute(k, attrs[k]);
    }
    (children || []).forEach(function (c) {
      if (c == null) return;
      node.appendChild(typeof c === "string" ? document.createTextNode(c) : c);
    });
    return node;
  }
  function escapeHtml(s) {
    return String(s == null ? "" : s).replace(/[&<>"']/g, function (c) {
      return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c];
    });
  }
  function markDirty() { dirty = true; renderTopbar(); }

  // ---------- GitHub API ----------
  function getToken() { return localStorage.getItem(TOKEN_KEY) || ""; }
  function setToken(t) { if (t) localStorage.setItem(TOKEN_KEY, t); else localStorage.removeItem(TOKEN_KEY); }

  function ghLoad() {
    var token = getToken();
    var headers = { Accept: "application/vnd.github+json" };
    if (token) headers.Authorization = "token " + token;
    return fetch(API + "?ts=" + Date.now(), { headers: headers, cache: "no-store" })
      .then(function (res) {
        if (!res.ok) throw new Error("GitHub API " + res.status);
        return res.json();
      })
      .then(function (json) {
        sha = json.sha;
        var text = decodeURIComponent(escape(atob(json.content.replace(/\n/g, ""))));
        return JSON.parse(text);
      });
  }

  function ghSave(newState) {
    var token = getToken();
    if (!token) return Promise.reject(new Error("NO_TOKEN"));
    var body = {
      message: "Update itinerary via web editor",
      content: btoa(unescape(encodeURIComponent(JSON.stringify(newState, null, 2)))),
      sha: sha,
    };
    return fetch(API, {
      method: "PUT",
      headers: {
        Accept: "application/vnd.github+json",
        Authorization: "token " + token,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(body),
    }).then(function (res) {
      if (!res.ok) {
        return res.json().catch(function () { return {}; }).then(function (err) {
          var e = new Error((err && err.message) || ("HTTP " + res.status));
          e.status = res.status;
          throw e;
        });
      }
      return res.json();
    }).then(function (json) {
      sha = json.content.sha;
      return json;
    });
  }

  // ---------- toast ----------
  function toast(msg, isError) {
    var t = el("div", { className: "toast" + (isError ? " error" : ""), text: msg });
    document.body.appendChild(t);
    setTimeout(function () { t.remove(); }, 4800);
  }

  // ---------- token modal ----------
  function showTokenModal(onDone) {
    var input = el("input", { type: "password", placeholder: "貼上 GitHub Personal Access Token" });
    var backdrop = el("div", { className: "modal-backdrop" }, [
      el("div", { className: "modal" }, [
        el("h3", { text: "輸入編輯權杖" }),
        el("p", { html: "需要用<b>你自己的 GitHub 帳號</b>產生一組對 <b>" + OWNER + "/" + REPO + "</b> repo 有 Contents 讀寫權限的 Fine-grained Personal Access Token。輸入後只會存在你的瀏覽器 localStorage,不會傳送給任何人。" }),
        el("p", { html: "如果你還不是這個 repo 的協作者(collaborator),Token 產生得出來但存檔會失敗 —— 請先點下方「申請編輯權限」。" }),
        input,
        el("div", { className: "modal-actions", style: "justify-content:space-between;" }, [
          el("a", { className: "btn", href: ISSUE_URL, target: "_blank", rel: "noopener", text: "申請編輯權限" }),
          el("span", {}),
        ]),
        el("div", { className: "modal-actions" }, [
          el("button", { className: "btn", text: "取消", onclick: function () { backdrop.remove(); } }),
          el("button", { className: "btn primary", text: "確認", onclick: function () {
            var v = input.value.trim();
            if (!v) return;
            setToken(v);
            backdrop.remove();
            onDone && onDone();
          } }),
        ]),
      ]),
    ]);
    document.body.appendChild(backdrop);
    input.focus();
  }

  // ---------- topbar ----------
  function renderTopbar() {
    var token = getToken();
    statusEl.textContent = editMode
      ? ("編輯模式" + (dirty ? "・有未儲存的變更" : "・已同步"))
      : "檢視模式(唯讀)";
    statusEl.className = "status" + (editMode ? " edit" : "");

    topbarActions.innerHTML = "";
    topbarActions.appendChild(
      el("button", {
        className: "btn",
        text: "重新整理",
        onclick: function () {
          if (dirty && !confirm("有未儲存的變更,重新整理會捨棄這些變更,確定要繼續嗎?")) return;
          boot();
        },
      })
    );

    if (!editMode) {
      topbarActions.appendChild(
        el("a", {
          className: "btn",
          href: ISSUE_URL,
          target: "_blank",
          rel: "noopener",
          text: "申請編輯權限",
        })
      );
      topbarActions.appendChild(
        el("button", {
          className: "btn primary",
          text: "解鎖編輯",
          onclick: function () {
            if (token) { editMode = true; render(); }
            else showTokenModal(function () { editMode = true; render(); });
          },
        })
      );
    } else {
      topbarActions.appendChild(
        el("button", {
          className: "btn primary",
          text: "儲存變更",
          onclick: doSave,
        })
      );
      topbarActions.appendChild(
        el("button", {
          className: "btn",
          text: "鎖定",
          onclick: function () { editMode = false; render(); },
        })
      );
      topbarActions.appendChild(
        el("button", {
          className: "btn danger",
          text: "清除權杖",
          onclick: function () {
            if (confirm("清除儲存在這個瀏覽器裡的 GitHub Token?")) { setToken(""); editMode = false; render(); }
          },
        })
      );
    }
  }

  function doSave() {
    ghSave(state)
      .then(function () {
        dirty = false;
        toast("已儲存到 GitHub");
        renderTopbar();
      })
      .catch(function (e) {
        if (e.message === "NO_TOKEN") {
          showTokenModal(doSave);
          return;
        }
        if (e.status === 409) {
          toast("儲存衝突:資料已在別處被更新,請先「重新整理」再編輯", true);
        } else if (e.status === 401) {
          toast("Token 無效或已過期,請重新輸入", true);
          setToken("");
        } else if (e.status === 403) {
          toast("Token 有效,但這個帳號還沒有此 repo 的協作者權限,請先「申請編輯權限」", true);
        } else if (e.status === 404) {
          toast("找不到 repo 或檔案,請確認 Token 的 Repository access 有勾選這個 repo", true);
        } else {
          toast("儲存失敗: " + e.message, true);
        }
      });
  }

  // ---------- section: logistics ----------
  function logiCard(key, cfg) {
    var body = [];
    if (editMode) {
      body.push(el("input", { className: "logi-title-edit", value: cfg.name || cfg.route, oninput: function (e) {
        if ("name" in cfg) cfg.name = e.target.value; else cfg.route = e.target.value;
        markDirty();
      } }));
    } else {
      body.push(el("div", { className: "logi-title", text: cfg.name || cfg.route }));
    }

    function row(label, field) {
      if (editMode) {
        var input = el("input", { value: cfg[field] || "", oninput: function (e) { cfg[field] = e.target.value; markDirty(); } });
        return el("div", { className: "logi-row" }, [el("span", { text: label }), input]);
      }
      return el("div", { className: "logi-row" }, [el("span", { text: label }), el("b", { className: "tabular", text: cfg[field] || "" })]);
    }

    var rows = [];
    if (cfg.code) rows.push(row(cfg.date, "depart") /* placeholder, replaced below per type */);

    // Build rows per logistics type explicitly for clarity
    rows = [];
    if (key === "outbound" || key === "returnFlight") {
      rows.push(row(cfg.date, "depart"));
      rows.push(row("抵達", "arrive"));
      rows.push(row("飛行時間", "duration"));
    } else if (key === "car") {
      rows.push(row("取車", "pickup"));
      rows.push(row("還車", "dropoff"));
      rows.push(row("共", "days"));
    } else {
      rows.push(row("入住", "checkin"));
      rows.push(row("退房", "checkout"));
      rows.push(row("共", "nights"));
    }

    var flag = null;
    if (cfg.note) {
      flag = editMode
        ? el("input", { className: "logi-flag", style: "width:100%;color:inherit;", value: cfg.note, oninput: function (e) { cfg.note = e.target.value; markDirty(); } })
        : el("div", { className: "logi-flag", text: cfg.note });
    }

    var label = editMode
      ? el("input", { value: cfg.label, style: "font-size:11px;text-transform:uppercase;", oninput: function (e) { cfg.label = e.target.value; markDirty(); } })
      : el("div", { className: "logi-label", text: cfg.label });

    return el("div", { className: "logi-card" }, [label].concat(body, rows, flag ? [flag] : []));
  }

  function renderLogistics(container) {
    var section = el("section", { className: "section" }, [
      el("div", { className: "section-head" }, [
        el("div", { className: "kicker", text: "關鍵時刻" }),
        el("h2", { text: "機票 / 住宿 / 租車一覽" }),
      ]),
    ]);
    var grid = el("div", { className: "logi-grid" }, [
      logiCard("outbound", state.logistics.outbound),
      logiCard("stay1", state.logistics.stay1),
      logiCard("laUnion", state.logistics.laUnion),
      logiCard("stay2", state.logistics.stay2),
      logiCard("car", state.logistics.car),
      logiCard("returnFlight", state.logistics.returnFlight),
    ]);
    section.appendChild(grid);

    var w = state.warning;
    var warnBody = editMode
      ? el("textarea", { className: "slot-textarea", rows: 3, oninput: function (e) { w.body = e.target.value; markDirty(); } }, [])
      : el("p", { text: w.body });
    if (editMode) warnBody.value = w.body;

    var ul = el("ul", {});
    w.items.forEach(function (item, idx) {
      if (editMode) {
        var ta = el("textarea", { className: "slot-textarea", rows: 2, oninput: function (e) { w.items[idx] = e.target.value; markDirty(); } });
        ta.value = item;
        var li = el("li", { style: "list-style:none;margin-bottom:6px;" }, [
          ta,
          el("button", { className: "icon-btn", text: "✕ 刪除", onclick: function () { w.items.splice(idx, 1); markDirty(); render(); } }),
        ]);
        ul.appendChild(li);
      } else {
        ul.appendChild(el("li", { text: item }));
      }
    });
    var warnChildren = [
      el("div", { className: "icon", text: w.icon }),
      el("div", {}, [
        editMode ? el("input", { value: w.title, style: "font-family:Georgia,serif;font-size:14.5px;width:100%;margin-bottom:4px;", oninput: function (e) { w.title = e.target.value; markDirty(); } }) : el("h3", { text: w.title }),
        warnBody,
        ul,
        editMode ? el("button", { className: "btn", text: "+ 新增提醒", onclick: function () { w.items.push(""); markDirty(); render(); } }) : null,
      ]),
    ];
    section.appendChild(el("div", { className: "warn" }, warnChildren));
    container.appendChild(section);
  }

  // ---------- section: day table ----------
  function slotCell(slot, klass) {
    if (editMode) {
      var tagSel = el("select", {
        onchange: function (e) {
          var v = e.target.value;
          if (!v) { delete slot.tag; delete slot.tagLabel; }
          else { slot.tag = v; slot.tagLabel = v === "flight" ? "飛機" : "住宿"; }
          markDirty(); render();
        },
      }, [
        el("option", { value: "", text: "無標籤" }),
        el("option", { value: "flight", text: "✈ 飛機" }),
        el("option", { value: "hotel", text: "🏨 住宿" }),
      ]);
      tagSel.value = slot.tag || "";
      var textArea = el("textarea", { className: "slot-textarea", rows: 2, oninput: function (e) { slot.text = e.target.value; markDirty(); } });
      textArea.value = slot.text || "";
      var noteArea = el("textarea", { className: "slot-textarea", rows: 1, placeholder: "備註(選填)", oninput: function (e) { slot.note = e.target.value; markDirty(); } });
      noteArea.value = slot.note || "";
      return el("td", { className: klass }, [tagSel, textArea, noteArea]);
    }
    var parts = [];
    if (slot.tag) parts.push(el("span", { className: "tag tag-" + slot.tag, text: slot.tagLabel || "" }), el("br"));
    parts.push(document.createTextNode(slot.text || ""));
    if (slot.note) { parts.push(el("small", { className: "cell-note", text: slot.note })); }
    return el("td", { className: klass }, parts);
  }

  function renderDayTable(container) {
    var section = el("section", { className: "section" }, [
      el("div", { className: "section-head" }, [
        el("div", { className: "kicker", text: "每日規劃" }),
        el("h2", { text: state.meta.dateRange + " 逐日行程" }),
      ]),
    ]);
    var thead = el("thead", {}, [
      el("tr", {}, [
        el("th", { rowspan: "2", style: "min-width:78px;", text: "日期" }),
        el("th", { colspan: "2", className: "grp-am", text: "上午" }),
        el("th", { colspan: "2", className: "grp-pm", text: "下午" }),
        el("th", { colspan: "2", className: "grp-ev", text: "晚上" }),
      ]),
      el("tr", { className: "sub-row" }, [
        el("th", { text: "活動 1" }), el("th", { text: "活動 2" }),
        el("th", { text: "活動 1" }), el("th", { text: "活動 2" }),
        el("th", { text: "活動 1" }), el("th", { text: "活動 2" }),
      ]),
    ]);
    var tbody = el("tbody", {});
    state.days.forEach(function (d) {
      var tr = el("tr", {}, [
        el("td", { className: "day-cell" }, [document.createTextNode("第" + d.day + "天"), el("span", { className: "wk", text: d.date })]),
        slotCell(d.am1, "slot-am"),
        slotCell(d.am2, "slot-am"),
        slotCell(d.pm1, "slot-pm"),
        slotCell(d.pm2, "slot-pm"),
        slotCell(d.ev1, "slot-ev"),
        slotCell(d.ev2, "slot-ev"),
      ]);
      tbody.appendChild(tr);
    });
    var table = el("table", { className: "day-table" }, [thead, tbody]);
    section.appendChild(el("div", { className: "table-wrap" }, [table]));
    container.appendChild(section);
  }

  // ---------- section: todos ----------
  function renderTodos(container) {
    var section = el("section", { className: "section" }, [
      el("div", { className: "section-head" }, [
        el("div", { className: "kicker", text: "出發前準備" }),
        el("h2", { text: "待辦事項" }),
      ]),
    ]);
    var grid = el("div", { className: "todo-grid" });
    Object.keys(state.todos).forEach(function (key) {
      var cat = state.todos[key];
      var titleEl = editMode
        ? el("input", { value: cat.title, style: "font-family:Georgia,serif;font-weight:700;font-size:14px;width:70%;", oninput: function (e) { cat.title = e.target.value; markDirty(); } })
        : el("span", { text: cat.title });
      var list = el("ul", { className: "todo-list" });
      cat.items.forEach(function (item, idx) {
        var cb = el("input", { type: "checkbox", onchange: function (e) { item.checked = e.target.checked; markDirty(); } });
        cb.checked = !!item.checked;
        var bodyChildren;
        if (editMode) {
          var textIn = el("input", { type: "text", value: item.text, oninput: function (e) { item.text = e.target.value; markDirty(); } });
          var noteIn = el("textarea", { placeholder: "備註(選填)", oninput: function (e) { item.note = e.target.value; markDirty(); } });
          noteIn.value = item.note || "";
          bodyChildren = [textIn, noteIn];
        } else {
          bodyChildren = [document.createTextNode(item.text)];
          if (item.note) bodyChildren.push(el("small", { text: item.note }));
        }
        var li = el("li", { className: "todo-item" }, [cb, el("div", { className: "body" }, bodyChildren)]);
        if (editMode) li.appendChild(el("button", { className: "icon-btn", text: "✕", onclick: function () { cat.items.splice(idx, 1); markDirty(); render(); } }));
        list.appendChild(li);
      });
      var card = el("div", { className: "todo-card" }, [
        el("div", { className: "todo-title" }, [el("span", { className: "name" }, [el("span", { className: "dot" }), titleEl])]),
        list,
      ]);
      if (editMode) card.appendChild(el("div", { className: "add-row" }, [
        el("button", { className: "btn", text: "+ 新增項目", onclick: function () { cat.items.push({ text: "", note: "", checked: false }); markDirty(); render(); } }),
      ]));
      grid.appendChild(card);
    });
    section.appendChild(grid);
    container.appendChild(section);
  }

  // ---------- section: spots ----------
  function renderSpots(container) {
    var section = el("section", { className: "section" }, [
      el("div", { className: "section-head" }, [
        el("div", { className: "kicker", text: "口袋名單" }),
        el("h2", { text: "景點分類" }),
        el("div", { className: "hint", text: "勾選方框代表已排入上方逐日行程。" }),
      ]),
    ]);
    Object.keys(state.spots).forEach(function (regionKey) {
      var region = state.spots[regionKey];
      var block = el("div", { className: "region-block" }, [el("div", { className: "region-label", text: region.label })]);
      var grid = el("div", { className: "spot-grid" });
      Object.keys(region.categories).forEach(function (catKey) {
        var cat = region.categories[catKey];
        var list = el("ul", { className: "todo-list" });
        cat.items.forEach(function (item, idx) {
          var cb = el("input", { type: "checkbox", onchange: function (e) { item.checked = e.target.checked; markDirty(); } });
          cb.checked = !!item.checked;
          var bodyChildren;
          if (editMode) {
            var textIn = el("input", { type: "text", placeholder: "*待補充", value: item.name, oninput: function (e) { item.name = e.target.value; markDirty(); } });
            bodyChildren = [textIn];
          } else {
            bodyChildren = [document.createTextNode(item.name && item.name.trim() ? item.name : "*待補充")];
          }
          var li = el("li", { className: "todo-item" }, [cb, el("div", { className: "body" }, bodyChildren)]);
          if (editMode) li.appendChild(el("button", { className: "icon-btn", text: "✕", onclick: function () { cat.items.splice(idx, 1); markDirty(); render(); } }));
          list.appendChild(li);
        });
        var card = el("div", { className: "todo-card" }, [
          el("div", { className: "todo-title" }, [el("span", { className: "name" }, [el("span", { className: "dot" }), el("span", { text: cat.title })])]),
          list,
        ]);
        if (editMode) card.appendChild(el("div", { className: "add-row" }, [
          el("button", { className: "btn", text: "+ 新增景點", onclick: function () { cat.items.push({ name: "", checked: false }); markDirty(); render(); } }),
        ]));
        grid.appendChild(card);
      });
      block.appendChild(grid);
      section.appendChild(block);
    });
    container.appendChild(section);
  }

  // ---------- header + notes ----------
  function renderHeader(container) {
    var header = el("header", { className: "header" }, [
      el("div", { className: "shell" }, [
        el("div", { className: "eyebrow", text: state.meta.subtitle + " · " + state.meta.pax }),
        el("h1", { text: state.meta.title + ":" + state.meta.dateRange }),
        el("p", { text: "依已確認的機票與訂房資訊排出每日行程,含登機、入住/退房與建議抵達機場時間。點右上角「解鎖編輯」即可線上新增景點、修改行程並存回 GitHub。" }),
      ]),
    ]);
    container.appendChild(header);
  }

  function renderNotes(container) {
    var box = el("div", { className: "notes" }, [
      el("h4", { text: "備註" }),
      el("ul", {}, [
        el("li", { text: "除了機票與住宿的入住/退房資訊,其餘活動預設為「*待規劃」,可在編輯模式中直接填入實際安排。" }),
        el("li", { text: "景點分類中未命名的項目會顯示「*待補充」,填入名稱後記得勾選「已排入行程」方框並到逐日行程對應欄位補上。" }),
        el("li", { text: "資料儲存在本 repo 的 data.json,任何裝置開啟本頁都會讀到最新版本;編輯需要輸入具備 Contents 讀寫權限的 GitHub Token。" }),
        el("li", { text: "編輯權限採 GitHub 協作者制:想編輯的人先點「申請編輯權限」送出請求,擁有者到 repo 的 Settings → Collaborators 手動加入該 GitHub 帳號後,對方才能用自己的 Token 成功存檔。" }),
      ]),
    ]);
    container.appendChild(box);
  }

  // ---------- main render ----------
  function render() {
    app.innerHTML = "";
    var shell = el("div", { className: "shell" });
    renderLogistics(shell);
    renderDayTable(shell);
    renderTodos(shell);
    renderSpots(shell);
    renderNotes(shell);

    app.innerHTML = "";
    renderHeader(app);
    app.appendChild(shell);

    renderTopbar();
  }

  window.addEventListener("beforeunload", function (e) {
    if (dirty) { e.preventDefault(); e.returnValue = ""; }
  });

  function boot() {
    statusEl.textContent = "載入中…";
    app.innerHTML = '<div class="loading">載入行程資料中…</div>';
    ghLoad()
      .then(function (data) {
        state = data;
        dirty = false;
        render();
      })
      .catch(function () {
        // fallback to bundled data.json (e.g. rate-limited / offline)
        return fetch("./data.json", { cache: "no-store" })
          .then(function (r) { return r.json(); })
          .then(function (data) {
            state = data;
            sha = null;
            dirty = false;
            render();
            toast("無法連線 GitHub API,顯示的是本地備份版本(唯讀)", true);
          });
      })
      .catch(function (e) {
        app.innerHTML = '<div class="loading">載入失敗:' + escapeHtml(e.message) + "</div>";
      });
  }

  boot();
})();
