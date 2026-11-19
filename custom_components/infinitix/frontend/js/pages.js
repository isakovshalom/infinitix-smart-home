// Personal pages: named collections of existing cards (an entity can appear on several
// pages and keeps its room).  Pages are part of the shared config; editing is admin-only
// and enforced by the server (save_config).

import { esc, uid, byOrder } from "./util.js";
import { roomName, UNASSIGNED } from "./logic.js";

let jobId = 0;

export const visiblePages = (cfg) => [...(cfg.pages || [])].sort(byOrder);

export function renderPageView(app, cfg, pid) {
  const { t } = app, page = (cfg.pages || []).find((p) => p.id === pid);
  if (!page) return `<div class="page"><div class="empty">${esc(t("page_empty"))}</div></div>`;
  const items = page.entities.filter((eid) => cfg.entities[eid] && !cfg.entities[eid].hidden).map((eid) => ({ eid, pref: cfg.entities[eid] }));
  const id = `pg${++jobId}`;
  if (items.length) app._lazy.push({ id, items });
  return `<div class="page"><h1>${esc(page.name)}</h1>
    ${items.length ? `<div class="grid" data-lazy="${id}"></div>` : `<div class="empty">${esc(t("page_empty"))}</div>`}
    ${app._isAdmin ? `<div class="row" style="margin-block-start:16px"><button class="btn" data-act="pg-edit" data-pid="${esc(page.id)}">${esc(t("edit"))}</button></div>` : ""}</div>`;
}

export function pagesSettingsHTML(app) {
  const { t } = app, c = app._cfg, pages = visiblePages(c);
  const max = app._features?.max_pages ?? 20;
  return `<div class="panel"><h2 style="margin-block-start:0">${esc(t("pages"))}</h2>
    <div class="elist">${pages.map((p, i) => `<div class="erow" data-pid="${esc(p.id)}"><div class="meta"><div class="nm">${esc(p.name)}</div><div class="id">${p.entities.length}</div></div>
      <div class="acts"><button class="iconbtn" data-act="pg-up" aria-label="${esc(t("move_up"))}" ${i === 0 ? "disabled" : ""}>↑</button>
      <button class="iconbtn" data-act="pg-down" aria-label="${esc(t("move_down"))}" ${i === pages.length - 1 ? "disabled" : ""}>↓</button>
      <button class="btn" data-act="pg-edit">${esc(t("edit"))}</button><button class="btn danger" data-act="pg-del">${esc(t("remove"))}</button></div></div>`).join("")}</div>
    <button class="btn" data-act="pg-new" ${pages.length >= max ? "disabled" : ""}>+ ${esc(t("page_new"))}</button></div>`;
}

function editDialog(app, page) {
  const { t } = app, c = app._cfg;
  const rooms = [...c.rooms].sort(byOrder);
  const byRoom = (rid) => Object.entries(c.entities).filter(([, p]) => !p.hidden && (p.room || UNASSIGNED) === rid);
  const list = rooms.map((r) => {
    const ents = byRoom(r.id);
    if (!ents.length) return "";
    return `<fieldset class="pg-room"><legend>${esc(roomName(r, t))}</legend>${ents.map(([eid, p]) =>
      `<label class="row"><input type="checkbox" class="chk" data-mf="e:${esc(eid)}" ${page.entities.includes(eid) ? "checked" : ""}> ${esc(p.name || app._invMap.get(eid)?.name || eid)}</label>`).join("")}</fieldset>`;
  }).join("");
  app.openModal({
    title: page.name || t("page_new"),
    body: `<div class="field"><label class="label">${esc(t("page_name"))}</label><input class="input" data-mf="name" maxlength="60" value="${esc(page.name)}"></div>
      <div class="field"><span class="label">${esc(t("page_entities"))}</span><div class="pg-list">${list}</div></div>`,
    actions: [{ id: "cancel", label: t("cancel") }, { id: "save", label: t("save"), cls: "primary" }],
    onAction: (id, f) => {
      if (id !== "save") return true;
      page.name = (f.name || "").trim() || t("page_new");
      const chosen = Object.entries(f).filter(([k, v]) => k.startsWith("e:") && v).map(([k]) => k.slice(2));
      // keep the existing order of cards that stay, append new ones
      page.entities = [...page.entities.filter((e) => chosen.includes(e)), ...chosen.filter((e) => !page.entities.includes(e))];
      if (!c.pages.includes(page)) c.pages.push(page);
      app.persistSoon(true);
      app.render();
      return true;
    },
  });
}

export async function pagesAct(app, act, el) {
  if (!app._isAdmin) return app.toast(app.t("admin_only"), true);
  const c = app._cfg; c.pages ||= [];
  const pid = el.dataset.pid || el.closest("[data-pid]")?.dataset.pid;
  const pages = visiblePages(c), i = pages.findIndex((p) => p.id === pid);
  switch (act) {
    case "pg-new": return editDialog(app, { id: uid("pg"), name: "", icon: null, order: pages.length, entities: [] });
    case "pg-edit": return pages[i] && editDialog(app, pages[i]);
    case "pg-up": case "pg-down": {
      const j = i + (act === "pg-up" ? -1 : 1);
      if (i < 0 || j < 0 || j >= pages.length) return;
      [pages[i], pages[j]] = [pages[j], pages[i]];
      pages.forEach((p, k) => { p.order = k; });
      app.persistSoon(); return app.render();
    }
    case "pg-del": {
      const r = await app._confirm(app.t("page_delete_confirm"));
      if (!r.ok) return;
      c.pages = c.pages.filter((p) => p.id !== pid);
      if (app._view.name === "page" && app._view.page === pid) app._view = { name: "home" };
      app.persistSoon(true); return app.render();
    }
  }
}
